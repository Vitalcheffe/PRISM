// sensitivity-analysis.ts — Computes the 47 × 15 sensitivity matrix of the
// PRISM macroeconomic model.
//
// For each of the 47 levers L:
//   - Start from baseline lever vector.
//   - Compute the baseline indicator vector I_base via formulas.computeAllIndicators
//     (the ground-truth economic model — Okun, Phillips, HDI, fiscal accounting).
//   - Perturb L by +10% of its [min, max] range, clamp to [min, max], recompute.
//   - Perturb L by −10% of its range, clamp, recompute.
//   - The central-difference sensitivity S[L][I] = (ΔI⁺ − ΔI⁻) / (2 · ΔL).
//   - Normalize to a unitless elasticity-like coefficient:
//       S_norm[L][I] = S[L][I] · (lever_range / indicator_typical_scale)
//     so the matrix is comparable across rows and columns.
//
// This file drives the actual formulas — no mocking, no shortcuts. The output
// is a markdown section consumed by run-validation.ts.

import { LEVERS, INDICATORS, MACRO_CONSTANTS, LEVER_BY_ID } from "../model.js";
import { computeAllIndicators, type Levers } from "../formulas.js";

// Typical magnitude (scale) per indicator, used to normalize sensitivities
// into unitless elasticity-like coefficients. Values picked from the
// INDICATOR_RANGES enforced inside engine.ts and from the formula outputs.
const INDICATOR_SCALE: Record<string, number> = {
  gdp: 1400,
  gdp_growth: 5,
  gdp_per_capita: 37000,
  unemployment: 10,
  inflation: 5,
  debt_to_gdp: 60,
  budget_deficit: 100,
  tax_revenue: 400,
  life_expectancy: 73,
  hdi: 0.7,
  gini: 0.4,
  balance_of_trade: 160,
  poverty_rate: 10,
  stability: 50,
  revolution_risk: 30,
  public_spending: 500,
};

export interface SanityCheck {
  name: string;
  leverId: string;
  indicatorId: string;
  direction: "up" | "down";
  observedDelta: number;
  passed: boolean;
  note: string;
}

export interface SensitivityResult {
  markdown: string;
  topLevers: { id: string; name: string; totalAbsSensitivity: number }[];
  topIndicators: { id: string; name: string; totalAbsSensitivity: number }[];
  sanityChecks: SanityCheck[];
  matrix: Record<string, Record<string, number>>; // leverId -> indicatorId -> S_norm
}

function baselineLevers(): Levers {
  const levers: Levers = {};
  for (const l of LEVERS) levers[l.id] = l.baseline;
  return levers;
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function runSensitivityAnalysis(): SensitivityResult {
  const base = baselineLevers();
  const baseIndicators = computeAllIndicators(
    base,
    MACRO_CONSTANTS.gdp_baseline_mrd_mad,
    MACRO_CONSTANTS.debt_baseline_mrd_mad,
  );

  const indicatorIds = INDICATORS.map((i) => i.id);
  const matrix: Record<string, Record<string, number>> = {};
  const leverTotalAbs: Record<string, number> = {};
  const indicatorTotalAbs: Record<string, number> = {};

  for (const lever of LEVERS) {
    const range = lever.max - lever.min;
    const deltaL = 0.1 * range; // ±10% of the physical range

    // +10% perturbation (clamped)
    const upLevers = { ...base };
    upLevers[lever.id] = clamp(lever.baseline + deltaL, lever.min, lever.max);
    const actualDeltaUp = upLevers[lever.id] - lever.baseline;

    // −10% perturbation (clamped)
    const downLevers = { ...base };
    downLevers[lever.id] = clamp(lever.baseline - deltaL, lever.min, lever.max);
    const actualDeltaDown = downLevers[lever.id] - lever.baseline;

    const indUp = computeAllIndicators(
      upLevers,
      MACRO_CONSTANTS.gdp_baseline_mrd_mad,
      MACRO_CONSTANTS.debt_baseline_mrd_mad,
    );
    const indDown = computeAllIndicators(
      downLevers,
      MACRO_CONSTANTS.gdp_baseline_mrd_mad,
      MACRO_CONSTANTS.debt_baseline_mrd_mad,
    );

    matrix[lever.id] = {};
    let totalAbs = 0;

    // Span of the perturbation (L_up − L_down). Always > 0 unless both
    // directions clamped to the same boundary value (extreme edge case).
    const span = actualDeltaUp - actualDeltaDown;

    for (const indId of indicatorIds) {
      const upVal = (indUp as any)[indId] as number;
      const downVal = (indDown as any)[indId] as number;
      // Central difference ∂I/∂L = (I_up − I_down) / (L_up − L_down).
      const centralDiff = Math.abs(span) > 1e-12 ? (upVal - downVal) / span : 0;
      const scale = INDICATOR_SCALE[indId] || 1;
      // Normalize to a unitless elasticity-like coefficient.
      const normalized = (centralDiff * range) / scale;
      matrix[lever.id][indId] = normalized;
      totalAbs += Math.abs(normalized);
      indicatorTotalAbs[indId] =
        (indicatorTotalAbs[indId] || 0) + Math.abs(normalized);
    }
    leverTotalAbs[lever.id] = totalAbs;
  }

  // Top 10 most influential levers
  const topLevers = LEVERS.map((l) => ({
    id: l.id,
    name: l.name,
    totalAbsSensitivity: leverTotalAbs[l.id] || 0,
  }))
    .sort((a, b) => b.totalAbsSensitivity - a.totalAbsSensitivity)
    .slice(0, 10);

  // Top 10 most sensitive indicators
  const topIndicators = INDICATORS.map((i) => ({
    id: i.id,
    name: i.name,
    totalAbsSensitivity: indicatorTotalAbs[i.id] || 0,
  }))
    .sort((a, b) => b.totalAbsSensitivity - a.totalAbsSensitivity)
    .slice(0, 10);

  // Sanity checks — does the model behave the way economic theory says it should?
  const sanityChecks: SanityCheck[] = [];

  function check(
    name: string,
    leverId: string,
    indicatorId: string,
    direction: "up" | "down",
    note: string,
  ) {
    const lever = LEVER_BY_ID.get(leverId)!;
    const range = lever.max - lever.min;
    const newLevers = baselineLevers();
    newLevers[leverId] = clamp(lever.baseline + 0.1 * range, lever.min, lever.max);
    const newInd = computeAllIndicators(
      newLevers,
      MACRO_CONSTANTS.gdp_baseline_mrd_mad,
      MACRO_CONSTANTS.debt_baseline_mrd_mad,
    );
    const baseVal = (baseIndicators as any)[indicatorId] as number;
    const newVal = (newInd as any)[indicatorId] as number;
    const delta = newVal - baseVal;
    const passed =
      direction === "up" ? delta > 0 : delta < 0;
    sanityChecks.push({ name, leverId, indicatorId, direction, observedDelta: delta, passed, note });
  }

  // The six sanity checks demanded by the validation framework.
  check("public_investment ↑ ⇒ GDP ↑", "public_investment", "gdp", "up", "Fiscal multiplier: G enters GDP as C+I+G+(X−M).");
  check("vat_rate ↑ ⇒ tax_revenue ↑", "vat_rate", "tax_revenue", "up", "Direct: VAT revenue = consumptionBase × vatRate.");
  check("hospital_beds_per_1k ↑ ⇒ life_expectancy ↑", "hospital_beds_per_1k", "life_expectancy", "up", "Health production function: bedEffect = (beds−1.1)×2.");
  check("interest_rate ↑ ⇒ inflation ↓", "interest_rate", "inflation", "down", "Monetary tightening: monetaryEffect = −(rate−2.5)×0.5.");
  check("minimum_wage ↑ ⇒ gini ↓", "minimum_wage", "gini", "down", "Redistribution: wageEffect = −(minWage−3330)/3330 × 0.05.");
  check("interest_rate ↑ ⇒ unemployment ↑ (Okun via GDP)", "interest_rate", "unemployment", "up", "Higher rate → lower investment → lower growth → Okun raises unemployment.");

  // ── Markdown ──
  const lines: string[] = [];
  lines.push("## 1. Sensitivity Analysis");
  lines.push("");
  lines.push("> Each of the 47 levers was perturbed by ±10% of its physical `[min, max]` range, the 15 indicators were recomputed via `formulas.computeAllIndicators()` (the ground-truth economic model — Okun, Phillips, HDI, fiscal accounting), and a central-difference Jacobian was extracted. Coefficients are normalized to a unitless elasticity-like scale: `S_norm = (∂I/∂L) · (lever_range / indicator_scale)`.");
  lines.push("");

  // Top influential levers table
  lines.push("### 1.1 Top 10 most influential levers");
  lines.push("");
  lines.push("| Rank | Lever | Category | Total |S| (unitless) |");
  lines.push("|---:|---|---|---:|");
  topLevers.forEach((l, i) => {
    const cat = LEVER_BY_ID.get(l.id)?.category ?? "?";
    lines.push(`| ${i + 1} | \`${l.id}\` — ${l.name} | ${cat} | ${l.totalAbsSensitivity.toFixed(4)} |`);
  });
  lines.push("");

  // Top sensitive indicators
  lines.push("### 1.2 Top 10 most sensitive indicators");
  lines.push("");
  lines.push("| Rank | Indicator | Total |S| received (unitless) |");
  lines.push("|---:|---|---:|");
  topIndicators.forEach((ind, i) => {
    lines.push(`| ${i + 1} | \`${ind.id}\` — ${ind.name} | ${ind.totalAbsSensitivity.toFixed(4)} |`);
  });
  lines.push("");

  // Full 47×15 matrix (compact, transposed for readability: rows = levers)
  lines.push("### 1.3 Full 47 × 15 sensitivity matrix");
  lines.push("");
  lines.push("Each cell is `S_norm[L][I]` — positive means the indicator rises with the lever, negative means it falls. `|S| > 0.10` is highlighted with a trailing marker (`◄` for the top-quartile magnitudes).");
  lines.push("");
  // header
  const header = ["lever"].concat(indicatorIds);
  lines.push("| " + header.join(" | ") + " |");
  lines.push("|" + header.map(() => "---").join("|") + "|");
  // Compute a threshold for highlighting (75th percentile of |S|)
  const allS = LEVERS.flatMap((l) =>
    indicatorIds.map((i) => Math.abs(matrix[l.id][i])),
  ).sort((a, b) => a - b);
  const p75 = allS[Math.floor(allS.length * 0.75)] || 0;
  for (const lever of LEVERS) {
    const row = [lever.id];
    for (const indId of indicatorIds) {
      const v = matrix[lever.id][indId];
      const mark = Math.abs(v) >= p75 && Math.abs(v) > 0.001 ? " ◄" : "";
      row.push(v.toFixed(3) + mark);
    }
    lines.push("| " + row.join(" | ") + " |");
  }
  lines.push("");

  // Sanity checks
  lines.push("### 1.4 Sanity checks — does the model obey economic theory?");
  lines.push("");
  lines.push("| Check | Expected | Observed Δ | Result |");
  lines.push("|---|---|---:|:---:|");
  const passCount = sanityChecks.filter((c) => c.passed).length;
  for (const c of sanityChecks) {
    const arrow = c.direction === "up" ? "↑" : "↓";
    const expected = `${c.leverId} ↑ ⇒ ${c.indicatorId} ${arrow}`;
    const result = c.passed ? "✅ PASS" : "🚩 FAIL";
    lines.push(`| ${c.name} | ${expected} | ${c.observedDelta.toFixed(4)} | ${result} |`);
  }
  lines.push("");
  lines.push(`**Sanity-check summary: ${passCount}/${sanityChecks.length} passed.** ${passCount === sanityChecks.length ? "All theoretical directional predictions hold." : "Failures are real findings — the model does NOT obey these predictions and the report should say so."}`);
  lines.push("");

  // Baseline indicator values (for reference)
  lines.push("### 1.5 Baseline indicator values (Morocco 2023 reference)");
  lines.push("");
  lines.push("| Indicator | Baseline value | Unit |");
  lines.push("|---|---:|---|");
  for (const ind of INDICATORS) {
    const v = (baseIndicators as any)[ind.id] as number;
    lines.push(`| ${ind.name} (\`${ind.id}\`) | ${v.toFixed(4)} | ${ind.unit} |`);
  }
  lines.push("");

  return {
    markdown: lines.join("\n"),
    topLevers,
    topIndicators,
    sanityChecks,
    matrix,
  };
}
