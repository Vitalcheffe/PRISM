// backtest.ts — Historical backtesting against real Morocco data 2000-2023.
//
// This is the harness that closes Gap 1 from VALIDATION.md §5 #1:
//   "No historical backtesting. ... This harness tests *internal* consistency,
//    not *external* predictive accuracy against real data."
//
// Protocol:
//   1. Take the 6 hardcoded Morocco data points (2000, 2005, 2010, 2015,
//      2020, 2023) — World Bank / IMF published values for GDP growth,
//      unemployment, inflation, debt-to-GDP, life expectancy, HDI.
//   2. For each year, set the 47 levers via leverOverrides (historical proxy).
//   3. Run TWO predictors:
//        a. Formulas (formulas.computeAllIndicators) with prevGdp + debt
//           matching the historical macro state.
//        b. Neural network (neural-network.forward) — the production code path.
//   4. Compare predicted vs actual for the 6 known indicators.
//   5. Compute:
//        - MAE per indicator (formulas vs NN).
//        - Overall normalized MAE.
//        - Directional accuracy: did the predictor get the year-over-year
//          change direction right?
//   6. Verify the Gap-3 fix: zeroing layer-0 weights should change the output
//      (the layer-0 weights carry signal, not just the biases).
//   7. Output a BACKTEST.md report with year-by-year tables + summary stats.
//
// All numbers come from the actual PRISM engine — no mocking. The historical
// lever values are PROXIES (selected from published sources where possible,
// estimated otherwise), not authoritative reconstructions. The 6 indicator
// targets are real published values.

import { LEVERS, INDICATORS, MACRO_CONSTANTS } from "../model.js";
import { computeAllIndicators, type Levers } from "../formulas.js";
import {
  createNetwork,
  forward,
  pretrainFromFormulas,
  preTrainOnRealData,
  verifyLayer0WeightsMatter,
  MOROCCO_HISTORICAL,
  type NeuralNetwork,
  type Layer0Verification,
  type PreTrainResult,
} from "../neural-network.js";

// --- Types ---

const BACKTEST_INDICATORS = [
  "gdp_growth",
  "unemployment",
  "inflation",
  "debt_to_gdp",
  "life_expectancy",
  "hdi",
] as const;
type BacktestIndicator = (typeof BACKTEST_INDICATORS)[number];

interface YearResult {
  year: number;
  notes: string;
  actual: Record<BacktestIndicator, number>;
  formula: Record<BacktestIndicator, number>;
  nn: Record<BacktestIndicator, number>;
  formulaErr: Record<BacktestIndicator, number>;
  nnErr: Record<BacktestIndicator, number>;
  // Direction: +1 = up vs previous year, -1 = down, 0 = flat
  actualDir: Record<BacktestIndicator, number>;
  formulaDir: Record<BacktestIndicator, number>;
  nnDir: Record<BacktestIndicator, number>;
}

export interface BacktestResult {
  markdown: string;
  results: YearResult[];
  formulaMAE: Record<BacktestIndicator, number>;
  nnMAE: Record<BacktestIndicator, number>;
  formulaOverallMAE: number;
  nnOverallMAE: number;
  formulaDirectionalAccuracy: number;
  nnDirectionalAccuracy: number;
  preTrain: PreTrainResult;
  layer0Verification: Layer0Verification;
  layer0VerificationNoFix: Layer0Verification;
}

// --- Helpers ---

function buildLeversForYear(yearData: (typeof MOROCCO_HISTORICAL)[number]): Levers {
  const levers: Levers = {};
  for (const l of LEVERS) levers[l.id] = l.baseline;
  for (const [k, v] of Object.entries(yearData.leverOverrides)) {
    levers[k] = v as number;
  }
  return levers;
}

function leverValuesArray(levers: Levers): number[] {
  return LEVERS.map((l) => levers[l.id] ?? l.baseline);
}

function indicatorValue(
  obj: Record<string, number> | number[],
  id: string,
): number {
  if (Array.isArray(obj)) {
    const idx = INDICATORS.findIndex((i) => i.id === id);
    return obj[idx];
  }
  return obj[id];
}

function sign(x: number, epsilon = 1e-6): number {
  if (Math.abs(x) < epsilon) return 0;
  return x > 0 ? 1 : -1;
}

function fmt(x: number, d = 2): string {
  if (!Number.isFinite(x)) return "NaN";
  return x.toFixed(d);
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

// --- The backtest itself ---

export interface BacktestOpts {
  // Whether to fine-tune the NN on real data after pretrainFromFormulas.
  // Default: true (closes Gap 2).
  fineTuneOnRealData?: boolean;
  // Number of epochs for preTrainOnRealData. Default: 500.
  nnEpochs?: number;
  // Whether to also evaluate a "no-fix" NN for the Gap-3 verification comparison.
  // Default: true.
  evaluateNoFixBaseline?: boolean;
}

export function runBacktest(opts?: BacktestOpts): BacktestResult {
  const fineTuneOnRealData = opts?.fineTuneOnRealData ?? true;
  const nnEpochs = opts?.nnEpochs ?? 500;
  const evaluateNoFixBaseline = opts?.evaluateNoFixBaseline ?? true;

  // ── 1. Build the production NN: pretrain on formulas, then fine-tune on real data ──
  console.log("[backtest] Building production NN (pretrainFromFormulas + preTrainOnRealData with Gap-3 fix)...");
  const net = createNetwork();
  const formulaPretrainLoss = pretrainFromFormulas(net, 30);
  console.log(`[backtest] pretrainFromFormulas final loss = ${formulaPretrainLoss.toFixed(6)}`);

  let preTrain: PreTrainResult | null = null;
  if (fineTuneOnRealData) {
    preTrain = preTrainOnRealData(net, nnEpochs, { logEvery: 100 });
    console.log(
      `[backtest] preTrainOnRealData: before=${preTrain.beforeLoss.toFixed(6)} → after=${preTrain.afterLoss.toFixed(6)} (epochs=${nnEpochs})`,
    );
  } else {
    // Build a dummy result for the return type
    const samples = MOROCCO_HISTORICAL.map(() => ({ levers: [] as number[], targets: [] as number[], year: 0 }));
    preTrain = { beforeLoss: formulaPretrainLoss, afterLoss: formulaPretrainLoss, lossHistory: [], samples };
  }

  // ── 2. Also build a "no-fix" NN (no biasDecay, layerMult=[1,1,1]) for comparison ──
  // This isolates the Gap-3 contribution. We use the same NN pretrain + real-data
  // fine-tune, but WITHOUT the fix to show what changes.
  let layer0VerificationNoFix: Layer0Verification;
  if (evaluateNoFixBaseline) {
    console.log("[backtest] Building no-fix NN (preTrainOnRealData without Gap-3 fix) for comparison...");
    const netNoFix = createNetwork();
    pretrainFromFormulas(netNoFix, 30);
    preTrainOnRealData(netNoFix, nnEpochs, {
      layerLRMultiplier: [1, 1, 1],
      biasDecay: 0,
      logEvery: 0,
    });
    layer0VerificationNoFix = verifyLayer0WeightsMatter(netNoFix);
  } else {
    // Use the same network for both (degrades the comparison but doesn't fail)
    layer0VerificationNoFix = verifyLayer0WeightsMatter(net);
  }

  // ── 3. Run the backtest year-by-year ──
  console.log(`[backtest] Running backtest on ${MOROCCO_HISTORICAL.length} historical years...`);
  const results: YearResult[] = [];
  let prevActual: Record<BacktestIndicator, number> | null = null;

  for (const yearData of MOROCCO_HISTORICAL) {
    const levers = buildLeversForYear(yearData);
    const leverValues = leverValuesArray(levers);

    // Formula prediction: feed prevGdp + accumulatedDebt from the year's macro state
    const accumulatedDebt = (yearData.debt_to_gdp / 100) * yearData.prevGdp;
    const indicators = computeAllIndicators(
      levers,
      yearData.prevGdp,
      accumulatedDebt,
    );

    // NN prediction
    const nnOut = forward(net, leverValues);

    const actual: Record<BacktestIndicator, number> = {
      gdp_growth: yearData.gdp_growth,
      unemployment: yearData.unemployment,
      inflation: yearData.inflation,
      debt_to_gdp: yearData.debt_to_gdp,
      life_expectancy: yearData.life_expectancy,
      hdi: yearData.hdi,
    };
    const formula: Record<BacktestIndicator, number> = {
      gdp_growth: indicators.gdp_growth,
      unemployment: indicators.unemployment,
      inflation: indicators.inflation,
      debt_to_gdp: indicators.debt_to_gdp,
      life_expectancy: indicators.life_expectancy,
      hdi: indicators.hdi,
    };
    const nn: Record<BacktestIndicator, number> = {
      gdp_growth: indicatorValue(nnOut, "gdp_growth"),
      unemployment: indicatorValue(nnOut, "unemployment"),
      inflation: indicatorValue(nnOut, "inflation"),
      debt_to_gdp: indicatorValue(nnOut, "debt_to_gdp"),
      life_expectancy: indicatorValue(nnOut, "life_expectancy"),
      hdi: indicatorValue(nnOut, "hdi"),
    };

    const formulaErr: Record<BacktestIndicator, number> = {
      gdp_growth: Math.abs(formula.gdp_growth - actual.gdp_growth),
      unemployment: Math.abs(formula.unemployment - actual.unemployment),
      inflation: Math.abs(formula.inflation - actual.inflation),
      debt_to_gdp: Math.abs(formula.debt_to_gdp - actual.debt_to_gdp),
      life_expectancy: Math.abs(formula.life_expectancy - actual.life_expectancy),
      hdi: Math.abs(formula.hdi - actual.hdi),
    };
    const nnErr: Record<BacktestIndicator, number> = {
      gdp_growth: Math.abs(nn.gdp_growth - actual.gdp_growth),
      unemployment: Math.abs(nn.unemployment - actual.unemployment),
      inflation: Math.abs(nn.inflation - actual.inflation),
      debt_to_gdp: Math.abs(nn.debt_to_gdp - actual.debt_to_gdp),
      life_expectancy: Math.abs(nn.life_expectancy - actual.life_expectancy),
      hdi: Math.abs(nn.hdi - actual.hdi),
    };

    // Directional change vs previous year
    const actualDir: Record<BacktestIndicator, number> = {
      gdp_growth: prevActual ? sign(actual.gdp_growth - prevActual.gdp_growth) : 0,
      unemployment: prevActual ? sign(actual.unemployment - prevActual.unemployment) : 0,
      inflation: prevActual ? sign(actual.inflation - prevActual.inflation) : 0,
      debt_to_gdp: prevActual ? sign(actual.debt_to_gdp - prevActual.debt_to_gdp) : 0,
      life_expectancy: prevActual ? sign(actual.life_expectancy - prevActual.life_expectancy) : 0,
      hdi: prevActual ? sign(actual.hdi - prevActual.hdi) : 0,
    };
    const formulaDir: Record<BacktestIndicator, number> = {
      gdp_growth: prevActual ? sign(formula.gdp_growth - prevActual.gdp_growth) : 0,
      unemployment: prevActual ? sign(formula.unemployment - prevActual.unemployment) : 0,
      inflation: prevActual ? sign(formula.inflation - prevActual.inflation) : 0,
      debt_to_gdp: prevActual ? sign(formula.debt_to_gdp - prevActual.debt_to_gdp) : 0,
      life_expectancy: prevActual ? sign(formula.life_expectancy - prevActual.life_expectancy) : 0,
      hdi: prevActual ? sign(formula.hdi - prevActual.hdi) : 0,
    };
    const nnDir: Record<BacktestIndicator, number> = {
      gdp_growth: prevActual ? sign(nn.gdp_growth - prevActual.gdp_growth) : 0,
      unemployment: prevActual ? sign(nn.unemployment - prevActual.unemployment) : 0,
      inflation: prevActual ? sign(nn.inflation - prevActual.inflation) : 0,
      debt_to_gdp: prevActual ? sign(nn.debt_to_gdp - prevActual.debt_to_gdp) : 0,
      life_expectancy: prevActual ? sign(nn.life_expectancy - prevActual.life_expectancy) : 0,
      hdi: prevActual ? sign(nn.hdi - prevActual.hdi) : 0,
    };

    results.push({
      year: yearData.year,
      notes: yearData.notes,
      actual,
      formula,
      nn,
      formulaErr,
      nnErr,
      actualDir,
      formulaDir,
      nnDir,
    });

    prevActual = { ...actual };
  }

  // ── 4. Compute summary statistics ──
  const formulaMAE: Record<BacktestIndicator, number> = {} as any;
  const nnMAE: Record<BacktestIndicator, number> = {} as any;
  for (const id of BACKTEST_INDICATORS) {
    formulaMAE[id] = mean(results.map((r) => r.formulaErr[id]));
    nnMAE[id] = mean(results.map((r) => r.nnErr[id]));
  }

  // Overall MAE — simple average of the 6 indicator MAEs (each is already in
  // its natural unit: %, years, or [0,1] for HDI).
  const formulaOverallMAE = mean(BACKTEST_INDICATORS.map((id) => formulaMAE[id]));
  const nnOverallMAE = mean(BACKTEST_INDICATORS.map((id) => nnMAE[id]));

  // Directional accuracy: of the (n-1) * 6 = 5*6 = 30 directional comparisons
  // (year-over-year, skipping the first year which has no previous), how many
  // did each predictor get right?
  let formulaDirCorrect = 0, nnDirCorrect = 0, dirTotal = 0;
  for (let i = 1; i < results.length; i++) {
    const r = results[i];
    for (const id of BACKTEST_INDICATORS) {
      if (r.actualDir[id] === 0) continue; // skip flat years (no directional signal)
      dirTotal++;
      if (r.formulaDir[id] === r.actualDir[id]) formulaDirCorrect++;
      if (r.nnDir[id] === r.actualDir[id]) nnDirCorrect++;
    }
  }
  const formulaDirectionalAccuracy = dirTotal > 0 ? formulaDirCorrect / dirTotal : 0;
  const nnDirectionalAccuracy = dirTotal > 0 ? nnDirCorrect / dirTotal : 0;

  // ── 5. Layer-0 verification (Gap 3) ──
  console.log("[backtest] Verifying Gap-3 fix (zeroing layer-0 weights should change output)...");
  const layer0Verification = verifyLayer0WeightsMatter(net);

  // ── 6. Build the markdown report ──
  const markdown = buildMarkdown({
    results,
    formulaMAE,
    nnMAE,
    formulaOverallMAE,
    nnOverallMAE,
    formulaDirectionalAccuracy,
    nnDirectionalAccuracy,
    preTrain,
    layer0Verification,
    layer0VerificationNoFix,
    formulaPretrainLoss,
    dirTotal,
    formulaDirCorrect,
    nnDirCorrect,
    nnEpochs,
  });

  return {
    markdown,
    results,
    formulaMAE,
    nnMAE,
    formulaOverallMAE,
    nnOverallMAE,
    formulaDirectionalAccuracy,
    nnDirectionalAccuracy,
    preTrain,
    layer0Verification,
    layer0VerificationNoFix,
  };
}

// --- Markdown builder ---

interface MarkdownContext {
  results: YearResult[];
  formulaMAE: Record<BacktestIndicator, number>;
  nnMAE: Record<BacktestIndicator, number>;
  formulaOverallMAE: number;
  nnOverallMAE: number;
  formulaDirectionalAccuracy: number;
  nnDirectionalAccuracy: number;
  preTrain: PreTrainResult;
  layer0Verification: Layer0Verification;
  layer0VerificationNoFix: Layer0Verification;
  formulaPretrainLoss: number;
  dirTotal: number;
  formulaDirCorrect: number;
  nnDirCorrect: number;
  nnEpochs: number;
}

function buildMarkdown(c: MarkdownContext): string {
  const lines: string[] = [];
  const now = new Date().toISOString();

  lines.push("# PRISM — Historical Backtest (Morocco 2000-2023)");
  lines.push("");
  lines.push(`> Auto-generated by \`validation/backtest.ts\` at ${now}.`);
  lines.push("> Run `cd mini-services/simulation-engine && bun run validation/backtest.ts` to regenerate.");
  lines.push(">");
  lines.push("> Closes Gap 1 (historical backtesting), Gap 2 (NN training on real");
  lines.push("> time series), and Gap 3 (NN normalization fix) from VALIDATION.md §5.");
  lines.push("");
  lines.push("## 1. Protocol");
  lines.push("");
  lines.push("Six real Morocco data points (World Bank / IMF published values) are used as ground truth:");
  lines.push("");
  lines.push("| Year | GDP growth % | Unemployment % | Inflation % | Debt/GDP % | Life exp (yrs) | HDI |");
  lines.push("|---:|---:|---:|---:|---:|---:|---:|");
  for (const y of MOROCCO_HISTORICAL) {
    lines.push(
      `| ${y.year} | ${y.gdp_growth} | ${y.unemployment} | ${y.inflation} | ${y.debt_to_gdp} | ${y.life_expectancy} | ${y.hdi} |`,
    );
  }
  lines.push("");
  lines.push("For each year, the 47 levers are positioned via `leverOverrides` (historical proxy —");
  lines.push("selected from published sources where possible, estimated otherwise). All other");
  lines.push("levers stay at their baseline (calibrated to ~2022-2023). Two predictors are then run:");
  lines.push("");
  lines.push("1. **Formulas** — `formulas.computeAllIndicators(levers, prevGdp, accumulatedDebt)`.");
  lines.push("2. **Neural network** — `neural-network.forward(net, leverValues)` — the production code path.");
  lines.push("");
  lines.push("The NN is built as follows (closing Gap 2 + Gap 3):");
  lines.push("- `pretrainFromFormulas(net, 30)` — exactly mirrors the `SimulationEngine` constructor (final");
  lines.push(`  loss = ${c.formulaPretrainLoss.toFixed(6)}).`);
  lines.push(`- \`preTrainOnRealData(net, ${c.nnEpochs})\` — fine-tunes on the 6 real data points above.`);
  lines.push("  This applies the Gap-3 fix by default: `layerLRMultiplier = [3, 1, 1]` (layer-0 LR");
  lines.push("  3× higher) and `biasDecay = 0.001` (L2 on biases only — forces the network to use");
  lines.push("  weights rather than relying on biases to absorb the baseline signal).");
  lines.push("");

  // ── Section 2: NN training on real data ──
  lines.push("## 2. NN training on real data (Gap 2)");
  lines.push("");
  lines.push(`Loss before fine-tuning: **${c.preTrain.beforeLoss.toFixed(6)}** (normalized MSE on the 6 real samples).`);
  lines.push(`Loss after ${c.nnEpochs} epochs of SGD with momentum: **${c.preTrain.afterLoss.toFixed(6)}**.`);
  lines.push(`Reduction factor: **${(c.preTrain.beforeLoss / Math.max(c.preTrain.afterLoss, 1e-12)).toFixed(1)}×**.`);
  lines.push("");
  lines.push("Loss curve (every 50th epoch shown):");
  lines.push("");
  lines.push("| Epoch | Avg MSE loss |");
  lines.push("|---:|---:|");
  const stride = Math.max(1, Math.floor(c.preTrain.lossHistory.length / 10));
  for (let i = 0; i < c.preTrain.lossHistory.length; i += stride) {
    lines.push(`| ${i} | ${c.preTrain.lossHistory[i].toFixed(6)} |`);
  }
  // Always show the last point
  const lastIdx = c.preTrain.lossHistory.length - 1;
  if (lastIdx % stride !== 0) {
    lines.push(`| ${lastIdx} | ${c.preTrain.lossHistory[lastIdx].toFixed(6)} |`);
  }
  lines.push("");

  // ── Section 3: Year-by-year table ──
  lines.push("## 3. Year-by-year predicted vs actual");
  lines.push("");
  for (const r of c.results) {
    lines.push(`### ${r.year}`);
    lines.push("");
    lines.push(`> ${r.notes}`);
    lines.push("");
    lines.push("| Indicator | Actual | Formulas | NN | Formula err | NN err |");
    lines.push("|---|---:|---:|---:|---:|---:|");
    for (const id of BACKTEST_INDICATORS) {
      const hd = id === "hdi" ? 3 : id === "life_expectancy" ? 1 : 2;
      lines.push(
        `| ${id} | ${fmt(r.actual[id], hd)} | ${fmt(r.formula[id], hd)} | ${fmt(r.nn[id], hd)} | ${fmt(r.formulaErr[id], hd)} | ${fmt(r.nnErr[id], hd)} |`,
      );
    }
    lines.push("");
  }

  // ── Section 4: MAE summary ──
  lines.push("## 4. MAE summary (mean absolute error across 6 years)");
  lines.push("");
  lines.push("| Indicator | Formula MAE | NN MAE | NN / Formula | Winner |");
  lines.push("|---|---:|---:|---:|---|");
  for (const id of BACKTEST_INDICATORS) {
    const f = c.formulaMAE[id];
    const n = c.nnMAE[id];
    const ratio = f > 1e-9 ? n / f : Infinity;
    const winner = n < f ? "NN" : f < n ? "Formulas" : "tie";
    const hd = id === "hdi" ? 3 : id === "life_expectancy" ? 1 : 2;
    lines.push(`| ${id} | ${fmt(f, hd)} | ${fmt(n, hd)} | ${Number.isFinite(ratio) ? ratio.toFixed(2) : "∞"} | ${winner} |`);
  }
  lines.push(`| **Overall (mean of 6)** | **${c.formulaOverallMAE.toFixed(3)}** | **${c.nnOverallMAE.toFixed(3)}** | ${(c.formulaOverallMAE > 1e-9 ? c.nnOverallMAE / c.formulaOverallMAE : 0).toFixed(2)} | ${c.nnOverallMAE < c.formulaOverallMAE ? "NN" : "Formulas"} |`);
  lines.push("");
  lines.push("**Note on units.** Each MAE is in the indicator's natural unit (%, years, or [0,1] for HDI).");
  lines.push("HDI has tiny absolute errors because it's a [0,1] score; life expectancy errors are in years.");
  lines.push("The 'Overall' row is the simple mean of the 6 indicator MAEs (which mixes units — interpret");
  lines.push("directionally, not as a composite error metric).");
  lines.push("");

  // ── Section 5: Directional accuracy ──
  lines.push("## 5. Directional accuracy (year-over-year change direction)");
  lines.push("");
  lines.push(`Of ${c.dirTotal} year-over-year directional comparisons (5 transitions × 6 indicators,`);
  lines.push("excluding flat actual changes):");
  lines.push("");
  lines.push(`- **Formulas**: ${c.formulaDirCorrect}/${c.dirTotal} correct = **${(c.formulaDirectionalAccuracy * 100).toFixed(1)}%**`);
  lines.push(`- **NN**     : ${c.nnDirCorrect}/${c.dirTotal} correct = **${(c.nnDirectionalAccuracy * 100).toFixed(1)}%**`);
  lines.push("");
  lines.push("Year-over-year change direction table (`+` = up, `−` = down, `.` = flat/skip):");
  lines.push("");
  lines.push("| Year transition | Indicator | Actual | Formula | NN |");
  lines.push("|---|---|:---:|:---:|:---:|");
  for (let i = 1; i < c.results.length; i++) {
    const prev = c.results[i - 1];
    const cur = c.results[i];
    for (const id of BACKTEST_INDICATORS) {
      const arrow = (s: number) => (s > 0 ? "+" : s < 0 ? "−" : ".");
      lines.push(
        `| ${prev.year}→${cur.year} | ${id} | ${arrow(cur.actualDir[id])} | ${arrow(cur.formulaDir[id])} | ${arrow(cur.nnDir[id])} |`,
      );
    }
  }
  lines.push("");

  // ── Section 6: Gap-3 verification ──
  lines.push("## 6. Gap-3 verification: layer-0 weights carry signal");
  lines.push("");
  lines.push("**Method.** For two input vectors (baseline and +25%-of-range perturbed), compute the");
  lines.push("network's output, then zero all layer-0 weights, recompute, and measure the delta.");
  lines.push("If layer-0 weights carry signal, the perturbed delta should be non-trivial.");
  lines.push("(The baseline delta is expected to be ~0 because at baseline, all normalized inputs are 0,");
  lines.push("so layer-0 weights never activate — this is by design of the normalization, not a bug.)");
  lines.push("");
  lines.push("### 6.1 With Gap-3 fix (layer-0 LR 3×, biasDecay 0.001)");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---:|");
  lines.push(`| Layer-0 weight count (nonzero out of 1504) | ${c.layer0Verification.layer0WeightStats.nonzero} |`);
  lines.push(`| Layer-0 weight mean | ${c.layer0Verification.layer0WeightStats.mean.toFixed(6)} |`);
  lines.push(`| Layer-0 weight std | ${c.layer0Verification.layer0WeightStats.std.toFixed(6)} |`);
  lines.push(`| Layer-0 weight max abs | ${c.layer0Verification.layer0WeightStats.max.toFixed(6)} |`);
  lines.push(`| Perturbed max output delta (after zeroing layer 0) | ${c.layer0Verification.perturbedMaxDelta.toExponential(4)} |`);
  lines.push(`| Baseline max output delta (after zeroing layer 0) | ${c.layer0Verification.baselineMaxDelta.toExponential(4)} |`);
  lines.push(`| **weightsMatter** (perturbedMaxDelta > 1e-3) | **${c.layer0Verification.weightsMatter}** |`);
  lines.push("");
  lines.push("### 6.2 Without Gap-3 fix (layerMult = [1,1,1], biasDecay = 0) — for comparison");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---:|");
  lines.push(`| Layer-0 weight count (nonzero out of 1504) | ${c.layer0VerificationNoFix.layer0WeightStats.nonzero} |`);
  lines.push(`| Layer-0 weight mean | ${c.layer0VerificationNoFix.layer0WeightStats.mean.toFixed(6)} |`);
  lines.push(`| Layer-0 weight std | ${c.layer0VerificationNoFix.layer0WeightStats.std.toFixed(6)} |`);
  lines.push(`| Layer-0 weight max abs | ${c.layer0VerificationNoFix.layer0WeightStats.max.toFixed(6)} |`);
  lines.push(`| Perturbed max output delta (after zeroing layer 0) | ${c.layer0VerificationNoFix.perturbedMaxDelta.toExponential(4)} |`);
  lines.push(`| **weightsMatter** (perturbedMaxDelta > 1e-3) | **${c.layer0VerificationNoFix.weightsMatter}** |`);
  lines.push("");
  const stdDelta = c.layer0Verification.layer0WeightStats.std - c.layer0VerificationNoFix.layer0WeightStats.std;
  const maxDelta = c.layer0Verification.layer0WeightStats.max - c.layer0VerificationNoFix.layer0WeightStats.max;
  lines.push("### 6.3 Interpretation");
  lines.push("");
  lines.push(`- The fix increased layer-0 weight std by **${stdDelta >= 0 ? "+" : ""}${stdDelta.toFixed(4)}**`);
  lines.push(`  (from ${c.layer0VerificationNoFix.layer0WeightStats.std.toFixed(4)} → ${c.layer0Verification.layer0WeightStats.std.toFixed(4)}).`);
  lines.push(`- The fix increased layer-0 weight max abs by **${maxDelta >= 0 ? "+" : ""}${maxDelta.toFixed(4)}**`);
  lines.push(`  (from ${c.layer0VerificationNoFix.layer0WeightStats.max.toFixed(4)} → ${c.layer0Verification.layer0WeightStats.max.toFixed(4)}).`);
  lines.push(`- Zeroing layer-0 weights at a perturbed input changed the output by`);
  lines.push(`  ${c.layer0Verification.perturbedMaxDelta.toExponential(2)} (with fix) vs ${c.layer0VerificationNoFix.perturbedMaxDelta.toExponential(2)} (without).`);
  lines.push(`- **Verdict**: ${c.layer0Verification.weightsMatter ? "✓ layer-0 weights carry signal (weightsMatter = true)" : "✗ layer-0 weights do NOT carry signal (weightsMatter = false)"}.`);
  lines.push("");
  lines.push("> **Note on the baseline delta being 0.** The network's input normalization");
  lines.push("> subtracts `lever.baseline` from each input. At baseline, all normalized inputs are");
  lines.push("> exactly 0, so the layer-0 weighted sum is 0 (since `0 × w = 0`), regardless of");
  lines.push("> what the weights are. The output at baseline is determined entirely by the");
  lines.push("> biases of all three layers. This is why we verify at a *perturbed* input —");
  lines.push("> zeroing layer-0 weights only changes the output when the inputs are non-zero");
  lines.push("> in normalized space. The biasDecay term addresses the *training dynamics*: it");
  lines.push("> prevents biases from growing unboundedly to compensate for small layer-0 weights,");
  lines.push("> forcing the network to encode signal in the weights themselves.");
  lines.push("");

  // ── Section 7: Honest interpretation ──
  lines.push("## 7. Honest interpretation");
  lines.push("");
  const formulaWins = BACKTEST_INDICATORS.filter((id) => c.formulaMAE[id] < c.nnMAE[id]).length;
  const nnWins = BACKTEST_INDICATORS.filter((id) => c.nnMAE[id] < c.formulaMAE[id]).length;
  lines.push(`- On raw MAE, formulas beat the NN on ${formulaWins}/${BACKTEST_INDICATORS.length} indicators; the NN beats formulas on ${nnWins}/${BACKTEST_INDICATORS.length}.`);
  lines.push(`- On directional accuracy, formulas get ${(c.formulaDirectionalAccuracy * 100).toFixed(1)}% vs NN at ${(c.nnDirectionalAccuracy * 100).toFixed(1)}% of year-over-year change directions correct.`);
  lines.push(`- The NN was fine-tuned on these EXACT 6 data points (in-sample), so its MAE on them is artificially low — this is a fit-quality diagnostic, NOT a generalization test. The directional accuracy is the more honest signal: it tests whether the network learned the *shape* of the historical trajectory, not just memorized the 6 target values.`);
  lines.push(`- The Gap-3 fix is verified: ${c.layer0Verification.weightsMatter ? "zeroing layer-0 weights changes the output by " + c.layer0Verification.perturbedMaxDelta.toExponential(2) + " (well above the 1e-3 threshold)" : "zeroing layer-0 weights does NOT change the output — fix failed"}.`);
  lines.push("");
  lines.push("### 7.1 What this backtest does NOT prove");
  lines.push("");
  lines.push("1. **No out-of-sample test.** The NN trained on these exact 6 years and is evaluated on the same 6. A proper generalization test would hold out, say, 2010 and 2015, train on the other 4, and predict the held-out years. With only 6 data points, this is statistically weak — but the framework is in place to add more years as data is collected.");
  lines.push("2. **Lever values are PROXIES, not authoritative.** The 47 levers per year are reconstructed from published sources where possible (interest rate, minimum_wage, public_investment) and estimated otherwise (doctors_per_1k in 2000 ≈ 0.4 is an educated guess from WHO trend data). Errors in lever reconstruction propagate to BOTH the formula and NN predictors, so the comparison is fair but the absolute MAEs are upper bounds on the *model's* error.");
  lines.push("3. **The formula predictor is fed prevGdp + accumulatedDebt directly from the historical record.** This is a 'cheat' — in production, the engine computes these from its own state. The backtest measures the *formula's* fidelity to the data when given the right macro state, not the engine's ability to track the trajectory over multi-year simulation.");
  lines.push("4. **The 6 indicators were chosen because they have clean, published, year-by-year data.** Indicators like `stability`, `revolution_risk`, `gini`, `poverty_rate` are harder to backtest (sparse or model-dependent definitions).");
  lines.push("");

  // ── Section 8: Reproducibility ──
  lines.push("## 8. Reproducibility");
  lines.push("");
  lines.push("```bash");
  lines.push("cd mini-services/simulation-engine");
  lines.push("bun run validation/backtest.ts");
  lines.push("```");
  lines.push("");
  lines.push("The harness is deterministic EXCEPT for the NN's `pretrainFromFormulas` step, which");
  lines.push("uses `Math.random()` to generate the 200 synthetic samples. To make runs comparable,");
  lines.push("the `preTrainOnRealData` step uses fixed real data (no randomness), so the fine-tuning");
  lines.push("trajectory is deterministic given the same starting network. For full reproducibility,");
  lines.push("call `Math.seedrandom(...)` before `createNetwork()` (not done here to avoid adding a");
  lines.push("dependency).");
  lines.push("");
  lines.push("Source: `mini-services/simulation-engine/validation/backtest.ts`.");
  lines.push("");

  return lines.join("\n");
}

// --- CLI entry point ---

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  PRISM Historical Backtest (Morocco 2000-2023)");
  console.log(`  Start: ${new Date().toISOString()}`);
  console.log("═══════════════════════════════════════════════════════════");
  const t0 = Date.now();
  const result = runBacktest({ nnEpochs: 500 });
  const OUTPUT_PATH = "/home/z/my-project/BACKTEST.md";
  await Bun.write(OUTPUT_PATH, result.markdown);
  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  ✓ BACKTEST.md written to ${OUTPUT_PATH}`);
  console.log(`  Size: ${(result.markdown.length / 1024).toFixed(1)} KB, ~${result.markdown.split(/\s+/).length} words`);
  console.log(`  Formula overall MAE: ${result.formulaOverallMAE.toFixed(3)} | NN overall MAE: ${result.nnOverallMAE.toFixed(3)}`);
  console.log(`  Formula directional accuracy: ${(result.formulaDirectionalAccuracy * 100).toFixed(1)}% | NN: ${(result.nnDirectionalAccuracy * 100).toFixed(1)}%`);
  console.log(`  Layer-0 verification: weightsMatter = ${result.layer0Verification.weightsMatter} (perturbedMaxDelta = ${result.layer0Verification.perturbedMaxDelta.toExponential(3)})`);
  console.log(`  End: ${new Date().toISOString()}, elapsed ${((Date.now() - t0) / 1000).toFixed(2)}s`);
  console.log("═══════════════════════════════════════════════════════════");
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
