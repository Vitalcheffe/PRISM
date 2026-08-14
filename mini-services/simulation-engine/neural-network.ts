// neural-network.ts — Réseau de neurones artificiel (MLP) pour la simulation macroéconomique.
//
// Architecture : MLP 47 (leviers) → 32 → 32 → 15 (indicateurs)
//   ~3000 "transistors" (poids synaptiques) apprenables.
//
// Le réseau est initialisé avec les formules économiques (théorie) puis
// affiné par apprentissage sur données réelles (Banque Mondiale).
// Chaque "document" (point de données historique) déclenche une mise à jour
// des poids par rétropropagation.
//
// Fonctions d'activation : ReLU sur couches cachées, identité sur la sortie
// (régression). Optimiseur : SGD avec momentum.
//
// Ce réseau est brevetable dans son approche : il combine connaissance
// structurelle (équations économiques comme initialisation) et apprentissage
// adaptatif (ajustement des poids par les données empiriques).

import { LEVERS, INDICATORS, MACRO_CONSTANTS, LEVER_BY_ID } from "./model.js";
import { computeAllIndicators, type Levers } from "./formulas.js";

// --- Architecture ---

export const INPUT_SIZE = LEVERS.length;       // 47 leviers
export const HIDDEN1_SIZE = 32;                 // couche cachée 1
export const HIDDEN2_SIZE = 32;                 // couche cachée 2
export const OUTPUT_SIZE = INDICATORS.length;   // 15 indicateurs

export interface Layer {
  weights: Float64Array;   // [in × out] en row-major
  biases: Float64Array;    // [out]
  // Gradients accumulés (pour backprop)
  gradWeights: Float64Array;
  gradBiases: Float64Array;
  // Momentum (SGD avec momentum)
  velWeights: Float64Array;
  velBiases: Float64Array;
  // Sorties de la couche (pour backprop)
  activations: Float64Array;
  preActivations: Float64Array;
  inSize: number;
  outSize: number;
}

export interface NeuralNetwork {
  layers: [Layer, Layer, Layer]; // 3 couches : input→h1, h1→h2, h2→output
  // Normalisation des entrées (mean/std par levier)
  inputMean: Float64Array;
  inputStd: Float64Array;
  // Normalisation des sorties
  outputMean: Float64Array;
  outputStd: Float64Array;
  // Métriques d'apprentissage
  epoch: number;
  totalSamples: number;
  lastLoss: number;
  trainingHistory: number[]; // loss par epoch
}

// --- Helpers math ---

function relu(x: number): number {
  return x > 0 ? x : 0;
}

function reluDeriv(x: number): number {
  return x > 0 ? 1 : 0;
}

function randn(): number {
  // Box-Muller
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Initialisation He pour ReLU
function heInit(fanIn: number): number {
  return randn() * Math.sqrt(2 / fanIn);
}

// --- Création du réseau ---

function createLayer(inSize: number, outSize: number): Layer {
  const weights = new Float64Array(inSize * outSize);
  const biases = new Float64Array(outSize);
  for (let i = 0; i < weights.length; i++) {
    weights[i] = heInit(inSize);
  }
  return {
    weights,
    biases,
    gradWeights: new Float64Array(inSize * outSize),
    gradBiases: new Float64Array(outSize),
    velWeights: new Float64Array(inSize * outSize),
    velBiases: new Float64Array(outSize),
    activations: new Float64Array(outSize),
    preActivations: new Float64Array(outSize),
    inSize,
    outSize,
  };
}

export function createNetwork(): NeuralNetwork {
  const network: NeuralNetwork = {
    layers: [
      createLayer(INPUT_SIZE, HIDDEN1_SIZE),
      createLayer(HIDDEN1_SIZE, HIDDEN2_SIZE),
      createLayer(HIDDEN2_SIZE, OUTPUT_SIZE),
    ],
    inputMean: new Float64Array(INPUT_SIZE),
    inputStd: new Float64Array(INPUT_SIZE),
    outputMean: new Float64Array(OUTPUT_SIZE),
    outputStd: new Float64Array(OUTPUT_SIZE),
    epoch: 0,
    totalSamples: 0,
    lastLoss: 0,
    trainingHistory: [],
  };

  // Initialiser la normalisation depuis les bornes des leviers
  for (let i = 0; i < INPUT_SIZE; i++) {
    const lever = LEVERS[i];
    const range = lever.max - lever.min;
    network.inputMean[i] = lever.baseline;
    network.inputStd[i] = range > 0 ? range / 2 : 1;
  }

  // Initialiser la normalisation des sorties (estimations raisonnables)
  const outputScales = [
    400,   // gdp (Mrd)
    5,     // gdp_growth (%)
    30000, // gdp_per_capita
    10,    // unemployment (%)
    5,     // inflation (%)
    60,    // debt_to_gdp (%)
    100,   // budget_deficit (Mrd)
    400,   // tax_revenue (Mrd)
    73,    // life_expectancy
    0.7,   // hdi
    0.4,   // gini
    150,   // balance_of_trade (Mrd)
    10,    // poverty_rate (%)
    50,    // stability (/100)
    30,    // revolution_risk (/100)
  ];
  for (let i = 0; i < OUTPUT_SIZE; i++) {
    network.outputMean[i] = 0;
    network.outputStd[i] = outputScales[i] || 1;
  }

  return network;
}

// --- Propagation avant (forward pass) ---

function normalizeInput(network: NeuralNetwork, leverValues: number[]): Float64Array {
  const normalized = new Float64Array(INPUT_SIZE);
  for (let i = 0; i < INPUT_SIZE; i++) {
    const std = network.inputStd[i] || 1;
    normalized[i] = (leverValues[i] - network.inputMean[i]) / std;
  }
  return normalized;
}

function denormalizeOutput(network: NeuralNetwork, normalized: Float64Array): number[] {
  const output = new Array(OUTPUT_SIZE);
  for (let i = 0; i < OUTPUT_SIZE; i++) {
    const std = network.outputStd[i] || 1;
    output[i] = normalized[i] * std + network.outputMean[i];
  }
  return output;
}

function forwardLayer(layer: Layer, input: Float64Array, isOutput: boolean): Float64Array {
  const { inSize, outSize, weights, biases } = layer;
  for (let j = 0; j < outSize; j++) {
    let sum = biases[j];
    for (let i = 0; i < inSize; i++) {
      sum += input[i] * weights[i * outSize + j];
    }
    layer.preActivations[j] = sum;
    // ReLU sur cachées, identité sur sortie
    layer.activations[j] = isOutput ? sum : relu(sum);
  }
  return layer.activations;
}

export function forward(network: NeuralNetwork, leverValues: number[]): number[] {
  const input = normalizeInput(network, leverValues);
  const h1 = forwardLayer(network.layers[0], input, false);
  const h2 = forwardLayer(network.layers[1], h1, false);
  const out = forwardLayer(network.layers[2], h2, true);
  return denormalizeOutput(network, out);
}

// --- Rétropropagation (backward pass) + mise à jour des poids ---

function backwardLayer(
  layer: Layer,
  input: Float64Array,
  outputGradient: Float64Array,
  isOutput: boolean,
): Float64Array {
  const { inSize, outSize, weights, preActivations, gradWeights, gradBiases } = layer;
  const inputGrad = new Float64Array(inSize);

  for (let j = 0; j < outSize; j++) {
    // dL/dz = dL/da × da/dz
    const dz = isOutput ? outputGradient[j] : outputGradient[j] * reluDeriv(preActivations[j]);
    gradBiases[j] += dz;
    for (let i = 0; i < inSize; i++) {
      gradWeights[i * outSize + j] += dz * input[i];
      inputGrad[i] += dz * weights[i * outSize + j];
    }
  }
  return inputGrad;
}

export function train(
  network: NeuralNetwork,
  leverValues: number[],
  targetIndicators: number[],
  learningRate: number,
  momentum: number,
): number {
  // Forward
  const input = normalizeInput(network, leverValues);
  const h1 = forwardLayer(network.layers[0], input, false);
  const h2 = forwardLayer(network.layers[1], h1, false);
  const outNorm = forwardLayer(network.layers[2], h2, true);
  const out = denormalizeOutput(network, outNorm);

  // Calculer la perte (MSE)
  let loss = 0;
  const outputGrad = new Float64Array(OUTPUT_SIZE);
  for (let i = 0; i < OUTPUT_SIZE; i++) {
    const target = (targetIndicators[i] - network.outputMean[i]) / (network.outputStd[i] || 1);
    const pred = outNorm[i];
    const diff = pred - target;
    loss += diff * diff;
    outputGrad[i] = 2 * diff; // dL/dz (identité sur sortie)
  }
  loss /= OUTPUT_SIZE;

  // Zéro les gradients
  for (const layer of network.layers) {
    layer.gradWeights.fill(0);
    layer.gradBiases.fill(0);
  }

  // Backward
  const gradH2 = backwardLayer(network.layers[2], h2, outputGrad, true);
  const gradH1 = backwardLayer(network.layers[1], h1, gradH2, false);
  backwardLayer(network.layers[0], input, gradH1, false);

  // Mise à jour SGD + momentum
  for (const layer of network.layers) {
    for (let i = 0; i < layer.weights.length; i++) {
      layer.velWeights[i] = momentum * layer.velWeights[i] - learningRate * layer.gradWeights[i];
      layer.weights[i] += layer.velWeights[i];
    }
    for (let j = 0; j < layer.biases.length; j++) {
      layer.velBiases[j] = momentum * layer.velBiases[j] - learningRate * layer.gradBiases[j];
      layer.biases[j] += layer.velBiases[j];
    }
  }

  network.lastLoss = loss;
  network.totalSamples++;
  return loss;
}

// --- Entraînement sur un batch (époque) ---

export function trainEpoch(
  network: NeuralNetwork,
  samples: { levers: number[]; targets: number[] }[],
  learningRate: number,
  momentum: number,
): number {
  let totalLoss = 0;
  for (const sample of samples) {
    totalLoss += train(network, sample.levers, sample.targets, learningRate, momentum);
  }
  const avgLoss = totalLoss / samples.length;
  network.epoch++;
  network.trainingHistory.push(avgLoss);
  if (network.trainingHistory.length > 100) {
    network.trainingHistory.shift();
  }
  return avgLoss;
}

// --- Initialisation par transfer learning depuis les formules économiques ---
//
// On génère des données synthétiques avec les formules (PIB = C+I+G+NX, etc.)
// et on pré-entraîne le réseau dessus. Le réseau apprend ainsi la structure
// économique, puis sera affiné par les données réelles.

export function pretrainFromFormulas(network: NeuralNetwork, epochs: number): number {
  const samples: { levers: number[]; targets: number[] }[] = [];

  // Générer 200 configurations de leviers autour des baselines
  for (let s = 0; s < 200; s++) {
    const levers: Levers = {};
    const leverValues: number[] = [];
    for (let i = 0; i < LEVERS.length; i++) {
      const lever = LEVERS[i];
      // Perturbation aléatoire autour de la baseline (±30%)
      const perturbation = (Math.random() - 0.5) * 0.6;
      const range = lever.max - lever.min;
      const value = Math.max(lever.min, Math.min(lever.max, lever.baseline + perturbation * range * 0.3));
      levers[lever.id] = value;
      leverValues.push(value);
    }
    // Calculer les cibles avec les formules
    const indicators = computeAllIndicators(levers, MACRO_CONSTANTS.gdp_baseline_mrd_mad, MACRO_CONSTANTS.debt_baseline_mrd_mad);
    const targets = INDICATORS.map((ind) => (indicators as any)[ind.id] as number);
    samples.push({ levers: leverValues, targets });
  }

  // Entraîner
  let lastLoss = 0;
  for (let e = 0; e < epochs; e++) {
    // Learning rate décroissant
    const lr = 0.001 * Math.pow(0.95, e);
    lastLoss = trainEpoch(network, samples, lr, 0.9);
  }
  return lastLoss;
}

// --- Sérialisation (pour persistence) ---

export function serializeNetwork(network: NeuralNetwork): string {
  return JSON.stringify({
    layers: network.layers.map((l) => ({
      weights: Array.from(l.weights),
      biases: Array.from(l.biases),
      inSize: l.inSize,
      outSize: l.outSize,
    })),
    inputMean: Array.from(network.inputMean),
    inputStd: Array.from(network.inputStd),
    outputMean: Array.from(network.outputMean),
    outputStd: Array.from(network.outputStd),
    epoch: network.epoch,
    totalSamples: network.totalSamples,
    lastLoss: network.lastLoss,
    trainingHistory: network.trainingHistory,
  });
}

export function deserializeNetwork(data: string): NeuralNetwork {
  const obj = JSON.parse(data);
  const network = createNetwork();
  for (let li = 0; li < 3; li++) {
    const layer = network.layers[li];
    const saved = obj.layers[li];
    for (let i = 0; i < layer.weights.length; i++) layer.weights[i] = saved.weights[i];
    for (let i = 0; i < layer.biases.length; i++) layer.biases[i] = saved.biases[i];
  }
  for (let i = 0; i < network.inputMean.length; i++) network.inputMean[i] = obj.inputMean[i];
  for (let i = 0; i < network.inputStd.length; i++) network.inputStd[i] = obj.inputStd[i];
  for (let i = 0; i < network.outputMean.length; i++) network.outputMean[i] = obj.outputMean[i];
  for (let i = 0; i < network.outputStd.length; i++) network.outputStd[i] = obj.outputStd[i];
  network.epoch = obj.epoch || 0;
  network.totalSamples = obj.totalSamples || 0;
  network.lastLoss = obj.lastLoss || 0;
  network.trainingHistory = obj.trainingHistory || [];
  return network;
}

// --- Statistiques du réseau (pour l'UI) ---

export function getNetworkStats(network: NeuralNetwork) {
  let totalWeights = 0;
  let activeWeights = 0; // poids non nuls
  let maxWeight = 0;
  let sumAbsWeight = 0;

  for (const layer of network.layers) {
    for (const w of layer.weights) {
      totalWeights++;
      if (Math.abs(w) > 0.001) activeWeights++;
      if (Math.abs(w) > maxWeight) maxWeight = Math.abs(w);
      sumAbsWeight += Math.abs(w);
    }
  }

  return {
    totalWeights,
    activeWeights,
    maxWeight,
    avgWeight: sumAbsWeight / totalWeights,
    epoch: network.epoch,
    totalSamples: network.totalSamples,
    lastLoss: network.lastLoss,
    architecture: `${INPUT_SIZE}→${HIDDEN1_SIZE}→${HIDDEN2_SIZE}→${OUTPUT_SIZE}`,
    parameters: totalWeights,
  };
}

// --- Activation d'un levier spécifique (pour visualisation des transistors) ---

export function getLayerActivations(network: NeuralNetwork, leverValues: number[]): {
  input: number[];
  hidden1: number[];
  hidden2: number[];
  output: number[];
} {
  const input = normalizeInput(network, leverValues);
  const h1 = forwardLayer(network.layers[0], input, false);
  const h2 = forwardLayer(network.layers[1], h1, false);
  const out = forwardLayer(network.layers[2], h2, true);
  return {
    input: Array.from(input),
    hidden1: Array.from(h1),
    hidden2: Array.from(h2),
    output: Array.from(out),
  };
}
