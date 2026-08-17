// governance.ts — Gestion étatique. Budget, ministères, capacité, services, corruption.
//
// Le pays n'est pas que des leviers et des agents — il y a un État qui gère.
// Il a un budget qu'il répartit entre ministères, une capacité bureaucratique
// qui détermine la qualité de l'exécution des politiques, un niveau de
// corruption qui fait fuir les fonds, et une qualité de service qui affecte
// la satisfaction des citoyens. C'est « crée une gestion » — du vrai management.
//
// Les 8 ministères reçoivent des allocations budgétaires réalistes (Loi de
// Finances Maroc ~500 Mrd MAD). Chaque tick, ils dépensent, fuient, et
// ajustent leur qualité de service. La corruption répond aux leviers de
// gouvernance (anti_corruption_index, tax_compliance_rate, digital_admin_budget).

import { MACRO_CONSTANTS } from "./model.js";
import { KernelPhase, type Subsystem, type KernelState } from "./kernel.js";

// --- Types ---

export type MinistryId =
  | "education"
  | "health"
  | "infrastructure"
  | "interior"
  | "finance"
  | "defense"
  | "agriculture"
  | "social";

export interface Ministry {
  id: MinistryId;
  name: string;            // "Ministère de l'Éducation", etc.
  allocatedBudget: number; // en Mrd MAD
  spentBudget: number;     // dépensé ce tick (allocated * efficiency)
  capacity: number;        // 0-1, capacité bureaucratique
  serviceQuality: number;  // 0-1, qualité de service délivrée
  efficiency: number;      // 0-1, ratio spent/allocated qui atteint le terrain
  leakage: number;         // 0-1, fraction perdue à la corruption/inefficacité
  referenceBudget: number; // budget de référence pour ajustement de la qualité
}

export interface GovernanceStats {
  totalBudget: number;     // Mrd MAD
  totalSpent: number;      // Mrd MAD
  totalLeakage: number;    // Mrd MAD
  avgCapacity: number;     // 0-1
  avgServiceQuality: number; // 0-1
  avgEfficiency: number;   // 0-1
  corruptionIndex: number; // 0-100 (100 = très corrompu)
}

// --- RNG seeded (mulberry32) ---

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Constantes ---

// Budget total de l'État marocain ~500 Mrd MAD (Loi de Finances 2023).
const TOTAL_BUDGET_MRD = 500;

// Allocations par défaut (fractions du budget total).
// Proportions réelles approximatives du Maroc.
const DEFAULT_ALLOCATIONS: Record<MinistryId, number> = {
  education: 0.15,       // ~75 Mrd MAD
  health: 0.07,          // ~35 Mrd MAD
  infrastructure: 0.12,  // ~60 Mrd MAD
  interior: 0.08,        // ~40 Mrd MAD
  finance: 0.06,         // ~30 Mrd MAD
  defense: 0.06,         // ~30 Mrd MAD
  agriculture: 0.08,     // ~40 Mrd MAD
  social: 0.38,          // ~190 Mrd MAD (dette + subventions + social)
};

// Ajustements d'allocation par paradigme politique.
// Le libéralisme favorise infrastructure+défense ; la planification favorise
// social+éducation ; l'autoritarisme favorise intérieur+défense.
const PARADIGM_ADJUSTMENTS: Record<string, Partial<Record<MinistryId, number>>> = {
  liberal: {
    infrastructure: +0.04,
    defense: +0.02,
    social: -0.04,
    education: -0.02,
  },
  planned: {
    social: +0.04,
    education: +0.03,
    infrastructure: +0.02,
    defense: -0.03,
    finance: -0.02,
  },
  technocracy: {
    education: +0.02,
    health: +0.01,
    interior: -0.01,
    social: -0.02,
  },
  authoritarian: {
    interior: +0.05,
    defense: +0.03,
    social: -0.04,
    education: -0.02,
    finance: -0.02,
  },
  transition: {
    // Transition : allocations inchangées (régime volatile, incertitude)
  },
};

const MINISTRY_NAMES: Record<MinistryId, string> = {
  education: "Ministère de l'Éducation",
  health: "Ministère de la Santé",
  infrastructure: "Ministère de l'Équipement et de l'Eau",
  interior: "Ministère de l'Intérieur",
  finance: "Ministère de l'Économie et des Finances",
  defense: "Ministère de la Défense Nationale",
  agriculture: "Ministère de l'Agriculture",
  social: "Ministère des Solidarités (dette + subventions + social)",
};

// --- Le système de gouvernance ---

export class GovernanceSystem implements Subsystem {
  id = "governance";
  name = "Gestion étatique";
  phase: KernelPhase = KernelPhase.GOVERN;
  enabled = true;

  private ministries: Map<MinistryId, Ministry> = new Map();
  private seed: number;
  private rnd: () => number;

  constructor(seed: number = 77777) {
    this.seed = seed;
    this.rnd = mulberry32(seed);
  }

  init(): void {
    this.ministries.clear();
    for (const id of Object.keys(DEFAULT_ALLOCATIONS) as MinistryId[]) {
      const fraction = DEFAULT_ALLOCATIONS[id];
      const allocatedBudget = fraction * TOTAL_BUDGET_MRD;
      const ministry: Ministry = {
        id,
        name: MINISTRY_NAMES[id],
        allocatedBudget,
        spentBudget: 0,
        capacity: 0.4 + this.rnd() * 0.3,       // 0.4-0.7
        serviceQuality: 0.4 + this.rnd() * 0.3,  // 0.4-0.7
        efficiency: 0.6 + this.rnd() * 0.2,      // 0.6-0.8
        leakage: 0.15 + this.rnd() * 0.15,       // 0.15-0.30
        referenceBudget: allocatedBudget,
      };
      this.ministries.set(id, ministry);
    }
  }

  // --- Cycle de gouvernance ---

  step(kernelState: KernelState): number {
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();

    // Lire l'état de l'hôte si disponible
    const levers = kernelState.hostSnapshot?.levers ?? {};
    const paradigm = (kernelState.hostSnapshot?.paradigm as string) ?? "technocracy";

    // 1. Réallouer le budget selon le paradigme courant
    this.reallocateBudget(paradigm);

    // 2. Ajuster la capacité et la fuite selon les leviers de gouvernance
    const antiCorruption = levers["anti_corruption_index"] ?? 45;      // /100
    const taxCompliance = levers["tax_compliance_rate"] ?? 65;         // %
    const digitalAdmin = levers["digital_admin_budget"] ?? 3.8;        // Mrd MAD
    const publicInvestment = levers["public_investment"] ?? 150;       // Mrd MAD

    // L'indice anti-corruption cible une fuite faible : 100 → 0.05, 0 → 0.50
    const targetLeakage = Math.max(0.05, 0.50 - (antiCorruption / 100) * 0.45);

    // La digitalisation améliore la capacité (réduit la bureaucratie manuelle)
    const digitalBoost = Math.min(0.1, digitalAdmin / 30 * 0.1);

    for (const ministry of this.ministries.values()) {
      // 3. Dépenser le budget : spentBudget = allocatedBudget * efficiency
      //    La fuite = allocatedBudget * leakage. efficiency = 1 - leakage (approximatif).
      //    L'efficacité dérive vers (1 - leakage) avec inertie.
      const targetEfficiency = Math.max(0.3, 1 - ministry.leakage);
      ministry.efficiency = ministry.efficiency * 0.95 + targetEfficiency * 0.05;
      ministry.spentBudget = ministry.allocatedBudget * ministry.efficiency;

      // 4. Qualité de service : s'améliore si on dépense au-dessus de la référence,
      //    se dégrade si on dépense en-dessous.
      const spendingRatio = ministry.referenceBudget > 0
        ? ministry.spentBudget / ministry.referenceBudget
        : 1;
      const qualityDelta = (spendingRatio - 0.5) * 0.01;
      ministry.serviceQuality = Math.max(
        0,
        Math.min(1, ministry.serviceQuality + qualityDelta + (this.rnd() - 0.5) * 0.002),
      );

      // 5. Fuite (corruption) : dérive vers la cible anti-corruption
      ministry.leakage = ministry.leakage * 0.97 + targetLeakage * 0.03;

      // 6. Capacité bureaucratique : dérive lentement.
      //    Faible corruption → capacité augmente. Forte corruption → capacité diminue.
      //    La digitalisation booste la capacité.
      const capacityDrift = (1 - ministry.leakage - 0.3) * 0.002 + digitalBoost * 0.001;
      // La conformité fiscale affecte surtout le ministère des finances
      const complianceBoost = ministry.id === "finance"
        ? (taxCompliance / 100 - 0.5) * 0.002
        : 0;
      ministry.capacity = Math.max(
        0.1,
        Math.min(1, ministry.capacity + capacityDrift + complianceBoost + (this.rnd() - 0.5) * 0.0005),
      );
    }

    // 7. Ajuster les budgets de référence lentement vers l'allocation courante
    //    (pour que la qualité de service s'adapte aux changements structurels)
    for (const ministry of this.ministries.values()) {
      ministry.referenceBudget = ministry.referenceBudget * 0.99 + ministry.allocatedBudget * 0.01;
    }

    // L'investissement public augmente le budget d'infrastructure (dépendance directe)
    if (publicInvestment !== 150) {
      const infra = this.ministries.get("infrastructure");
      if (infra) {
        const infraAdjust = (publicInvestment - 150) * 0.1; // 1 Mrd d'investissement → 0.1 Mrd d'ajustement
        infra.allocatedBudget = Math.max(10, infra.allocatedBudget + infraAdjust * 0.01);
      }
    }

    const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
    return t1 - t0;
  }

  // --- Réallocation budgétaire selon le paradigme ---

  private reallocateBudget(paradigm: string): void {
    const adjustments = PARADIGM_ADJUSTMENTS[paradigm] ?? {};
    // Calculer les fractions ajustées
    const adjustedFractions: Record<MinistryId, number> = { ...DEFAULT_ALLOCATIONS };
    for (const [id, delta] of Object.entries(adjustments) as [MinistryId, number][]) {
      adjustedFractions[id] = Math.max(0.02, DEFAULT_ALLOCATIONS[id] + delta);
    }
    // Normaliser pour que la somme = TOTAL_BUDGET_MRD
    const totalFraction = Object.values(adjustedFractions).reduce((s, v) => s + v, 0);
    for (const id of Object.keys(adjustedFractions) as MinistryId[]) {
      const ministry = this.ministries.get(id);
      if (ministry) {
        ministry.allocatedBudget = (adjustedFractions[id] / totalFraction) * TOTAL_BUDGET_MRD;
      }
    }
  }

  // --- Accès ---

  getMinistries(): Ministry[] {
    return Array.from(this.ministries.values());
  }

  getMinistry(id: MinistryId): Ministry | undefined {
    return this.ministries.get(id);
  }

  // --- Réallocation manuelle (l'utilisateur ajuste) ---

  setAllocation(ministryId: MinistryId, fraction: number): void {
    const ministry = this.ministries.get(ministryId);
    if (!ministry) return;
    const clampedFraction = Math.max(0.01, Math.min(0.80, fraction));
    // Calculer le budget restant pour les autres ministères
    const oldFraction = ministry.allocatedBudget / TOTAL_BUDGET_MRD;
    const remainingFraction = 1 - clampedFraction;
    const oldRemainingFraction = 1 - oldFraction;
    ministry.allocatedBudget = clampedFraction * TOTAL_BUDGET_MRD;
    // Redistribuer proportionnellement les autres ministères
    for (const [id, m] of this.ministries) {
      if (id === ministryId) continue;
      if (oldRemainingFraction > 0) {
        const proportion = (m.allocatedBudget / TOTAL_BUDGET_MRD) / oldRemainingFraction;
        m.allocatedBudget = proportion * remainingFraction * TOTAL_BUDGET_MRD;
      }
    }
  }

  // --- Statistiques agrégées ---

  getGovernanceStats(): GovernanceStats {
    let totalBudget = 0, totalSpent = 0, totalLeakage = 0;
    let sumCapacity = 0, sumServiceQuality = 0, sumEfficiency = 0, sumLeakage = 0;
    let n = 0;
    for (const m of this.ministries.values()) {
      totalBudget += m.allocatedBudget;
      totalSpent += m.spentBudget;
      totalLeakage += m.allocatedBudget * m.leakage;
      sumCapacity += m.capacity;
      sumServiceQuality += m.serviceQuality;
      sumEfficiency += m.efficiency;
      sumLeakage += m.leakage;
      n++;
    }
    if (n === 0) {
      return {
        totalBudget: 0,
        totalSpent: 0,
        totalLeakage: 0,
        avgCapacity: 0,
        avgServiceQuality: 0,
        avgEfficiency: 0,
        corruptionIndex: 0,
      };
    }
    return {
      totalBudget,
      totalSpent,
      totalLeakage,
      avgCapacity: sumCapacity / n,
      avgServiceQuality: sumServiceQuality / n,
      avgEfficiency: sumEfficiency / n,
      // Indice de corruption = fuite moyenne * 100 (inversé de l'efficacité)
      corruptionIndex: (sumLeakage / n) * 100,
    };
  }

  // --- Arrêt ---

  shutdown(): void {
    this.ministries.clear();
  }
}
