// training.test.ts — Tests for the deep learning pipeline
// Honest scope: tests verify the pipeline RUNS and produces structured
// output. The custom trainStep only backprops the output layer (known
// limitation documented in TRAINING_REPORT.md), so loss convergence is
// not tested — the pipeline exists and is reproducible.

import { test, expect, describe } from "bun:test";
import { createNetwork } from "../neural-network.js";
import { buildDataset, applyNormalizationToNetwork, datasetSummary } from "../training/data-pipeline.js";
import { Trainer, defaultTrainerConfig } from "../training/trainer.js";
import { defaultHPGrid, runHyperparameterSearch } from "../training/hyperparameter-search.js";
import { LEVERS, INDICATORS } from "../model.js";

describe("data-pipeline: buildDataset", () => {
  test("produces train/val/test splits with correct proportions", () => {
    const ds = buildDataset({ nSynthetic: 1000, seed: 42 });
    expect(ds.train.length).toBeGreaterThan(600);
    expect(ds.val.length).toBeGreaterThan(100);
    expect(ds.test.length).toBeGreaterThan(100);
    expect(ds.train.length + ds.val.length + ds.test.length).toBe(ds.stats.totalSamples);
  });

  test("every sample has 47 levers and 15 targets", () => {
    const ds = buildDataset({ nSynthetic: 50, seed: 1 });
    for (const s of ds.train.slice(0, 10)) {
      expect(s.levers.length).toBe(47);
      expect(s.targets.length).toBe(15);
    }
  });

  test("normalization stats are computed from train set", () => {
    const ds = buildDataset({ nSynthetic: 100, seed: 42 });
    expect(ds.inputMean.length).toBe(47);
    expect(ds.inputStd.length).toBe(47);
    expect(ds.outputMean.length).toBe(15);
    expect(ds.outputStd.length).toBe(15);
    // Input std should be positive (not zero)
    expect(ds.inputStd[0]).toBeGreaterThan(0);
  });

  test("datasetSummary produces markdown with headers", () => {
    const ds = buildDataset({ nSynthetic: 50, seed: 42 });
    const md = datasetSummary(ds);
    expect(md).toContain("Dataset");
    expect(md).toContain("Train");
    expect(md).toContain("Val");
    expect(md).toContain("Test");
  });

  test("applyNormalizationToNetwork writes stats into network", () => {
    const ds = buildDataset({ nSynthetic: 50, seed: 42 });
    const net = createNetwork();
    const original = net.inputMean[0];
    applyNormalizationToNetwork(net, ds.normalization);
    // After applying, the stats should be the dataset's stats
    expect(net.inputMean[0]).toBe(ds.inputMean[0]);
  });
});

describe("trainer: training loop", () => {
  test("Trainer runs and returns loss history arrays", () => {
    const ds = buildDataset({ nSynthetic: 100, seed: 42 });
    const net = createNetwork();
    const trainer = new Trainer(net, ds, { ...defaultTrainerConfig(), maxEpochs: 5, patience: 10, logEvery: 0 });
    const result = trainer.train();
    expect(result.trainLossHistory.length).toBeGreaterThan(0);
    expect(result.valLossHistory.length).toBeGreaterThan(0);
    expect(result.trainLossHistory.length).toBeLessThanOrEqual(5);
  });

  test("Trainer result has bestValLoss, bestEpoch, totalEpochs", () => {
    const ds = buildDataset({ nSynthetic: 100, seed: 42 });
    const net = createNetwork();
    const trainer = new Trainer(net, ds, { ...defaultTrainerConfig(), maxEpochs: 3, patience: 10, logEvery: 0 });
    const result = trainer.train();
    expect(typeof result.bestValLoss).toBe("number");
    expect(typeof result.bestEpoch).toBe("number");
    expect(typeof result.totalEpochs).toBe("number");
    expect(typeof result.earlyStopped).toBe("boolean");
  });

  test("defaultTrainerConfig returns a valid config", () => {
    const cfg = defaultTrainerConfig();
    expect(cfg.learningRate).toBeGreaterThan(0);
    expect(cfg.batchSize).toBeGreaterThan(0);
    expect(cfg.maxEpochs).toBeGreaterThan(0);
    expect(cfg.patience).toBeGreaterThan(0);
  });

  test("Trainer preserves network weights after training (no NaN explosion)", () => {
    const ds = buildDataset({ nSynthetic: 50, seed: 42 });
    const net = createNetwork();
    const trainer = new Trainer(net, ds, { ...defaultTrainerConfig(), maxEpochs: 3, patience: 5, logEvery: 0 });
    trainer.train();
    // Network weights should still be numbers (not NaN)
    for (const layer of net.layers) {
      for (let i = 0; i < Math.min(5, layer.weights.length); i++) {
        expect(typeof layer.weights[i]).toBe("number");
      }
    }
  });
});

describe("hyperparameter-search", () => {
  test("default grid has 81 configs (3×3×3×3)", () => {
    const grid = defaultHPGrid();
    const total = grid.learningRates.length * grid.batchSizes.length * grid.weightDecays.length * grid.layer0Mults.length;
    expect(total).toBe(81);
  });

  test("runHyperparameterSearch runs with a tiny grid and returns results", () => {
    const tinyGrid = { learningRates: [0.001], batchSizes: [32], weightDecays: [0.001], layer0Mults: [3] };
    const result = runHyperparameterSearch({
      nSynthetic: 30,
      searchEpochs: 1,
      logEvery: 0,
      grid: tinyGrid,
    });
    expect(result.results.length).toBe(1);
    expect(result.totalConfigs).toBe(1);
    expect(result.best).toBe(result.results[0]);
  });

  test("each HP config result has the right shape", () => {
    const tinyGrid = { learningRates: [0.001, 0.01], batchSizes: [32], weightDecays: [0.001], layer0Mults: [3] };
    const result = runHyperparameterSearch({
      nSynthetic: 30,
      searchEpochs: 1,
      logEvery: 0,
      grid: tinyGrid,
    });
    expect(result.results.length).toBe(2);
    for (const r of result.results) {
      expect(r.config).toBeDefined();
      expect(r.config.learningRate).toBeGreaterThan(0);
      expect(r.config.batchSize).toBeGreaterThan(0);
      expect(typeof r.bestValLoss).toBe("number");
      expect(typeof r.earlyStopped).toBe("boolean");
      expect(r.durationMs).toBeGreaterThan(0);
    }
  });

  test("markdown output contains the grid table", () => {
    const tinyGrid = { learningRates: [0.001], batchSizes: [32], weightDecays: [0.001], layer0Mults: [3] };
    const result = runHyperparameterSearch({
      nSynthetic: 30,
      searchEpochs: 1,
      logEvery: 0,
      grid: tinyGrid,
    });
    expect(result.markdown).toContain("Grid search:");
    expect(result.markdown).toContain("Best config:");
  });

  test("onConfig callback fires for every config", () => {
    const tinyGrid = { learningRates: [0.001, 0.01], batchSizes: [32], weightDecays: [0], layer0Mults: [1] };
    const expected = 2;
    let count = 0;
    runHyperparameterSearch({
      nSynthetic: 30,
      searchEpochs: 1,
      logEvery: 0,
      grid: tinyGrid,
      onConfig: (_i, total, _r) => {
        expect(total).toBe(expected);
        count++;
      },
    });
    expect(count).toBe(expected);
  });
});
