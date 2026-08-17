// hyperparameter-search.ts — Grid search over Trainer hyperparameters.
//
// The grid covers 4 axes:
//   - learning rate:    [0.001, 0.003, 0.01]
//   - batch size:       [16, 32, 64]
//   - L2 weight decay:  [0, 0.001, 0.01]
//   - layer-0 LR mult:  [1, 3, 5]
//
// Total = 3 × 3 × 3 × 3 = 81 configurations. For each:
//   1. Clone the base starting network (random He init — NO pretraining, so
//      the HP search measures pure deep-learning convergence, not formula
//      fine-tuning).
//   2. Train for up to `searchEpochs` epochs (default 100) with early
//      stopping (patience = 20 — same as production).
//   3. Record the best val loss achieved.
//
// Output: a markdown table of all configs sorted by val loss (best first).
// The orchestrator then picks the best config and re-trains a fresh network
// for `finalEpochs` (default 500) epochs.
//
// Performance note: 81 configs × ~30 epochs (early stopping) × ~80ms/epoch
// = ~200 seconds on Bun. Acceptable. If the search takes too long, reduce
// `nSynthetic` (default 10000 → 3000 cuts the time by 3×).

import { createNetwork, type NeuralNetwork } from "../neural-network.js";
import {
  buildDataset,
  applyNormalizationToNetwork,
  type Dataset,
} from "./data-pipeline.js";
import { Trainer, defaultTrainerConfig, type TrainerConfig, type TrainResult } from "./trainer.js";

// --- Grid definition ---

export interface HPGrid {
  learningRates: number[];
  batchSizes: number[];
  weightDecays: number[];
  layer0Mults: number[];
}

export function defaultHPGrid(): HPGrid {
  return {
    learningRates: [0.001, 0.003, 0.01],
    batchSizes: [16, 32, 64],
    weightDecays: [0, 0.001, 0.01],
    layer0Mults: [1, 3, 5],
  };
}

export interface HPConfigResult {
  config: TrainerConfig;
  bestValLoss: number;
  epochsTrained: number;
  earlyStopped: boolean;
  durationMs: number;
}

export interface HPSearchResult {
  results: HPConfigResult[];
  best: HPConfigResult;
  markdown: string;
  totalDurationMs: number;
  totalConfigs: number;
}

// --- Network cloning ---
//
// We need each HP config to start from the SAME random He init, so the
// comparison is fair. We do this by creating ONE base network, snapshotting
// it, and restoring the snapshot before each config.

function cloneNetwork(base: NeuralNetwork): NeuralNetwork {
  const net = createNetwork();
  for (let li = 0; li < 3; li++) {
    net.layers[li].weights.set(base.layers[li].weights);
    net.layers[li].biases.set(base.layers[li].biases);
    // Note: velocity starts fresh for each config (cleaner comparison)
  }
  // Apply the same normalization (will be overwritten by Trainer constructor,
  // but we set it here for consistency)
  for (let i = 0; i < net.inputMean.length; i++) {
    net.inputMean[i] = base.inputMean[i];
    net.inputStd[i] = base.inputStd[i];
  }
  for (let i = 0; i < net.outputMean.length; i++) {
    net.outputMean[i] = base.outputMean[i];
    net.outputStd[i] = base.outputStd[i];
  }
  return net;
}

// --- Run a single HP config ---

function runConfig(
  baseNet: NeuralNetwork,
  dataset: Dataset,
  lr: number,
  batchSize: number,
  weightDecay: number,
  layer0Mult: number,
  maxEpochs: number,
  logEvery: number,
): HPConfigResult {
  const config: TrainerConfig = {
    ...defaultTrainerConfig(),
    learningRate: lr,
    batchSize,
    weightDecay,
    layerLRMultiplier: [layer0Mult, 1, 1],
    patience: 20,
    logEvery,
  };
  const net = cloneNetwork(baseNet);
  const trainer = new Trainer(net, dataset, config);
  const t0 = Date.now();
  const result: TrainResult = trainer.train(maxEpochs);
  const durationMs = Date.now() - t0;
  return {
    config,
    bestValLoss: result.bestValLoss,
    epochsTrained: result.epochsTrained,
    earlyStopped: result.earlyStopped,
    durationMs,
  };
}

// --- Main entry point ---

export function runHyperparameterSearch(opts: {
  dataset?: Dataset;
  /** If provided, this is a SMALLER dataset used ONLY for HP search (subsampling
   *  the full training set is standard ML practice — it speeds up HP search
   *  without changing the relative ranking of configs). If omitted, `dataset`
   *  is used directly. */
  searchDataset?: Dataset;
  nSynthetic?: number;
  grid?: HPGrid;
  searchEpochs?: number;
  logEvery?: number;
  onConfig?: (idx: number, total: number, result: HPConfigResult) => void;
} = {}): HPSearchResult {
  const grid = opts.grid ?? defaultHPGrid();
  const searchEpochs = opts.searchEpochs ?? 100;
  const logEvery = opts.logEvery ?? 0;
  const fullDataset =
    opts.dataset ??
    buildDataset({ nSynthetic: opts.nSynthetic ?? 10000, seed: 42 });

  // HP search uses a SMALLER subsample of the training set if searchDataset
  // is provided. This is standard ML practice: HP search explores the
  // relative ranking of configs, which is largely invariant to dataset size
  // (as long as the search dataset is representative). The final model is
  // then trained on the full dataset with the best HPs.
  const dataset = opts.searchDataset ?? fullDataset;

  // Create the base starting network (random He init — NO pretraining)
  const baseNet = createNetwork();

  // Build the full Cartesian product of grid axes
  const configs: { lr: number; bs: number; wd: number; l0: number }[] = [];
  for (const lr of grid.learningRates) {
    for (const bs of grid.batchSizes) {
      for (const wd of grid.weightDecays) {
        for (const l0 of grid.layer0Mults) {
          configs.push({ lr, bs, wd, l0 });
        }
      }
    }
  }

  const results: HPConfigResult[] = [];
  const totalStart = Date.now();

  for (let i = 0; i < configs.length; i++) {
    const { lr, bs, wd, l0 } = configs[i];
    const result = runConfig(baseNet, dataset, lr, bs, wd, l0, searchEpochs, logEvery);
    results.push(result);
    if (opts.onConfig) {
      opts.onConfig(i + 1, configs.length, result);
    }
  }

  const totalDurationMs = Date.now() - totalStart;

  // Sort by val loss (best first)
  results.sort((a, b) => a.bestValLoss - b.bestValLoss);
  const best = results[0];

  const markdown = formatResultsTable(
    results,
    dataset,
    fullDataset,
    totalDurationMs,
  );

  return {
    results,
    best,
    markdown,
    totalDurationMs,
    totalConfigs: configs.length,
  };
}

// --- Markdown table ---

function formatResultsTable(
  results: HPConfigResult[],
  dataset: Dataset,
  fullDataset: Dataset,
  totalDurationMs: number,
): string {
  const lines: string[] = [];
  const isSubsampled = dataset !== fullDataset;
  lines.push(`**Grid search:** ${results.length} configs, ${(totalDurationMs / 1000).toFixed(1)}s total.`);
  if (isSubsampled) {
    lines.push("");
    lines.push(`> HP search uses a **subsampled training set** (${dataset.train.length} train / ${dataset.val.length} val / ${dataset.test.length} test) — standard ML practice to speed up hyperparameter exploration. The final model is trained on the **full dataset** (${fullDataset.train.length} train / ${fullDataset.val.length} val / ${fullDataset.test.length} test) using the best HP config found here.`);
  } else {
    lines.push(` Dataset = ${dataset.train.length} train / ${dataset.val.length} val / ${dataset.test.length} test.`);
  }
  lines.push("");
  lines.push("| Rank | LR | Batch | WeightDecay | Layer0Mult | Best Val Loss | Epochs | Early Stop? | Duration (s) |");
  lines.push("|---:|---:|---:|---:|---:|---:|---:|:---:|---:|");
  results.forEach((r, i) => {
    lines.push(
      `| ${i + 1} | ${r.config.learningRate.toExponential(2)} | ${r.config.batchSize} | ${r.config.weightDecay} | ${r.config.layerLRMultiplier[0]} | ${r.bestValLoss.toExponential(4)} | ${r.epochsTrained} | ${r.earlyStopped ? "yes" : "no"} | ${(r.durationMs / 1000).toFixed(2)} |`,
    );
  });
  lines.push("");
  lines.push("**Best config:**");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(bestConfigObj(results[0]), null, 2));
  lines.push("```");
  return lines.join("\n");
}

function bestConfigObj(r: HPConfigResult): Record<string, unknown> {
  return {
    learningRate: r.config.learningRate,
    batchSize: r.config.batchSize,
    weightDecay: r.config.weightDecay,
    layerLRMultiplier: r.config.layerLRMultiplier,
    momentum: r.config.momentum,
    biasDecay: r.config.biasDecay,
    lrDecay: r.config.lrDecay,
    reduceOnPlateauPatience: r.config.reduceOnPlateauPatience,
    reduceOnPlateauFactor: r.config.reduceOnPlateauFactor,
    patience: r.config.patience,
    bestValLoss: r.bestValLoss,
    epochsTrained: r.epochsTrained,
    earlyStopped: r.earlyStopped,
  };
}
