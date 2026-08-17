// kernel.ts — Le noyau PRISM. Ordonnanceur, cycle de vie, syscalls.
//
// PRISM est un OS pour un pays. Le noyau est le cœur qui ordonnance les
// sous-systèmes, gère la mémoire (l'état), et expose une interface de
// syscalls. Chaque tick est un cycle noyau avec des phases distinctes.
//
// Le noyau NE remplace PAS le moteur — il l'enroule. Le moteur SimulationEngine
// fait le travail neuronal pendant la phase NEURAL. Les autres phases sont
// soit des no-ops (si aucun sous-système enregistré) soit exécutent les
// sous-systèmes enregistrés (life.ts → LIFECYCLE, governance.ts → GOVERN).

import { LifeSystem } from "./life.js";
import { GovernanceSystem } from "./governance.js";

// --- Version ---

export const KERNEL_VERSION = "1.0.0";

// --- Phases du cycle noyau ---

export enum KernelPhase {
  BOOT = "BOOT",             // initialisation, chargement des sous-systèmes
  EXTRACT = "EXTRACT",       // couche 01 : extraction causale NLP (si nouveau document)
  NEURAL = "NEURAL",         // couche 02 : forward pass du réseau de neurones
  NONLINEAR = "NONLINEAR",   // couche 03 : 7 transforms non-linéaires
  SWARM = "SWARM",           // couche 04 : mise à jour de l'essaim d'agents
  LIFECYCLE = "LIFECYCLE",   // couche 04b : démographie (naissance, vieillissement, mort)
  GOVERN = "GOVERN",         // couche 04c : gestion étatique (budget, services)
  BLACKSWAN = "BLACKSWAN",   // couche 05 : tirage des cygnes noirs
  PARADIGM = "PARADIGM",     // couche 06 : application du paradigme politique
  COMMIT = "COMMIT",         // écriture de l'état, persistance optionnelle
  EMIT = "EMIT",             // diffusion du snapshot aux clients
  HALT = "HALT",             // arrêt propre
}

// Ordre d'exécution des phases dans un cycle noyau.
export const PHASE_ORDER: KernelPhase[] = [
  KernelPhase.BOOT,
  KernelPhase.EXTRACT,
  KernelPhase.NEURAL,
  KernelPhase.NONLINEAR,
  KernelPhase.SWARM,
  KernelPhase.LIFECYCLE,
  KernelPhase.GOVERN,
  KernelPhase.BLACKSWAN,
  KernelPhase.PARADIGM,
  KernelPhase.COMMIT,
  KernelPhase.EMIT,
  KernelPhase.HALT,
];

// --- Sous-système ---

export interface Subsystem {
  id: string;
  name: string;
  phase: KernelPhase;
  enabled: boolean;
  // Appelé une fois au BOOT
  init?(): void;
  // Appelé à chaque tick pendant la phase de ce sous-système. Retourne le temps en ms.
  step(state: KernelState): number;
  // Appelé au HALT
  shutdown?(): void;
}

// --- État noyau ---

export interface KernelState {
  tick: number;
  phase: KernelPhase;
  uptimeMs: number;
  phaseTimings: Record<KernelPhase, number>;  // ms passées dans chaque phase au dernier tick
  subsystems: Subsystem[];
  booted: boolean;
  halted: boolean;
  // Snapshot de l'hôte (moteur de simulation) — accessible aux sous-systèmes
  // pour lire leviers et indicateurs courants. Peut être absent au tout début.
  hostSnapshot?: any;
}

// --- Hôte (le moteur enroulé par le noyau) ---

export interface KernelHost {
  // Avance d'un tick (fait le travail neuronal + non-linéaire + essaim + cygne noir).
  step(): void;
  // Retourne le snapshot sérialisable de l'état courant.
  snapshot(): any;
  // Ajuste un levier (délègue au moteur). Optionnel.
  adjustLever?(leverId: string, value: number): { accepted: boolean; reason?: string };
}

// --- Helper : timings vides ---

function emptyTimings(): Record<KernelPhase, number> {
  const t = {} as Record<KernelPhase, number>;
  for (const p of PHASE_ORDER) t[p] = 0;
  return t;
}

// --- Helper : now() en ms haute résolution ---

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

// --- Le noyau ---

export class PrismKernel {
  static readonly PHASE_ORDER: KernelPhase[] = PHASE_ORDER;
  static readonly VERSION: string = KERNEL_VERSION;

  private host: KernelHost;
  private state: KernelState;
  private subsystemsByPhase: Map<KernelPhase, Subsystem[]>;
  private bootTime: number;

  constructor(host: KernelHost) {
    this.host = host;
    this.bootTime = 0;
    this.subsystemsByPhase = new Map();
    this.state = {
      tick: 0,
      phase: KernelPhase.BOOT,
      uptimeMs: 0,
      phaseTimings: emptyTimings(),
      subsystems: [],
      booted: false,
      halted: false,
    };
  }

  // Enregistre un sous-système. Idempotent (pas de doublons d'id).
  register(subsystem: Subsystem): void {
    if (this.state.subsystems.some((s) => s.id === subsystem.id)) {
      return;
    }
    this.state.subsystems.push(subsystem);
    const list = this.subsystemsByPhase.get(subsystem.phase) ?? [];
    list.push(subsystem);
    this.subsystemsByPhase.set(subsystem.phase, list);
  }

  // --- Cycle de vie ---

  boot(): void {
    if (this.state.booted) return;
    this.bootTime = Date.now();
    this.state.phase = KernelPhase.BOOT;
    // init() dans l'ordre des phases
    for (const phase of PHASE_ORDER) {
      const list = this.subsystemsByPhase.get(phase) ?? [];
      for (const sub of list) {
        if (sub.enabled && sub.init) {
          try {
            sub.init();
          } catch (e) {
            console.error(`[kernel] init ${sub.id} échoué:`, e);
          }
        }
      }
    }
    // Récupérer un snapshot initial pour les sous-systèmes
    try {
      this.state.hostSnapshot = this.host.snapshot();
    } catch {
      /* hôte non prêt — acceptable au boot */
    }
    this.state.booted = true;
  }

  // Le battement de cœur. Exécute un cycle noyau complet.
  cycle(): KernelState {
    if (!this.state.booted) this.boot();
    if (this.state.halted) return this.state;

    // Réinitialiser les timings du tick
    for (const p of PHASE_ORDER) this.state.phaseTimings[p] = 0;

    // Phases normales : tout sauf BOOT et HALT
    const cyclePhases = PHASE_ORDER.filter(
      (p) => p !== KernelPhase.BOOT && p !== KernelPhase.HALT,
    );

    for (const phase of cyclePhases) {
      this.state.phase = phase;
      const t0 = nowMs();

      // Le moteur hôte fait tout le travail neuronal pendant la phase NEURAL.
      // (Le moteur fait en interne : forward pass + non-linéaire + essaim + cygne noir.)
      if (phase === KernelPhase.NEURAL) {
        try {
          this.host.step();
        } catch (e) {
          console.error(`[kernel] host.step() échoué:`, e);
        }
        // Rafraîchir le snapshot pour les sous-systèmes suivants
        try {
          this.state.hostSnapshot = this.host.snapshot();
        } catch {
          /* hôte non prêt */
        }
      }

      // Exécuter les sous-systèmes enregistrés pour cette phase
      const list = this.subsystemsByPhase.get(phase) ?? [];
      for (const sub of list) {
        if (!sub.enabled) continue;
        try {
          // Le retour de step() est le temps que le sous-système a mesuré lui-même.
          // On l'utilise comme fallback si la mesure externe est absente.
          const subTime = sub.step(this.state);
          if (typeof subTime === "number" && subTime > 0) {
            // on garde la mesure externe (plus précise) — subTime est informatif
          }
        } catch (e) {
          console.error(`[kernel] step ${sub.id} échoué:`, e);
        }
      }

      const t1 = nowMs();
      this.state.phaseTimings[phase] = t1 - t0;
    }

    // S'assurer qu'un snapshot est disponible même si NEURAL n'a pas tourné
    if (!this.state.hostSnapshot) {
      try {
        this.state.hostSnapshot = this.host.snapshot();
      } catch {
        /* hôte non prêt */
      }
    }

    this.state.tick++;
    this.state.uptimeMs = Date.now() - this.bootTime;
    // Dernière phase effective
    this.state.phase = KernelPhase.EMIT;
    return this.state;
  }

  halt(): void {
    if (this.state.halted) return;
    this.state.phase = KernelPhase.HALT;
    // shutdown() dans l'ordre inverse des phases
    const reversed = [...PHASE_ORDER].reverse();
    for (const phase of reversed) {
      const list = this.subsystemsByPhase.get(phase) ?? [];
      for (const sub of list) {
        if (sub.shutdown) {
          try {
            sub.shutdown();
          } catch (e) {
            console.error(`[kernel] shutdown ${sub.id} échoué:`, e);
          }
        }
      }
    }
    this.state.halted = true;
  }

  // --- Syscalls ---

  syscall(name: string, args?: any): any {
    switch (name) {
      case "read_state":
        try {
          return this.host.snapshot();
        } catch {
          return null;
        }

      case "set_lever": {
        if (!args || typeof args.leverId !== "string" || typeof args.value !== "number") {
          return { accepted: false, reason: "arguments invalides (attendu { leverId, value })" };
        }
        if (this.host.adjustLever) {
          return this.host.adjustLever(args.leverId, args.value);
        }
        return { accepted: false, reason: "hôte sans adjustLever" };
      }

      case "get_phase":
        return this.state.phase;

      case "get_uptime":
        return this.state.uptimeMs;

      case "get_tick":
        return this.state.tick;

      case "list_subsystems":
        return this.state.subsystems.map((s) => ({
          id: s.id,
          name: s.name,
          phase: s.phase,
          enabled: s.enabled,
        }));

      case "register_subsystem": {
        if (args && typeof args === "object" && typeof args.id === "string") {
          this.register(args as Subsystem);
          return { ok: true, id: args.id };
        }
        return { ok: false, reason: "sous-système invalide" };
      }

      case "disable_phase": {
        const phase = args as KernelPhase;
        const list = this.subsystemsByPhase.get(phase) ?? [];
        for (const s of list) s.enabled = false;
        return { ok: true, disabled: list.length };
      }

      case "enable_phase": {
        const phase = args as KernelPhase;
        const list = this.subsystemsByPhase.get(phase) ?? [];
        for (const s of list) s.enabled = true;
        return { ok: true, enabled: list.length };
      }

      default:
        return { ok: false, reason: `syscall inconnu: ${name}` };
    }
  }
}

// --- Fabrique ---

// Crée un noyau par défaut avec les sous-systèmes life et governance enregistrés,
// puis le boote. Retourne un noyau prêt à cyclers.
export function createDefaultKernel(host: KernelHost): PrismKernel {
  const kernel = new PrismKernel(host);
  kernel.register(new LifeSystem());
  kernel.register(new GovernanceSystem());
  kernel.boot();
  return kernel;
}
