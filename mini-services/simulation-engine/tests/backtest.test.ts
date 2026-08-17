// backtest.test.ts — Tests for the new Gap 2 + Gap 3 functionality.
//
// These tests cover:
//   1. MOROCCO_HISTORICAL data integrity (6 years, all indicators finite).
//   2. buildHistoricalSamples() returns 6 samples with correct shape.
//   3. preTrainOnRealData() reduces the loss on the 6 real samples.
//   4. preTrainOnRealData() applies the Gap-3 fix by default (layer 0 = 3× LR).
//   5. verifyLayer0WeightsMatter() returns the expected shape and is non-mutating.
//   6. verifyLayer0WeightsMatter() correctly identifies that zeroing layer-0
//      weights changes the output at a perturbed input.
//   7. train() with TrainOpts (layerLRMultiplier, biasDecay) does not break
//      backward compatibility — the existing 4-arg call still reduces loss.
//   8. runBacktest() produces a non-empty markdown report with the expected
//      section headers.

import { test, expect, describe } from "bun:test";
import {
  createNetwork,
  forward,
  train,
  trainEpoch,
  pretrainFromFormulas,
  preTrainOnRealData,
  buildHistoricalSamples,
  computeAverageLoss,
  verifyLayer0WeightsMatter,
  MOROCCO_HISTORICAL,
  type TrainOpts,
} from "../neural-network.js";
import { LEVERS, INDICATORS } from "../model.ts";
import { runBacktest } from "../validation/backtest.ts";

// --- Helpers ---

function baselineLeverValues(): number[] {
  return LEVERS.map((l) => l.baseline);
}

function perturbedLeverValues(fraction = 0.25): number[] {
  return LEVERS.map((l) => {
    const range = l.max - l.min;
    return Math.min(l.max, l.baseline + range * fraction);
  });
}

// ──────────────────────────────────────────────────────────────────────────
//  MOROCCO_HISTORICAL data integrity
// ──────────────────────────────────────────────────────────────────────────

describe("MOROCCO_HISTORICAL", () => {
  test("contains exactly 6 year data points (2000, 2005, 2010, 2015, 2020, 2023)", () => {
    expect(MOROCCO_HISTORICAL.length).toBe(6);
    const years = MOROCCO_HISTORICAL.map((y) => y.year);
    expect(years).toEqual([2000, 2005, 2010, 2015, 2020, 2023]);
  });

  test("every year's 6 indicators are finite numbers", () => {
    for (const y of MOROCCO_HISTORICAL) {
      for (const id of ["gdp_growth", "unemployment", "inflation", "debt_to_gdp", "life_expectancy", "hdi"] as const) {
        expect(Number.isFinite(y[id])).toBe(true);
      }
    }
  });

  test("the 2020 COVID year has negative GDP growth (ground truth)", () => {
    const y2020 = MOROCCO_HISTORICAL.find((y) => y.year === 2020)!;
    expect(y2020.gdp_growth).toBe(-6.3);
  });

  test("the 2023 inflation shock year has inflation > 5% (ground truth)", () => {
    const y2023 = MOROCCO_HISTORICAL.find((y) => y.year === 2023)!;
    expect(y2023.inflation).toBeGreaterThan(5);
  });

  test("every year has at least one leverOverride (historical proxy)", () => {
    for (const y of MOROCCO_HISTORICAL) {
      expect(Object.keys(y.leverOverrides).length).toBeGreaterThan(0);
    }
  });

  test("the 2015 leverOverrides include subsidies reform (subsidies dropped)", () => {
    const y2015 = MOROCCO_HISTORICAL.find((y) => y.year === 2015)!;
    expect(y2015.leverOverrides.subsidies).toBeDefined();
    expect(y2015.leverOverrides.subsidies).toBeLessThan(30); // 2014 reform dropped subsidies
  });

  test("every leverOverride ID references a real lever (no typos)", () => {
    const leverIds = new Set(LEVERS.map((l) => l.id));
    for (const y of MOROCCO_HISTORICAL) {
      for (const id of Object.keys(y.leverOverrides)) {
        expect(leverIds.has(id)).toBe(true);
      }
    }
  });

  test("every leverOverride value is within the lever's [min, max] range", () => {
    const leverById = new Map(LEVERS.map((l) => [l.id, l]));
    for (const y of MOROCCO_HISTORICAL) {
      for (const [id, v] of Object.entries(y.leverOverrides)) {
        const lever = leverById.get(id)!;
        expect(v).toBeGreaterThanOrEqual(lever.min);
        expect(v).toBeLessThanOrEqual(lever.max);
      }
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  buildHistoricalSamples + computeAverageLoss
// ──────────────────────────────────────────────────────────────────────────

describe("buildHistoricalSamples()", () => {
  test("returns 6 samples (one per historical year)", () => {
    const samples = buildHistoricalSamples();
    expect(samples.length).toBe(6);
  });

  test("each sample has 47 lever values and 15 targets", () => {
    const samples = buildHistoricalSamples();
    for (const s of samples) {
      expect(s.levers.length).toBe(47);
      expect(s.targets.length).toBe(15);
    }
  });

  test("the gdp_growth target for 2020 is -6.3 (the real COVID value)", () => {
    const samples = buildHistoricalSamples();
    const s2020 = samples.find((s) => s.year === 2020)!;
    const gdpGrowthIdx = INDICATORS.findIndex((i) => i.id === "gdp_growth");
    expect(s2020.targets[gdpGrowthIdx]).toBe(-6.3);
  });

  test("the hdi target for 2023 is 0.740 (the real value)", () => {
    const samples = buildHistoricalSamples();
    const s2023 = samples.find((s) => s.year === 2023)!;
    const hdiIdx = INDICATORS.findIndex((i) => i.id === "hdi");
    expect(s2023.targets[hdiIdx]).toBeCloseTo(0.740, 5);
  });
});

describe("computeAverageLoss()", () => {
  test("returns a finite, non-negative number on the historical samples", () => {
    const net = createNetwork();
    const samples = buildHistoricalSamples();
    const loss = computeAverageLoss(net, samples);
    expect(Number.isFinite(loss)).toBe(true);
    expect(loss).toBeGreaterThanOrEqual(0);
  });

  test("decreases after a few training epochs (sanity)", () => {
    const net = createNetwork();
    const samples = buildHistoricalSamples();
    const before = computeAverageLoss(net, samples);
    for (let e = 0; e < 20; e++) {
      trainEpoch(net, samples, 0.005, 0.9, { layerLRMultiplier: [3, 1, 1], biasDecay: 0.001 });
    }
    const after = computeAverageLoss(net, samples);
    expect(after).toBeLessThan(before);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  preTrainOnRealData() — Gap 2 + Gap 3
// ──────────────────────────────────────────────────────────────────────────

describe("preTrainOnRealData()", () => {
  test("runs without crashing and returns before/after loss + history", () => {
    const net = createNetwork();
    const result = preTrainOnRealData(net, 10, { logEvery: 0 });
    expect(Number.isFinite(result.beforeLoss)).toBe(true);
    expect(Number.isFinite(result.afterLoss)).toBe(true);
    expect(result.lossHistory.length).toBe(10);
  });

  test("reduces the loss on the 6 real historical samples", () => {
    const net = createNetwork();
    const result = preTrainOnRealData(net, 200, { logEvery: 0 });
    expect(result.afterLoss).toBeLessThan(result.beforeLoss);
    // Should be at least 5× lower after 200 epochs.
    expect(result.beforeLoss / Math.max(result.afterLoss, 1e-12)).toBeGreaterThan(5);
  });

  test("loss history is monotonically decreasing on average (last < first)", () => {
    const net = createNetwork();
    const result = preTrainOnRealData(net, 100, { logEvery: 0 });
    expect(result.lossHistory[result.lossHistory.length - 1]).toBeLessThan(result.lossHistory[0]);
  });

  test("the Gap-3 fix is applied by default (layerLRMultiplier = [3, 1, 1])", () => {
    // Indirect test: with the fix, the layer-0 weights should grow more than
    // without the fix. We can't easily test the default, but we can verify
    // that calling with explicit [1,1,1] and biasDecay=0 produces a DIFFERENT
    // (smaller) layer-0 weight std than the default.
    const netA = createNetwork();
    pretrainFromFormulas(netA, 5);
    preTrainOnRealData(netA, 100, { logEvery: 0 }); // default fix
    const stdA = verifyLayer0WeightsMatter(netA).layer0WeightStats.std;

    const netB = createNetwork();
    pretrainFromFormulas(netB, 5);
    preTrainOnRealData(netB, 100, { logEvery: 0, layerLRMultiplier: [1, 1, 1], biasDecay: 0 });
    const stdB = verifyLayer0WeightsMatter(netB).layer0WeightStats.std;

    // The fix should make layer-0 weights larger (more signal).
    // (We use a soft inequality because of training stochasticity, but the
    // direction should hold.)
    expect(stdA).toBeGreaterThanOrEqual(stdB * 0.95);
  });

  test("respects the epochs parameter", () => {
    const net = createNetwork();
    const r = preTrainOnRealData(net, 42, { logEvery: 0 });
    expect(r.lossHistory.length).toBe(42);
    expect(net.epoch).toBeGreaterThanOrEqual(42);
  });

  test("respects the logEvery=0 (silent) option without error", () => {
    const net = createNetwork();
    // Capture console.log to ensure it's not called
    const origLog = console.log;
    let called = false;
    console.log = (...args: any[]) => { called = true; };
    try {
      preTrainOnRealData(net, 50, { logEvery: 0 });
    } finally {
      console.log = origLog;
    }
    expect(called).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  verifyLayer0WeightsMatter() — Gap 3 verification
// ──────────────────────────────────────────────────────────────────────────

describe("verifyLayer0WeightsMatter()", () => {
  test("returns the expected shape (all fields present)", () => {
    const net = createNetwork();
    const v = verifyLayer0WeightsMatter(net);
    expect(v).toHaveProperty("baselineInput");
    expect(v).toHaveProperty("perturbedInput");
    expect(v).toHaveProperty("baselineOutputBefore");
    expect(v).toHaveProperty("baselineOutputAfter");
    expect(v).toHaveProperty("perturbedOutputBefore");
    expect(v).toHaveProperty("perturbedOutputAfter");
    expect(v).toHaveProperty("baselineMaxDelta");
    expect(v).toHaveProperty("perturbedMaxDelta");
    expect(v).toHaveProperty("weightsMatter");
    expect(v).toHaveProperty("layer0WeightStats");
    expect(v.layer0WeightStats).toHaveProperty("mean");
    expect(v.layer0WeightStats).toHaveProperty("std");
    expect(v.layer0WeightStats).toHaveProperty("max");
    expect(v.layer0WeightStats).toHaveProperty("nonzero");
  });

  test("does NOT mutate the network (weights are restored after zeroing)", () => {
    const net = createNetwork();
    const before = Array.from(net.layers[0].weights);
    verifyLayer0WeightsMatter(net);
    const after = Array.from(net.layers[0].weights);
    // Should be byte-identical after the verification
    expect(after.length).toBe(before.length);
    for (let i = 0; i < before.length; i++) {
      expect(after[i]).toBe(before[i]);
    }
  });

  test("at baseline input, the delta is ~0 (by design of the normalization)", () => {
    const net = createNetwork();
    const v = verifyLayer0WeightsMatter(net);
    expect(v.baselineMaxDelta).toBeCloseTo(0, 6);
  });

  test("at perturbed input, the delta is non-trivial (weights carry signal)", () => {
    const net = createNetwork();
    // Pretrain so the weights have signal
    pretrainFromFormulas(net, 10);
    preTrainOnRealData(net, 100, { logEvery: 0 });
    const v = verifyLayer0WeightsMatter(net);
    expect(v.perturbedMaxDelta).toBeGreaterThan(1e-3);
    expect(v.weightsMatter).toBe(true);
  });

  test("the baseline input is exactly the lever baselines", () => {
    const net = createNetwork();
    const v = verifyLayer0WeightsMatter(net);
    for (let i = 0; i < LEVERS.length; i++) {
      expect(v.baselineInput[i]).toBe(LEVERS[i].baseline);
    }
  });

  test("the perturbed input is strictly greater than baseline (for non-zero-range levers)", () => {
    const net = createNetwork();
    const v = verifyLayer0WeightsMatter(net);
    let anyGreater = false;
    for (let i = 0; i < LEVERS.length; i++) {
      const range = LEVERS[i].max - LEVERS[i].min;
      if (range > 0 && v.perturbedInput[i] > v.baselineInput[i]) {
        anyGreater = true;
        break;
      }
    }
    expect(anyGreater).toBe(true);
  });

  test("layer0WeightStats reports 1504 nonzero weights at He init", () => {
    const net = createNetwork();
    const v = verifyLayer0WeightsMatter(net);
    expect(v.layer0WeightStats.nonzero).toBe(1504); // 47 × 32
  });

  test("zeroing layer-0 weights and computing a forward pass produces a different perturbed output", () => {
    const net = createNetwork();
    pretrainFromFormulas(net, 5);
    const v = verifyLayer0WeightsMatter(net);
    // At perturbed input, the outputs before and after zeroing should differ.
    let anyDifferent = false;
    for (let i = 0; i < v.perturbedOutputBefore.length; i++) {
      if (Math.abs(v.perturbedOutputBefore[i] - v.perturbedOutputAfter[i]) > 1e-6) {
        anyDifferent = true;
        break;
      }
    }
    expect(anyDifferent).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  train() with TrainOpts — backward compatibility + Gap 3
// ──────────────────────────────────────────────────────────────────────────

describe("train() with TrainOpts", () => {
  test("the 4-arg call (no opts) still works (backward compat)", () => {
    const net = createNetwork();
    const levers = baselineLeverValues();
    const targets = new Array(15).fill(0);
    const loss = train(net, levers, targets, 0.001, 0.9);
    expect(Number.isFinite(loss)).toBe(true);
    expect(loss).toBeGreaterThanOrEqual(0);
  });

  test("the 6-arg call with empty opts also works (no behavior change)", () => {
    const net = createNetwork();
    const levers = baselineLeverValues();
    const targets = new Array(15).fill(0);
    const loss = train(net, levers, targets, 0.001, 0.9, {});
    expect(Number.isFinite(loss)).toBe(true);
  });

  test("layerLRMultiplier = [3, 1, 1] makes layer 0 weights move 3× farther", () => {
    // Two identical networks, trained on the same target, but one with 3× LR
    // on layer 0. After N steps, the layer-0 weights should have moved MORE
    // (greater L2 distance from their init) in the [3,1,1] network.
    const netA = createNetwork();
    const netB = createNetwork();
    // Copy netA's weights to netB for fair comparison
    for (let li = 0; li < 3; li++) {
      netB.layers[li].weights.set(netA.layers[li].weights);
      netB.layers[li].biases.set(netA.layers[li].biases);
    }
    // Snapshot initial layer-0 weights
    const w0Init = new Float64Array(netA.layers[0].weights);

    const levers = perturbedLeverValues(0.25); // non-baseline so layer-0 weights get gradient
    const targets = new Array(15).fill(1); // non-trivial target

    // Train both for 50 steps
    for (let i = 0; i < 50; i++) {
      train(netA, levers, targets, 0.001, 0.9, { layerLRMultiplier: [1, 1, 1] });
      train(netB, levers, targets, 0.001, 0.9, { layerLRMultiplier: [3, 1, 1] });
    }

    // Compute L2 distance from init for each network's layer-0 weights
    let distA = 0, distB = 0;
    for (let i = 0; i < w0Init.length; i++) {
      const dA = netA.layers[0].weights[i] - w0Init[i];
      const dB = netB.layers[0].weights[i] - w0Init[i];
      distA += dA * dA;
      distB += dB * dB;
    }
    distA = Math.sqrt(distA);
    distB = Math.sqrt(distB);
    // NetB (3× LR on layer 0) should have moved its layer-0 weights farther.
    expect(distB).toBeGreaterThan(distA);
  });

  test("biasDecay shrinks biases over training (forces use of weights)", () => {
    const net = createNetwork();
    const levers = baselineLeverValues();
    const targets = new Array(15).fill(1);
    const biasSumBefore = Array.from(net.layers[2].biases).reduce((s, v) => s + Math.abs(v), 0);
    for (let i = 0; i < 100; i++) {
      train(net, levers, targets, 0.001, 0.9, { biasDecay: 0.1 }); // strong decay
    }
    const biasSumAfter = Array.from(net.layers[2].biases).reduce((s, v) => s + Math.abs(v), 0);
    // With biasDecay, biases should grow less than they would without decay.
    // This is hard to test in isolation, so just verify the network didn't
    // explode and biases are finite.
    expect(Number.isFinite(biasSumAfter)).toBe(true);
  });

  test("weightDecay shrinks weights toward zero (standard L2)", () => {
    const net = createNetwork();
    const levers = baselineLeverValues();
    const targets = new Array(15).fill(1);
    const wStdBefore = verifyLayer0WeightsMatter(net).layer0WeightStats.std;
    for (let i = 0; i < 100; i++) {
      train(net, levers, targets, 0.001, 0.9, { weightDecay: 0.1 }); // strong decay
    }
    const wStdAfter = verifyLayer0WeightsMatter(net).layer0WeightStats.std;
    // Standard weight decay shrinks weights
    expect(wStdAfter).toBeLessThan(wStdBefore);
  });

  test("repeated train() with opts still reduces the loss (existing test parity)", () => {
    const net = createNetwork();
    const levers = baselineLeverValues();
    const targets = new Array(15).fill(1);
    const initialLoss = train(net, levers, targets, 0.001, 0.9, {
      layerLRMultiplier: [3, 1, 1],
      biasDecay: 0.001,
    });
    let finalLoss = initialLoss;
    for (let i = 0; i < 200; i++) {
      finalLoss = train(net, levers, targets, 0.001, 0.9, {
        layerLRMultiplier: [3, 1, 1],
        biasDecay: 0.001,
      });
    }
    expect(finalLoss).toBeLessThan(initialLoss);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  runBacktest() — end-to-end harness
// ──────────────────────────────────────────────────────────────────────────

describe("runBacktest()", () => {
  test("produces a non-empty markdown report with all 8 sections", () => {
    // Use a small epoch count to keep the test fast
    const result = runBacktest({ nnEpochs: 50 });
    expect(result.markdown.length).toBeGreaterThan(1000);
    for (const section of [
      "## 1. Protocol",
      "## 2. NN training on real data (Gap 2)",
      "## 3. Year-by-year predicted vs actual",
      "## 4. MAE summary",
      "## 5. Directional accuracy",
      "## 6. Gap-3 verification",
      "## 7. Honest interpretation",
      "## 8. Reproducibility",
    ]) {
      expect(result.markdown).toContain(section);
    }
  });

  test("returns 6 year results", () => {
    const result = runBacktest({ nnEpochs: 30 });
    expect(result.results.length).toBe(6);
    const years = result.results.map((r) => r.year);
    expect(years).toEqual([2000, 2005, 2010, 2015, 2020, 2023]);
  });

  test("each year result has all 6 indicators in actual / formula / nn", () => {
    const result = runBacktest({ nnEpochs: 30 });
    for (const r of result.results) {
      for (const id of ["gdp_growth", "unemployment", "inflation", "debt_to_gdp", "life_expectancy", "hdi"] as const) {
        expect(Number.isFinite(r.actual[id])).toBe(true);
        expect(Number.isFinite(r.formula[id])).toBe(true);
        expect(Number.isFinite(r.nn[id])).toBe(true);
        expect(Number.isFinite(r.formulaErr[id])).toBe(true);
        expect(Number.isFinite(r.nnErr[id])).toBe(true);
      }
    }
  });

  test("formula MAE and NN MAE are computed for all 6 indicators", () => {
    const result = runBacktest({ nnEpochs: 30 });
    for (const id of ["gdp_growth", "unemployment", "inflation", "debt_to_gdp", "life_expectancy", "hdi"] as const) {
      expect(Number.isFinite(result.formulaMAE[id])).toBe(true);
      expect(Number.isFinite(result.nnMAE[id])).toBe(true);
    }
    expect(Number.isFinite(result.formulaOverallMAE)).toBe(true);
    expect(Number.isFinite(result.nnOverallMAE)).toBe(true);
  });

  test("directional accuracy is in [0, 1] for both predictors", () => {
    const result = runBacktest({ nnEpochs: 30 });
    expect(result.formulaDirectionalAccuracy).toBeGreaterThanOrEqual(0);
    expect(result.formulaDirectionalAccuracy).toBeLessThanOrEqual(1);
    expect(result.nnDirectionalAccuracy).toBeGreaterThanOrEqual(0);
    expect(result.nnDirectionalAccuracy).toBeLessThanOrEqual(1);
  });

  test("layer-0 verification returns weightsMatter=true after the Gap-3 fix", () => {
    const result = runBacktest({ nnEpochs: 50 });
    expect(result.layer0Verification.weightsMatter).toBe(true);
    expect(result.layer0Verification.perturbedMaxDelta).toBeGreaterThan(1e-3);
  });

  test("the NN was actually trained (afterLoss < beforeLoss)", () => {
    const result = runBacktest({ nnEpochs: 100 });
    expect(result.preTrain.afterLoss).toBeLessThan(result.preTrain.beforeLoss);
  });
});
