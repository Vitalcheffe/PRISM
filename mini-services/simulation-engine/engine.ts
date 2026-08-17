// engine.ts — Moteur de simulation "Système Dynamique" V3.
//
// Architecture deux-couches :
//   COUCHE 1 — LEVIERS : ~40 paramètres ajustables par le joueur (ou par décret).
//   COUCHE 2 — INDICATEURS : 15 agrégats CALCULÉS par de vraies formules.
//
// Le joueur ne touche que les leviers. Les indicateurs se recalculent à chaque
// tick via les formules (formulas.ts). Les changements de leviers se propagent
// aussi à d'autres leviers via les arêtes causales (avec retard).
//
// Les décrets (decrees.ts) traduisent une action concrète en deltas de leviers.

import { LEVERS, INDICATORS, CATEGORIES, MACRO_CONSTANTS, LEVER_BY_ID } from "./model.js";
import {
  computeAllIndicators,
  OUTGOING,
  type CausalEdge,
  type Levers,
  type ComputedIndicators,
} from "./formulas.js";
import { executeDecree, type DecreeResult } from "./decrees.js";
import {
  createNetwork,
  forward,
  pretrainFromFormulas,
  train,
  getNetworkStats,
  type NeuralNetwork,
} from "./neural-network.js";
import {
  diminishingReturns,
  criticalThreshold,
  bifurcation,
  feedbackLoop,
  cascadeEffect,
  exponentialRunaway,
  Hysteresis,
} from "./nonlinear.js";
import {
  PARADIGMS,
  PARADIGM_LIST,
  applyParadigmToNetwork,
  computeSystemTension,
  type Paradigm,
  type ParadigmId,
} from "./paradigm.js";
import {
  createSwarm,
  updateSwarm,
  swarmSnapshot,
  type SwarmState,
} from "./agent-swarm.js";
import {
  rollBlackSwan,
  applyBlackSwan,
  chainBlackSwan,
  type BlackSwanEvent,
} from "./black-swan.js";

// --- Types d'état (miroir sim-types.ts côté frontend) ---

export interface Ripple {
  id: string;
  fromId: string;
  toId: string;
  strength: number;
  tick: number;
}

export interface Alert {
  id: string;
  level: "info" | "warning" | "critical";
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
  displayFormat: string;
}

export interface SimState {
  tick: number;
  // Couche 1 : leviers (ajustables)
  levers: Record<string, number>;
  leverStates: Record<string, "normal" | "hot" | "cold" | "crisis">;
  leverVelocities: Record<string, number>;
  // Couche 2 : indicateurs (calculés)
  indicators: Record<string, number>;
  indicatorStates: Record<string, "normal" | "warning" | "critical">;
  // Métriques de synthèse
  metrics: Metric[];
  // Propagation
  ripples: Ripple[];
  alerts: Alert[];
  paused: boolean;
  gameOver: null | { type: string; message: string };
  // Historique pour sparklines
  history: Record<string, number[]>;
  // Dette accumulée
  accumulatedDebt: number;
  // Stats du réseau neuronal
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
  // AUTOROUTE D : état agrégé de l'essaim
  swarm: any;
}

export interface InitPayload {
  levers: typeof LEVERS;
  indicators: typeof INDICATORS;
  categories: typeof CATEGORIES;
  state: SimState;
}

// --- Constantes ---

const TICK_MS = 200;             // un tick = 200ms (5 ticks/sec)
const MAX_RIPPLES = 60;
const MAX_ALERTS = 50;
const HISTORY_MAX = 80;
const RIPPLE_TTL = 8;

// Seuils de crise pour indicateurs
const INDICATOR_THRESHOLDS: Record<string, { warning: number; critical: number; direction: "high" | "low" }> = {
  gdp_growth: { warning: 1, critical: -1, direction: "low" },
  unemployment: { warning: 12, critical: 18, direction: "high" },
  inflation: { warning: 5, critical: 10, direction: "high" },
  debt_to_gdp: { warning: 70, critical: 90, direction: "high" },
  budget_deficit: { warning: 50, critical: 100, direction: "high" },
  life_expectancy: { warning: 68, critical: 62, direction: "low" },
  hdi: { warning: 0.6, critical: 0.45, direction: "low" },
  gini: { warning: 0.45, critical: 0.55, direction: "high" },
  poverty_rate: { warning: 10, critical: 20, direction: "high" },
  stability: { warning: 50, critical: 30, direction: "low" },
  revolution_risk: { warning: 50, critical: 75, direction: "high" },
  balance_of_trade: { warning: -150, critical: -250, direction: "low" },
};

// Conditions de fin (persistance)
const COLLAPSE_THRESHOLD = 20;
const COLLAPSE_PERSISTENCE = 40;
const REVOLUTION_STAB_THRESHOLD = 30;
const REVOLUTION_RISK_THRESHOLD = 75;
const REVOLUTION_PERSISTENCE = 50;
const DEBT_GDP_THRESHOLD = 150;
const DEBT_PERSISTENCE = 80;
const UNEMPLOYMENT_THRESHOLD = 25;
const UNEMPLOYMENT_PERSISTENCE = 50;

// --- Helpers ---

function rid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

function leverState(lever: typeof LEVERS[number], value: number): "normal" | "hot" | "cold" | "crisis" {
  if (value >= lever.max * 0.95) return "crisis";
  if (value >= lever.safeHigh) return "hot";
  if (value <= lever.safeLow) return "cold";
  return "normal";
}

function indicatorState(id: string, value: number): "normal" | "warning" | "critical" {
  const t = INDICATOR_THRESHOLDS[id];
  if (!t) return "normal";
  if (t.direction === "high") {
    if (value >= t.critical) return "critical";
    if (value >= t.warning) return "warning";
  } else {
    if (value <= t.critical) return "critical";
    if (value <= t.warning) return "warning";
  }
  return "normal";
}

// --- Effet différé en file d'attente ---

interface PendingEffect {
  targetLever: string;
  amount: number;          // delta absolu à appliquer
  fireAtTick: number;
  sourceLever: string;
}

// --- Le moteur ---

export class SimulationEngine {
  levers: Levers = {};
  leverTargets: Record<string, number> = {}; // cible fixée par le joueur
  prevGdp: number = MACRO_CONSTANTS.gdp_baseline_mrd_mad;
  accumulatedDebt: number = MACRO_CONSTANTS.debt_baseline_mrd_mad;
  pending: PendingEffect[] = [];
  ripples: Ripple[] = [];
  alerts: Alert[] = [];
  tick = 0;
  paused = false;
  gameOver: null | { type: string; message: string } = null;
  indicators: ComputedIndicators | null = null;
  // Le réseau neuronal (breveté) qui calcule les indicateurs
  neuralNetwork: NeuralNetwork;
  networkStats: ReturnType<typeof getNetworkStats> | null = null;
  // Hystérésis : le système se souvient de son passé (non-linéarité de mémoire)
  debtHysteresis: Hysteresis = new Hysteresis();
  unemploymentHysteresis: Hysteresis = new Hysteresis();
  inflationHysteresis: Hysteresis = new Hysteresis();
  stabilityHysteresis: Hysteresis = new Hysteresis();
  // AUTOROUTE C : Paradigm Engine (régime politique courant)
  paradigm: Paradigm = PARADIGMS.technocracy;
  // AUTOROUTE D : Agent Swarm (essaim d'agents)
  swarm: SwarmState | null = null;
  // LE CYGNE NOIR : dernier événement aléatoire imprévisible
  lastBlackSwan: BlackSwanEvent | null = null;
  history: Record<string, number[]> = {};
  leverVelocities: Record<string, number> = {};

  // Compteurs de persistance pour game over
  private collapseTicks = 0;
  private revolutionTicks = 0;
  private debtTicks = 0;
  private unemploymentTicks = 0;
  private previousLeverCrises = new Set<string>();
  private previousIndicatorCrises = new Set<string>();

  constructor() {
    // Créer et pré-entraîner le réseau neuronal depuis les formules économiques
    console.log("[neural] Initialisation du réseau neuronal...");
    this.neuralNetwork = createNetwork();
    const finalLoss = pretrainFromFormulas(this.neuralNetwork, 30);
    this.networkStats = getNetworkStats(this.neuralNetwork);
    console.log(`[neural] Réseau pré-entraîné : ${this.networkStats.totalWeights} poids, loss final = ${finalLoss.toFixed(4)}`);
    console.log(`[neural] Architecture : ${this.networkStats.architecture}`);
    // Créer l'essaim d'agents (10000 agents en 8 factions, paradigm par défaut = technocratie)
    this.swarm = createSwarm(10000, this.paradigm);
    console.log(`[swarm] Essaim créé : ${this.swarm.agents.length} agents en 8 factions`);
    this.reset();
  }

  // --- Apprentissage : nourrit le réseau avec un nouveau "document" (point de données) ---

  learnFromDocument(leverValues: Levers, targetIndicators: Partial<ComputedIndicators>): number {
    // Construire les tableaux d'entrée/sortie
    const input: number[] = LEVERS.map((l) => leverValues[l.id] ?? l.baseline);
    const targets = INDICATORS.map((ind) => {
      const v = (targetIndicators as any)[ind.id];
      return typeof v === "number" ? v : 0;
    });
    const loss = train(this.neuralNetwork, input, targets, 0.0005, 0.9);
    this.networkStats = getNetworkStats(this.neuralNetwork);
    return loss;
  }

  reset(): void {
    this.levers = {};
    this.leverTargets = {};
    for (const l of LEVERS) {
      this.levers[l.id] = l.baseline;
      this.leverTargets[l.id] = l.baseline;
    }
    this.prevGdp = MACRO_CONSTANTS.gdp_baseline_mrd_mad;
    this.accumulatedDebt = MACRO_CONSTANTS.debt_baseline_mrd_mad;
    this.pending = [];
    this.ripples = [];
    this.alerts = [];
    this.tick = 0;
    this.paused = false;
    this.gameOver = null;
    // Réinitialiser l'hystérésis (effacer la mémoire du système)
    this.debtHysteresis.reset();
    this.unemploymentHysteresis.reset();
    this.inflationHysteresis.reset();
    this.stabilityHysteresis.reset();
    this.lastBlackSwan = null;
    this.collapseTicks = 0;
    this.revolutionTicks = 0;
    this.debtTicks = 0;
    this.unemploymentTicks = 0;
    this.previousLeverCrises = new Set();
    this.previousIndicatorCrises = new Set();
    this.history = {};
    this.leverVelocities = {};
    for (const l of LEVERS) {
      this.history[l.id] = [l.baseline];
      this.leverVelocities[l.id] = 0;
    }
    this.recompute();
    this.pushAlert("info", `Système initialisé. ${LEVERS.length} leviers, ${INDICATORS.length} indicateurs dérivés. PIB = ${this.indicators!.gdp.toFixed(0)} Mrd MAD.`);
  }

  // --- Recalcul des indicateurs par PROPAGATION DANS LE RÉSEAU NEURONAL ---
  //
  // Les leviers sont les entrées du réseau. Les indicateurs sont les sorties.
  // Le réseau a été pré-entraîné sur les formules économiques, puis affiné
  // par les données réelles. Chaque appel à recompute() fait une propagation
  // avant (forward pass) dans le réseau.

  recompute(): void {
    // Construire le vecteur d'entrée (valeurs des leviers dans l'ordre LEVERS)
    const leverValues = LEVERS.map((l) => this.levers[l.id] ?? l.baseline);

    // Propagation avant dans le réseau neuronal
    const outputs = forward(this.neuralNetwork, leverValues);

    // Construire l'objet ComputedIndicators depuis les sorties du réseau
    const indicators: any = {};
    for (let i = 0; i < INDICATORS.length; i++) {
      indicators[INDICATORS[i].id] = outputs[i];
    }

    // ── CLAMPE PHYSIQUE POST-RÉSEAU ──
    // Le réseau de neurones produit des sorties linéaires non-bornées. Chaque
    // indicateur a une plage physique réelle — une espérance de vie ne peut
    // pas dépasser 90 ans, un IDH est dans [0, 1]. Sans ce clampe, le réseau
    // peut produire des valeurs absurdes (espérance de vie 147 ans, IDH 1.2)
    // qui détruisent la crédibilité du simulateur. On clampe ici, avant toute
    // transformation non-linéaire, pour garantir que tous les indicateurs
    // restent dans des plages physiquement possibles.
    const INDICATOR_RANGES: Record<string, [number, number]> = {
      gdp: [100, 5000],              // Mrd MAD (Maroc ~1300)
      gdp_growth: [-15, 15],         // % par an
      gdp_per_capita: [1000, 100000],// MAD/hab
      unemployment: [0, 50],         // %
      inflation: [-5, 50],           // %
      debt_to_gdp: [0, 300],         // % (peut monter haut, cap à 300)
      budget_deficit: [-200, 50],    // Mrd MAD
      tax_revenue: [0, 1000],        // Mrd MAD
      life_expectancy: [45, 90],     // années (physiquement possible)
      hdi: [0, 1],                   // IDH défini sur [0, 1]
      gini: [0.2, 0.7],              // coefficient de Gini plausible
      balance_of_trade: [-100, 100], // Mrd MAD
      poverty_rate: [0, 80],         // %
      stability: [0, 95],            // score interne
      revolution_risk: [0, 100],     // %
    };
    for (const id of Object.keys(indicators)) {
      const range = INDICATOR_RANGES[id];
      if (range) {
        indicators[id] = Math.max(range[0], Math.min(range[1], indicators[id]));
      }
    }

    // Le PIB doit utiliser la dette accumulée pour debt_to_gdp
    const gdp = indicators.gdp ?? MACRO_CONSTANTS.gdp_baseline_mrd_mad;
    indicators.debt_to_gdp = (this.accumulatedDebt / gdp) * 100;
    // La croissance du PIB = (gdp - prevGdp) / prevGdp
    indicators.gdp_growth = this.prevGdp > 0 ? ((gdp - this.prevGdp) / this.prevGdp) * 100 : 0;

    // ── MODIFICATEURS DE PARADIGME ──
    // Le paradigme courant applique des offsets directs aux indicateurs.
    // Cela reflète l'effet structurel du régime politique : sous planification,
    // le plein emploi est garanti mais le PIB baisse ; sous libéralisme, le PIB
    // monte mais les inégalités augmentent. Les multiplicateurs (gdp) sont
    // appliqués avant les offsets additifs.
    const mods = this.paradigm.indicatorModifiers;
    if (mods) {
      for (const [id, mod] of Object.entries(mods)) {
        if (id === "gdp" && typeof mod === "number") {
          indicators.gdp = (indicators.gdp ?? gdp) * mod;
        } else if (indicators[id] !== undefined && typeof mod === "number") {
          indicators[id] = indicators[id] + mod;
        }
      }
    }

    // ── NON-LINÉARITÉS POST-RÉSEAU ──
    // Le réseau donne une base linéaire. On applique ensuite des corrections
    // non-linéaires qui modélisent les phénomènes économiques réels : seuils
    // critiques, emballement, hystérésis, bifurcations.

    const debtToGdp = indicators.debt_to_gdp;
    const unemployment = indicators.unemployment ?? 9.5;
    const inflation = indicators.inflation ?? 2;
    const stability = indicators.stability ?? 70;

    // 1. SEUIL CRITIQUE de la dette : au-delà de 80% du PIB, effet exponentiel
    //    sur le risque d'instabilité (crise de confiance des investisseurs).
    if (debtToGdp > 80) {
      const debtExcess = exponentialRunaway(debtToGdp, 80, 0.08);
      indicators.revolution_risk = (indicators.revolution_risk ?? 20) + debtExcess * 30;
    }

    // 2. EMBALLEMENT de l'inflation : au-delà de 8%, l'inflation devient
    //    non-linéaire (anticipations inflationnistes, spirale prix-salaires).
    if (inflation > 8) {
      const inflationRunaway = exponentialRunaway(inflation, 8, 0.15);
      indicators.inflation = inflation + inflationRunaway * 5;
      // L'emballement inflationniste détruit la stabilité
      indicators.stability = stability * (1 - inflationRunaway * 0.3);
    }

    // 3. BIFURCATION du chômage : au-delà de 15%, bascule vers un régime
    //    d'instabilité sociale (effet non-linéaire, pas proportionnel).
    if (unemployment > 15) {
      const unemploymentBifurcation = bifurcation(unemployment, 15, 0.5);
      indicators.revolution_risk = (indicators.revolution_risk ?? 20) + unemploymentBifurcation * 25;
      indicators.stability = (indicators.stability ?? 70) * (1 - unemploymentBifurcation * 0.2);
    }

    // 4. HYSTÉRÉSIS : le système se souvient de son passé.
    //    Même après réduction de la dette, la confiance persiste basse.
    this.debtHysteresis.update(debtToGdp);
    this.unemploymentHysteresis.update(unemployment);
    this.inflationHysteresis.update(inflation);
    this.stabilityHysteresis.update(stability);

    const debtMemory = this.debtHysteresis.hysteresisEffect(debtToGdp, 90, 0.05);
    const unemploymentMemory = this.unemploymentHysteresis.hysteresisEffect(unemployment, 18, 0.08);
    // L'hystérésis réduit la stabilité même après retour à la normale
    indicators.stability = (indicators.stability ?? 70) * (1 - debtMemory * 0.1 - unemploymentMemory * 0.08);

    // 5. RÉTROACTION : boucle chômage → instabilité → investissement → chômage
    //    Non-linéaire (amplifie jusqu'à saturation).
    const riskLevel = (indicators.revolution_risk ?? 20) / 100;
    const feedbackAmplification = feedbackLoop(riskLevel, 0.5, 0.3);
    indicators.revolution_risk = feedbackAmplification * 100;

    // 6. CASCADE : un effet intense déclenche des effets secondaires
    //    (grèves → paralysie → effondrement économique)
    if (riskLevel > 0.6) {
      const cascade = cascadeEffect(riskLevel, 0.6, 1.5);
      indicators.revolution_risk = cascade * 100;
      indicators.stability = (indicators.stability ?? 70) * (1 - (cascade - riskLevel) * 0.5);
    }

    // 7. SATURATION : la stabilité ne peut pas dépasser 95 ni descendre sous 0
    indicators.stability = Math.max(0, Math.min(95, indicators.stability));
    indicators.revolution_risk = Math.max(0, Math.min(100, indicators.revolution_risk));

    // 8. ÉQUILIBRE THERMODYNAMIQUE SOCIAL + PIÈGE DE SUR-OPTIMISATION
    // Le but ultime n'est pas de maximiser un indicateur, mais d'atteindre
    // l'équilibre : un état où les prismes respirent sans pics de chaleur.
    // Si un joueur sur-optimise une variable (ex: éducation au max), le système
    // s'effondre ailleurs (personne ne ramasse les poubelles — famine de génies).
    const leverArray = LEVERS.map((l) => this.levers[l.id] ?? l.baseline);
    const normalizedLevers = LEVERS.map((l) => {
      const v = this.levers[l.id] ?? l.baseline;
      return (v - l.min) / (l.max - l.min);
    });
    // Entropie : mesure la dispersion des leviers. Si tous sont proches d'une
    // valeur moyenne = équilibre. Si certains sont à 1.0 et d'autres à 0.0 =
    // sur-optimisation (déséquilibre thermique).
    const meanNorm = normalizedLevers.reduce((a, b) => a + b, 0) / normalizedLevers.length;
    const variance = normalizedLevers.reduce((a, b) => a + (b - meanNorm) ** 2, 0) / normalizedLevers.length;
    const thermodynamicBalance = Math.max(0, 1 - Math.sqrt(variance) * 2); // 0 = chaotique, 1 = équilibré

    // Le piège : si un seul levier est à >0.9 (sur-optimisé) ET la variance est
    // élevée, l'équilibre thermodynamique s'effondre.
    const overoptimized = normalizedLevers.filter((n) => n > 0.9).length;
    if (overoptimized > 5 && variance > 0.1) {
      // Sur-optimisation détectée : pénalité sur la stabilité
      const hubrisPenalty = (overoptimized - 5) * variance * 5;
      indicators.stability = Math.max(0, indicators.stability - hubrisPenalty);
      indicators.revolution_risk = Math.min(100, indicators.revolution_risk + hubrisPenalty * 0.5);
    }

    (this as any)._thermodynamicBalance = thermodynamicBalance;
    (this as any)._overoptimizedCount = overoptimized;

    this.indicators = indicators as ComputedIndicators;
  }

  // --- Ajustement direct d'un levier par le joueur ---

  adjustLever(leverId: string, newValue: number): { accepted: boolean; reason?: string } {
    if (this.gameOver) return { accepted: false, reason: "Simulation terminée." };
    const lever = LEVER_BY_ID.get(leverId);
    if (!lever) return { accepted: false, reason: "Levier inconnu." };

    const clamped = clamp(newValue, lever.min, lever.max);
    const delta = clamped - this.levers[leverId];
    if (Math.abs(delta) < 0.0001) return { accepted: true };

    this.levers[leverId] = clamped;
    this.leverTargets[leverId] = clamped; // mémoriser la cible du joueur
    this.leverVelocities[leverId] = Math.abs(delta) / (lever.max - lever.min);

    // Propagation causale différée vers les leviers dépendants (amplitude réduite)
    const edges = OUTGOING.get(leverId) ?? [];
    for (const e of edges) {
      const targetLever = LEVER_BY_ID.get(e.target);
      if (!targetLever) continue;
      const sourceRange = lever.max - lever.min;
      const normalizedDelta = delta / sourceRange;
      const targetRange = targetLever.max - targetLever.min;
      // NON-LINÉARITÉ : l'effet sur le levier cible dépend de sa valeur courante.
      // - Rendements décroissants : si le levier cible est déjà élevé, l'effet
      //   marginal est plus faible (saturation).
      // - Effet de seuil : si le levier cible est près de son max, l'effet
      //   est amplifié (zone critique).
      const targetCurrentValue = this.levers[e.target] ?? targetLever.baseline;
      const targetNormalized = (targetCurrentValue - targetLever.min) / targetRange;
      // Facteur de saturation : 1 au milieu, 0.3 aux extrêmes (rendements décroissants)
      const saturationFactor = 1 - 0.7 * Math.pow(Math.abs(targetNormalized - 0.5) * 2, 2);
      // Facteur de seuil : amplifie l'effet quand le levier est près de son max (zone critique)
      const thresholdFactor = targetNormalized > 0.8 ? 1 + (targetNormalized - 0.8) * 2 : 1;

      const targetDelta = normalizedDelta * e.coefficient * targetRange * 0.2 * saturationFactor * thresholdFactor;
      if (Math.abs(targetDelta) < 0.001) continue;
      this.pending.push({
        targetLever: e.target,
        amount: targetDelta,
        fireAtTick: this.tick + e.delayTicks,
        sourceLever: leverId,
      });
      this.ripples.push({
        id: rid(),
        fromId: leverId,
        toId: e.target,
        strength: Math.min(1, Math.abs(targetDelta) / targetRange * 4),
        tick: this.tick,
      });
    }

    // Recalcul immédiat des indicateurs
    this.recompute();

    this.pushAlert(
      "info",
      `${lever.name} → ${clamped.toFixed(2)} ${lever.unit}`,
      this.tick,
      leverId,
    );

    return { accepted: true };
  }

  // --- Décret ---

  decree(text: string): DecreeResult {
    if (this.gameOver) {
      return {
        accepted: false,
        reason: "Simulation terminée.",
        deltas: [],
        immediateGdpImpact: 0,
        immediateBudgetImpact: 0,
        immediateDebtImpact: 0,
        projectedStabilityDelta: 0,
        fiscalCost: 0,
        summary: "Impossible : simulation terminée.",
      };
    }
    const result = executeDecree(text, this.levers, this.accumulatedDebt);
    if (!result.accepted) {
      this.pushAlert("warning", `Décret refusé : ${result.reason}`, this.tick);
      return result;
    }
    // Appliquer les deltas
    for (const d of result.deltas) {
      this.adjustLever(d.leverId, d.absoluteChange);
    }
    // Le coût budgétaire augmente la dette
    if (result.fiscalCost > 0) {
      this.accumulatedDebt += result.fiscalCost;
      this.recompute();
    }
    this.pushAlert(
      result.fiscalCost > 50 ? "warning" : "info",
      `Décret : « ${text} » — ${result.deltas.length} levier(s) modifié(s), coût ${result.fiscalCost.toFixed(1)} Mrd MAD.`,
      this.tick,
    );
    return result;
  }

  pause(): void {
    if (!this.paused && !this.gameOver) {
      this.paused = true;
      this.pushAlert("info", "Simulation suspendue.", this.tick);
    }
  }

  resume(): void {
    if (this.paused) {
      this.paused = false;
      this.pushAlert("info", "Reprise.", this.tick);
    }
  }

  // --- AUTOROUTE C : changement de paradigme (transition de régime) ---

  setParadigm(paradigmId: string): void {
    const p = PARADIGMS[paradigmId as ParadigmId];
    if (!p || this.paradigm.id === p.id) return;

    // V2 : applyParadigmToNetwork réécrit réellement la matrice de poids.
    // On reconstruit la map leverId -> index pour que la fonction sache quel
    // poids correspond à quel levier. On réinitialise d'abord le réseau aux
    // poids de base (pré-entraînés) puis on applique le mask du nouveau paradigme
    // — sinon les masks s'accumuleraient à chaque switch.
    const leverCategoryById = new Map<string, string>();
    const leverIdByIndex = new Map<number, string>();
    for (let i = 0; i < LEVERS.length; i++) {
      leverCategoryById.set(LEVERS[i].id, LEVERS[i].category as string);
      leverIdByIndex.set(i, LEVERS[i].id);
    }

    // Pour éviter l'accumulation des masks, on recharge les poids de base
    // depuis le réseau pré-entraîné avant d'appliquer le nouveau paradigm.
    // Le réseau stocke une copie de ses poids initiaux dans `baseWeights`.
    const nn = this.neuralNetwork as any;
    if (nn.baseWeights && nn.baseLayers) {
      // Restaurer les poids de base
      for (let l = 0; l < nn.layers.length; l++) {
        const layer = nn.layers[l];
        const base = nn.baseLayers[l];
        if (base && base.weights && layer.weights) {
          for (let i = 0; i < layer.weights.length; i++) {
            layer.weights[i] = base.weights[i];
          }
          if (base.biases && layer.biases) {
            for (let i = 0; i < layer.biases.length; i++) {
              layer.biases[i] = base.biases[i];
            }
          }
        }
      }
    } else {
      // Première fois : snapshotter les poids de base
      nn.baseLayers = nn.layers.map((l: any) => ({
        weights: l.weights.slice(),
        biases: l.biases.slice(),
        inSize: l.inSize,
        outSize: l.outSize,
      }));
      nn.baseWeights = true;
    }

    // Appliquer le nouveau paradigme aux poids restaurés
    applyParadigmToNetwork(this.neuralNetwork, p, leverCategoryById, leverIdByIndex);

    this.paradigm = p;
    // Le changement de régime recrée l'essaim avec le nouveau comportement
    if (this.swarm) {
      this.swarm = createSwarm(this.swarm.agents.length, p);
    }
    // Recalculer les indicateurs avec les nouveaux poids
    this.recompute();
    this.pushAlert(
      "warning",
      `Transition de régime : ${p.name}. ${p.description}`,
      this.tick,
    );
  }

  // --- Tick : avance la simulation ---

  step(): void {
    if (this.paused || this.gameOver) return;
    this.tick++;

    // 0. Rappel des leviers vers leur cible joueur (mean-reversion).
    //    Les effets causaux différés créent des perturbations temporaires qui
    //    décroissent : le levier revient vers la valeur fixée par le joueur.
    //    Sans cela, les effets en chaîne s'accumulent et poussent les leviers
    //    vers leurs bornes (bug observé : TVA→30%, IS→50%, SMIG→8000...).
    for (const l of LEVERS) {
      const target = this.leverTargets[l.id] ?? l.baseline;
      const current = this.levers[l.id];
      const drift = (target - current) * 0.03; // 3% de rappel par tick
      if (Math.abs(drift) > 1e-6) {
        this.levers[l.id] = current + drift;
      }
    }

    // 1. Traiter les effets différés arrivés à échéance
    const firing: PendingEffect[] = [];
    const remaining: PendingEffect[] = [];
    for (const eff of this.pending) {
      if (eff.fireAtTick <= this.tick) firing.push(eff);
      else remaining.push(eff);
    }
    this.pending = remaining;

    for (const eff of firing) {
      const lever = LEVER_BY_ID.get(eff.targetLever);
      if (!lever) continue;
      const oldVal = this.levers[eff.targetLever];
      const newVal = clamp(oldVal + eff.amount, lever.min, lever.max);
      const actualDelta = newVal - oldVal;
      this.levers[eff.targetLever] = newVal;
      this.leverVelocities[eff.targetLever] = Math.max(
        this.leverVelocities[eff.targetLever] ?? 0,
        Math.abs(actualDelta) / (lever.max - lever.min),
      );
      this.ripples.push({
        id: rid(),
        fromId: eff.sourceLever,
        toId: eff.targetLever,
        strength: Math.min(1, Math.abs(actualDelta) / (lever.max - lever.min) * 3),
        tick: this.tick,
      });
      // Propager en chaîne (très atténué pour éviter l'emballement)
      const childEdges = OUTGOING.get(eff.targetLever) ?? [];
      for (const e of childEdges) {
        const childLever = LEVER_BY_ID.get(e.target);
        if (!childLever) continue;
        const sourceRange = lever.max - lever.min;
        const normalizedDelta = actualDelta / sourceRange;
        const targetRange = childLever.max - childLever.min;
        const childDelta = normalizedDelta * e.coefficient * targetRange * 0.08;
        if (Math.abs(childDelta) < 0.001) continue;
        if (this.pending.length > 100) break;
        this.pending.push({
          targetLever: e.target,
          amount: childDelta,
          fireAtTick: this.tick + e.delayTicks,
          sourceLever: eff.targetLever,
        });
      }
    }

    // 2. Accummuler la dette. En réalité, une partie du déficit est monétisée
    //    ou compensée par la croissance économique. On accumule 15% du déficit
    //    structurel — le reste est absorbé par la croissance du PIB et les
    //    recettes exceptionnelles (privatisations, dette externe concessionnelle).
    //    (Calibration : 30% faisait dériver la dette > 150% en ~60 ans simulés,
    //    déclenchant la cascade de faillite trop tôt. 15% donne une trajectoire
    //    réaliste sur 100+ ans — voir VALIDATION.md stability test.)
    if (this.indicators) {
      const annualDeficit = this.indicators.budget_deficit;
      const netAccumulation = annualDeficit * 0.15;
      if (netAccumulation > 0) {
        this.accumulatedDebt += netAccumulation / 24;
      } else {
        this.accumulatedDebt = Math.max(0, this.accumulatedDebt + netAccumulation / 24);
      }
    }

    // 3. Recalculer les indicateurs
    this.recompute();
    this.prevGdp = this.indicators!.gdp;

    // 3b. AUTOROUTE D : mettre à jour l'essaim d'agents (micro → macro)
    if (this.swarm && this.indicators) {
      this.swarm = updateSwarm(this.swarm, {
        inflation: this.indicators.inflation,
        unemployment: this.indicators.unemployment,
        stability: this.indicators.stability,
        revolutionRisk: this.indicators.revolution_risk,
        gdpGrowth: this.indicators.gdp_growth,
      }, this.paradigm);
      // Émettre des alertes pour les événements émergents
      for (const evt of this.swarm.emergentEvents) {
        if (evt.intensity > 0.15) {
          this.pushAlert(
            evt.intensity > 0.3 ? "critical" : "warning",
            `[AGENTS] ${evt.description}`,
            this.tick,
          );
        }
      }
      // Alerte pour les menaces politiques (coups d'État, guerres civiles, révolutions)
      for (const threat of this.swarm.politicalThreats) {
        if (threat.probability > 0.15) {
          this.pushAlert(
            threat.probability > 0.3 ? "critical" : "warning",
            `[POLITIQUE] ${threat.description} (probabilité ${(threat.probability * 100).toFixed(0)}%)`,
            this.tick,
          );
        }
      }
    }

    // 3c. LE CYGNE NOIR : tirage aléatoire d'événements imprévisibles.
    //     Dans la vraie politique, le chaos ne fait pas la queue : crises
    //     simultanées, avalanches. On tire 1 à 3 événements par tick quand
    //     le système est fragile.
    if (this.indicators && !this.gameOver) {
      const fragility = (100 - this.indicators.stability) / 100;
      const tension = this.indicators.revolution_risk / 100;
      // Nombre d'événements simultanés : 1 normal, 2-3 si système fragile
      const maxSimultaneous = fragility > 0.5 ? 3 : fragility > 0.3 ? 2 : 1;

      for (let sw = 0; sw < maxSimultaneous; sw++) {
        const event = rollBlackSwan(this.indicators.stability, this.indicators.revolution_risk);
        if (!event) break;

        event.tick = this.tick;
        this.lastBlackSwan = event;
        const result = applyBlackSwan(event, this.levers, this.accumulatedDebt);
        this.levers = result.levers;
        this.accumulatedDebt = result.newDebt;

        // Choc sur les agents
        if (this.swarm) {
          for (const agent of this.swarm.agents) {
            agent.stress = Math.min(1, agent.stress + event.agentStressShock);
            agent.trust = Math.max(0, agent.trust - event.agentTrustShock);
          }
        }

        this.pushAlert(
          "critical",
          `🕊️ CYGNE NOIR — ${event.name} : ${event.description} (sévérité ${(event.severity * 100).toFixed(0)}%)`,
          this.tick,
        );

        // Chaîne : l'événement peut en déclencher d'autres
        const chainEvent = chainBlackSwan(event, this.indicators.stability, this.indicators.revolution_risk);
        if (chainEvent) {
          chainEvent.tick = this.tick;
          this.lastBlackSwan = chainEvent;
          const chainResult = applyBlackSwan(chainEvent, this.levers, this.accumulatedDebt);
          this.levers = chainResult.levers;
          this.accumulatedDebt = chainResult.newDebt;
          this.pushAlert(
            "critical",
            `🔗 CHAÎNE — ${chainEvent.name} (conséquence de ${event.name})`,
            this.tick,
          );
        }
      }
      // Recalculer après les impacts
      this.recompute();
    }

    // 4. Mettre à jour l'historique
    for (const l of LEVERS) {
      const arr = this.history[l.id] ?? (this.history[l.id] = []);
      arr.push(this.levers[l.id]);
      if (arr.length > HISTORY_MAX) arr.shift();
    }
    for (const id of Object.keys(this.indicators!)) {
      const arr = this.history[`ind_${id}`] ?? (this.history[`ind_${id}`] = []);
      arr.push((this.indicators as any)[id]);
      if (arr.length > HISTORY_MAX) arr.shift();
    }

    // 5. Atténuation des vélocités
    for (const id of Object.keys(this.leverVelocities)) {
      this.leverVelocities[id] *= 0.85;
    }

    // 6. Nettoyer les ripples
    this.ripples = this.ripples.filter((r) => this.tick - r.tick <= RIPPLE_TTL);
    if (this.ripples.length > MAX_RIPPLES) {
      this.ripples = this.ripples.slice(-MAX_RIPPLES);
    }

    // 7. Détection de crise + game over
    this.detectCrises();
    this.detectGameOver();
  }

  // --- Détection de crise ---

  private detectCrises(): void {
    // Crises de leviers
    const currentLeverCrises = new Set<string>();
    for (const l of LEVERS) {
      const state = leverState(l, this.levers[l.id]);
      if (state === "crisis") {
        currentLeverCrises.add(l.id);
        if (!this.previousLeverCrises.has(l.id)) {
          this.pushAlert("critical", `« ${l.name} » en zone critique (${this.levers[l.id].toFixed(2)} ${l.unit}).`, this.tick, l.id);
        }
      }
    }
    // Sorties de crise
    for (const id of this.previousLeverCrises) {
      if (!currentLeverCrises.has(id)) {
        const lever = LEVER_BY_ID.get(id);
        if (lever) {
          this.pushAlert("info", `« ${lever.name} » sort de zone critique.`, this.tick, id);
        }
      }
    }
    this.previousLeverCrises = currentLeverCrises;

    // Crises d'indicateurs
    if (!this.indicators) return;
    const currentIndicatorCrises = new Set<string>();
    for (const ind of INDICATORS) {
      const value = (this.indicators as any)[ind.id] as number;
      const state = indicatorState(ind.id, value);
      if (state === "critical") {
        currentIndicatorCrises.add(ind.id);
        if (!this.previousIndicatorCrises.has(ind.id)) {
          this.pushAlert("critical", `${ind.name} en crise (${value.toFixed(ind.displayFormat === "score" ? 3 : 1)} ${ind.unit}).`, this.tick, undefined, ind.id);
        }
      }
    }
    for (const id of this.previousIndicatorCrises) {
      if (!currentIndicatorCrises.has(id)) {
        const ind = INDICATORS.find((i) => i.id === id);
        if (ind) {
          this.pushAlert("info", `${ind.name} sort de crise.`, this.tick, undefined, id);
        }
      }
    }
    this.previousIndicatorCrises = currentIndicatorCrises;
  }

  // --- Game over ---

  private detectGameOver(): void {
    if (!this.indicators) return;
    const { stability, revolution_risk, debt_to_gdp, unemployment } = this.indicators;

    // Effondrement
    if (stability < COLLAPSE_THRESHOLD) {
      this.collapseTicks++;
      if (this.collapseTicks > COLLAPSE_PERSISTENCE) {
        this.triggerGameOver("effondrement", "Stabilité effondrée. Le pays est ingouvernable.");
        return;
      }
    } else {
      this.collapseTicks = Math.max(0, this.collapseTicks - 1);
    }

    // Révolution
    if (stability < REVOLUTION_STAB_THRESHOLD && revolution_risk > REVOLUTION_RISK_THRESHOLD) {
      this.revolutionTicks++;
      if (this.revolutionTicks > REVOLUTION_PERSISTENCE) {
        this.triggerGameOver("révolution", "Soulèvement populaire. Le pouvoir est renversé.");
        return;
      }
    } else {
      this.revolutionTicks = Math.max(0, this.revolutionTicks - 1);
    }

    // Faillite souveraine
    if (debt_to_gdp > DEBT_GDP_THRESHOLD) {
      this.debtTicks++;
      if (this.debtTicks > DEBT_PERSISTENCE) {
        this.triggerGameOver("faillite", "Faillite souveraine. Le pays ne peut plus rembourser sa dette.");
        return;
      }
    } else {
      this.debtTicks = Math.max(0, this.debtTicks - 1);
    }

    // Chômage massif
    if (unemployment > UNEMPLOYMENT_THRESHOLD) {
      this.unemploymentTicks++;
      if (this.unemploymentTicks > UNEMPLOYMENT_PERSISTENCE) {
        this.triggerGameOver("chômage", "Chômage de masse. L'économie s'effondre.");
        return;
      }
    } else {
      this.unemploymentTicks = Math.max(0, this.unemploymentTicks - 1);
    }
  }

  private triggerGameOver(type: string, message: string): void {
    // FIN DU GAME OVER : le pays bascule en régime post-collapse réaliste.
    // Pas un écran de fin — une longue période de chaos, seigneurs de guerre,
    // économie de troc, puis reconstruction lente.
    this.gameOver = { type, message };
    this.pushAlert("critical", `EFFONDREMENT — ${message}`, this.tick);

    // Phase 1 : effondrement immédiat
    this.pushAlert("warning", `PHASE 1 — L'État s'effondre. Les institutions cessent de fonctionner. L'économie de troc s'installe.`, this.tick);

    // La dette est partiellement effacée (défaut souverain)
    this.accumulatedDebt *= 0.3;
    this.collapseTicks = 0;
    this.revolutionTicks = 0;
    this.debtTicks = 0;
    this.unemploymentTicks = 0;

    // Les leviers s'effondrent vers des valeurs de survie
    for (const l of LEVERS) {
      const survival = l.min + (l.max - l.min) * 0.10; // 10% du range = survie minimale
      this.levers[l.id] = survival;
      this.leverTargets[l.id] = survival;
    }

    // Transition vers le régime "transition" (volatile)
    this.paradigm = PARADIGMS.transition;
    if (this.swarm) {
      this.swarm = createSwarm(this.swarm.agents.length, this.paradigm);
    }

    // Phase 2 : seigneurs de guerre (après 10 ticks = 2s)
    setTimeout(() => {
      if (!this.gameOver) return;
      this.pushAlert("warning", `PHASE 2 — Seigneurs de guerre. Des factions armées contrôlent les territoires. Le pouvoir central n'existe plus.`, this.tick);
      // Les factions militaire et informelle gagnent en puissance
      if (this.swarm) {
        const mil = (this.swarm as any).factions?.military;
        const inf = (this.swarm as any).factions?.informal;
        if (mil) { mil.power = Math.min(0.6, mil.power * 2); mil.grievance = 0.8; }
        if (inf) { inf.power = Math.min(0.5, inf.power * 2); inf.grievance = 0.7; }
      }
    }, 2000);

    // Phase 3 : famine et exode (après 20 ticks = 4s)
    setTimeout(() => {
      if (!this.gameOver) return;
      this.pushAlert("critical", `PHASE 3 — Famine. Exode massif. La population fuit les villes. Les champs sont abandonnés.`, this.tick);
      // Choc sur l'agriculture et la démographie
      if (this.swarm) {
        for (const agent of this.swarm.agents) {
          agent.stress = Math.min(1, agent.stress + 0.3);
          agent.trust = Math.max(0, agent.trust - 0.3);
          if (Math.random() < 0.1) agent.behavior = "fleeing";
        }
      }
    }, 4000);

    // Phase 4 : émergence de la reconstruction (après 40 ticks = 8s)
    setTimeout(() => {
      if (!this.gameOver) return;
      this.pushAlert("info", `PHASE 4 — Reconstruction. Des conseils locaux se forment. Le troc cède place à une économie rudimentaire.`, this.tick);
      // Les leviers remontent légèrement
      for (const l of LEVERS) {
        const recovery = l.min + (l.max - l.min) * 0.20; // 20% = début de reconstruction
        this.levers[l.id] = recovery;
        this.leverTargets[l.id] = recovery;
      }
      this.recompute();
    }, 8000);

    // Phase 5 : le pays émerge des ruines (après 60 ticks = 12s)
    setTimeout(() => {
      if (!this.gameOver) return;
      this.gameOver = null;
      this.pushAlert("info", `Le pays émerge des ruines. Nouveau régime. Stabilité résiduelle : ${(this.indicators?.stability ?? 0).toFixed(0)}/100. À toi de reconstruire.`, this.tick);
      this.recompute();
    }, 12000);
  }

  private pushAlert(
    level: Alert["level"],
    message: string,
    tick: number,
    leverId?: string,
    indicatorId?: string,
  ): void {
    this.alerts.push({ id: rid(), level, message, tick, leverId, indicatorId });
    if (this.alerts.length > MAX_ALERTS) {
      this.alerts = this.alerts.slice(-MAX_ALERTS);
    }
  }

  // --- Snapshot sérialisable ---

  snapshot(): SimState {
    const leverStates: Record<string, "normal" | "hot" | "cold" | "crisis"> = {};
    for (const l of LEVERS) {
      leverStates[l.id] = leverState(l, this.levers[l.id]);
    }
    const indicators: Record<string, number> = {};
    const indicatorStates: Record<string, "normal" | "warning" | "critical"> = {};
    if (this.indicators) {
      for (const ind of INDICATORS) {
        const value = (this.indicators as any)[ind.id] as number;
        indicators[ind.id] = value;
        indicatorStates[ind.id] = indicatorState(ind.id, value);
      }
    }
    const metrics: Metric[] = INDICATORS.map((ind) => {
      const value = (this.indicators as any)?.[ind.id] ?? 0;
      return {
        id: ind.id,
        name: ind.name,
        value,
        unit: ind.unit,
        displayFormat: ind.displayFormat,
      };
    });

    return {
      tick: this.tick,
      levers: { ...this.levers },
      leverStates,
      leverVelocities: { ...this.leverVelocities },
      indicators,
      indicatorStates,
      metrics,
      ripples: this.ripples.slice(-MAX_RIPPLES),
      alerts: this.alerts.slice(-MAX_ALERTS),
      paused: this.paused,
      gameOver: this.gameOver ? { ...this.gameOver } : null,
      history: this.history,
      accumulatedDebt: this.accumulatedDebt,
      networkStats: this.networkStats || getNetworkStats(this.neuralNetwork),
      // AUTOROUTE C : paradigm courant
      paradigm: this.paradigm.id,
      // AUTOROUTE D : état agrégé de l'essaim
      swarm: this.swarm ? swarmSnapshot(this.swarm) : null,
      // LE CYGNE NOIR : dernier événement aléatoire
      lastBlackSwan: this.lastBlackSwan ? {
        type: this.lastBlackSwan.type,
        name: this.lastBlackSwan.name,
        description: this.lastBlackSwan.description,
        severity: this.lastBlackSwan.severity,
        tick: this.lastBlackSwan.tick,
      } : null,
      // ÉQUILIBRE THERMODYNAMIQUE
      thermodynamicBalance: (this as any)._thermodynamicBalance ?? 0.5,
      overoptimizedCount: (this as any)._overoptimizedCount ?? 0,
    };
  }

  // --- PROJECTION — simule N ticks en avant SANS modifier l'état réel ---
  // C'est la fonction "comment gagner" : on teste une décision avant de l'appliquer.

  project(
    leverDeltas: { leverId: string; value: number }[],
    extraDebt: number,
    ticks: number,
  ): ProjectionResult {
    // Cloner l'état courant dans un moteur fantôme
    const ghost = new SimulationEngine();
    ghost.levers = { ...this.levers };
    for (const d of leverDeltas) {
      const lever = LEVER_BY_ID.get(d.leverId);
      if (lever) ghost.levers[d.leverId] = clamp(d.value, lever.min, lever.max);
    }
    ghost.accumulatedDebt = this.accumulatedDebt + extraDebt;
    ghost.prevGdp = this.indicators!.gdp;
    ghost.tick = this.tick;
    ghost.recompute();

    const baselineIndicators = this.indicators!;
    const trajectory: ProjectionPoint[] = [];
    let crashed = false;
    let crashReason: string | null = null;

    for (let i = 0; i <= ticks; i++) {
      const ind = ghost.indicators!;
      trajectory.push({
        tick: this.tick + i,
        stability: ind.stability,
        gdp: ind.gdp,
        debtToGdp: ind.debt_to_gdp,
        unemployment: ind.unemployment,
        inflation: ind.inflation,
        revolutionRisk: ind.revolution_risk,
        lifeExpectancy: ind.life_expectancy,
        hdi: ind.hdi,
        gini: ind.gini,
      });
      if (i === ticks) break;
      ghost.step();
      if (ghost.gameOver) {
        crashed = true;
        crashReason = ghost.gameOver.type;
        break;
      }
    }

    const final = trajectory[trajectory.length - 1];
    const initial = trajectory[0];

    return {
      trajectory,
      deltas: {
        stability: final.stability - initial.stability,
        gdp: final.gdp - initial.gdp,
        debtToGdp: final.debtToGdp - initial.debtToGdp,
        unemployment: final.unemployment - initial.unemployment,
        inflation: final.inflation - initial.inflation,
        revolutionRisk: final.revolutionRisk - initial.revolutionRisk,
        lifeExpectancy: final.lifeExpectancy - initial.lifeExpectancy,
        hdi: final.hdi - initial.hdi,
        gini: final.gini - initial.gini,
      },
      crashed,
      crashReason,
      // Verdict : la décision est-elle bénéfique sur la période ?
      verdict: computeVerdict(final, initial, crashed),
    };
  }
}

// --- Types de projection ---

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
    score: number; // -100 à +100
    reasoning: string;
  };
}

function computeVerdict(
  final: ProjectionPoint,
  initial: ProjectionPoint,
  crashed: boolean,
): ProjectionResult["verdict"] {
  if (crashed) {
    return {
      label: "catastrophique",
      score: -100,
      reasoning: "Cette décision provoque l'effondrement du système.",
    };
  }
  // Score composite : stabilité (+), PIB (+), dette (-), chômage (-), risque révolution (-)
  let score = 0;
  score += (final.stability - initial.stability) * 1.5;
  score += (final.gdp - initial.gdp) / initial.gdp * 100 * 0.5;
  score -= (final.debtToGdp - initial.debtToGdp) * 0.3;
  score -= (final.unemployment - initial.unemployment) * 1.0;
  score -= (final.revolutionRisk - initial.revolutionRisk) * 0.8;
  score += (final.hdi - initial.hdi) * 200;
  score = Math.max(-100, Math.min(100, score));

  let label: ProjectionResult["verdict"]["label"];
  if (score >= 15) label = "favorable";
  else if (score <= -15) label = "défavorable";
  else if (score <= -50) label = "catastrophique";
  else label = "mitigé";

  const reasoning = `Stabilité ${final.stability > initial.stability ? "+" : ""}${(final.stability - initial.stability).toFixed(1)}, PIB ${final.gdp > initial.gdp ? "+" : ""}${(final.gdp - initial.gdp).toFixed(0)} Mrd, dette/PIB ${final.debtToGdp > initial.debtToGdp ? "+" : ""}${(final.debtToGdp - initial.debtToGdp).toFixed(1)}%, chômage ${final.unemployment > initial.unemployment ? "+" : ""}${(final.unemployment - initial.unemployment).toFixed(1)}%.`;

  return { label, score: Math.round(score), reasoning };
}
