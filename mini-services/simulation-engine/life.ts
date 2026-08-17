// life.ts — Système de vie. Démographie, cycle de vie, ménages, mortalité.
//
// L'essaim n'est pas statique. Les agents naissent, grandissent, vont à
// l'école, travaillent, forment des ménages, ont des enfants, prennent leur
// retraite, et meurent. Une pyramide des âges se déforme sur les décennies.
// C'est « crée une vie » — de la vraie vie.
//
// Chaque tick = 1 mois de temps simulé (12 ticks = 1 an). La population est
// maintenue stable : un décès déclenche une naissance. Les naissances
// supplémentaires proviennent de la reproduction des WORKER/MATURE.

import type { Agent } from "./agent-swarm.js";
import { MACRO_CONSTANTS } from "./model.js";
import { KernelPhase, type Subsystem, type KernelState } from "./kernel.js";

// --- Constantes démographiques (Maroc, sources réelles) ---

const TICKS_PER_YEAR = 12;
const MAX_AGE = 100;            // âge plafond (rares)
const DEFAULT_AGENT_COUNT = 10000;
// Espérance de vie de référence (Maroc ~73 ans, MACRO_CONSTANTS.base_life_expectancy)
const REF_LIFE_EXPECTANCY = MACRO_CONSTANTS.base_life_expectancy;

// Taux de mortalité mensuel de base par tranche d'âge (décès pour 1000 par an → /12)
// Source : HCP Maroc / Banque Mondiale, taux brut de mortalité ~5/1000/an.
const MORTALITY_BASE: Record<LifeStage, number> = {
  INFANT: (15 / 1000) / 12,    // mortalité infantile élevée (~15/1000/an)
  CHILD: (0.5 / 1000) / 12,
  STUDENT: (1 / 1000) / 12,
  WORKER: (2 / 1000) / 12,
  MATURE: (8 / 1000) / 12,
  RETIREE: (25 / 1000) / 12,
  ELDER: (80 / 1000) / 12,
  DECEASED: 0,
};

// Probabilité mensuelle de reproduction pour un agent WORKER/MATURE éligible
// (fécondité max). Cible ~13 naissances/1000/an (taux brut de natalité Maroc).
const BASE_FERTILITY_PROB = 0.0043;

// --- Stades de vie ---

export enum LifeStage {
  INFANT = "INFANT",       // 0-4
  CHILD = "CHILD",         // 5-14
  STUDENT = "STUDENT",     // 15-24
  WORKER = "WORKER",       // 25-54
  MATURE = "MATURE",       // 55-64
  RETIREE = "RETIREE",     // 65-74
  ELDER = "ELDER",         // 75+
  DECEASED = "DECEASED",   // mort
}

// Détermine le stade de vie à partir de l'âge.
export function stageFromAge(age: number): LifeStage {
  if (age < 0) return LifeStage.INFANT;
  if (age <= 4) return LifeStage.INFANT;
  if (age <= 14) return LifeStage.CHILD;
  if (age <= 24) return LifeStage.STUDENT;
  if (age <= 54) return LifeStage.WORKER;
  if (age <= 64) return LifeStage.MATURE;
  if (age <= 74) return LifeStage.RETIREE;
  if (age <= MAX_AGE) return LifeStage.ELDER;
  return LifeStage.ELDER;
}

// --- Profil démographique ---

export interface DemographicProfile {
  age: number;             // années
  stage: LifeStage;
  householdId: number | null;  // null = sans ménage
  childrenCount: number;   // enfants vivants
  parentId: number | null;
  birthTick: number;
  deathTick: number | null;
  educationLevel: number;  // 0-1, accumulé pendant STUDENT
  health: number;          // 0-1, décline avec l'âge, affecté par healthcare
  fertility: number;       // 0-1, pic pendant WORKER/MATURE
  gender: "male" | "female";
}

// --- RNG seeded (mulberry32) ---
// Déterministe pour reproductibilité des simulations.

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

// --- Groupe d'âge pour pyramide ---

export interface PyramidBand {
  ageGroup: string;
  male: number;
  female: number;
}

export interface DemographicStats {
  medianAge: number;
  birthRate: number;       // naissances / 1000 / an
  deathRate: number;       // décès / 1000 / an
  dependencyRatio: number; // (0-14 + 65+) / 15-64 * 100
  populationGrowth: number; // % par an
  population: number;
}

// --- Le système de vie ---

export class LifeSystem implements Subsystem {
  id = "life";
  name = "Système de vie";
  phase: KernelPhase = KernelPhase.LIFECYCLE;
  enabled = true;

  private profiles: Map<number, DemographicProfile> = new Map();
  private agentCount: number;
  private seed: number;
  private rnd: () => number;
  private nextHouseholdId: number = 1;
  private nextAgentId: number;

  // Compteurs roulants sur 12 ticks (1 an) pour taux de natalité/mortalité
  private birthsHistory: number[] = [];
  private deathsHistory: number[] = [];
  private birthsThisYear: number = 0;
  private deathsThisYear: number = 0;
  private lastTick: number = 0;

  constructor(agentCount: number = DEFAULT_AGENT_COUNT, seed: number = 12345) {
    this.agentCount = agentCount;
    this.seed = seed;
    this.rnd = mulberry32(seed);
    this.nextAgentId = agentCount; // les nouveaux agents commencent après les initiaux
  }

  init(): void {
    this.profiles.clear();
    this.nextHouseholdId = 1;
    this.nextAgentId = this.agentCount;
    this.birthsHistory = [];
    this.deathsHistory = [];
    this.birthsThisYear = 0;
    this.deathsThisYear = 0;
    this.lastTick = 0;

    // Générer la population initiale avec une distribution d'âge réaliste.
    // Utilise age = floor(r^1.5 * 80) qui produit une médiane ~28 ans
    // (médiane d'âge réelle du Maroc, HCP 2023).
    for (let i = 0; i < this.agentCount; i++) {
      const r = this.rnd();
      const age = Math.floor(Math.pow(r, 1.5) * 80);
      const stage = stageFromAge(age);
      const gender: "male" | "female" = this.rnd() < 0.5 ? "male" : "female";

      // Niveau d'éducation initial selon l'âge/stade
      let educationLevel = 0;
      if (stage === LifeStage.STUDENT) {
        educationLevel = 0.2 + this.rnd() * 0.3;
      } else if (stage === LifeStage.WORKER || stage === LifeStage.MATURE) {
        educationLevel = 0.3 + this.rnd() * 0.5;
      } else if (stage === LifeStage.RETIREE || stage === LifeStage.ELDER) {
        educationLevel = 0.15 + this.rnd() * 0.35;
      }

      // Santé initiale : haute pour les jeunes, décline avec l'âge
      const healthBase = 1.0 - (age / MAX_AGE) * 0.5;
      const health = Math.max(0.2, Math.min(1, healthBase + (this.rnd() - 0.5) * 0.1));

      // Fécondité : pic pendant WORKER/MATURE
      let fertility = 0;
      if (stage === LifeStage.WORKER) {
        fertility = 0.5 + this.rnd() * 0.5;
      } else if (stage === LifeStage.MATURE) {
        fertility = 0.2 + this.rnd() * 0.3;
      } else if (stage === LifeStage.STUDENT) {
        fertility = 0.05 + this.rnd() * 0.1;
      }

      // Ménage : formé pour WORKER/MATURE/RETIREE/ELDER
      let householdId: number | null = null;
      if (
        stage === LifeStage.WORKER ||
        stage === LifeStage.MATURE ||
        stage === LifeStage.RETIREE ||
        stage === LifeStage.ELDER
      ) {
        householdId = this.nextHouseholdId++;
      }

      // Enfants : pour les adultes, nombre aléatoire selon l'âge
      let childrenCount = 0;
      if (stage === LifeStage.WORKER) {
        childrenCount = Math.floor(this.rnd() * 3);
      } else if (stage === LifeStage.MATURE || stage === LifeStage.RETIREE) {
        childrenCount = Math.floor(this.rnd() * 4);
      } else if (stage === LifeStage.ELDER) {
        childrenCount = Math.floor(this.rnd() * 5);
      }

      this.profiles.set(i, {
        age,
        stage,
        householdId,
        childrenCount,
        parentId: null,
        birthTick: -age * TICKS_PER_YEAR, // né il y a `age` années
        deathTick: null,
        educationLevel,
        health,
        fertility,
        gender,
      });
    }

    // Assigner les parents : pour chaque enfant (CHILD/INFANT), assigner un parent WORKER/MATURE
    const potentialParentIds: number[] = [];
    for (const [pid, p] of this.profiles) {
      if ((p.stage === LifeStage.WORKER || p.stage === LifeStage.MATURE) && p.householdId !== null) {
        potentialParentIds.push(pid);
      }
    }
    if (potentialParentIds.length > 0) {
      for (const [id, profile] of this.profiles) {
        if (profile.stage === LifeStage.INFANT || profile.stage === LifeStage.CHILD) {
          const parentId = potentialParentIds[Math.floor(this.rnd() * potentialParentIds.length)];
          profile.parentId = parentId;
          // Lier l'enfant au ménage du parent
          const parentProfile = this.profiles.get(parentId);
          if (parentProfile && parentProfile.householdId !== null) {
            profile.householdId = parentProfile.householdId;
            parentProfile.childrenCount++;
          }
        }
      }
    }
  }

  // --- Accès depuis l'essaim (lien agent ↔ profil démographique) ---

  // Retourne le profil démographique d'un agent de l'essaim.
  // Les ids sont partagés : l'agent #0 ↔ le profil #0.
  getAgentProfile(agent: Agent): DemographicProfile | undefined {
    return this.profiles.get(agent.id);
  }

  // --- Étape mensuelle ---

  step(kernelState: KernelState): number {
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    const currentTick = kernelState.tick;

    // Lire les leviers de santé/éducation depuis le snapshot de l'hôte si disponible
    const levers = kernelState.hostSnapshot?.levers ?? {};
    const healthcareQuality = this.computeHealthcareQuality(levers);
    const educationQuality = this.computeEducationQuality(levers);

    // Détection de nouvelle année (tous les 12 ticks)
    const isNewYear = currentTick > 0 && currentTick % TICKS_PER_YEAR === 0;

    // Parcourir tous les profils vivants
    const deceased: number[] = [];
    let births = 0;
    let deaths = 0;

    for (const [id, profile] of this.profiles) {
      if (profile.stage === LifeStage.DECEASED) continue;

      // Vieillissement : +1 an tous les 12 ticks
      // On utilise l'écart entre le tick courant et le birthTick pour l'âge exact
      const ageInTicks = currentTick - profile.birthTick;
      const newAge = Math.floor(ageInTicks / TICKS_PER_YEAR);
      if (newAge !== profile.age) {
        profile.age = newAge;
        const newStage = stageFromAge(profile.age);
        if (newStage !== profile.stage) {
          this.handleStageTransition(profile, newStage);
        }
      }

      // Éducation : les STUDENT accumulent du capital éducatif
      if (profile.stage === LifeStage.STUDENT) {
        profile.educationLevel = Math.min(
          1,
          profile.educationLevel + 0.004 * educationQuality,
        );
      }

      // Santé : décline avec l'âge (référence espérance de vie ~73 ans),
      // améliorée par la qualité des soins.
      // Au-delà de l'espérance de vie de référence, le déclin s'accélère.
      const ageRatio = profile.age / REF_LIFE_EXPECTANCY;
      const ageDecline = (profile.age / MAX_AGE) * 0.0008 * (1 + Math.max(0, ageRatio - 1) * 2);
      const healthBoost = healthcareQuality * 0.0006;
      profile.health = Math.max(
        0.05,
        Math.min(1, profile.health - ageDecline + healthBoost + (this.rnd() - 0.5) * 0.0002),
      );

      // Fécondité : évolue avec l'âge
      if (profile.stage === LifeStage.WORKER) {
        profile.fertility = Math.max(0.3, Math.min(1, profile.fertility * 0.999));
      } else if (profile.stage === LifeStage.MATURE) {
        profile.fertility = Math.max(0, profile.fertility * 0.998);
      }

      // Mortalité
      const baseMort = MORTALITY_BASE[profile.stage] ?? 0.001;
      const healthFactor = 1 / Math.max(0.1, profile.health);
      const deathProb = baseMort * healthFactor;
      if (this.rnd() < deathProb) {
        profile.stage = LifeStage.DECEASED;
        profile.deathTick = currentTick;
        deceased.push(id);
        deaths++;
        continue;
      }

      // Reproduction : WORKER/MATURE avec ménage et fertilité suffisante
      if (
        profile.gender === "female" &&
        (profile.stage === LifeStage.WORKER || profile.stage === LifeStage.MATURE) &&
        profile.householdId !== null &&
        profile.fertility > 0.3 &&
        profile.childrenCount < 5
      ) {
        const birthProb = BASE_FERTILITY_PROB * profile.fertility;
        if (this.rnd() < birthProb) {
          this.createChild(id, profile, currentTick);
          births++;
        }
      }
    }

    // Stabilité de la population : compenser les décès NETS par des naissances
    // de remplacement. Si births >= deaths ce tick, pas besoin de remplacement
    // (les naissances de reproduction couvrent déjà). Sinon, on crée des
    // nourrissons pour maintenir la population stable.
    // Cela évite la croissance infinie de la Map (OOM) et garde la démographie
    // réaliste : population ~constante, remplacement naturel.
    const netDeaths = Math.max(0, deaths - births);
    for (let i = 0; i < netDeaths; i++) {
      this.createInfant(currentTick);
    }

    // Nettoyer les profils décédés anciens (garder les 500 derniers pour stats)
    // Plus agressif pour éviter la croissance de la Map.
    if (this.profiles.size > this.agentCount + 500) {
      this.pruneDeceased(500);
    }

    // Comptabiliser naissances/décès
    this.birthsThisYear += births;
    this.deathsThisYear += deaths;

    // Rotation annuelle des compteurs
    if (isNewYear) {
      this.birthsHistory.push(this.birthsThisYear);
      this.deathsHistory.push(this.deathsThisYear);
      if (this.birthsHistory.length > 5) this.birthsHistory.shift();
      if (this.deathsHistory.length > 5) this.deathsHistory.shift();
      this.birthsThisYear = 0;
      this.deathsThisYear = 0;
    }

    this.lastTick = currentTick;

    const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
    return t1 - t0;
  }

  // --- Transition de stade ---

  private handleStageTransition(profile: DemographicProfile, newStage: LifeStage): void {
    const oldStage = profile.stage;
    profile.stage = newStage;

    // STUDENT → WORKER : formation du ménage
    if (oldStage === LifeStage.STUDENT && newStage === LifeStage.WORKER) {
      if (profile.householdId === null) {
        profile.householdId = this.nextHouseholdId++;
      }
      // La fécondité devient active
      profile.fertility = 0.5 + this.rnd() * 0.5;
    }

    // WORKER → MATURE : fécondité décline
    if (oldStage === LifeStage.WORKER && newStage === LifeStage.MATURE) {
      profile.fertility *= 0.4;
    }

    // MATURE → RETIREE : fin de vie active, fécondité nulle
    if (oldStage === LifeStage.MATURE && newStage === LifeStage.RETIREE) {
      profile.fertility = 0;
    }
  }

  // --- Création d'enfant ---

  private createChild(parentId: number, parent: DemographicProfile, currentTick: number): void {
    const childId = this.nextAgentId++;
    const child: DemographicProfile = {
      age: 0,
      stage: LifeStage.INFANT,
      householdId: parent.householdId,
      childrenCount: 0,
      parentId,
      birthTick: currentTick,
      deathTick: null,
      educationLevel: 0,
      health: 0.85 + this.rnd() * 0.15,
      fertility: 0,
      gender: this.rnd() < 0.5 ? "male" : "female",
    };
    this.profiles.set(childId, child);
    parent.childrenCount++;
  }

  // --- Création d'un nourrisson de remplacement (maintien de la population) ---

  private createInfant(currentTick: number): void {
    const infantId = this.nextAgentId++;
    this.profiles.set(infantId, {
      age: 0,
      stage: LifeStage.INFANT,
      householdId: null,
      childrenCount: 0,
      parentId: null,
      birthTick: currentTick,
      deathTick: null,
      educationLevel: 0,
      health: 0.8 + this.rnd() * 0.2,
      fertility: 0,
      gender: this.rnd() < 0.5 ? "male" : "female",
    });
  }

  // --- Nettoyage des profils décédés anciens ---

  private pruneDeceased(keepCount: number): void {
    const deceased: Array<{ id: number; deathTick: number }> = [];
    for (const [id, p] of this.profiles) {
      if (p.stage === LifeStage.DECEASED && p.deathTick !== null) {
        deceased.push({ id, deathTick: p.deathTick });
      }
    }
    deceased.sort((a, b) => b.deathTick - a.deathTick);
    // Garder les `keepCount` plus récents, supprimer les autres
    for (let i = keepCount; i < deceased.length; i++) {
      this.profiles.delete(deceased[i].id);
    }
  }

  // --- Qualité des soins (depuis les leviers) ---

  private computeHealthcareQuality(levers: Record<string, number>): number {
    const beds = levers["hospital_beds_per_1k"] ?? 1.1;
    const doctors = levers["doctors_per_1k"] ?? 0.7;
    const budget = levers["health_budget_share"] ?? 6.8;
    const vacc = levers["vaccination_rate"] ?? 89;
    const water = levers["water_access"] ?? 87;
    // Normaliser chaque levier vers [0, 1] par rapport à ses bornes saines
    const bedsQ = Math.min(1, beds / 4);
    const docsQ = Math.min(1, doctors / 3);
    const budgetQ = Math.min(1, budget / 10);
    const vaccQ = vacc / 100;
    const waterQ = water / 100;
    return (bedsQ + docsQ + budgetQ + vaccQ + waterQ) / 5;
  }

  // --- Qualité de l'éducation (depuis les leviers) ---

  private computeEducationQuality(levers: Record<string, number>): number {
    const budget = levers["education_budget_share"] ?? 6.4;
    const teachers = levers["teachers_per_1k_students"] ?? 42;
    const primary = levers["primary_enrollment"] ?? 99;
    const secondary = levers["secondary_enrollment"] ?? 70;
    const tertiary = levers["tertiary_enrollment"] ?? 38;
    const budgetQ = Math.min(1, budget / 8);
    const teachersQ = Math.min(1, teachers / 60);
    const primaryQ = primary / 100;
    const secondaryQ = secondary / 100;
    const tertiaryQ = Math.min(1, tertiary / 60);
    return (budgetQ + teachersQ + primaryQ + secondaryQ + tertiaryQ) / 5;
  }

  // --- Pyramide des âges ---

  getPopulationPyramid(): PyramidBand[] {
    const bands: PyramidBand[] = [
      { ageGroup: "0-4", male: 0, female: 0 },
      { ageGroup: "5-14", male: 0, female: 0 },
      { ageGroup: "15-24", male: 0, female: 0 },
      { ageGroup: "25-54", male: 0, female: 0 },
      { ageGroup: "55-64", male: 0, female: 0 },
      { ageGroup: "65-74", male: 0, female: 0 },
      { ageGroup: "75+", male: 0, female: 0 },
    ];

    for (const p of this.profiles.values()) {
      if (p.stage === LifeStage.DECEASED) continue;
      const idx = this.bandIndex(p.age);
      if (p.gender === "male") bands[idx].male++;
      else bands[idx].female++;
    }
    return bands;
  }

  private bandIndex(age: number): number {
    if (age <= 4) return 0;
    if (age <= 14) return 1;
    if (age <= 24) return 2;
    if (age <= 54) return 3;
    if (age <= 64) return 4;
    if (age <= 74) return 5;
    return 6;
  }

  // --- Statistiques démographiques ---

  getDemographicStats(): DemographicStats {
    const living = Array.from(this.profiles.values()).filter(
      (p) => p.stage !== LifeStage.DECEASED,
    );
    const population = living.length;
    if (population === 0) {
      return {
        medianAge: 0,
        birthRate: 0,
        deathRate: 0,
        dependencyRatio: 0,
        populationGrowth: 0,
        population: 0,
      };
    }

    // Âge médian
    const ages = living.map((p) => p.age).sort((a, b) => a - b);
    const medianAge = ages[Math.floor(ages.length / 2)] ?? 0;

    // Taux de natalité / mortalité (moyenne sur l'historique, par 1000 par an)
    const avgBirths =
      this.birthsHistory.length > 0
        ? this.birthsHistory.reduce((s, v) => s + v, 0) / this.birthsHistory.length
        : this.birthsThisYear;
    const avgDeaths =
      this.deathsHistory.length > 0
        ? this.deathsHistory.reduce((s, v) => s + v, 0) / this.deathsHistory.length
        : this.deathsThisYear;

    const birthRate = (avgBirths / population) * 1000;
    const deathRate = (avgDeaths / population) * 1000;
    const populationGrowth = ((avgBirths - avgDeaths) / population) * 100;

    // Ratio de dépendance : (0-14 + 65+) / 15-64 * 100
    let young = 0, working = 0, old = 0;
    for (const p of living) {
      if (p.age <= 14) young++;
      else if (p.age <= 64) working++;
      else old++;
    }
    const dependencyRatio = working > 0 ? ((young + old) / working) * 100 : 0;

    return {
      medianAge,
      birthRate,
      deathRate,
      dependencyRatio,
      populationGrowth,
      population,
    };
  }

  // --- Accès aux profils (pour intégration avec l'essaim) ---

  getProfile(agentId: number): DemographicProfile | undefined {
    return this.profiles.get(agentId);
  }

  getLivingCount(): number {
    let n = 0;
    for (const p of this.profiles.values()) {
      if (p.stage !== LifeStage.DECEASED) n++;
    }
    return n;
  }

  // --- Arrêt ---

  shutdown(): void {
    this.profiles.clear();
    this.birthsHistory = [];
    this.deathsHistory = [];
    this.birthsThisYear = 0;
    this.deathsThisYear = 0;
  }
}
