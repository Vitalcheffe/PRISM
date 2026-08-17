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

// --- Options d'entraînement (Gap 3: normalisation / couche 0) ---
//
// Le problème observé dans VALIDATION.md §4.8 : à baseline, tous les leviers
// normalisés valent 0, donc les poids de la couche 0 ne reçoivent AUCUN
// gradient (gradWeights[i] += dz * input[i] = dz * 0 = 0). Le réseau compense
// en poussant les BIAIS pour produire la bonne sortie à baseline — mais les
// poids de la couche 0 restent proches de leur initialisation He (~0.2 std)
// et ne portent aucun signal. Entraîner sur des données réelles hors-baseline
// corrige partiellement ceci, mais lentement.
//
// Trois leviers pour forcer les poids à porter du signal :
//   1. layerLRMultiplier — multiplieur de LR par couche (défaut: 3× sur couche 0)
//   2. biasDecay — L2 sur les BIAIS uniquement (pousse le réseau à utiliser
//      les poids, contrairement au weight decay standard qui les rétrécit)
//   3. weightDecay — L2 standard sur les poids (optionnel, non activé par défaut)
//
// Vérification : verifyLayer0WeightsMatter() zeroe les poids de la couche 0 et
// mesure le delta sur la sortie. Avant le fix : ~0. Après : > epsilon.

export interface TrainOpts {
  // Multiplieur de learning rate par couche (défaut: [1,1,1]).
  // Mettre [3,1,1] pour donner à la couche 0 un LR 3× plus élevé.
  layerLRMultiplier?: [number, number, number];
  // L2 decay sur les BIAIS uniquement (défaut: 0). Force le réseau à utiliser
  // les poids plutôt que de tout coder dans les biais.
  biasDecay?: number;
  // L2 decay standard sur les poids (défaut: 0). Rétrécit les poids vers 0.
  weightDecay?: number;
}

// --- Données historiques réelles du Maroc (World Bank / IMF) ---
//
// Utilisées par preTrainOnRealData() pour entraîner le réseau sur des points
// de données RÉELS plutôt que sur les formules. Chaque année apporte :
//   - 6 valeurs cibles réelles (PIB_growth, chômage, inflation, dette/PIB,
//     espérance de vie, HDI) — ground truth World Bank.
//   - prevGdp et debt_to_gdp en Mrd MAD pour alimenter computeAllIndicators().
//   - leverOverrides : valeurs de leviers pour cette année (proxy historique).
//     Les autres leviers restent à leur baseline (calibrée ~2022-2023).

export interface MoroccoYearData {
  year: number;
  // 6 indicateurs réels (ground truth)
  gdp_growth: number;       // % par an
  unemployment: number;     // %
  inflation: number;        // %
  debt_to_gdp: number;      // %
  life_expectancy: number;  // années
  hdi: number;              // [0,1]
  // État macro pour les formules
  prevGdp: number;          // Mrd MAD (PIB année précédente, pour growth)
  // Overrides de leviers pour cette année (proxy historique)
  leverOverrides: Partial<Record<string, number>>;
  notes: string;            // contexte historique
}

export const MOROCCO_HISTORICAL: MoroccoYearData[] = [
  {
    year: 2000,
    gdp_growth: 3.9, unemployment: 13.0, inflation: 2.5,
    debt_to_gdp: 65.1, life_expectancy: 69.0, hdi: 0.577,
    prevGdp: 360,
    leverOverrides: {
      doctors_per_1k: 0.4, hospital_beds_per_1k: 0.8, vaccination_rate: 75,
      water_access: 75, primary_enrollment: 85, secondary_enrollment: 40,
      tertiary_enrollment: 15, education_budget_share: 4.5, health_budget_share: 4.0,
      interest_rate: 5.0, tax_compliance_rate: 50, anti_corruption_index: 30,
      minimum_wage: 1500, public_investment: 80, subsidies: 30,
      broadband_penetration: 5, road_paved_share: 50, renewable_energy_share: 20,
      gender_equality_index: 40, press_freedom_index: 25,
    },
    notes: "Baseline ~2000 : HDI 0.577, infrastructure faible, fiscalité peu efficiente.",
  },
  {
    year: 2005,
    gdp_growth: 3.0, unemployment: 11.0, inflation: 1.0,
    debt_to_gdp: 52.0, life_expectancy: 70.0, hdi: 0.617,
    prevGdp: 500,
    leverOverrides: {
      doctors_per_1k: 0.5, hospital_beds_per_1k: 0.9, vaccination_rate: 80,
      water_access: 80, primary_enrollment: 90, secondary_enrollment: 50,
      tertiary_enrollment: 20, education_budget_share: 5.0, health_budget_share: 4.8,
      interest_rate: 4.0, tax_compliance_rate: 55, minimum_wage: 1800,
      public_investment: 100, subsidies: 35, broadband_penetration: 12,
      road_paved_share: 56, renewable_energy_share: 25,
      gender_equality_index: 45, press_freedom_index: 28,
    },
    notes: "Dette ramenée à 52%, HDI 0.617, chômage encore élevé (11%).",
  },
  {
    year: 2010,
    gdp_growth: 4.5, unemployment: 9.0, inflation: 1.0,
    debt_to_gdp: 47.0, life_expectancy: 73.0, hdi: 0.661,
    prevGdp: 780,
    leverOverrides: {
      doctors_per_1k: 0.6, hospital_beds_per_1k: 1.0, vaccination_rate: 85,
      water_access: 83, primary_enrollment: 95, secondary_enrollment: 60,
      tertiary_enrollment: 28, education_budget_share: 5.7, health_budget_share: 5.5,
      interest_rate: 3.0, tax_compliance_rate: 60, minimum_wage: 2500,
      public_investment: 130, subsidies: 40, broadband_penetration: 25,
      road_paved_share: 62, renewable_energy_share: 28,
      gender_equality_index: 52, press_freedom_index: 32,
    },
    notes: "Âge d'or : HDI 0.661, dette 47% (plancher historique), chômage 9%.",
  },
  {
    year: 2015,
    gdp_growth: 4.5, unemployment: 9.7, inflation: 1.6,
    debt_to_gdp: 64.0, life_expectancy: 75.0, hdi: 0.701,
    prevGdp: 950,
    leverOverrides: {
      doctors_per_1k: 0.65, hospital_beds_per_1k: 1.0, vaccination_rate: 87,
      water_access: 85, primary_enrollment: 98, secondary_enrollment: 65,
      tertiary_enrollment: 32, education_budget_share: 5.7, health_budget_share: 5.8,
      interest_rate: 2.5, tax_compliance_rate: 62, minimum_wage: 2800,
      public_investment: 140, subsidies: 20, // réforme des subventions 2014
      broadband_penetration: 30, road_paved_share: 65, renewable_energy_share: 32,
      gender_equality_index: 55, press_freedom_index: 35,
    },
    notes: "Après réforme des subventions 2014 : subsidies chutent, dette remonte à 64%.",
  },
  {
    year: 2020,
    gdp_growth: -6.3, unemployment: 11.0, inflation: 0.7,
    debt_to_gdp: 76.0, life_expectancy: 77.0, hdi: 0.726,
    prevGdp: 1250,
    leverOverrides: {
      public_investment: 180, // plan de relance COVID
      subsidies: 70,          // soutien aux prix (COVID)
      interest_rate: 1.5,     // BAM coupe les taux
      exchange_rate: 10.5,    // MAD légèrement affaibli
      vaccination_rate: 88, minimum_wage: 3000, doctors_per_1k: 0.7,
      hospital_beds_per_1k: 1.1, education_budget_share: 6.4, health_budget_share: 6.8,
      broadband_penetration: 38, road_paved_share: 70, renewable_energy_share: 37,
      gender_equality_index: 60, press_freedom_index: 38,
    },
    notes: "COVID-19 : PIB −6.3%, dette grimpe à 76%, chômage remonte à 11%.",
  },
  {
    year: 2023,
    gdp_growth: 3.4, unemployment: 9.8, inflation: 6.1,
    debt_to_gdp: 69.0, life_expectancy: 78.0, hdi: 0.740,
    prevGdp: 1450,
    leverOverrides: {
      interest_rate: 3.0,     // BAM relève les taux pour contrer l'inflation
      subsidies: 25,          // poursuite de la réforme
      exchange_rate: 10.5,    // MAD toujours faible
      // Le reste est à baseline (calibré ~2022-2023) — cohérent avec l'inflation shock.
    },
    notes: "Choc inflationniste : inflation 6.1%, dette redescend à 69%, HDI 0.740.",
  },
];

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
  opts?: TrainOpts,
): number {
  // Forward
  const input = normalizeInput(network, leverValues);
  const h1 = forwardLayer(network.layers[0], input, false);
  const h2 = forwardLayer(network.layers[1], h1, false);
  const outNorm = forwardLayer(network.layers[2], h2, true);
  const out = denormalizeOutput(network, outNorm);

  // Calculer la perte (MSE — data loss, sans pénalité pour préserver la compat arrière)
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

  // Mise à jour SGD + momentum, avec options par-couche (Gap 3)
  const layerMult = opts?.layerLRMultiplier ?? ([1, 1, 1] as [number, number, number]);
  const biasDecay = opts?.biasDecay ?? 0;
  const weightDecay = opts?.weightDecay ?? 0;
  for (let li = 0; li < network.layers.length; li++) {
    const layer = network.layers[li];
    const lr = learningRate * layerMult[li];
    for (let i = 0; i < layer.weights.length; i++) {
      layer.velWeights[i] = momentum * layer.velWeights[i] - lr * layer.gradWeights[i];
      let w = layer.weights[i] + layer.velWeights[i];
      // L2 standard sur les poids (rétrécit vers 0 — par défaut désactivé)
      if (weightDecay > 0) w -= lr * weightDecay * layer.weights[i];
      layer.weights[i] = w;
    }
    for (let j = 0; j < layer.biases.length; j++) {
      layer.velBiases[j] = momentum * layer.velBiases[j] - lr * layer.gradBiases[j];
      let b = layer.biases[j] + layer.velBiases[j];
      // L2 sur les BIAIS uniquement (Gap 3) : pousse le réseau à coder le
      // signal dans les poids plutôt que dans les biais. Sans cela, à baseline
      // (input normalisé = 0), les biais absorbent toute la cible et les
      // poids de la couche 0 restent à leur init He (~0.2 std), sans signal.
      if (biasDecay > 0) b -= lr * biasDecay * layer.biases[j];
      layer.biases[j] = b;
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
  opts?: TrainOpts,
): number {
  let totalLoss = 0;
  for (const sample of samples) {
    totalLoss += train(network, sample.levers, sample.targets, learningRate, momentum, opts);
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

// --- Pré-entraînement sur données RÉELLES du Maroc (Gap 2) ---
//
// Contrairement à pretrainFromFormulas() qui entraîne sur 200 samples
// synthétiques générés par les formules économiques, cette fonction entraîne
// le réseau sur les 6 points de données réelles du Maroc (2000, 2005, 2010,
// 2015, 2020, 2023) — ground truth World Bank / IMF.
//
// Pour chaque année :
//   - Les 47 leviers sont positionnés via leverOverrides (proxy historique).
//   - Les 6 indicateurs connus (gdp_growth, chômage, inflation, dette/PIB,
//     espérance de vie, HDI) sont les CIBLES réelles.
//   - Les 9 autres indicateurs sont dérivés des formules (puisqu'on n'a pas
//     de données réelles publiées pour tous les 15 indicateurs à chaque année).
//
// Cette fonction applique par défaut le fix de normalisation (Gap 3) :
//   - layerLRMultiplier = [3, 1, 1]  → couche 0 apprend 3× plus vite
//   - biasDecay = 0.001             → L2 sur les biais, force l'utilisation
//                                      des poids
//
// Retourne la loss MSE avant et après entraînement + l'historique.

export interface PreTrainRealDataOpts {
  // Multiplieur de LR par couche (défaut: [3,1,1] pour le fix Gap 3)
  layerLRMultiplier?: [number, number, number];
  // L2 sur les biais (défaut: 0.001)
  biasDecay?: number;
  // LR de base (défaut: 0.005 — plus agressif que pretrainFromFormulas)
  baseLR?: number;
  // Momentum (défaut: 0.9)
  momentum?: number;
  // Décroissance du LR par epoch (défaut: 0.98 — décroissance lente)
  lrDecay?: number;
  // Log tous les N epochs (défaut: 50, 0 = silent)
  logEvery?: number;
}

export interface PreTrainResult {
  beforeLoss: number;
  afterLoss: number;
  lossHistory: number[];
  samples: { levers: number[]; targets: number[]; year: number }[];
}

export function buildHistoricalSamples(): {
  levers: number[];
  targets: number[];
  year: number;
}[] {
  return MOROCCO_HISTORICAL.map((yearData) => {
    const levers: Levers = {};
    for (const l of LEVERS) levers[l.id] = l.baseline;
    for (const [k, v] of Object.entries(yearData.leverOverrides)) {
      levers[k] = v as number;
    }
    const leverValues = LEVERS.map((l) => levers[l.id]);
    // accumulatedDebt approximatif : debt_to_gdp × prevGdp / 100
    const accumulatedDebt = (yearData.debt_to_gdp / 100) * yearData.prevGdp;
    const indicators = computeAllIndicators(
      levers,
      yearData.prevGdp,
      accumulatedDebt,
    );
    // Cibles : 6 valeurs réelles + 9 valeurs dérivées des formules
    const targets = INDICATORS.map((ind) => {
      switch (ind.id) {
        case "gdp_growth":       return yearData.gdp_growth;
        case "unemployment":      return yearData.unemployment;
        case "inflation":         return yearData.inflation;
        case "debt_to_gdp":      return yearData.debt_to_gdp;
        case "life_expectancy":  return yearData.life_expectancy;
        case "hdi":              return yearData.hdi;
        default:                 return (indicators as any)[ind.id] as number;
      }
    });
    return { levers: leverValues, targets, year: yearData.year };
  });
}

export function preTrainOnRealData(
  network: NeuralNetwork,
  epochs: number,
  opts?: PreTrainRealDataOpts,
): PreTrainResult {
  const samples = buildHistoricalSamples();

  // Loss avant entraînement (MSE normalisé, comme dans train())
  const beforeLoss = computeAverageLoss(network, samples);

  const baseLR = opts?.baseLR ?? 0.005;
  const momentum = opts?.momentum ?? 0.9;
  const lrDecay = opts?.lrDecay ?? 0.98;
  const layerLRMultiplier = opts?.layerLRMultiplier ?? ([3, 1, 1] as [number, number, number]);
  const biasDecay = opts?.biasDecay ?? 0.001;
  const logEvery = opts?.logEvery ?? 50;

  const lossHistory: number[] = [];
  for (let e = 0; e < epochs; e++) {
    const lr = baseLR * Math.pow(lrDecay, e);
    const avgLoss = trainEpoch(network, samples, lr, momentum, {
      layerLRMultiplier,
      biasDecay,
    });
    lossHistory.push(avgLoss);
    if (logEvery > 0 && (e % logEvery === 0 || e === epochs - 1)) {
      console.log(
        `[real-data] epoch ${e.toString().padStart(4, " ")}/${epochs}  lr=${lr.toExponential(2)}  loss=${avgLoss.toFixed(6)}`,
      );
    }
  }

  const afterLoss = computeAverageLoss(network, samples);

  return { beforeLoss, afterLoss, lossHistory, samples };
}

// Calcule la MSE normalisée moyenne sur un jeu d'échantillons (sans entraîner).
export function computeAverageLoss(
  network: NeuralNetwork,
  samples: { levers: number[]; targets: number[] }[],
): number {
  let total = 0;
  for (const s of samples) {
    const pred = forward(network, s.levers);
    let l = 0;
    for (let i = 0; i < OUTPUT_SIZE; i++) {
      const std = network.outputStd[i] || 1;
      const target = (s.targets[i] - network.outputMean[i]) / std;
      const predNorm = (pred[i] - network.outputMean[i]) / std;
      const diff = predNorm - target;
      l += diff * diff;
    }
    total += l / OUTPUT_SIZE;
  }
  return total / samples.length;
}

// --- Vérification du fix Gap 3 : les poids de la couche 0 portent-ils du signal ? ---
//
// Méthode : pour un input NON-baseline (sinon les entrées normalisées sont
// toutes 0 et la couche 0 ne peut rien coder), on :
//   1. Calcule la sortie du réseau (forward).
//   2. Sauvegarde les poids de la couche 0, les zeroe.
//   3. Recalcule la sortie.
//   4. Restaure les poids (ne mute pas le réseau).
//   5. Mesure le delta absolu moyen et max sur les 15 indicateurs.
//
// Si maxDelta > epsilon (1e-3 typiquement), les poids de la couche 0 portent
// du signal. Sinon, ils sont inactifs (signal codé uniquement dans les biais).

export interface Layer0Verification {
  baselineInput: number[];
  perturbedInput: number[];
  baselineOutputBefore: number[];
  baselineOutputAfter: number[];   // avec couche 0 zeroée
  perturbedOutputBefore: number[];
  perturbedOutputAfter: number[];  // avec couche 0 zeroée
  baselineMaxDelta: number;
  perturbedMaxDelta: number;
  weightsMatter: boolean;
  layer0WeightStats: { mean: number; std: number; max: number; nonzero: number };
}

export function verifyLayer0WeightsMatter(
  network: NeuralNetwork,
  customInputs?: number[],
): Layer0Verification {
  // Input 1 : baseline (entrées normalisées toutes 0 → couche 0 inactive)
  const baselineInput = LEVERS.map((l) => l.baseline);
  // Input 2 : perturbé (entrées normalisées non nulles → couche 0 active si
  // les poids portent du signal)
  const perturbedInput =
    customInputs ??
    LEVERS.map((l) => {
      const range = l.max - l.min;
      // +25% of range au-dessus de baseline, clampé
      return Math.min(l.max, l.baseline + range * 0.25);
    });

  // Sauvegarder les poids de la couche 0
  const layer0 = network.layers[0];
  const savedWeights = new Float64Array(layer0.weights);

  // Stats des poids de la couche 0 (avant zeroing)
  let wSum = 0, wSqSum = 0, wMax = 0, nonzero = 0;
  for (let i = 0; i < savedWeights.length; i++) {
    const w = savedWeights[i];
    wSum += w;
    wSqSum += w * w;
    if (Math.abs(w) > wMax) wMax = Math.abs(w);
    if (Math.abs(w) > 1e-6) nonzero++;
  }
  const wMean = wSum / savedWeights.length;
  const wStd = Math.sqrt(wSqSum / savedWeights.length - wMean * wMean);

  // Avant zeroing
  const baselineOutputBefore = forward(network, baselineInput);
  const perturbedOutputBefore = forward(network, perturbedInput);

  // Zeroer les poids de la couche 0
  layer0.weights.fill(0);

  // Après zeroing
  const baselineOutputAfter = forward(network, baselineInput);
  const perturbedOutputAfter = forward(network, perturbedInput);

  // Restaurer
  layer0.weights.set(savedWeights);

  // Deltas
  let baselineMaxDelta = 0;
  let perturbedMaxDelta = 0;
  for (let i = 0; i < OUTPUT_SIZE; i++) {
    const bd = Math.abs(baselineOutputBefore[i] - baselineOutputAfter[i]);
    const pd = Math.abs(perturbedOutputBefore[i] - perturbedOutputAfter[i]);
    if (bd > baselineMaxDelta) baselineMaxDelta = bd;
    if (pd > perturbedMaxDelta) perturbedMaxDelta = pd;
  }

  // Les poids portent du signal si le perturbed delta est significatif
  // (au-dessus d'epsilon pour éviter le bruit de précision flottante).
  const weightsMatter = perturbedMaxDelta > 1e-3;

  return {
    baselineInput,
    perturbedInput,
    baselineOutputBefore,
    baselineOutputAfter,
    perturbedOutputBefore,
    perturbedOutputAfter,
    baselineMaxDelta,
    perturbedMaxDelta,
    weightsMatter,
    layer0WeightStats: { mean: wMean, std: wStd, max: wMax, nonzero },
  };
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
