// hysteresis-verification.ts — Proves (or disproves) the hysteresis ("scar")
// effect in the PRISM engine.
//
// Protocol:
//   Phase 0 (ticks 0–100):  Run from baseline. Record U_base, stability_base.
//   Phase 1 (ticks 100–150): Apply a multi-lever shock designed to push
//                            unemployment above the engine's hysteresis
//                            threshold of 18%:
//                              • minimum_wage → 7000 (wage channel)
//                              • interest_rate → 12 (investment channel)
//                              • public_investment → 50 (G channel)
//                              • subsidies → 0 (inflation + G channel)
//                            Record peak unemployment, min stability.
//   Phase 2 (ticks 150–250): Reverse all four levers to baseline. Record
//                            U_final, stability_final. Track decay time.
//
// The engine's `unemploymentHysteresis` and `debtHysteresis` mechanisms
// (engine.ts lines ~403–411) track max-values and apply a decaying penalty
// to `stability` even after the underlying indicator returns to baseline.
// So the scar — if present — should manifest on `stability`, not necessarily
// on `unemployment` itself. We instrument both honestly.

import { LEVERS, INDICATORS, MACRO_CONSTANTS } from "../model.js";
import { SimulationEngine } from "../engine.js";

export interface HysteresisResult {
  markdown: string;
  U_base: number;
  U_peak: number;
  U_final: number;
  U_scar: number;
  stability_base: number;
  stability_min: number;
  stability_final: number;
  stability_scar: number;
  debt_base: number;
  debt_peak: number;
  debt_final: number;
  decayTicks: number | null; // ticks after reversal to return within 10% of U_base
  trajectory: { tick: number; phase: string; unemployment: number; stability: number; debt_to_gdp: number; inflation: number }[];
  unemploymentScarAssertPassed: boolean;
  stabilityScarAssertPassed: boolean;
}

const SHOCKS: { leverId: string; value: number }[] = [
  { leverId: "minimum_wage", value: 8000 },   // max — biggest wage channel
  { leverId: "interest_rate", value: 15 },     // max — biggest investment dampening
  { leverId: "public_investment", value: 0 },  // min — biggest G cut
  { leverId: "subsidies", value: 0 },          // min — inflation + G cut
  { leverId: "corporate_tax_rate", value: 50 },// max — investment dampening
  { leverId: "vat_rate", value: 30 },          // max — consumption dampening + inflation
];

// Engine hysteresis thresholds (from engine.ts recompute()).
const UNEMPLOYMENT_HYSTERESIS_THRESHOLD = 18;
const DEBT_HYSTERESIS_THRESHOLD = 90;

export function runHysteresisVerification(): HysteresisResult {
  const engine = new SimulationEngine();
  engine.reset();

  const trajectory: HysteresisResult["trajectory"] = [];
  let U_base = 0, U_peak = 0, U_final = 0;
  let stability_base = 0, stability_min = Infinity, stability_final = 0;
  let debt_base = 0, debt_peak = 0, debt_final = 0;
  let reversalTick = 150;
  let decayTicks: number | null = null;

  // Phase 0: baseline 100 ticks
  for (let t = 0; t < 100; t++) {
    engine.step();
    if (t === 99) {
      U_base = engine.indicators!.unemployment;
      stability_base = engine.indicators!.stability;
      debt_base = engine.indicators!.debt_to_gdp;
    }
    if (t % 5 === 0) {
      trajectory.push({
        tick: engine.tick,
        phase: "baseline",
        unemployment: engine.indicators!.unemployment,
        stability: engine.indicators!.stability,
        debt_to_gdp: engine.indicators!.debt_to_gdp,
        inflation: engine.indicators!.inflation,
      });
    }
  }

  // Phase 1: shock — apply 4 lever changes simultaneously
  for (const s of SHOCKS) {
    engine.adjustLever(s.leverId, s.value);
  }
  for (let t = 0; t < 50; t++) {
    engine.step();
    const u = engine.indicators!.unemployment;
    const stab = engine.indicators!.stability;
    const dtg = engine.indicators!.debt_to_gdp;
    if (u > U_peak) U_peak = u;
    if (stab < stability_min) stability_min = stab;
    if (dtg > debt_peak) debt_peak = dtg;
    if (t % 5 === 0) {
      trajectory.push({
        tick: engine.tick,
        phase: "shock",
        unemployment: u,
        stability: stab,
        debt_to_gdp: dtg,
        inflation: engine.indicators!.inflation,
      });
    }
  }

  // Phase 2: reverse all shocks to baseline
  for (const s of SHOCKS) {
    const lever = LEVERS.find((l) => l.id === s.leverId)!;
    engine.adjustLever(s.leverId, lever.baseline);
  }
  for (let t = 0; t < 100; t++) {
    engine.step();
    const u = engine.indicators!.unemployment;
    const stab = engine.indicators!.stability;
    const dtg = engine.indicators!.debt_to_gdp;
    // Decay check: first tick after reversal where U within 10% of U_base
    if (decayTicks === null && Math.abs(u - U_base) <= Math.abs(U_base) * 0.10) {
      decayTicks = t + 1;
    }
    if (t === 99) {
      U_final = u;
      stability_final = stab;
      debt_final = dtg;
    }
    if (t % 5 === 0) {
      trajectory.push({
        tick: engine.tick,
        phase: "recovery",
        unemployment: u,
        stability: stab,
        debt_to_gdp: dtg,
        inflation: engine.indicators!.inflation,
      });
    }
  }
  void reversalTick;

  const U_scar = U_final - U_base;
  const stability_scar = stability_base - stability_final;
  const unemploymentScarAssertPassed = U_final > U_base;
  const stabilityScarAssertPassed = stability_final < stability_base;

  // Did the shock cross the engine's hysteresis activation thresholds?
  const unemploymentThresholdCrossed = U_peak >= UNEMPLOYMENT_HYSTERESIS_THRESHOLD;
  const debtThresholdCrossed = debt_peak >= DEBT_HYSTERESIS_THRESHOLD;

  // ── Markdown ──
  const lines: string[] = [];
  lines.push("## 3. Hysteresis Verification");
  lines.push("");
  lines.push("> The PRISM engine implements four `Hysteresis` trackers (`debtHysteresis`, `unemploymentHysteresis`, `inflationHysteresis`, `stabilityHysteresis` in `engine.ts`). Each records the max-value it has ever seen. When the underlying indicator drops below its threshold (e.g. unemployment < 18%), the engine still applies a decaying penalty to `stability` via `hysteresisEffect(currentValue, threshold, decayRate) = exp(−gap × decayRate)`. This is the model's formal implementation of the economic idea that *crises leave scars* — recovery is not symmetric with collapse.");
  lines.push("");
  lines.push("**Protocol.** Phase 0 (100 ticks baseline) → Phase 1 (50 ticks shock: `minimum_wage→8000`, `interest_rate→15`, `public_investment→0`, `subsidies→0`, `corporate_tax_rate→50`, `vat_rate→30`) → Phase 2 (100 ticks recovery, all six levers reversed to baseline).");
  lines.push("");
  lines.push(`**Hysteresis activation.** The engine's \`unemploymentHysteresis\` activates only when \`unemployment ≥ ${UNEMPLOYMENT_HYSTERESIS_THRESHOLD}%\` (engine.ts: \`hysteresisEffect(unemployment, 18, 0.08)\`). The \`debtHysteresis\` activates only when \`debt_to_gdp ≥ ${DEBT_HYSTERESIS_THRESHOLD}%\`. This run: U_peak = ${U_peak.toFixed(2)}% (${unemploymentThresholdCrossed ? "✓ crossed" : "✗ did NOT cross"} the unemployment threshold), debt_peak = ${debt_peak.toFixed(2)}% (${debtThresholdCrossed ? "✓ crossed" : "✗ did NOT cross"} the debt threshold).`);
  lines.push("");

  lines.push("### 3.1 Key values");
  lines.push("");
  lines.push("| Quantity | Baseline (end of phase 0) | Peak / trough (during shock) | Final (end of phase 2) |");
  lines.push("|---|---:|---:|---:|");
  lines.push(`| Unemployment (%) | ${U_base.toFixed(4)} | ${U_peak.toFixed(4)} (peak) | ${U_final.toFixed(4)} |`);
  lines.push(`| Stability (/100) | ${stability_base.toFixed(4)} | ${stability_min.toFixed(4)} (trough) | ${stability_final.toFixed(4)} |`);
  lines.push(`| Debt-to-GDP (%) | ${debt_base.toFixed(4)} | ${debt_peak.toFixed(4)} (peak) | ${debt_final.toFixed(4)} |`);
  lines.push("");

  lines.push("### 3.2 Scar magnitudes");
  lines.push("");
  lines.push("| Scar | Formula | Value | Interpretation |");
  lines.push("|---|---|---:|---|");
  lines.push(`| Unemployment scar | \`U_final − U_base\` | ${U_scar.toFixed(4)} | ${U_scar > 0.05 ? "Persistent — recovery did not erase the crisis." : U_scar < -0.05 ? "Negative — unemployment ended below baseline (over-correction)." : "≈ 0 — unemployment returned to baseline (no direct scar on this indicator)."} |`);
  lines.push(`| Stability scar | \`stability_base − stability_final\` | ${stability_scar.toFixed(4)} | ${stability_scar > 0.5 ? "Persistent — stability did not fully recover (the implemented scar mechanism)." : stability_scar < -0.5 ? "Negative — stability ended higher than baseline (rare)." : "≈ 0 — stability recovered fully."} |`);
  lines.push(`| Debt scar | \`debt_final − debt_base\` | ${(debt_final - debt_base).toFixed(4)} | ${(debt_final - debt_base) > 0.5 ? "Persistent — debt accumulated during shock did not unwind." : "≈ 0 or negative — debt reverted."} |`);
  lines.push("");

  lines.push("### 3.3 Assertion results");
  lines.push("");
  lines.push("| Assertion | Expected | Observed | Result |");
  lines.push("|---|---|---|:---:|");
  lines.push(`| \`U_final > U_base\` (unemployment scar) | true | \`U_final=${U_final.toFixed(4)} > U_base=${U_base.toFixed(4)}\` | ${unemploymentScarAssertPassed ? "✅ PASS" : "🚩 FAIL"} |`);
  lines.push(`| \`stability_final < stability_base\` (stability scar) | true | \`stability_final=${stability_final.toFixed(4)} < stability_base=${stability_base.toFixed(4)}\` | ${stabilityScarAssertPassed ? "✅ PASS" : "🚩 FAIL"} |`);
  lines.push("");

  lines.push(`**Decay time** (ticks after reversal until unemployment returns within 10% of baseline): ${decayTicks === null ? "_never (within 100 recovery ticks)_" : decayTicks + " ticks"}.`);
  lines.push("");

  if (!unemploymentScarAssertPassed && stabilityScarAssertPassed) {
    lines.push("> **Honest finding.** The engine's `unemploymentHysteresis` mechanism does NOT leave a scar on the *unemployment* value itself — unemployment is recomputed from lever values each tick via the formula, so once the shock levers revert, unemployment reverts. The scar manifests on **stability**, which is post-processed by the hysteresis penalty. This is consistent with the source: `indicators.stability *= (1 − debtMemory × 0.1 − unemploymentMemory × 0.08)` in `engine.ts`.");
    lines.push("");
  } else if (!unemploymentScarAssertPassed && !stabilityScarAssertPassed) {
    if (!unemploymentThresholdCrossed && !debtThresholdCrossed) {
      lines.push("> **Honest finding.** Neither hysteresis threshold was crossed (U_peak < 18% and debt_peak < 90%), so neither `unemploymentHysteresis` nor `debtHysteresis` activated. Stability returned to baseline because the hysteresis penalty remained zero throughout. The shock was insufficient to trigger the scar mechanism — this is the model's designed behavior: small shocks do not leave scars, only threshold-crossing crises do. This is itself a finding: the engine's scar mechanism is gated behind sufficiently large shocks, and the threshold values (18% unemployment, 90% debt/GDP) are calibrated to historically-crisis-level magnitudes.");
    } else {
      lines.push("> **Honest finding.** Even though a hysteresis threshold was crossed during the shock, the 100-tick recovery window was long enough for the `exp(−gap × decayRate)` memory to fully decay. The scar mechanism activated transiently but did not persist to the end of the test. A longer shock or a shorter recovery window would be needed to observe a persistent scar.");
    }
    lines.push("");
  } else if (unemploymentScarAssertPassed) {
    lines.push("> Unemployment itself shows a persistent scar. This would be a stronger result than the engine's design implies (the source code only applies hysteresis to stability) — likely caused by lingering causal-edge propagation or debt accumulation depressing GDP growth via Okun's law.");
    lines.push("");
  }

  // Trajectory table — sample every 10 ticks for readability
  lines.push("### 3.4 Trajectory (sampled every 5 ticks)");
  lines.push("");
  lines.push("| Tick | Phase | Unemployment (%) | Stability (/100) | Debt/GDP (%) | Inflation (%) |");
  lines.push("|---:|---|---:|---:|---:|---:|");
  for (const p of trajectory) {
    lines.push(`| ${p.tick} | ${p.phase} | ${p.unemployment.toFixed(4)} | ${p.stability.toFixed(4)} | ${p.debt_to_gdp.toFixed(4)} | ${p.inflation.toFixed(4)} |`);
  }
  lines.push("");

  return {
    markdown: lines.join("\n"),
    U_base,
    U_peak,
    U_final,
    U_scar,
    stability_base,
    stability_min,
    stability_final,
    stability_scar,
    debt_base,
    debt_peak,
    debt_final,
    decayTicks,
    trajectory,
    unemploymentScarAssertPassed,
    stabilityScarAssertPassed,
  };
}
