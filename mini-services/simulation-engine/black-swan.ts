// black-swan.ts — Le Cygne Noir : événements aléatoires imprévisibles.
//
// Peu importe la puissance du moteur, il y a le hasard absolu. Le joueur a le
// pays parfait, les prismes sont verts, et soudain : une pandémie, un séisme,
// un krach boursier, un coup d'État. Le joueur réalise que malgré sa "vue de
// Dieu", il est à la merci de l'Univers.
//
// Ces événements sont RARES (probabilité faible par tick) mais DÉVASTATEURS.
// Ils ne peuvent être prédits ni évités — seulement subis et gérés.

export type BlackSwanType =
  | "pandemic"
  | "earthquake"
  | "market_crash"
  | "coup"
  | "drought"
  | "cyberattack"
  | "refugee_crisis"
  | "oil_shock"
  | "harvest_failure"
  | "diplomatic_crisis";

export interface BlackSwanEvent {
  id: string;
  type: BlackSwanType;
  name: string;
  description: string;
  // Impacts : deltas appliqués aux leviers (négatifs = destructeur)
  impacts: { leverId: string; delta: number }[];
  // Impact sur les agents (stress, confiance)
  agentStressShock: number; // 0-1, choc immédiat de stress
  agentTrustShock: number;  // 0-1, chute de confiance
  // Impact sur la dette (coût de la reconstruction)
  fiscalCost: number; // Mrd MAD
  // Durée (en ticks pendant lesquels l'effet persiste)
  duration: number;
  // Sévérité (0-1)
  severity: number;
  tick: number;
}

// Probabilité de base par tick qu'un cygne noir se produise.
// 1 tick = 15 jours. Un cygne noir tous les ~6 mois en moyenne (pour la démo).
const BASE_PROBABILITY = 0.008; // ~0.8% par tick

// La probabilité augmente avec l'instabilité du système
// (un système fragile attire les crises — effet de clustering)
export function computeBlackSwanProbability(stability: number, revolutionRisk: number): number {
  // Plus la stabilité est basse, plus la probabilité augmente
  const fragility = (100 - stability) / 100;
  const tension = revolutionRisk / 100;
  return BASE_PROBABILITY * (1 + fragility * 2 + tension * 1.5);
}

// Catalogue des cygnes noirs possibles
const BLACK_SWAN_CATALOG: Omit<BlackSwanEvent, "id" | "tick">[] = [
  {
    type: "pandemic",
    name: "Pandémie virale",
    description: "Un virus mutant se propage. Le système de santé est débordé, l'économie se fige.",
    impacts: [
      { leverId: "hospital_beds_per_1k", delta: -0.3 },
      { leverId: "doctors_per_1k", delta: -0.1 },
      { leverId: "vaccination_rate", delta: -15 },
      { leverId: "public_investment", delta: -30 },
    ],
    agentStressShock: 0.4,
    agentTrustShock: 0.2,
    fiscalCost: 80,
    duration: 48, // 1 an
    severity: 0.8,
  },
  {
    type: "earthquake",
    name: "Séisme majeur",
    description: "Un séisme dévastateur frappe une zone dense. Infrastructures effondrées.",
    impacts: [
      { leverId: "road_paved_share", delta: -15 },
      { leverId: "rail_network_km", delta: -200 },
      { leverId: "hospital_beds_per_1k", delta: -0.2 },
      { leverId: "social_housing_units", delta: -30000 },
    ],
    agentStressShock: 0.5,
    agentTrustShock: 0.15,
    fiscalCost: 120,
    duration: 24,
    severity: 0.7,
  },
  {
    type: "market_crash",
    name: "Krach boursier mondial",
    description: "Les marchés financiers s'effondrent. Fuite des capitaux, investissements gelés.",
    impacts: [
      { leverId: "interest_rate", delta: 3 },
      { leverId: "exchange_rate", delta: 2 },
      { leverId: "public_investment", delta: -40 },
    ],
    agentStressShock: 0.3,
    agentTrustShock: 0.3,
    fiscalCost: 60,
    duration: 36,
    severity: 0.6,
  },
  {
    type: "coup",
    name: "Tentative de coup d'État",
    description: "Une faction militaire tente de prendre le pouvoir. Le pays paralyse.",
    impacts: [
      { leverId: "military_budget_share", delta: 2 },
      { leverId: "anti_corruption_index", delta: -20 },
      { leverId: "press_freedom_index", delta: -30 },
    ],
    agentStressShock: 0.6,
    agentTrustShock: 0.4,
    fiscalCost: 40,
    duration: 12,
    severity: 0.9,
  },
  {
    type: "drought",
    name: "Sécheresse exceptionnelle",
    description: "La pire sécheresse en 50 ans. Récoltes détruites, rationnement d'eau.",
    impacts: [
      { leverId: "water_access", delta: -10 },
      { leverId: "agriculture_subsidies", delta: -10 },
      { leverId: "renewable_energy_share", delta: -5 },
    ],
    agentStressShock: 0.25,
    agentTrustShock: 0.1,
    fiscalCost: 35,
    duration: 60,
    severity: 0.5,
  },
  {
    type: "cyberattack",
    name: "Cyberattaque massive",
    description: "Les infrastructures critiques sont paralysées. Banques, énergie, transports.",
    impacts: [
      { leverId: "broadband_penetration", delta: -20 },
      { leverId: "digital_admin_budget", delta: -2 },
      { leverId: "electricity_access", delta: -5 },
    ],
    agentStressShock: 0.35,
    agentTrustShock: 0.25,
    fiscalCost: 25,
    duration: 18,
    severity: 0.6,
  },
  {
    type: "refugee_crisis",
    name: "Crise migratoire",
    description: "Un conflit régional provoque un afflux massif de réfugiés. Pression sur tout le système.",
    impacts: [
      { leverId: "immigration_quota", delta: 200000 },
      { leverId: "social_programs_budget", delta: 15 },
      { leverId: "health_budget_share", delta: 1 },
    ],
    agentStressShock: 0.2,
    agentTrustShock: 0.15,
    fiscalCost: 50,
    duration: 72,
    severity: 0.5,
  },
  {
    type: "oil_shock",
    name: "Choc pétrolier",
    description: "Le prix du pétrole explose. Inflation importée, balance commerciale déficitaire.",
    impacts: [
      { leverId: "inflation", delta: 5 },
      { leverId: "subsidies", delta: 30 },
      { leverId: "renewable_energy_share", delta: 5 },
    ],
    agentStressShock: 0.2,
    agentTrustShock: 0.1,
    fiscalCost: 30,
    duration: 48,
    severity: 0.5,
  },
  {
    type: "harvest_failure",
    name: "Faille des récoltes",
    description: "Ravageurs + climat = récoltes annihilées. Famine menaçante.",
    impacts: [
      { leverId: "agriculture_subsidies", delta: -15 },
      { leverId: "water_management_budget", delta: -5 },
    ],
    agentStressShock: 0.3,
    agentTrustShock: 0.2,
    fiscalCost: 20,
    duration: 36,
    severity: 0.6,
  },
  {
    type: "diplomatic_crisis",
    name: "Crise diplomatique",
    description: "Un conflit avec un voisin ferme les frontières. Commerce suspendu.",
    impacts: [
      { leverId: "exchange_rate", delta: 1.5 },
      { leverId: "military_budget_share", delta: 1 },
    ],
    agentStressShock: 0.15,
    agentTrustShock: 0.1,
    fiscalCost: 15,
    duration: 24,
    severity: 0.4,
  },
];

function rid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// Tire un cygne noir aléatoirement
export function rollBlackSwan(stability: number, revolutionRisk: number): BlackSwanEvent | null {
  const prob = computeBlackSwanProbability(stability, revolutionRisk);
  if (Math.random() > prob) return null;

  // Sélectionner un événement aléatoire
  const template = BLACK_SWAN_CATALOG[Math.floor(Math.random() * BLACK_SWAN_CATALOG.length)];

  // La sévérité varie (parfois un séisme mineur, parfois majeur)
  const severityMultiplier = 0.5 + Math.random() * 1.0;

  return {
    ...template,
    id: rid(),
    impacts: template.impacts.map((imp) => ({
      ...imp,
      delta: imp.delta * severityMultiplier,
    })),
    agentStressShock: Math.min(1, template.agentStressShock * severityMultiplier),
    agentTrustShock: Math.min(1, template.agentTrustShock * severityMultiplier),
    fiscalCost: template.fiscalCost * severityMultiplier,
    severity: Math.min(1, template.severity * severityMultiplier),
    tick: 0, // sera défini par l'appelant
  };
}

// Applique un cygne noir au moteur (impacts immédiats + dette)
export function applyBlackSwan(
  event: BlackSwanEvent,
  levers: Record<string, number>,
  accumulatedDebt: number,
): { levers: Record<string, number>; newDebt: number } {
  const newLevers = { ...levers };
  for (const impact of event.impacts) {
    if (newLevers[impact.leverId] !== undefined) {
      newLevers[impact.leverId] += impact.delta;
    }
  }
  return {
    levers: newLevers,
    newDebt: accumulatedDebt + event.fiscalCost,
  };
}

// CYGNE NOIR EN CHAÎNE : un événement peut en déclencher d'autres.
// Une pandémie → récession → instabilité sociale. Un krach → faillites →
// chômage → émeutes. Le système cascade.
export function chainBlackSwan(
  event: BlackSwanEvent,
  stability: number,
  revolutionRisk: number,
): BlackSwanEvent | null {
  // La probabilité de chaîne augmente avec la fragilité
  const fragility = (100 - stability) / 100;
  const chainProb = event.severity * fragility * 0.3; // 30% max si système fragile

  if (Math.random() > chainProb) return null;

  // Chaînes causales : chaque type déclenche des types spécifiques
  const chains: Record<BlackSwanType, BlackSwanType[]> = {
    pandemic: ["market_crash", "harvest_failure"], // pandémie → krach + récoltes
    earthquake: ["refugee_crisis", "market_crash"], // séisme → réfugiés + krach
    market_crash: ["coup", "cyberattack"], // krach → coup d'État + cyberattaque
    coup: ["refugee_crisis", "diplomatic_crisis"], // coup → réfugiés + crise dipl.
    drought: ["harvest_failure", "oil_shock"], // sécheresse → récoltes + énergie
    cyberattack: ["market_crash"], // cyber → krach
    refugee_crisis: ["diplomatic_crisis"], // réfugiés → crise dipl.
    oil_shock: ["market_crash", "harvest_failure"], // pétrole → krach + récoltes
    harvest_failure: ["drought"], // récoltes → sécheresse (cycle)
    diplomatic_crisis: ["coup"], // crise dipl. → coup
  };

  const possibleChains = chains[event.type] ?? [];
  if (possibleChains.length === 0) return null;

  const chainType = possibleChains[Math.floor(Math.random() * possibleChains.length)];
  const template = BLACK_SWAN_CATALOG.find((t) => t.type === chainType);
  if (!template) return null;

  // L'événement en chaîne est moins sévère que l'original
  const severityMultiplier = event.severity * 0.7;

  return {
    ...template,
    id: rid(),
    impacts: template.impacts.map((imp) => ({
      ...imp,
      delta: imp.delta * severityMultiplier,
    })),
    agentStressShock: Math.min(1, template.agentStressShock * severityMultiplier),
    agentTrustShock: Math.min(1, template.agentTrustShock * severityMultiplier),
    fiscalCost: template.fiscalCost * severityMultiplier,
    severity: Math.min(1, template.severity * severityMultiplier),
    tick: 0,
  };
}
