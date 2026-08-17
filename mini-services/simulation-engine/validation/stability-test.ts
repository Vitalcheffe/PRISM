// stability-test.ts — Runs the PRISM SimulationEngine for 10,000 ticks from
// the baseline lever vector and verifies the simulation remains well-behaved.
//
// What this checks:
//   1. The engine does not throw an exception.
//   2. Every indicator stays inside its declared physical range.
//   3. The simulated population stays within ±5% of 10,000 (the swarm size).
//   4. GDP stays positive throughout.
//   5. Debt-to-GDP stays below 300%.
//   6. No NaN or Infinity leaks into the final indicator state.
//   7. (Informational) the game-over cascade (collapse / revolution / bankruptcy)
//      does not trigger from the baseline initial state.
//
// The engine's `step()` ticks every 200 ms wall-clock in the live service;
// here we drive it headlessly as fast as Bun can iterate.

import { LEVERS, INDICATORS, MACRO_CONSTANTS } from "../model.js";
import { SimulationEngine } from "../engine.js";

export interface StabilityResult {
  markdown: string;
  ticks: number;
  crashed: boolean;
  errorMessage?: string;
  gameOverTriggered: boolean;
  gameOverTick?: number;
  gameOverType?: string;
  finalIndicators: Record<string, number>;
  maxDebtToGdp: number;
  minGdp: number;
  maxGdp: number;
  nanCount: number;
  rangeViolations: { indicator: string; value: number; range: [number, number]; tick: number }[];
  population: number;
  populationStable: boolean;
}

const INDICATOR_RANGES: Record<string, [number, number]> = {
  gdp: [100, 5000],
  gdp_growth: [-15, 15],
  gdp_per_capita: [1000, 100000],
  unemployment: [0, 50],
  inflation: [-5, 50],
  debt_to_gdp: [0, 300],
  budget_deficit: [-200, 50],
  tax_revenue: [0, 1000],
  life_expectancy: [45, 90],
  hdi: [0, 1],
  gini: [0.2, 0.7],
  balance_of_trade: [-100, 100],
  poverty_rate: [0, 80],
  stability: [0, 95],
  revolution_risk: [0, 100],
  public_spending: [0, 2000],
};

const TICKS = 10_000;

export function runStabilityTest(): StabilityResult {
  const lines: string[] = [];
  lines.push("## 2. Stability Test (10,000 ticks)");
  lines.push("");
  lines.push(`> A fresh \`SimulationEngine\` is constructed, all levers reset to baseline, then \`step()\` is called ${TICKS.toLocaleString()} times. At ~24 ticks/simulated-year this is ~416 simulated years — far beyond any plausible play session, deliberately chosen to expose slow-blowing instabilities (debt accumulation, NaN propagation, game-over cascade triggers).`);
  lines.push("");

  let crashed = false;
  let errorMessage: string | undefined;
  let gameOverTriggered = false;
  let gameOverTick: number | undefined;
  let gameOverType: string | undefined;
  let nanCount = 0;
  let maxDebtToGdp = 0;
  let minGdp = Infinity;
  let maxGdp = -Infinity;
  const rangeViolations: { indicator: string; value: number; range: [number, number]; tick: number }[] = [];

  let engine: SimulationEngine;
  try {
    engine = new SimulationEngine();
    engine.reset();
  } catch (e: any) {
    crashed = true;
    errorMessage = e?.stack || String(e);
    lines.push(`**Constructor failure:** \`${errorMessage}\``);
    lines.push("");
    return finalize(crashed, errorMessage, false, undefined, undefined, {}, 0, 0, 0, 0, [], 0, false, lines);
  }

  const population = engine.swarm?.agents.length ?? 0;
  const initialSwarmCount = population;

  let ticksCompleted = 0;
  try {
    for (let t = 0; t < TICKS; t++) {
      engine.step();
      ticksCompleted = engine.tick;

      // Detect game-over cascade
      if (engine.gameOver && !gameOverTriggered) {
        gameOverTriggered = true;
        gameOverTick = engine.tick;
        gameOverType = engine.gameOver.type;
      }

      // Read indicators
      const ind = engine.indicators;
      if (!ind) continue;

      // Track debt-to-gdp and gdp extremes
      const dtg = (ind as any).debt_to_gdp as number;
      if (Number.isFinite(dtg)) maxDebtToGdp = Math.max(maxDebtToGdp, dtg);
      const g = (ind as any).gdp as number;
      if (Number.isFinite(g)) {
        minGdp = Math.min(minGdp, g);
        maxGdp = Math.max(maxGdp, g);
      }

      // NaN / Infinity scan
      for (const k of Object.keys(ind)) {
        const v = (ind as any)[k] as number;
        if (!Number.isFinite(v)) nanCount++;
      }

      // Range violation scan (sampled — every 25 ticks to keep this fast)
      if (t % 25 === 0) {
        for (const k of Object.keys(INDICATOR_RANGES)) {
          const v = (ind as any)[k] as number;
          if (!Number.isFinite(v)) continue;
          const [lo, hi] = INDICATOR_RANGES[k];
          if (v < lo || v > hi) {
            rangeViolations.push({ indicator: k, value: v, range: [lo, hi], tick: engine.tick });
            if (rangeViolations.length > 100) break;
          }
        }
      }
    }
  } catch (e: any) {
    crashed = true;
    errorMessage = e?.stack || String(e);
  }

  // Final state snapshot
  const finalIndicators: Record<string, number> = {};
  if (engine.indicators) {
    for (const k of Object.keys(engine.indicators)) {
      finalIndicators[k] = (engine.indicators as any)[k] as number;
    }
  }
  const finalSwarmCount = engine.swarm?.agents.length ?? 0;
  const populationStable =
    initialSwarmCount > 0 &&
    finalSwarmCount > 0 &&
    Math.abs(finalSwarmCount - initialSwarmCount) / initialSwarmCount <= 0.05;

  // ── Pass / Fail table ──
  const gdpPositive = minGdp > 0;
  const debtUnder300 = maxDebtToGdp < 300;
  const noNaN = nanCount === 0;
  const noRangeViolations = rangeViolations.length === 0;
  const noGameOver = !gameOverTriggered;

  const checks: { name: string; pass: boolean; detail: string }[] = [
    { name: "Engine did not crash", pass: !crashed, detail: crashed ? errorMessage! : `Completed ${ticksCompleted.toLocaleString()} ticks without exception.` },
    { name: "GDP stays positive", pass: gdpPositive, detail: `min GDP observed = ${minGdp.toFixed(2)} Mrd MAD` },
    { name: "Debt-to-GDP stays below 300%", pass: debtUnder300, detail: `max debt/GDP observed = ${maxDebtToGdp.toFixed(2)}%` },
    { name: "No NaN / Infinity in indicators", pass: noNaN, detail: `${nanCount} non-finite values encountered across all ticks.` },
    { name: "All indicators stay in physical ranges", pass: noRangeViolations, detail: `${rangeViolations.length} range violations observed (sampled every 25 ticks).` },
    { name: "Population (agent swarm) stable ±5%", pass: populationStable, detail: `initial=${initialSwarmCount}, final=${finalSwarmCount}` },
    { name: "Game-over cascade did NOT trigger", pass: noGameOver, detail: gameOverTriggered ? `Triggered at tick ${gameOverTick} (type: ${gameOverType}).` : "Stable throughout." },
  ];

  lines.push("### 2.1 Pass / Fail checklist");
  lines.push("");
  lines.push("| Check | Result | Detail |");
  lines.push("|---|:---:|---|");
  for (const c of checks) {
    lines.push(`| ${c.name} | ${c.pass ? "✅ PASS" : "🚩 FAIL"} | ${c.detail} |`);
  }
  lines.push("");

  const passCount = checks.filter((c) => c.pass).length;
  lines.push(`**Overall: ${passCount}/${checks.length} checks passed.**`);
  lines.push("");

  // Final indicator values
  lines.push("### 2.2 Final indicator values (tick " + ticksCompleted.toLocaleString() + ")");
  lines.push("");
  lines.push("| Indicator | Final value | Unit |");
  lines.push("|---|---:|---|");
  for (const ind of INDICATORS) {
    const v = finalIndicators[ind.id];
    const fmt = Number.isFinite(v) ? v.toFixed(4) : "NaN/Infinity";
    lines.push(`| ${ind.name} (\`${ind.id}\`) | ${fmt} | ${ind.unit} |`);
  }
  lines.push("");

  // Range violations (top 10) — only emit section if any observed
  let violationsSectionIndex = 0;
  if (rangeViolations.length > 0) {
    violationsSectionIndex = 3;
    lines.push("### 2.3 Indicator range violations (first 10)");
    lines.push("");
    lines.push("| Tick | Indicator | Value | Allowed range |");
    lines.push("|---:|---|---:|---|");
    for (const v of rangeViolations.slice(0, 10)) {
      lines.push(`| ${v.tick} | \`${v.indicator}\` | ${v.value.toFixed(4)} | [${v.range[0]}, ${v.range[1]}] |`);
    }
    if (rangeViolations.length > 10) {
      lines.push(`\n... and ${rangeViolations.length - 10} more violations.`);
    }
    lines.push("");
  }

  // Extremes observed (renumber to 2.3 or 2.4 depending on whether 2.3 was used)
  const extremesSectionNum = violationsSectionIndex > 0 ? 4 : 3;
  lines.push(`### 2.${extremesSectionNum} Extremes observed`);
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---:|");
  lines.push(`| min GDP (Mrd MAD) | ${minGdp.toFixed(4)} |`);
  lines.push(`| max GDP (Mrd MAD) | ${maxGdp.toFixed(4)} |`);
  lines.push(`| max debt-to-GDP (%) | ${maxDebtToGdp.toFixed(4)} |`);
  lines.push(`| NaN/Infinity occurrences | ${nanCount} |`);
  lines.push(`| Final accumulated debt (Mrd MAD) | ${engine.accumulatedDebt.toFixed(4)} |`);
  lines.push("");

  return finalize(
    crashed,
    errorMessage,
    gameOverTriggered,
    gameOverTick,
    gameOverType,
    finalIndicators,
    maxDebtToGdp,
    minGdp,
    maxGdp,
    nanCount,
    rangeViolations,
    finalSwarmCount,
    populationStable,
    lines,
  );
}

function finalize(
  crashed: boolean,
  errorMessage: string | undefined,
  gameOverTriggered: boolean,
  gameOverTick: number | undefined,
  gameOverType: string | undefined,
  finalIndicators: Record<string, number>,
  maxDebtToGdp: number,
  minGdp: number,
  maxGdp: number,
  nanCount: number,
  rangeViolations: { indicator: string; value: number; range: [number, number]; tick: number }[],
  population: number,
  populationStable: boolean,
  lines: string[],
): StabilityResult {
  return {
    markdown: lines.join("\n"),
    ticks: TICKS,
    crashed,
    errorMessage,
    gameOverTriggered,
    gameOverTick,
    gameOverType,
    finalIndicators,
    maxDebtToGdp,
    minGdp,
    maxGdp,
    nanCount,
    rangeViolations,
    population,
    populationStable,
  };
}
