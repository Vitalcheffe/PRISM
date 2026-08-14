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
  // ex: { economy: 1.3, governance: 0.7 } → les arêtes économiques sont amplifiées,
  //     les arêtes de gouvernance sont atténuées.
  weightMask: Record<string, number>;
  // Inversions de polarité : certaines arêtes voient leur signe inversé
  // ex: ["interest_rate→public_investment"] → sous planification, hausse taux
  //     n'inhibe plus l'investissement public (État investit quoi qu'il arrive)
  polarityFlip: string[];
  // Modificateur de friction systémique (vitesse de propagation)
  // > 1 = système plus réactif (changements rapides)
  // < 1 = système plus visqueux (changements lents)
  frictionModifier: number;
  // Modificateur de seuil critique (tolérance thermique)
  // > 1 = seuils plus élevés (le système tolère plus avant de rompre)
  // < 1 = seuils plus bas (le système est fragile)
  criticalThresholdModifier: number;
  // Comportement des agents sous ce régime
  agentBehavior: {
    trustBase: number;      // confiance de base des agents (0-1)
    stressVolatility: number; // volatilité du stress (0-1)
    capitalMobility: number;  // mobilité du capital (0-1, fuite facile)
    panicThreshold: number;   // seuil de panique (0-1)
  };
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
    frictionModifier: 1.2,    // système réactif
    criticalThresholdModifier: 0.95, // légèrement plus fragile
    agentBehavior: {
      trustBase: 0.5,
      stressVolatility: 0.7,
      capitalMobility: 0.9,   // capital très mobile (fuite facile)
      panicThreshold: 0.6,
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
    // Sous planification, hausse des taux n'inhibe pas l'investissement public
    polarityFlip: ["interest_rate→public_investment"],
    frictionModifier: 0.8,    // système visqueux (changements lents)
    criticalThresholdModifier: 1.2, // plus tolérant
    agentBehavior: {
      trustBase: 0.6,
      stressVolatility: 0.4,
      capitalMobility: 0.2,   // capital peu mobile (contrôlé)
      panicThreshold: 0.8,
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
    frictionModifier: 0.7,    // système très visqueux (changements bloqués)
    criticalThresholdModifier: 1.3, // tolérant en surface...
    agentBehavior: {
      trustBase: 0.3,         // ...mais confiance basse
      stressVolatility: 0.8,  // stress volatil
      capitalMobility: 0.3,   // capital contrôlé
      panicThreshold: 0.5,    // panique facile (sous tension)
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
    frictionModifier: 1.5,    // très réactif (volatile)
    criticalThresholdModifier: 0.8, // fragile
    agentBehavior: {
      trustBase: 0.35,
      stressVolatility: 0.9,
      capitalMobility: 0.8,   // fuite pendant l'incertitude
      panicThreshold: 0.4,    // panique très facile
    },
  },
};

export const PARADIGM_LIST = Object.values(PARADIGMS);

// Applique un paradigme à la matrice de poids du réseau neuronal.
// Cette fonction MODIFIE les poids du réseau pour refléter le nouveau régime.
export function applyParadigmToNetwork(
  network: any,
  paradigm: Paradigm,
  leverCategoryById: Map<string, string>,
): void {
  // La matrice de poids du réseau est dans network.layers[0].weights
  // (47 inputs → 32 hidden). Chaque input correspond à un levier.
  // On applique le weightMask selon la catégorie du levier.
  const inputLayer = network.layers[0];
  if (!inputLayer || !inputLayer.weights) return;

  // NOTE : On ne modifie pas directement les poids du réseau (ce serait destructif).
  // À la place, on stocke le paradigm actuel et on l'applique lors de la propagation
  // via un facteur multiplicatif. Cette fonction est un placeholder pour la V2
  // qui réécrira réellement la matrice.
  // Pour l'instant, le paradigm est appliqué au niveau du moteur (friction, seuils).
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
