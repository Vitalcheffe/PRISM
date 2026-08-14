// Types partagés — SYSTÈME DYNAMIQUE V3
//
// Architecture deux-couches :
//   LEVIERS (~41) : paramètres ajustables par le joueur (ou par décret).
//   INDICATEURS (~15) : agrégats CALCULÉS par de vraies formules économiques.
//
// Le joueur ne touche que les leviers. Les indicateurs se recalculent en direct.

export type LeverCategory =
  | "economy"
  | "health"
  | "education"
  | "infrastructure"
  | "demographics"
  | "governance"
  | "environment"
  | "social";

export type DisplayFormat =
  | "percent"
  | "currency"
  | "count"
  | "rate"
  | "years"
  | "index"
  | "score";

export interface LeverDef {
  id: string;
  name: string;
  category: LeverCategory;
  unit: string;
  baseline: number;
  min: number;
  max: number;
  safeLow: number;
  safeHigh: number;
  displayFormat: DisplayFormat;
  scale: "linear";
  description: string;
  source: string;
}

export interface IndicatorDef {
  id: string;
  name: string;
  formula: string;
  unit: string;
  displayFormat: DisplayFormat;
  description: string;
}

export interface CategoryDef {
  code: LeverCategory;
  name: string;
  description: string;
}

export interface ModelSchema {
  levers: LeverDef[];
  indicators: IndicatorDef[];
  categories: CategoryDef[];
}

export type LeverState = "normal" | "hot" | "cold" | "crisis";
export type IndicatorState = "normal" | "warning" | "critical";
export type AlertLevel = "info" | "warning" | "critical";

export interface Ripple {
  id: string;
  fromId: string;
  toId: string;
  strength: number;
  tick: number;
}

export interface Alert {
  id: string;
  level: AlertLevel;
  message: string;
  leverId?: string;
  indicatorId?: string;
  tick: number;
}

export interface Metric {
  id: string;
  name: string;
  value: number;
  unit: string;
  displayFormat: DisplayFormat;
}

export interface SimState {
  tick: number;
  levers: Record<string, number>;
  leverStates: Record<string, LeverState>;
  leverVelocities: Record<string, number>;
  indicators: Record<string, number>;
  indicatorStates: Record<string, IndicatorState>;
  metrics: Metric[];
  ripples: Ripple[];
  alerts: Alert[];
  paused: boolean;
  gameOver: null | { type: string; message: string };
  history: Record<string, number[]>;
  accumulatedDebt: number;
  networkStats: {
    totalWeights: number;
    activeWeights: number;
    maxWeight: number;
    avgWeight: number;
    epoch: number;
    totalSamples: number;
    lastLoss: number;
    architecture: string;
    parameters: number;
  } | null;
  // AUTOROUTE C : paradigm courant
  paradigm: string;
  // AUTOROUTE D : état agrégé de l'essaim avec factions
  swarm: {
    agentCount: number;
    avgTrust: number;
    avgStress: number;
    avgCapital: number;
    behaviorCounts: Record<string, number>;
    emergentEvents: Array<{
      type: string;
      intensity: number;
      agentCount: number;
      description: string;
    }>;
    politicalThreats: Array<{
      type: string;
      faction: string;
      probability: number;
      description: string;
    }>;
    factions: Record<string, {
      name: string;
      power: number;
      grievance: number;
      loyalty: number;
      demands: string[];
    }>;
  } | null;
  // LE CYGNE NOIR : dernier événement aléatoire imprévisible
  lastBlackSwan: {
    type: string;
    name: string;
    description: string;
    severity: number;
    tick: number;
  } | null;
  // ÉQUILIBRE THERMODYNAMIQUE SOCIAL
  thermodynamicBalance: number; // 0 = chaotique, 1 = équilibré
  overoptimizedCount: number; // nombre de leviers sur-optimisés (>90%)
}

export interface InitPayload {
  levers: LeverDef[];
  indicators: IndicatorDef[];
  categories: CategoryDef[];
  state: SimState;
}

export interface DecreeResult {
  accepted: boolean;
  reason?: string;
  deltas: {
    leverId: string;
    leverName: string;
    absoluteChange: number;
    relativeChange: number;
    unit: string;
  }[];
  immediateGdpImpact: number;
  immediateBudgetImpact: number;
  immediateDebtImpact: number;
  projectedStabilityDelta: number;
  fiscalCost: number;
  summary: string;
}

export type ClientCommand =
  | { type: "adjust"; leverId: string; value: number }
  | { type: "decree"; text: string }
  | { type: "project"; leverDeltas: { leverId: string; value: number }[]; extraDebt: number; ticks: number }
  | { type: "project-decree"; text: string; ticks: number }
  | { type: "set-paradigm"; paradigmId: string }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "reset" };

// --- Projection ---

export interface ProjectionPoint {
  tick: number;
  stability: number;
  gdp: number;
  debtToGdp: number;
  unemployment: number;
  inflation: number;
  revolutionRisk: number;
  lifeExpectancy: number;
  hdi: number;
  gini: number;
}

export interface ProjectionResult {
  trajectory: ProjectionPoint[];
  deltas: {
    stability: number;
    gdp: number;
    debtToGdp: number;
    unemployment: number;
    inflation: number;
    revolutionRisk: number;
    lifeExpectancy: number;
    hdi: number;
    gini: number;
  };
  crashed: boolean;
  crashReason: string | null;
  verdict: {
    label: "favorable" | "défavorable" | "mitigé" | "catastrophique";
    score: number;
    reasoning: string;
  };
  decreeResult?: DecreeResult;
}

// --- Formatage ---

export function formatLeverValue(value: number, fmt: DisplayFormat, unit: string): string {
  switch (fmt) {
    case "percent":
      return `${value.toFixed(1)} %`;
    case "currency":
      if (unit === "Mrd MAD") return `${value.toFixed(1)} Mrd`;
      if (unit === "MAD") {
        if (value >= 1e6) return `${(value / 1e6).toFixed(2)} M`;
        if (value >= 1e3) return `${(value / 1e3).toFixed(1)} k`;
        return value.toFixed(0);
      }
      if (unit === "MAD/mois") return value.toFixed(0);
      if (unit === "MAD/tonne") return value.toFixed(0);
      return value.toFixed(1);
    case "count":
      if (value >= 1e6) return `${(value / 1e6).toFixed(2)} M`;
      if (value >= 1e3) return `${(value / 1e3).toFixed(1)} k`;
      return value.toFixed(0);
    case "rate":
      return value.toFixed(2);
    case "years":
      return value.toFixed(1);
    case "index":
      return value.toFixed(0);
    case "score":
      return value.toFixed(3);
  }
}

export function formatIndicatorValue(value: number, fmt: DisplayFormat, unit: string): string {
  switch (fmt) {
    case "percent":
      return `${value.toFixed(1)} %`;
    case "currency":
      if (unit === "Mrd MAD") {
        if (value >= 1e3) return `${(value / 1e3).toFixed(2)} T`;
        return `${value.toFixed(0)} Mrd`;
      }
      return value.toFixed(0);
    case "count":
      if (value >= 1e6) return `${(value / 1e6).toFixed(2)} M`;
      if (value >= 1e3) return `${(value / 1e3).toFixed(1)} k`;
      return value.toFixed(0);
    case "rate":
      return value.toFixed(2);
    case "years":
      return value.toFixed(1);
    case "index":
      return value.toFixed(0);
    case "score":
      return value.toFixed(3);
  }
}
