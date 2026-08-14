"use client";

// use-simulation.ts — Zustand store + socket.io pour SYSTÈME DYNAMIQUE V3.
//
// Architecture deux-couches :
//   LEVIERS (~41) : paramètres ajustables par le joueur.
//   INDICATEURS (~15) : agrégats CALCULÉS par de vraies formules.
//
// Le joueur ne touche que les leviers. Les indicateurs se recalculent en direct.
//
// Connexion au mini-service port 3003 via Caddy : io('/?XTransformPort=3003').

import { create } from "zustand";
import { io, type Socket } from "socket.io-client";
import type {
  LeverDef,
  IndicatorDef,
  CategoryDef,
  SimState,
  InitPayload,
  DecreeResult,
  ClientCommand,
  ProjectionResult,
} from "@/lib/sim-types";

export type View = "panneau" | "metrics" | "methodology" | "network" | "timeline" | "neural" | "kernel" | "life" | "governance";

// --- Résultat d'un apprentissage (commande `learn`) ---
//
// Émis par le backend via l'événement socket `learn-result` après qu'un
// "document" (point de données) a été injecté dans le MLP. On capture le
// `lastLoss` AVANT l'apprentissage pour afficher la transition before → after.
export interface LearnResult {
  accepted: boolean;
  lossBefore: number | null;
  lossAfter: number;
  totalSamples: number; // documents cumulés après apprentissage
  timestamp: number;
}

// --- Arêtes causales entre leviers (graphe envoyé par le serveur) ---
//
// On définit le type localement (sans toucher à sim-types.ts) car le serveur
// les ajoute désormais au payload `init` (voir mini-services/simulation-engine).
// Utilisé par GlobeView pour dessiner les liaisons radiales.

export interface CausalEdge {
  source: string;
  target: string;
  coefficient: number;
  delayTicks: number;
  rationale: string;
}

// --- États vides stables (préservent les références de memo) ---

const EMPTY_LEVERS: LeverDef[] = [];
const EMPTY_INDICATORS: IndicatorDef[] = [];
const EMPTY_CATEGORIES: CategoryDef[] = [];
const EMPTY_EDGES: CausalEdge[] = [];

const EMPTY_STATE: SimState = {
  tick: 0,
  levers: {},
  leverStates: {},
  leverVelocities: {},
  indicators: {},
  indicatorStates: {},
  metrics: [],
  ripples: [],
  alerts: [],
  paused: false,
  gameOver: null,
  history: {},
  accumulatedDebt: 0,
};

// Bornes saines affichables pour la mini-barre de chaque indicateur (gauche).
// Valeurs typiques du Maroc ou normes internationales.
export const INDICATOR_SANE_RANGE: Record<
  string,
  { low: number; high: number; invert?: boolean }
> = {
  gdp: { low: 1000, high: 1600 },
  gdp_growth: { low: 2, high: 6 },
  gdp_per_capita: { low: 25000, high: 45000 },
  unemployment: { low: 5, high: 12, invert: true },
  inflation: { low: 0, high: 4, invert: true },
  debt_to_gdp: { low: 30, high: 70, invert: true },
  budget_deficit: { low: -30, high: 0, invert: true },
  tax_revenue: { low: 200, high: 350 },
  life_expectancy: { low: 70, high: 80 },
  hdi: { low: 0.6, high: 0.85 },
  gini: { low: 0.3, high: 0.45, invert: true },
  balance_of_trade: { low: -200, high: 0, invert: true },
  poverty_rate: { low: 0, high: 10, invert: true },
  stability: { low: 40, high: 80 },
  revolution_risk: { low: 0, high: 50, invert: true },
};

interface SimulationState {
  // --- Schema (init payload) ---
  levers: LeverDef[];
  indicators: IndicatorDef[];
  categories: CategoryDef[];
  edges: CausalEdge[];

  // --- État live (state payload) ---
  state: SimState;

  // --- Connexion ---
  connected: boolean;
  connecting: boolean;
  lastUpdate: number;

  // --- Dernier décret ---
  lastDecreeResult: DecreeResult | null;

  // --- Projection ---
  projection: ProjectionResult | null;
  projecting: boolean;

  // --- Apprentissage du réseau neuronal (commande `learn`) ---
  lastLearnResult: LearnResult | null;
  learnPending: boolean;
  learn: (levers: Record<string, number>, targets: Record<string, number>) => void;

  // --- UI state ---
  selectedLeverId: string | null;
  zoomedCategory: string | null; // category code ou null (overview)
  view: View;

  // --- Actions ---
  init: () => void;
  adjustLever: (leverId: string, value: number) => void;
  decree: (text: string) => void;
  projectDecree: (text: string, ticks: number) => void;
  clearProjection: () => void;
  setParadigm: (paradigmId: string) => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  setSelectedLeverId: (id: string | null) => void;
  setZoomedCategory: (cat: string | null) => void;
  setView: (v: View) => void;
}

let socket: Socket | null = null;
let inited = false;

// Capturé au moment où l'on émet `learn` pour pouvoir afficher la transition
// de loss avant → après. Le `state.networkStats.lastLoss` entre-temps est
// potentiellement rafraîchi par un tick `state` parasite.
let pendingLearnLossBefore: number | null = null;

export const useSimulation = create<SimulationState>((set, get) => ({
  levers: EMPTY_LEVERS,
  indicators: EMPTY_INDICATORS,
  categories: EMPTY_CATEGORIES,
  edges: EMPTY_EDGES,
  state: EMPTY_STATE,
  connected: false,
  connecting: false,
  lastUpdate: 0,
  lastDecreeResult: null,
  projection: null,
  projecting: false,
  lastLearnResult: null,
  learnPending: false,
  selectedLeverId: null,
  zoomedCategory: null,
  view: "panneau",

  init: () => {
    if (inited) return;
    inited = true;
    set({ connecting: true });

    socket = io({
      path: "/socket.io/",
      // Polling uniquement — la gateway Caddy ne forward pas correctement
      // les WebSocket upgrades avec le query param XTransformPort.
      // Le polling à 200ms est suffisant pour un tick de simulation de 200ms.
      transports: ["polling"],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      // La gateway Caddy route via le query param XTransformPort=3003.
      query: { XTransformPort: "3003" },
    });

    socket.on("connect", () => {
      set({ connected: true, connecting: false });
    });

    socket.on("disconnect", () => {
      set({ connected: false, connecting: true });
    });

    socket.on("reconnect_attempt", () => {
      set({ connecting: true });
    });

    socket.on("init", (payload: InitPayload & { edges?: CausalEdge[] }) => {
      if (!payload || !Array.isArray(payload.levers)) return;
      set({
        levers: payload.levers,
        indicators: payload.indicators ?? EMPTY_INDICATORS,
        categories: payload.categories ?? EMPTY_CATEGORIES,
        edges: Array.isArray(payload.edges) ? payload.edges : EMPTY_EDGES,
        state: payload.state ?? EMPTY_STATE,
        lastUpdate: Date.now(),
      });
    });

    socket.on("state", (s: SimState) => {
      if (!s) return;
      set({ state: s, lastUpdate: Date.now() });
    });

    socket.on("decree-result", (result: DecreeResult) => {
      set({ lastDecreeResult: result });
    });

    socket.on("projection-result", (result: ProjectionResult) => {
      set({ projection: result, projecting: false });
    });

    socket.on("learn-result", (result: { loss: number; accepted: boolean }) => {
      const before = pendingLearnLossBefore;
      pendingLearnLossBefore = null;
      set({
        learnPending: false,
        lastLearnResult: {
          accepted: !!result?.accepted,
          lossBefore: before,
          lossAfter: result?.loss ?? 0,
          totalSamples: get().state.networkStats?.totalSamples ?? 0,
          timestamp: Date.now(),
        },
      });
    });

    socket.on("connect_error", () => {
      set({ connecting: true });
    });
  },

  adjustLever: (leverId, value) => {
    if (!socket) return;
    const cmd: ClientCommand = { type: "adjust", leverId, value };
    socket.emit("command", cmd);
  },

  decree: (text) => {
    if (!socket) return;
    const cmd: ClientCommand = { type: "decree", text };
    socket.emit("command", cmd);
  },

  projectDecree: (text, ticks) => {
    if (!socket) return;
    set({ projecting: true, projection: null });
    const cmd: ClientCommand = { type: "project-decree", text, ticks };
    socket.emit("command", cmd);
  },

  clearProjection: () => {
    set({ projection: null, projecting: false });
  },

  setParadigm: (paradigmId) => {
    if (!socket) return;
    const cmd: ClientCommand = { type: "set-paradigm", paradigmId };
    socket.emit("command", cmd);
  },

  pause: () => {
    if (!socket) return;
    socket.emit("command", { type: "pause" } as ClientCommand);
  },

  resume: () => {
    if (!socket) return;
    socket.emit("command", { type: "resume" } as ClientCommand);
  },

  reset: () => {
    if (!socket) return;
    socket.emit("command", { type: "reset" } as ClientCommand);
    set({ selectedLeverId: null, zoomedCategory: null, projection: null, projecting: false });
  },

  learn: (levers, targets) => {
    if (!socket) return;
    // Capturer le loss AVANT apprentissage (le tick `state` suivant peut le rafraîchir).
    pendingLearnLossBefore = get().state.networkStats?.lastLoss ?? null;
    set({ learnPending: true });
    socket.emit("command", { type: "learn", levers, targets });
  },

  setSelectedLeverId: (id) => set({ selectedLeverId: id }),
  setZoomedCategory: (cat) => set({ zoomedCategory: cat }),
  setView: (v) => set({ view: v }),
}));

// --- Sélecteurs utilitaires (memo) ---

export function useLeverById(id: string | null): LeverDef | undefined {
  return useSimulation((s) => (id ? s.levers.find((l) => l.id === id) : undefined));
}

export function useIndicatorById(id: string | null): IndicatorDef | undefined {
  return useSimulation((s) =>
    id ? s.indicators.find((i) => i.id === id) : undefined,
  );
}
