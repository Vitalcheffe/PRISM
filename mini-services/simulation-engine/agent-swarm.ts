// agent-swarm.ts — AUTOROUTE D : Simulation multi-agents avec FACTIONS.
//
// 10 000 agents répartis en factions qui se font la guerre d'influence.
// Pas des statistiques passives : des groupes organisés avec des leaders,
// des objectifs, et la capacité de négocier, trahir, faire grève, ou
// renverser le pouvoir.

import type { Paradigm } from "./paradigm.js";

// --- Types d'agents ---

export type AgentType = "citizen" | "business" | "investor";
export type FactionId =
  | "labor_union"    // syndicats ouvriers
  | "employers"      // patronat
  | "military"       // armée
  | "religious"      // clergé religieux
  | "youth"          // mouvements de jeunesse
  | "rural"          // monde rural / agriculteurs
  | "urban_elite"    // élite urbaine
  | "informal";      // économie informelle / marché noir

export interface Faction {
  id: FactionId;
  name: string;
  // Puissance de la faction (0-1) — influence politique
  power: number;
  // Mécontentement (0-1) — 0 = loyal, 1 = prêt à la révolte
  grievance: number;
  // Relation avec le pouvoir (0 = hostile, 1 = allié)
  loyalty: number;
  // Demandes actuelles (ce que la faction veut)
  demands: string[];
}

export interface Agent {
  id: number;
  type: AgentType;
  faction: FactionId;
  trust: number;
  stress: number;
  capital: number;
  mobility: number;
  behavior: AgentBehavior;
  memory: { maxStress: number; minTrust: number };
}

export type AgentBehavior =
  | "normal"
  | "anxious"
  | "panicking"
  | "speculating"
  | "blackmarket"
  | "fleeing"
  | "striking"      // en grève (nouveau)
  | "rioting"       // en émeute (nouveau)
  | "rebelling";    // en rébellion ouverte (nouveau)

// --- L'essaim ---

export interface SwarmState {
  agents: Agent[];
  factions: Record<FactionId, Faction>;
  avgTrust: number;
  avgStress: number;
  avgCapital: number;
  behaviorCounts: Record<AgentBehavior, number>;
  emergentEvents: EmergentEvent[];
  // Menaces politiques (nouveau)
  politicalThreats: PoliticalThreat[];
}

export interface EmergentEvent {
  type: "panic" | "speculation" | "blackmarket" | "capital_flight" | "brain_drain" | "strike" | "riot" | "rebellion";
  intensity: number;
  agentCount: number;
  description: string;
}

export interface PoliticalThreat {
  type: "coup_risk" | "civil_war" | "general_strike" | "mass_exodus" | "revolution";
  faction: FactionId;
  probability: number; // 0-1
  description: string;
}

// --- Définition des factions ---

function createFactions(): Record<FactionId, Faction> {
  return {
    labor_union: {
      id: "labor_union", name: "Syndicats ouvriers", power: 0.25, grievance: 0.3, loyalty: 0.5,
      demands: ["Hausse du SMIG", "Protection de l'emploi", "Droits syndicaux"],
    },
    employers: {
      id: "employers", name: "Patronat", power: 0.30, grievance: 0.2, loyalty: 0.6,
      demands: ["Baisse des charges", "Flexibilité du travail", "Stabilité fiscale"],
    },
    military: {
      id: "military", name: "Armée", power: 0.20, grievance: 0.15, loyalty: 0.7,
      demands: ["Budget militaire", "Modernisation", "Statut"],
    },
    religious: {
      id: "religious", name: "Clergé religieux", power: 0.15, grievance: 0.25, loyalty: 0.55,
      demands: ["Lois morales", "Éducation religieuse", "Subventions"],
    },
    youth: {
      id: "youth", name: "Jeunesse", power: 0.18, grievance: 0.5, loyalty: 0.3,
      demands: ["Emploi", "Logement", "Éducation"],
    },
    rural: {
      id: "rural", name: "Monde rural", power: 0.12, grievance: 0.4, loyalty: 0.4,
      demands: ["Subventions agricoles", "Routes", "Accès eau"],
    },
    urban_elite: {
      id: "urban_elite", name: "Élite urbaine", power: 0.28, grievance: 0.15, loyalty: 0.65,
      demands: ["Sécurité", "Infrastructures", "Fiscalité avantageuse"],
    },
    informal: {
      id: "informal", name: "Économie informelle", power: 0.10, grievance: 0.6, loyalty: 0.2,
      demands: ["Légalisation", "Accès crédit", "Amnistie fiscale"],
    },
  };
}

// --- Création de l'essaim ---

export function createSwarm(size: number, paradigm: Paradigm): SwarmState {
  const agents: Agent[] = [];
  const factions = createFactions();

  // Répartition par faction (proportionnelle à la puissance)
  const factionList = Object.values(factions);
  const totalPower = factionList.reduce((s, f) => s + f.power, 0);

  for (let i = 0; i < size; i++) {
    // Assigner une faction (pondérée par puissance)
    const r = Math.random() * totalPower;
    let cumul = 0;
    let faction: FactionId = "citizen" as any;
    for (const f of factionList) {
      cumul += f.power;
      if (r <= cumul) { faction = f.id; break; }
    }

    // Type d'agent selon la faction
    let type: AgentType = "citizen";
    if (faction === "employers" || faction === "urban_elite") type = Math.random() < 0.5 ? "business" : "investor";
    else if (faction === "informal") type = Math.random() < 0.3 ? "business" : "citizen";

    const baseStress = factions[faction].grievance;
    agents.push({
      id: i,
      type,
      faction,
      trust: paradigm.agentBehavior.trustBase + (Math.random() - 0.5) * 0.2,
      stress: baseStress + Math.random() * 0.15,
      capital: type === "investor" ? 0.6 + Math.random() * 0.4 : type === "business" ? 0.3 + Math.random() * 0.4 : Math.random() * 0.3,
      mobility: type === "investor" ? paradigm.agentBehavior.capitalMobility : type === "business" ? paradigm.agentBehavior.capitalMobility * 0.6 : 0.1,
      behavior: "normal",
      memory: { maxStress: baseStress, minTrust: 0.5 },
    });
  }

  return aggregateSwarm(agents, factions, paradigm);
}

// --- Mise à jour de l'essaim ---

export function updateSwarm(
  swarm: SwarmState,
  indicators: {
    inflation: number;
    unemployment: number;
    stability: number;
    revolutionRisk: number;
    gdpGrowth: number;
  },
  paradigm: Paradigm,
): SwarmState {
  const { inflation, unemployment, stability, revolutionRisk, gdpGrowth } = indicators;
  const pb = paradigm.agentBehavior;
  const volatility = pb.stressVolatility;
  const panicThreshold = pb.panicThreshold;

  // Facteurs de stress macro
  const inflationStress = Math.max(0, (inflation - 5) / 15);
  const unemploymentStress = Math.max(0, (unemployment - 8) / 15);
  const instabilityStress = revolutionRisk / 100;
  const growthRelief = Math.max(0, gdpGrowth / 5);
  const macroStress = Math.min(1, inflationStress * 0.3 + unemploymentStress * 0.3 + instabilityStress * 0.4 - growthRelief * 0.2);

  // Mettre à jour les factions (leur mécontentement évolue — RAPIDE)
  const updatedFactions = { ...swarm.factions };
  for (const fid of Object.keys(updatedFactions) as FactionId[]) {
    const f = { ...updatedFactions[fid] };
    // Le mécontentement augmente vite avec le stress macro
    f.grievance = Math.min(1, f.grievance * 0.90 + macroStress * 0.10 + instabilityStress * 0.05);
    // La loyauté baisse vite si mécontentement élevé
    f.loyalty = Math.max(0, f.loyalty * 0.92 + (1 - f.grievance) * 0.08);
    // Les factions mécontentes gagnent en puissance (mobilisation)
    if (f.grievance > 0.5) {
      f.power = Math.min(0.6, f.power * 1.01);
    }
    updatedFactions[fid] = f;
  }

  const updatedAgents = swarm.agents.map((agent) => {
    const faction = updatedFactions[agent.faction];
    // Le stress de l'agent = stress macro + mécontentement de sa faction
    const factionStress = faction.grievance;
    const noise = (Math.random() - 0.5) * volatility * 0.1;
    let newStress = agent.stress * 0.9 + (macroStress * 0.6 + factionStress * 0.4) * 0.1 + noise;
    newStress = Math.max(0, Math.min(1, newStress));

    const trustDelta = (stability / 100 - agent.trust) * 0.05 - macroStress * 0.02 - factionStress * 0.01;
    let newTrust = agent.trust + trustDelta;
    newTrust = Math.max(0, Math.min(1, newTrust));

    const maxStress = Math.max(agent.memory.maxStress, newStress);
    const minTrust = Math.min(agent.memory.minTrust, newTrust);

    // Comportement — étendu avec grèves, émeutes, rébellion
    let behavior: AgentBehavior = "normal";
    if (newStress > 0.85 && faction.grievance > 0.7) {
      behavior = "rebelling"; // rébellion ouverte
    } else if (newStress > 0.8 && faction.grievance > 0.6) {
      behavior = "rioting"; // émeute
    } else if (newStress > 0.7 && (agent.faction === "labor_union" || agent.faction === "youth")) {
      behavior = "striking"; // grève
    } else if (newStress > panicThreshold + 0.2) {
      behavior = "panicking";
    } else if (newStress > panicThreshold) {
      behavior = agent.type === "investor" && agent.capital > 0.5 ? "fleeing" : "anxious";
    } else if (inflation > 10 && agent.type === "business") {
      behavior = "speculating";
    } else if (newTrust < 0.3 && agent.type === "business") {
      behavior = "blackmarket";
    } else if (newStress > 0.5 && agent.mobility > 0.6 && agent.capital > 0.4) {
      behavior = "fleeing";
    }

    let newCapital = agent.capital;
    if (behavior === "fleeing") newCapital *= 0.98;
    else if (behavior === "speculating") newCapital *= 1.005;
    else if (behavior === "striking") newCapital *= 0.999; // la grève coûte
    else if (behavior === "rebelling") newCapital *= 0.997; // la rébellion détruit
    else if (gdpGrowth > 2) newCapital *= 1.002;
    else if (gdpGrowth < 0) newCapital *= 0.998;

    return {
      ...agent,
      stress: newStress,
      trust: newTrust,
      capital: Math.max(0, Math.min(1, newCapital)),
      behavior,
      memory: { maxStress, minTrust },
    };
  });

  return aggregateSwarm(updatedAgents, updatedFactions, paradigm);
}

// --- Agréger + détecter menaces politiques ---

function aggregateSwarm(
  agents: Agent[],
  factions: Record<FactionId, Faction>,
  paradigm: Paradigm,
): SwarmState {
  const n = agents.length;
  let totalTrust = 0, totalStress = 0, totalCapital = 0;
  const behaviorCounts: Record<AgentBehavior, number> = {
    normal: 0, anxious: 0, panicking: 0, speculating: 0, blackmarket: 0,
    fleeing: 0, striking: 0, rioting: 0, rebelling: 0,
  };
  for (const a of agents) {
    totalTrust += a.trust;
    totalStress += a.stress;
    totalCapital += a.capital;
    behaviorCounts[a.behavior]++;
  }

  // Événements émergents
  const emergentEvents: EmergentEvent[] = [];
  const ratios: Record<string, number> = {};
  for (const [beh, count] of Object.entries(behaviorCounts)) {
    ratios[beh] = count / n;
  }

  if (ratios.panicking > 0.1) {
    emergentEvents.push({
      type: "panic", intensity: ratios.panicking, agentCount: behaviorCounts.panicking,
      description: `Panique : ${behaviorCounts.panicking} agents en panique irrationnelle (${(ratios.panicking * 100).toFixed(0)}%).`,
    });
  }
  if (ratios.fleeing > 0.05) {
    emergentEvents.push({
      type: "capital_flight", intensity: ratios.fleeing, agentCount: behaviorCounts.fleeing,
      description: `Fuite : ${behaviorCounts.fleeing} agents fuient (capitaux + cerveaux).`,
    });
  }
  if (ratios.striking > 0.05) {
    emergentEvents.push({
      type: "strike", intensity: ratios.striking, agentCount: behaviorCounts.striking,
      description: `Grève générale : ${behaviorCounts.striking} agents en grève (${(ratios.striking * 100).toFixed(0)}%).`,
    });
  }
  if (ratios.rioting > 0.03) {
    emergentEvents.push({
      type: "riot", intensity: ratios.rioting, agentCount: behaviorCounts.rioting,
      description: `Émeutes : ${behaviorCounts.rioting} agents en émeute dans les rues.`,
    });
  }
  if (ratios.rebelling > 0.02) {
    emergentEvents.push({
      type: "rebellion", intensity: ratios.rebelling, agentCount: behaviorCounts.rebelling,
      description: `RÉBELLION OUVERTE : ${behaviorCounts.rebelling} agents en insurrection !`,
    });
  }
  if (ratios.speculating > 0.08) {
    emergentEvents.push({
      type: "speculation", intensity: ratios.speculating, agentCount: behaviorCounts.speculating,
      description: `Spéculation : ${behaviorCounts.speculating} entreprises spéculent (bulle).`,
    });
  }
  if (ratios.blackmarket > 0.08) {
    emergentEvents.push({
      type: "blackmarket", intensity: ratios.blackmarket, agentCount: behaviorCounts.blackmarket,
      description: `Marché noir : ${behaviorCounts.blackmarket} entreprises contournent les lois.`,
    });
  }

  // Menaces politiques (nouveau)
  const politicalThreats: PoliticalThreat[] = [];
  for (const f of Object.values(factions)) {
    if (f.id === "military" && f.grievance > 0.6) {
      politicalThreats.push({
        type: "coup_risk", faction: f.id,
        probability: f.grievance * f.power,
        description: `Risque de coup d'État : l'armée est mécontente (grievance ${(f.grievance * 100).toFixed(0)}%, puissance ${(f.power * 100).toFixed(0)}%).`,
      });
    }
    if (f.grievance > 0.7 && behaviorCounts.rebelling > n * 0.01) {
      politicalThreats.push({
        type: "civil_war", faction: f.id,
        probability: f.grievance * f.power,
        description: `Risque de guerre civile : ${f.name} en rébellion ouverte.`,
      });
    }
    if (f.id === "labor_union" && f.grievance > 0.6 && behaviorCounts.striking > n * 0.05) {
      politicalThreats.push({
        type: "general_strike", faction: f.id,
        probability: f.grievance * f.power,
        description: `Grève générale imminente : les syndicats mobilisent.`,
      });
    }
    if (behaviorCounts.fleeing > n * 0.1) {
      politicalThreats.push({
        type: "mass_exodus", faction: f.id,
        probability: behaviorCounts.fleeing / n,
        description: `Exode massif : ${behaviorCounts.fleeing} agents fuient le pays.`,
      });
    }
    if (ratios.rebelling > 0.05 && f.grievance > 0.7) {
      politicalThreats.push({
        type: "revolution", faction: f.id,
        probability: f.grievance * f.power * (ratios.rebelling + 0.3),
        description: `RÉVOLUTION : ${f.name} prête à renverser le pouvoir !`,
      });
    }
  }

  return {
    agents,
    factions,
    avgTrust: totalTrust / n,
    avgStress: totalStress / n,
    avgCapital: totalCapital / n,
    behaviorCounts,
    emergentEvents,
    politicalThreats,
  };
}

// --- Snapshot sérialisable ---

export function swarmSnapshot(swarm: SwarmState) {
  return {
    agentCount: swarm.agents.length,
    avgTrust: swarm.avgTrust,
    avgStress: swarm.avgStress,
    avgCapital: swarm.avgCapital,
    behaviorCounts: swarm.behaviorCounts,
    emergentEvents: swarm.emergentEvents,
    politicalThreats: swarm.politicalThreats,
    factions: Object.fromEntries(
      Object.entries(swarm.factions).map(([id, f]) => [id, {
        name: f.name, power: f.power, grievance: f.grievance, loyalty: f.loyalty, demands: f.demands,
      }])
    ),
  };
}
