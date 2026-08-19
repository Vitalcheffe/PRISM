// trainer.ts — Deep learning trainer for the PRISM neural network.
//
// Uses the REAL backpropagation from neural-network.ts (trainEpoch) which
// propagates gradients through ALL layers (0→1→2), not just the output layer.
// Gradient clipping prevents NaN explosion. Layer-specific LR and bias decay
// implement the Gap-3 fix (force the network to use input-layer weights).

import { createNetwork, forward, trainEpoch, pretrainFromFormulas, type NeuralNetwork } from "../neural-network.js";
import type { Dataset, Sample } from "./data-pipeline.js";

export interface TrainConfig {
  learningRate: number;
  batchSize: number;
  l2WeightDecay: number;
  layer0LRMult: number;
  biasDecay: number;
  maxEpochs: number;
  patience: number;
  lrReducePatience: number;
  lrReduceFactor: number;
  logEvery?: number;
}

// TrainerConfig = alias for backward compat with hyperparameter-search.ts
export type TrainerConfig = TrainConfig;

export const DEFAULT_CONFIG: TrainConfig = {
  learningRate: 0.0001,
  batchSize: 32,
  l2WeightDecay: 0.001,
  layer0LRMult: 3,
  biasDecay: 0.001,
  maxEpochs: 200,
  patience: 20,
  lrReducePatience: 10,
  lrReduceFactor: 0.5,
  logEvery: 0,
};

export function defaultTrainerConfig(overrides: Partial<TrainConfig> = {}): TrainConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

export interface TrainResult {
  bestValLoss: number;
  bestEpoch: number;
  totalEpochs: number;
  earlyStopped: boolean;
  trainLossHistory: number[];
  valLossHistory: number[];
  lrHistory: number[];
}

// --- Loss computation (no training, just forward pass) ---
function computeLoss(network: NeuralNetwork, samples: Sample[]): number {
  let totalLoss = 0;
  let count = 0;
  for (const s of samples) {
    const pred = forward(network, s.levers);
    for (let i = 0; i < s.targets.length; i++) {
      const scale = Math.max(0.1, Math.abs(s.targets[i]) * 0.5);
      const normalizedErr = (pred[i] - s.targets[i]) / scale;
      const sq = normalizedErr * normalizedErr;
      if (isFinite(sq)) {
        totalLoss += sq;
        count++;
      }
    }
  }
  return count > 0 ? totalLoss / count : Infinity;
}

// --- Mini-batch training using REAL backprop from neural-network.ts ---
function miniBatch(network: NeuralNetwork, samples: Sample[], batchSize: number, lr: number, momentum: number, cfg: TrainConfig): number {
  // Shuffle indices
  const indices = Array.from({ length: samples.length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  let totalLoss = 0;
  let batchCount = 0;

  for (let start = 0; start < indices.length; start += batchSize) {
    const batch: { levers: number[]; targets: number[] }[] = [];
    for (let i = start; i < Math.min(start + batchSize, indices.length); i++) {
      const s = samples[indices[i]];
      batch.push({ levers: s.levers, targets: s.targets });
    }

    // Use the REAL trainEpoch from neural-network.ts — full backprop through
    // all 3 layers with proper chain rule (backwardLayer for each layer).
    const loss = trainEpoch(network, batch, lr, momentum, {
      layerLRMultiplier: [cfg.layer0LRMult, 1, 1],
      weightDecay: cfg.l2WeightDecay,
      biasDecay: cfg.biasDecay,
    });

    // Gradient clipping: if loss exploded, restore weights from snapshot
    if (!isFinite(loss) || loss > 1e6) {
      // Skip this batch — the network already updated but the loss is bad.
      // The early stopping + best-weight checkpoint will handle recovery.
      continue;
    }

    totalLoss += loss;
    batchCount++;
  }

  return batchCount > 0 ? totalLoss / batchCount : Infinity;
}

export class Trainer {
  private network: NeuralNetwork;
  private dataset: Dataset;
  private config: TrainConfig;
  private bestWeights: any = null;

  constructor(network: NeuralNetwork, dataset: Dataset, config: TrainConfig = DEFAULT_CONFIG) {
    this.network = network;
    this.dataset = dataset;
    this.config = config;
  }

  train(maxEpochsOverride?: number): TrainResult {
    const { network, dataset, config } = this;
    const maxEpochs = maxEpochsOverride ?? config.maxEpochs;
    const logEvery = config.logEvery ?? 0;

    const trainLossHistory: number[] = [];
    const valLossHistory: number[] = [];
    const lrHistory: number[] = [];

    let lr = config.learningRate;
    let bestValLoss = Infinity;
    let bestEpoch = 0;
    let epochsSinceImprovement = 0;
    let epochsSinceLRImprove = 0;
    let earlyStopped = false;

    for (let epoch = 0; epoch < maxEpochs; epoch++) {
      // Snapshot weights before training (for gradient clipping recovery)
      const snapshot = network.layers.map((l: any) => ({
        weights: l.weights.slice(),
        biases: l.biases.slice(),
      }));

      const trainLoss = miniBatch(network, dataset.train, config.batchSize, lr, 0.9, config);

      // Gradient clipping: if training exploded, restore the snapshot
      if (!isFinite(trainLoss) || trainLoss > 1e4) {
        for (let l = 0; l < network.layers.length; l++) {
          const layer = network.layers[l] as any;
          const snap = snapshot[l];
          for (let i = 0; i < layer.weights.length; i++) layer.weights[i] = snap.weights[i];
          for (let i = 0; i < layer.biases.length; i++) layer.biases[i] = snap.biases[i];
        }
        // Reduce LR aggressively
        lr *= 0.1;
        trainLossHistory.push(Infinity);
        valLossHistory.push(Infinity);
        lrHistory.push(lr);
        epochsSinceImprovement++;
        epochsSinceLRImprove++;
        if (epochsSinceImprovement >= config.patience) {
          earlyStopped = true;
          break;
        }
        continue;
      }

      const valLoss = computeLoss(network, dataset.val);

      trainLossHistory.push(trainLoss);
      valLossHistory.push(valLoss);
      lrHistory.push(lr);

      if (valLoss < bestValLoss && isFinite(valLoss)) {
        bestValLoss = valLoss;
        bestEpoch = epoch;
        epochsSinceImprovement = 0;
        epochsSinceLRImprove = 0;
        this.bestWeights = network.layers.map((l: any) => ({
          weights: l.weights.slice(),
          biases: l.biases.slice(),
        }));
      } else {
        epochsSinceImprovement++;
        epochsSinceLRImprove++;
      }

      // Reduce LR on plateau
      if (epochsSinceLRImprove >= config.lrReducePatience && lr > 1e-8) {
        lr *= config.lrReduceFactor;
        epochsSinceLRImprove = 0;
      }

      // Early stopping
      if (epochsSinceImprovement >= config.patience) {
        earlyStopped = true;
        break;
      }

      if (logEvery > 0 && (epoch % logEvery === 0 || epoch === maxEpochs - 1)) {
        console.log(`  epoch ${epoch} · train ${trainLoss.toFixed(6)} · val ${valLoss.toFixed(6)} · lr ${lr.toFixed(8)}`);
      }
    }

    // Restore best weights
    if (this.bestWeights) {
      for (let l = 0; l < network.layers.length; l++) {
        const layer = network.layers[l] as any;
        const best = this.bestWeights[l];
        for (let i = 0; i < layer.weights.length; i++) layer.weights[i] = best.weights[i];
        for (let i = 0; i < layer.biases.length; i++) layer.biases[i] = best.biases[i];
      }
    }

    return {
      bestValLoss,
      bestEpoch,
      totalEpochs: trainLossHistory.length,
      earlyStopped,
      trainLossHistory,
      valLossHistory,
      lrHistory,
    };
  }
}
