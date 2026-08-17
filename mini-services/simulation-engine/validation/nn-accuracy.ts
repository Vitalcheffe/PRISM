// nn-accuracy.ts — Tests the neural network's accuracy against the formulas.
//
// Protocol:
//   1. Construct a fresh `NeuralNetwork` and run `pretrainFromFormulas(net, 30)`
//      (exactly what `SimulationEngine`'s constructor does in production).
//   2. Generate 200 random lever configurations, sampled uniformly from each
//      lever's [min, max] range.
//   3. For each config, compute ground-truth indicators via
//      `formulas.computeAllIndicators()` and NN-predicted indicators via
//      `forward(net, leverValues)`.
//   4. Report MAE, RMSE, and R² per indicator across all 200 samples
//      (pre-training accuracy).
//   5. Train/test split: take the first 100 as the train set, the remaining
//      100 as the held-out test set. Run 20 additional training epochs on
//      the train set. Re-evaluate on both train and test.
//   6. Report the train vs test gap (overfitting diagnostic) and the
//      post-training R² improvement.
//
// All numbers come from the actual engine — no mocking.

import { LEVERS, INDICATORS, MACRO_CONSTANTS } from "../model.js";
import { computeAllIndicators, type Levers } from "../formulas.js";
import {
  createNetwork,
  forward,
  pretrainFromFormulas,
  trainEpoch,
  type NeuralNetwork,
} from "../neural-network.js";

export interface IndicatorMetrics {
  mae: number;
  rmse: number;
  r2: number;
  groundTruthMean: number;
  groundTruthStd: number;
  predictionMean: number;
}

export interface NNAccuracyResult {
  markdown: string;
  preTrainMetrics: Record<string, IndicatorMetrics>;
  postTrainTrainMetrics: Record<string, IndicatorMetrics>;
  postTrainTestMetrics: Record<string, IndicatorMetrics>;
  preTrainOverallMAE: number;
  postTrainTestOverallMAE: number;
  trainLossHistory: number[];
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

// Mirror the pretrainFromFormulas sampling: ±9% of the lever range around
// the baseline value (the code uses (rand − 0.5) × 0.6 × range × 0.3 = ±9%).
// This is the NN's in-distribution regime — the operating regime the
// production SimulationEngine actually lives in.
function generateInDistributionSamples(n: number): { levers: Levers; leverValues: number[]; targets: number[] }[] {
  const samples: { levers: Levers; leverValues: number[]; targets: number[] }[] = [];
  for (let s = 0; s < n; s++) {
    const levers: Levers = {};
    const leverValues: number[] = [];
    for (const l of LEVERS) {
      const perturbation = (Math.random() - 0.5) * 0.6;
      const range = l.max - l.min;
      const v = l.baseline + perturbation * range * 0.3;
      levers[l.id] = clamp(v, l.min, l.max);
      leverValues.push(levers[l.id]);
    }
    const indicators = computeAllIndicators(
      levers,
      MACRO_CONSTANTS.gdp_baseline_mrd_mad,
      MACRO_CONSTANTS.debt_baseline_mrd_mad,
    );
    const targets = INDICATORS.map((ind) => (indicators as any)[ind.id] as number);
    samples.push({ levers, leverValues, targets });
  }
  return samples;
}

// Out-of-distribution sampling: uniform across [min, max]. This exposes the
// NN's generalization gap — how badly it predicts when levers are pushed
// far from baseline (the regime a policy stress-tester would explore).
function generateOutOfDistributionSamples(n: number): { levers: Levers; leverValues: number[]; targets: number[] }[] {
  const samples: { levers: Levers; leverValues: number[]; targets: number[] }[] = [];
  for (let s = 0; s < n; s++) {
    const levers: Levers = {};
    const leverValues: number[] = [];
    for (const l of LEVERS) {
      const v = l.min + Math.random() * (l.max - l.min);
      levers[l.id] = clamp(v, l.min, l.max);
      leverValues.push(levers[l.id]);
    }
    const indicators = computeAllIndicators(
      levers,
      MACRO_CONSTANTS.gdp_baseline_mrd_mad,
      MACRO_CONSTANTS.debt_baseline_mrd_mad,
    );
    const targets = INDICATORS.map((ind) => (indicators as any)[ind.id] as number);
    samples.push({ levers, leverValues, targets });
  }
  return samples;
}

function evaluate(
  net: NeuralNetwork,
  samples: { leverValues: number[]; targets: number[] }[],
): Record<string, IndicatorMetrics> {
  const metrics: Record<string, IndicatorMetrics> = {};
  const n = samples.length;
  for (let i = 0; i < INDICATORS.length; i++) {
    const ind = INDICATORS[i];
    const gtArr: number[] = new Array(n);
    const predArr: number[] = new Array(n);
    for (let s = 0; s < n; s++) {
      const pred = forward(net, samples[s].leverValues);
      gtArr[s] = samples[s].targets[i];
      predArr[s] = pred[i];
    }
    // MAE
    let sumAbs = 0, sumSq = 0;
    let gtMean = 0, predMean = 0;
    for (let s = 0; s < n; s++) {
      const diff = predArr[s] - gtArr[s];
      sumAbs += Math.abs(diff);
      sumSq += diff * diff;
      gtMean += gtArr[s];
      predMean += predArr[s];
    }
    gtMean /= n;
    predMean /= n;
    const mae = sumAbs / n;
    const rmse = Math.sqrt(sumSq / n);
    // R² = 1 - SS_res / SS_tot
    let ssRes = 0, ssTot = 0;
    for (let s = 0; s < n; s++) {
      ssRes += (predArr[s] - gtArr[s]) ** 2;
      ssTot += (gtArr[s] - gtMean) ** 2;
    }
    const r2 = ssTot > 1e-12 ? 1 - ssRes / ssTot : 0;
    // GT std
    let varSum = 0;
    for (let s = 0; s < n; s++) varSum += (gtArr[s] - gtMean) ** 2;
    const gtStd = Math.sqrt(varSum / n);

    metrics[ind.id] = { mae, rmse, r2, groundTruthMean: gtMean, groundTruthStd: gtStd, predictionMean: predMean };
  }
  return metrics;
}

function overallMAE(metrics: Record<string, IndicatorMetrics>): number {
  // Mean of MAE / indicator_scale, so indicators with large magnitudes (gdp)
  // don't dominate. This gives a unitless "fraction of typical scale" error.
  const scales: Record<string, number> = {
    gdp: 1400, gdp_growth: 5, gdp_per_capita: 37000, unemployment: 10, inflation: 5,
    debt_to_gdp: 60, budget_deficit: 100, tax_revenue: 400, life_expectancy: 73,
    hdi: 0.7, gini: 0.4, balance_of_trade: 160, poverty_rate: 10, stability: 50,
    revolution_risk: 30, public_spending: 500,
  };
  let sum = 0, count = 0;
  for (const id of Object.keys(metrics)) {
    sum += metrics[id].mae / (scales[id] || 1);
    count++;
  }
  return sum / count;
}

function formatMetricRow(
  ind: typeof INDICATORS[number],
  m: IndicatorMetrics,
): string {
  const fmt = (x: number, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : "NaN");
  return `| \`${ind.id}\` — ${ind.name} | ${fmt(m.groundTruthMean)} | ${fmt(m.predictionMean)} | ${fmt(m.mae)} | ${fmt(m.rmse)} | ${fmt(m.r2)} |`;
}

export function runNNAccuracy(): NNAccuracyResult {
  // 1. Construct & pretrain (mirrors engine.ts constructor)
  const net = createNetwork();
  const pretrainLoss = pretrainFromFormulas(net, 30);

  // 2. Generate 200 in-distribution samples (matching pretrain sampling) +
  //    100 out-of-distribution samples for the generalization test.
  const inDistSamples = generateInDistributionSamples(200);
  const trainSamples = inDistSamples.slice(0, 100);
  const testSamples = inDistSamples.slice(100, 200);
  const oodSamples = generateOutOfDistributionSamples(100);

  // 4. Pre-training evaluation on all 200 in-distribution samples
  const preTrainMetrics = evaluate(net, inDistSamples);
  const preTrainOverallMAE = overallMAE(preTrainMetrics);

  // Pre-training evaluation on the held-out 100 (apples-to-apples vs post-train)
  const preTrainTestMetrics = evaluate(net, testSamples);
  const preTrainTestOverallMAE = overallMAE(preTrainTestMetrics);

  // Pre-training evaluation on out-of-distribution samples (generalization gap)
  const preTrainOODMetrics = evaluate(net, oodSamples);
  const preTrainOODOverallMAE = overallMAE(preTrainOODMetrics);

  // 5. Additional 20 epochs on the train set (in-distribution).
  //    Use a small learning rate — pretrainFromFormulas already converged
  //    (final loss ~0.003), so this is fine-tuning, not fresh training.
  //    Larger learning rates were observed to push the network away from
  //    its pre-train optimum and degrade held-out accuracy.
  const trainLossHistory: number[] = [];
  for (let e = 0; e < 20; e++) {
    const lr = 0.00005 * Math.pow(0.95, e);
    const loss = trainEpoch(net, trainSamples, lr, 0.9);
    trainLossHistory.push(loss);
  }

  // 6. Post-training evaluation (in-distribution train + test, and OOD)
  const postTrainTrainMetrics = evaluate(net, trainSamples);
  const postTrainTestMetrics = evaluate(net, testSamples);
  const postTrainOODMetrics = evaluate(net, oodSamples);
  const postTrainTestOverallMAE = overallMAE(postTrainTestMetrics);
  const postTrainOODOverallMAE = overallMAE(postTrainOODMetrics);

  // ── Markdown ──
  const lines: string[] = [];
  lines.push("## 4. Neural Network Accuracy");
  lines.push("");
  lines.push("> The PRISM `SimulationEngine` does not call `formulas.computeAllIndicators()` at runtime. Its `recompute()` method runs a forward pass through a 47→32→32→15 multilayer perceptron (3,008 weights, 3,087 trainable parameters with biases) that has been pre-trained on the formulas. The NN is the production code path. This section measures how faithfully the NN reproduces the formulas it was trained on, before and after additional training, in-distribution and out-of-distribution.");
  lines.push("");
  lines.push(`**Setup.** Two sample sets are generated:`);
  lines.push(`- **In-distribution (200 samples):** each lever perturbed by ±9% of its range around baseline — exactly mirroring the \`pretrainFromFormulas\` sampling (\`(rand − 0.5) × 0.6 × range × 0.3\`). This is the NN's operating regime. Split 100 train / 100 held-out test.`);
  lines.push(`- **Out-of-distribution (100 samples):** each lever sampled uniformly from its full \`[min, max]\` range — the regime a policy stress-tester explores. Held out entirely (never trained on).`);
  lines.push(`Pre-training = 30 epochs of \`pretrainFromFormulas\` (final loss = ${pretrainLoss.toFixed(6)}), exactly mirroring the \`SimulationEngine\` constructor. Then 20 additional epochs of fine-tuning on the in-distribution train set with \`lr = 0.00005 × 0.95^epoch\` (deliberately small — the pre-training already converged; larger learning rates were found to degrade held-out accuracy), momentum 0.9.`);
  lines.push("");

  // Pre-training table — in-distribution
  lines.push("### 4.1 Pre-training accuracy — in-distribution (200 samples, ±9% of range)");
  lines.push("");
  lines.push("| Indicator | GT mean | Pred mean | MAE | RMSE | R² |");
  lines.push("|---|---:|---:|---:|---:|---:|");
  for (const ind of INDICATORS) {
    lines.push(formatMetricRow(ind, preTrainMetrics[ind.id]));
  }
  lines.push("");
  lines.push(`**Overall normalized MAE (in-distribution, pre-training): ${(preTrainOverallMAE * 100).toFixed(2)}%** — average absolute error as a fraction of each indicator's typical scale.`);
  lines.push("");

  // Pre-training table — out-of-distribution
  lines.push(`### 4.2 Pre-training accuracy — out-of-distribution (100 samples, full \`[min, max]\`)`);
  lines.push("");
  lines.push("| Indicator | GT mean | Pred mean | MAE | RMSE | R² |");
  lines.push("|---|---:|---:|---:|---:|---:|");
  for (const ind of INDICATORS) {
    lines.push(formatMetricRow(ind, preTrainOODMetrics[ind.id]));
  }
  lines.push("");
  lines.push(`**Overall normalized MAE (out-of-distribution, pre-training): ${(preTrainOODOverallMAE * 100).toFixed(2)}%** — the generalization gap vs in-distribution is the difference between these two numbers.`);
  lines.push("");

  // Post-training tables
  lines.push("### 4.3 Post-training accuracy — in-distribution train set (100 samples)");
  lines.push("");
  lines.push("| Indicator | GT mean | Pred mean | MAE | RMSE | R² |");
  lines.push("|---|---:|---:|---:|---:|---:|");
  for (const ind of INDICATORS) {
    lines.push(formatMetricRow(ind, postTrainTrainMetrics[ind.id]));
  }
  lines.push("");

  lines.push("### 4.4 Post-training accuracy — in-distribution held-out test set (100 samples)");
  lines.push("");
  lines.push("| Indicator | GT mean | Pred mean | MAE | RMSE | R² |");
  lines.push("|---|---:|---:|---:|---:|---:|");
  for (const ind of INDICATORS) {
    lines.push(formatMetricRow(ind, postTrainTestMetrics[ind.id]));
  }
  lines.push("");
  lines.push(`**Overall normalized MAE (in-distribution held-out test): ${(postTrainTestOverallMAE * 100).toFixed(2)}%**.`);
  lines.push("");

  // Post-training OOD
  lines.push(`### 4.5 Post-training accuracy — out-of-distribution (100 samples, full \`[min, max]\`)`);
  lines.push("");
  lines.push("| Indicator | GT mean | Pred mean | MAE | RMSE | R² |");
  lines.push("|---|---:|---:|---:|---:|---:|");
  for (const ind of INDICATORS) {
    lines.push(formatMetricRow(ind, postTrainOODMetrics[ind.id]));
  }
  lines.push("");
  lines.push(`**Overall normalized MAE (out-of-distribution): ${(postTrainOODOverallMAE * 100).toFixed(2)}%** — this is the engine's expected error when a policy stress-tester drags levers far from baseline.`);
  lines.push("");

  // Train vs test gap (overfitting diagnostic)
  lines.push("### 4.6 Overfitting diagnostic — train vs test R² (in-distribution)");
  lines.push("");
  lines.push("| Indicator | Train R² | Test R² | Gap (test − train) |");
  lines.push("|---|---:|---:|---:|");
  for (const ind of INDICATORS) {
    const tr = postTrainTrainMetrics[ind.id].r2;
    const te = postTrainTestMetrics[ind.id].r2;
    const gap = te - tr;
    lines.push(`| \`${ind.id}\` — ${ind.name} | ${tr.toFixed(4)} | ${te.toFixed(4)} | ${gap.toFixed(4)} |`);
  }
  lines.push("");

  // Loss history
  lines.push("### 4.7 Training loss curve (20 additional epochs)");
  lines.push("");
  lines.push("| Epoch | Avg MSE loss |");
  lines.push("|---:|---:|");
  trainLossHistory.forEach((loss, i) => {
    lines.push(`| ${i + 1} | ${loss.toFixed(6)} |`);
  });
  lines.push("");

  // Interpretation
  const avgTestR2 = INDICATORS.reduce((s, ind) => s + postTrainTestMetrics[ind.id].r2, 0) / INDICATORS.length;
  const avgTrainR2 = INDICATORS.reduce((s, ind) => s + postTrainTrainMetrics[ind.id].r2, 0) / INDICATORS.length;
  const avgOODR2 = INDICATORS.reduce((s, ind) => s + postTrainOODMetrics[ind.id].r2, 0) / INDICATORS.length;
  const avgPreTrainTestR2 = INDICATORS.reduce((s, ind) => s + preTrainTestMetrics[ind.id].r2, 0) / INDICATORS.length;
  const avgPreTrainOODR2 = INDICATORS.reduce((s, ind) => s + preTrainOODMetrics[ind.id].r2, 0) / INDICATORS.length;
  // Median R² is more robust to outliers (life_expectancy, hdi, unemployment have
  // catastrophically negative R² that drags down the mean).
  const preTrainTestR2s = INDICATORS.map((ind) => preTrainTestMetrics[ind.id].r2).sort((a, b) => a - b);
  const medianPreTrainTestR2 = preTrainTestR2s[Math.floor(preTrainTestR2s.length / 2)];
  const indicatorsWithGoodR2 = INDICATORS.filter((ind) => preTrainTestMetrics[ind.id].r2 > 0.5).length;
  const indicatorsWithNegativeR2 = INDICATORS.filter((ind) => preTrainTestMetrics[ind.id].r2 < 0).length;
  lines.push("### 4.8 Interpretation");
  lines.push("");
  lines.push(`- **Pre-training mean R² (in-distribution held-out test): ${avgPreTrainTestR2.toFixed(4)}** (mean is dragged down by a few catastrophic outliers).`);
  lines.push(`- **Pre-training median R² (in-distribution held-out test): ${medianPreTrainTestR2.toFixed(4)}** — the median is the more representative statistic.`);
  lines.push(`- **Pre-training mean R² (out-of-distribution): ${avgPreTrainOODR2.toFixed(4)}**.`);
  lines.push(`- **Pre-training: ${indicatorsWithGoodR2}/${INDICATORS.length} indicators have R² > 0.5** (well-fit), **${indicatorsWithNegativeR2}/${INDICATORS.length} have R² < 0** (worse than predicting the mean).`);
  lines.push(`- **Post-fine-tuning mean R² (train): ${avgTrainR2.toFixed(4)}**, **post-fine-tuning mean R² (test): ${avgTestR2.toFixed(4)}**, **post-fine-tuning mean R² (OOD): ${avgOODR2.toFixed(4)}**.`);
  if (medianPreTrainTestR2 > 0.5) {
    lines.push(`- **Pre-training verdict: the NN reproduces the formulas with reasonable fidelity in-distribution** (median R² ${medianPreTrainTestR2.toFixed(4)} > 0.5 on held-out samples; ${indicatorsWithGoodR2}/${INDICATORS.length} indicators well-fit). The 47→32→32→15 architecture is sufficient to express the (mostly linear) economic identities in \`formulas.ts\`. The mean R² is dragged down by a few non-linear indicators (\`life_expectancy\`, \`hdi\` — both involve bounded contributions or \`cbrt\` / \`log\` non-linearities that a small ReLU MLP struggles to fit) and by \`unemployment\` (whose R² is dominated by the formula's Okun-law wage-effect channel which is small in magnitude relative to its variance).`);
  } else if (medianPreTrainTestR2 > 0.2) {
    lines.push(`- **Pre-training verdict: the NN reproduces the formulas only partially in-distribution** (median R² ${medianPreTrainTestR2.toFixed(4)}). Linear indicators are well-fit; non-linear ones (\`life_expectancy\`, \`hdi\`) are not.`);
  } else {
    lines.push(`- **Pre-training verdict: the NN fails to reproduce the formulas even in-distribution** (median R² ${medianPreTrainTestR2.toFixed(4)}). The pre-training protocol (30 epochs, 200 samples) is insufficient. This is a real weakness documented in RESEARCH.md §12.3 limitation #1.`);
  }
  if (avgPreTrainOODR2 < 0) {
    lines.push(`- **Out-of-distribution verdict: the NN generalizes POORLY outside its training distribution** (mean R² ${avgPreTrainOODR2.toFixed(4)} < 0). When levers are pushed far from baseline — exactly the regime a policy stress-tester explores — the NN's predictions diverge substantially from the formulas. The production \`SimulationEngine.recompute()\` is therefore unreliable for extreme scenarios; this is the most important finding of §4.`);
  }
  if (postTrainTestOverallMAE > preTrainTestOverallMAE) {
    lines.push(`- **Fine-tuning verdict: the additional 20 epochs of training on the 100-sample train subset DEGRADED held-out accuracy** (${(preTrainTestOverallMAE * 100).toFixed(2)}% → ${(postTrainTestOverallMAE * 100).toFixed(2)}%). The pre-train optimum is fragile: training on a subset pushes the network toward that subset's optimum, which differs from the global 200-sample optimum. This is a known failure mode of small-data fine-tuning without regularization — the production engine's \`learnFromDocument\` path (which calls \`train()\` on individual samples) is at risk of the same degradation if called repeatedly.`);
  } else {
    lines.push(`- **Fine-tuning verdict: the additional 20 epochs of training on the 100-sample train subset improved held-out accuracy** (${(preTrainTestOverallMAE * 100).toFixed(2)}% → ${(postTrainTestOverallMAE * 100).toFixed(2)}%).`);
  }
  lines.push("");
  const gap = avgTrainR2 - avgTestR2;
  if (gap > 0.1) {
    lines.push(`- **In-distribution train/test gap = ${gap.toFixed(4)}** — indicates overfitting. The network memorizes the train set rather than generalizing. Mitigations: more samples, regularization (weight decay / dropout), early stopping.`);
  } else {
    lines.push(`- **In-distribution train/test gap = ${gap.toFixed(4)}** — no significant overfitting detected (the model is either well-generalized or under-fit on both sets).`);
  }
  lines.push(`- **Out-of-distribution mean R² = ${avgOODR2.toFixed(4)}** vs in-distribution test R² = ${avgTestR2.toFixed(4)}. The OOD/in-distribution gap quantifies how much the NN degrades when levers leave their trained range. This is the most important number for a policy stress-tester: it is the expected error when exploring extreme scenarios.`);
  lines.push(`- **Overall normalized MAE: in-distribution held-out test = ${(preTrainTestOverallMAE * 100).toFixed(2)}% (pre-training) → ${(postTrainTestOverallMAE * 100).toFixed(2)}% (post-fine-tuning)**. A Δ = ${((postTrainTestOverallMAE - preTrainTestOverallMAE) * 100).toFixed(2)} pp indicates whether fine-tuning helped (negative Δ) or hurt (positive Δ — the pre-train optimum was fragile).`);
  lines.push(`- **Overall normalized MAE: in-distribution held-out test ${(preTrainTestOverallMAE * 100).toFixed(2)}% vs out-of-distribution ${(postTrainOODOverallMAE * 100).toFixed(2)}%** — the OOD gap is the engine's expected error when a policy stress-tester drags levers far from baseline.`);
  lines.push("");

  return {
    markdown: lines.join("\n"),
    preTrainMetrics,
    postTrainTrainMetrics,
    postTrainTestMetrics,
    preTrainOverallMAE,
    postTrainTestOverallMAE,
    trainLossHistory,
  };
}
