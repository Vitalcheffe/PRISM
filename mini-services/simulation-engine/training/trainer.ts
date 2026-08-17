// trainer.ts — Trainer pour le deep learning du NN PRISM.
//
// Implémente sa propre loss normalisée (MSE sur targets normalisés par outputStd)
// pour éviter l'explosion de gradient sur des indicateurs à grande échelle (GDP).

import { createNetwork, forward, type NeuralNetwork } from "../neural-network.js";
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
}

export const DEFAULT_CONFIG: TrainConfig = {
  learningRate: 0.00001,
  batchSize: 32,
  l2WeightDecay: 0.001,
  layer0LRMult: 3,
  biasDecay: 0.001,
  maxEpochs: 200,
  patience: 20,
  lrReducePatience: 10,
  lrReduceFactor: 0.5,
};

export interface TrainResult {
  bestValLoss: number;
  bestEpoch: number;
  totalEpochs: number;
  earlyStopped: boolean;
  trainLossHistory: number[];
  valLossHistory: number[];
  lrHistory: number[];
}

function computeLoss(network: NeuralNetwork, samples: Sample[]): number {
  // Loss normalisée : MSE sur (pred - target) / outputStd, moyennée sur tous les indicateurs.
  // Évite que GDP (échelle 1000s) domine HDI (échelle 0-1).
  let totalLoss = 0;
  let count = 0;
  for (const s of samples) {
    const pred = forward(network, s.levers);
    for (let i = 0; i < s.targets.length; i++) {
      const std = Math.max(0.1, Math.abs(s.targets[i]) * 0.5); // auto-scale par la target
      const normalizedErr = (pred[i] - s.targets[i]) / std;
      totalLoss += normalizedErr * normalizedErr;
      count++;
    }
  }
  return count > 0 && isFinite(totalLoss) ? totalLoss / count : Infinity;
}

function trainStep(network: NeuralNetwork, levers: number[], targets: number[], lr: number, momentum: number, cfg: TrainConfig): number {
  // Forward pass
  const input = levers; // normalizeInput est déjà fait dans forward()
  const pred = forward(network, input);

  // Loss normalisée
  let loss = 0;
  const outputGrad = new Float64Array(targets.length);
  for (let i = 0; i < targets.length; i++) {
    const std = Math.max(0.1, Math.abs(targets[i]) * 0.5);
    const normalizedErr = (pred[i] - targets[i]) / std;
    loss += normalizedErr * normalizedErr;
    outputGrad[i] = 2 * normalizedErr / std; // dL/dpred
  }
  loss /= targets.length;
  if (!isFinite(loss)) return Infinity;

  // Backward pass simplifié : gradient sur la couche de sortie seulement
  // (approximation : on ne backpropage que la dernière couche pour éviter les NaN)
  const outLayer = network.layers[2] as any;
  const h2 = outLayer.activations; // input de la couche de sortie = activations de h2
  // Recalculer h2 (activations de la couche 1)
  const h1Layer = network.layers[0] as any;
  const h2Layer = network.layers[1] as any;
  const h1Acts = h1Layer.activations;
  const h2Acts = h2Layer.activations;

  // Gradient sur les poids de la couche de sortie
  const l0mult = cfg.layer0LRMult;
  for (let j = 0; j < outLayer.outSize; j++) {
    const grad = outputGrad[j];
    // Update bias
    outLayer.velBiases[j] = momentum * outLayer.velBiases[j] - lr * grad;
    outLayer.biases[j] += outLayer.velBiases[j];
    if (cfg.biasDecay > 0) outLayer.biases[j] -= lr * cfg.biasDecay * outLayer.biases[j];
    // Update weights
    for (let i = 0; i < outLayer.inSize; i++) {
      const widx = i * outLayer.outSize + j;
      const gradW = grad * h2Acts[i];
      outLayer.velWeights[widx] = momentum * outLayer.velWeights[widx] - lr * gradW;
      let w = outLayer.weights[widx] + outLayer.velWeights[widx];
      if (cfg.l2WeightDecay > 0) w -= lr * cfg.l2WeightDecay * outLayer.weights[widx];
      outLayer.weights[widx] = w;
    }
  }

  // Layer 0 et 1 ne sont pas backpropagées dans cette approximation simplifiée.
  // Le pré-entraînement depuis les formules a déjà calibré ces couches.
  // Le deep learning affiné la couche de sortie.

  return loss;
}

function miniBatch(network: NeuralNetwork, samples: Sample[], batchSize: number, lr: number, momentum: number, cfg: TrainConfig) {
  const indices = Array.from({ length: samples.length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  let batchLoss = 0;
  let batchCount = 0;
  for (let start = 0; start < indices.length; start += batchSize) {
    const batch = indices.slice(start, start + batchSize).map((i) => samples[i]);
    let batchTotalLoss = 0;
    let validCount = 0;
    for (const s of batch) {
      const loss = trainStep(network, s.levers, s.targets, lr, momentum, cfg);
      if (isFinite(loss) && loss < 100) {
        batchTotalLoss += loss;
        validCount++;
      }
    }
    if (validCount > 0) {
      batchLoss += batchTotalLoss / validCount;
      batchCount++;
    }
  }
  return batchCount > 0 ? batchLoss / batchCount : Infinity;
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

  train(): TrainResult {
    const { network, dataset, config } = this;
    const trainLossHistory: number[] = [];
    const valLossHistory: number[] = [];
    const lrHistory: number[] = [];

    let lr = config.learningRate;
    let bestValLoss = Infinity;
    let bestEpoch = 0;
    let epochsSinceImprovement = 0;
    let epochsSinceLRImprove = 0;
    let earlyStopped = false;

    for (let epoch = 0; epoch < config.maxEpochs; epoch++) {
      const trainLoss = miniBatch(network, dataset.train, config.batchSize, lr, 0.9, config);
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

      if (epochsSinceLRImprove >= config.lrReducePatience && lr > 1e-6) {
        lr *= config.lrReduceFactor;
        epochsSinceLRImprove = 0;
      }

      if (epochsSinceImprovement >= config.patience) {
        earlyStopped = true;
        break;
      }

      if (epoch % 10 === 0 || epoch === config.maxEpochs - 1) {
        console.log(`  epoch ${epoch} · train ${trainLoss.toFixed(6)} · val ${valLoss.toFixed(6)} · lr ${lr.toFixed(6)}`);
      }
    }

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
