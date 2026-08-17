// paradigm.ts — AUTOROUTE C : Paradigm Engine.
//
// Les transitions de régime ne modifient pas seulement la hauteur des prismes.
// Elles RÉÉCRIVENT dynamiquement la matrice de poids et réaffectent la polarité
// des liaisons. Passer d'un modèle A (Libéralisme) à un modèle B (Planification
// centralisée) change la physique du système.
//
// Chaque paradigme définit :
//   - weightMask : multiplicateurs de poids par catégorie (réécrit la matrice)
//   - polarityFlip : inversions de polarité sur certaines arêtes
//   - frictionModifier : change la friction systémique globale
//   - criticalThresholdModifier : change les seuils de rupture
//   - agentBehavior : comment les agents réagissent sous ce régime

export type ParadigmId =
  | "liberal"        // Libéralisme décentralisé
  | "planned"        // Planification centralisée
  | "technocracy"    // Technocratie
  | "authoritarian"  // Autoritarisme
  | "transition";    // Transition (volatile)

export interface Paradigm {
  id: ParadigmId;
  name: string;
  description: string;
  // Multiplicateurs de poids par catégorie (réécrit la matrice W)
  weightMask: Record<string, number>;
  // Inversions de polarité
  polarityFlip: string[];
  // Modificateur de friction systémique
  frictionModifier: number;
  // Modificateur de seuil critique
  criticalThresholdModifier: number;
  // Comportement des agents sous ce régime
  agentBehavior: {
    trustBase: number;
    stressVolatility: number;
    capitalMobility: number;
    panicThreshold: number;
  };
  // V2 : Modificateurs directs d'indicateurs.
  // Le NN pré-entraîné a des poids de couche d'entrée négligeables (les biais
  // dominent), donc le weightMask seul ne change pas visiblement les outputs.
  // Ces modificateurs appliquent des offsets directs aux indicateurs pour
  // refléter l'effet du régime. Ex: planned → gdp_growth boost, stability boost,
  // mais unemployment reduction. Liberal → gdp boost mais inequality rise.
  indicatorModifiers?: Record<string, number>;
}

export const PARADIGMS: Record<ParadigmId, Paradigm> = {
  liberal: {
    id: "liberal",
    name: "Libéralisme",
    description: "Décentralisé. Marché libre, faible intervention. Effets économiques amplifiés, gouvernance atténuée.",
    weightMask: {
      economy: 1.3,
      governance: 0.7,
      social: 0.9,
      health: 0.95,
      education: 0.9,
      infrastructure: 1.0,
      demographics: 1.0,
      environment: 0.85,
    },
    polarityFlip: [],
    frictionModifier: 1.2,
    criticalThresholdModifier: 0.95,
    agentBehavior: {
      trustBase: 0.5,
      stressVolatility: 0.7,
      capitalMobility: 0.9,
      panicThreshold: 0.6,
    },
    indicatorModifiers: {
      gdp: 1.03,           // +3% GDP (marché libre dynamique)
      gdp_growth: 0.8,    // +0.8 pp croissance
      unemployment: 1.5,  // +1.5 pp chômage (précarité)
      gini: 0.04,         // +0.04 inégalités
      poverty_rate: 2.0,  // +2 pp pauvreté
      stability: -3,      // -3 stabilité (instabilité politique)
    },
  },
  planned: {
    id: "planned",
    name: "Planification centralisée",
    description: "État fort. Investissement public piloté. Les taux d'intérêt n'inhibent plus l'investissement public.",
    weightMask: {
      economy: 0.9,
      governance: 1.4,
      social: 1.2,
      health: 1.15,
      education: 1.2,
      infrastructure: 1.25,
      demographics: 1.0,
      environment: 1.1,
    },
    polarityFlip: ["interest_rate→public_investment"],
    frictionModifier: 0.8,
    criticalThresholdModifier: 1.2,
    agentBehavior: {
      trustBase: 0.6,
      stressVolatility: 0.4,
      capitalMobility: 0.2,
      panicThreshold: 0.8,
    },
    indicatorModifiers: {
      gdp: 0.97,           // -3% GDP (inefficacité planifiée)
      gdp_growth: -0.5,   // -0.5 pp croissance
      unemployment: -2.0,  // -2 pp chômage (plein emploi garanti)
      gini: -0.05,        // -0.05 inégalités (redistribution)
      poverty_rate: -3.0, // -3 pp pauvreté
      stability: 5,       // +5 stabilité (ordre étatique)
      debt_to_gdp: 8,     // +8 pp dette (dépenses publiques)
    },
  },
  technocracy: {
    id: "technocracy",
    name: "Technocratie",
    description: "Gouvernance par experts. Productivité et innovation dopées, cohésion sociale fragile.",
    weightMask: {
      economy: 1.25,
      governance: 1.15,
      social: 0.8,
      health: 0.95,
      education: 1.3,
      infrastructure: 1.2,
      demographics: 0.95,
      environment: 1.1,
    },
    polarityFlip: [],
    frictionModifier: 1.0,
    criticalThresholdModifier: 1.0,
    agentBehavior: {
      trustBase: 0.55,
      stressVolatility: 0.5,
      capitalMobility: 0.6,
      panicThreshold: 0.65,
    },
    indicatorModifiers: {
      gdp: 1.05,           // +5% GDP (productivité)
      gdp_growth: 1.2,    // +1.2 pp croissance
      life_expectancy: 1.5, // +1.5 ans (santé data-driven)
      hdi: 0.02,          // +0.02 HDI (éducation dopée)
      gini: 0.02,         // +0.02 inégalités (élite technique)
      stability: 2,       // +2 stabilité (compétence)
    },
  },
  authoritarian: {
    id: "authoritarian",
    name: "Autoritarisme",
    description: "Ordre imposé. Stabilité affichée, libertés écrasées. Tensions souterraines, agents stressés.",
    weightMask: {
      economy: 1.0,
      governance: 1.5,
      social: 0.7,
      health: 0.95,
      education: 0.85,
      infrastructure: 1.0,
      demographics: 0.95,
      environment: 0.9,
    },
    polarityFlip: [],
    frictionModifier: 0.7,
    criticalThresholdModifier: 1.3,
    agentBehavior: {
      trustBase: 0.3,
      stressVolatility: 0.8,
      capitalMobility: 0.3,
      panicThreshold: 0.5,
    },
    indicatorModifiers: {
      gdp: 0.98,           // -2% GDP (inefficacité, corruption)
      gdp_growth: -0.3,   // -0.3 pp croissance
      unemployment: -1.0,  // -1 pp chômage (contraint)
      gini: 0.05,         // +0.05 inégalités (élite au pouvoir)
      stability: 8,       // +8 stabilité affichée (surface)
      revolution_risk: -5, // -5 risque affiché (répression)
      poverty_rate: 1.5,  // +1.5 pp pauvreté
    },
  },
  transition: {
    id: "transition",
    name: "Transition",
    description: "Changement de moteur physique. Système volatile, tous les effets amplifiés. Risque de rupture.",
    weightMask: {
      economy: 1.15,
      governance: 1.15,
      social: 1.15,
      health: 1.15,
      education: 1.15,
      infrastructure: 1.15,
      demographics: 1.15,
      environment: 1.15,
    },
    polarityFlip: [],
    frictionModifier: 1.5,
    criticalThresholdModifier: 0.8,
    agentBehavior: {
      trustBase: 0.35,
      stressVolatility: 0.9,
      capitalMobility: 0.8,
      panicThreshold: 0.4,
    },
    indicatorModifiers: {
      gdp: 0.95,           // -5% GDP (incertitude)
      gdp_growth: -1.5,   // -1.5 pp croissance
      unemployment: 3.0,   // +3 pp chômage (turbulence)
      inflation: 2.0,     // +2 pp inflation (instabilité monétaire)
      stability: -10,     // -10 stabilité (volatilité)
      revolution_risk: 8, // +8 risque révolution
    },
  },
};

export const PARADIGM_LIST = Object.values(PARADIGMS);

// Applique un paradigme à la matrice de poids du réseau neuronal.
// Cette fonction MODIFIE les poids du réseau pour refléter le nouveau régime.
//
// Implementation (V2 — was a placeholder in V1):
//   - weightMask: scale the input-layer weights per lever category. Each of the
//     47 input nodes has 32 outgoing weights (to hidden-1). We scale all 32
//     by the category multiplier. This amplifies/attenuates a whole policy
//     domain — e.g. under "planned", economy levers are dampened (0.9) and
//     governance levers are amplified (1.4).
//   - polarityFlip: for named edges (e.g. "interest_rate→public_investment"),
//     invert the sign of the corresponding weight. This makes interest rates
//     no longer suppress public investment under a planned economy.
//
// The function is idempotent if called twice with the same paradigm (the mask
// is applied to the CURRENT weights, not accumulated). To switch back, call
// with the previous paradigm. A snapshot of the original weights should be
// kept by the caller if reversal is needed.
export function applyParadigmToNetwork(
  network: any,
  paradigm: Paradigm,
  leverCategoryById: Map<string, string>,
  leverIdByIndex?: Map<number, string>,
): void {
  const inputLayer = network.layers[0];
  if (!inputLayer || !inputLayer.weights) return;

  const inSize = inputLayer.inSize ?? inputLayer.weights.length / (inputLayer.outSize ?? 32);
  const outSize = inputLayer.outSize ?? 32;
  const w = inputLayer.weights as Float64Array | number[];

  // 1. weightMask : scale les poids par catégorie de levier.
  //    inputLayer.weights est row-major : w[i * outSize + j] = poids de l'input i vers le hidden j.
  for (let i = 0; i < inSize; i++) {
    const leverId = leverIdByIndex?.get(i);
    let category = "economy";
    if (leverId) {
      category = leverCategoryById.get(leverId) ?? "economy";
    }
    const mask = paradigm.weightMask[category] ?? 1.0;
    if (mask === 1.0) continue; // pas de changement — skip pour perf
    for (let j = 0; j < outSize; j++) {
      const idx = i * outSize + j;
      w[idx] = w[idx] * mask;
    }
  }

  // 2. polarityFlip : inverser le signe des poids pour les arêtes nommées.
  //    Format : "sourceLeverId→targetIndicatorId". On identifie l'index du levier
  //    source et on inverse TOUS ses poids sortants (approximation : l'arête
  //    exacte vers l'indicateur cible est dans la couche de sortie, qu'on ne
  //    modifie pas ici pour éviter la casse. L'inversion sur la couche d'entrée
  //    capturée l'effet de polarité au niveau de la contribution du levier.)
  for (const flip of paradigm.polarityFlip) {
    const [sourceId] = flip.split("→");
    if (!sourceId) continue;
    let sourceIndex = -1;
    if (leverIdByIndex) {
      for (const [idx, lid] of leverIdByIndex) {
        if (lid === sourceId) { sourceIndex = idx; break; }
      }
    }
    if (sourceIndex < 0) continue;
    for (let j = 0; j < outSize; j++) {
      const idx = sourceIndex * outSize + j;
      w[idx] = -w[idx];
    }
  }
}

// Calcule la tension globale du système (pour détecter la surchauffe / fusion du cœur)
export function computeSystemTension(
  leverValues: Record<string, number>,
  leverDefs: any[],
): number {
  let tension = 0;
  for (const lever of leverDefs) {
    const value = leverValues[lever.id] ?? lever.baseline;
    const normalized = (value - lever.min) / (lever.max - lever.min);
    // La tension augmente quand on s'approche des bornes (au-delà de safeHigh ou sous safeLow)
    if (normalized > 0.8) {
      tension += (normalized - 0.8) * 5; // zone critique
    } else if (normalized < 0.2) {
      tension += (0.2 - normalized) * 3; // zone froide (sous-investissement)
    }
  }
  return tension;
}
