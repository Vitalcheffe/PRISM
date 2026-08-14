// decrees.ts — Système de décret.
//
// Le joueur (ou un acteur externe) émet un décret concret :
//   "Construire 10 hôpitaux"
//   "Hausser la TVA de 2 points"
//   "Porter le SMIG à 4000 MAD"
//
// Le système :
//   1. Parse le décret → identifie les leviers touchés et les deltas.
//   2. Vérifie la faisabilité (le budget le permet-il ?).
//   3. Applique les deltas aux leviers.
//   4. Recalcule les indicateurs via les formules.
//   5. Projette les conséquences (effets immédiats + différés).
//
// Contraintes réelles : on ne peut pas décréter "+100% de PIB" (le PIB n'est
// pas un levier). On ne peut décréter que des actions sur les leviers.

import { LEVER_BY_ID, type LeverDef } from "./model.js";
import { computeGDP, computePublicSpending, computeTaxRevenue } from "./formulas.js";

export type Levers = Record<string, number>;

export interface DecreeDelta {
  leverId: string;
  leverName: string;
  absoluteChange: number;     // nouvelle valeur
  relativeChange: number;     // delta
  unit: string;
}

export interface DecreeResult {
  accepted: boolean;
  reason?: string;
  deltas: DecreeDelta[];
  // conséquences immédiates (indicateurs recalculés)
  immediateGdpImpact: number;
  immediateBudgetImpact: number;
  immediateDebtImpact: number;
  // conséquences projetées à 1 an (24 ticks)
  projectedStabilityDelta: number;
  // coût budgétaire total (si applicable)
  fiscalCost: number;       // Mrd MAD
  // résumé lisible
  summary: string;
}

// ──────────────────────────────────────────────────────────────────────────
//  PATTERNS DE DÉCRET — comment traduire une action en deltas
// ──────────────────────────────────────────────────────────────────────────

interface DecreePattern {
  // mots-clés déclencheurs (en français)
  keywords: string[];
  // fonction qui produit les deltas à partir des groupes capturés
  apply: (match: RegExpMatchArray, currentLevers: Levers) => { deltas: DecreeDelta[]; fiscalCost: number };
  // description du pattern
  description: string;
}

const HOSPITAL_COST_MRD_PER_UNIT = 0.15; // un hôpital de 500 lits coûte ~150M MAD = 0.15 Mrd
const SCHOOL_COST_MRD_PER_UNIT = 0.05;
const HOUSING_COST_MRD_PER_UNIT = 0.0003; // 300k MAD par logement
const ROAD_COST_MRD_PER_KM = 0.008;
const BEDS_PER_HOSPITAL = 500;

const PATTERNS: DecreePattern[] = [
  {
    description: "Construire N hôpitaux",
    keywords: ["hôpital", "hopital", "hôpitaux", "hopitaux"],
    apply: (match, levers) => {
      const n = parseInt(match[1] || "1", 10);
      const newBeds = (levers.hospital_beds_per_1k ?? 1.1) + (n * BEDS_PER_HOSPITAL / 37800); // 37.8M hab
      const fiscalCost = n * HOSPITAL_COST_MRD_PER_UNIT;
      return {
        deltas: [{
          leverId: "hospital_beds_per_1k",
          leverName: "Lits d'hôpitaux / 1000 hab.",
          absoluteChange: newBeds,
          relativeChange: newBeds - (levers.hospital_beds_per_1k ?? 1.1),
          unit: "lits",
        }],
        fiscalCost,
      };
    },
  },
  {
    description: "Construire N écoles",
    keywords: ["école", "ecole", "écoles", "ecoles"],
    apply: (match, levers) => {
      const n = parseInt(match[1] || "1", 10);
      const currentTeachers = levers.teachers_per_1k_students ?? 42;
      // une école ajoute ~20 enseignants pour ~5000 élèves = +4/1000
      const newTeachers = currentTeachers + (n * 4 / 10);
      const fiscalCost = n * SCHOOL_COST_MRD_PER_UNIT;
      return {
        deltas: [{
          leverId: "teachers_per_1k_students",
          leverName: "Enseignants / 1000 élèves",
          absoluteChange: newTeachers,
          relativeChange: newTeachers - currentTeachers,
          unit: "enseignants",
        }],
        fiscalCost,
      };
    },
  },
  {
    description: "Construire N logements sociaux",
    keywords: ["logement", "logements"],
    apply: (match, levers) => {
      const n = parseInt(match[1] || "1000", 10);
      const current = levers.social_housing_units ?? 100000;
      const newUnits = current + n;
      const fiscalCost = n * HOUSING_COST_MRD_PER_UNIT;
      return {
        deltas: [{
          leverId: "social_housing_units",
          leverName: "Logements sociaux / an",
          absoluteChange: newUnits,
          relativeChange: n,
          unit: "logements",
        }],
        fiscalCost,
      };
    },
  },
  {
    description: "Construire N km de routes",
    keywords: ["route", "routes", "autoroute"],
    apply: (match, levers) => {
      const n = parseInt(match[1] || "100", 10);
      const current = levers.road_paved_share ?? 70;
      // ~+0.1% de routes revêtues pour 100 km
      const newShare = Math.min(100, current + n / 1000);
      const fiscalCost = n * ROAD_COST_MRD_PER_KM;
      return {
        deltas: [{
          leverId: "road_paved_share",
          leverName: "Routes revêtues",
          absoluteChange: newShare,
          relativeChange: newShare - current,
          unit: "%",
        }],
        fiscalCost,
      };
    },
  },
  {
    description: "Hausser / baisser / porter la TVA",
    keywords: ["tva"],
    apply: (match, levers) => {
      const current = levers.vat_rate ?? 20;
      const value = parseFloat(match[1] || "0");
      const dir = (match[2] || "").toLowerCase();
      const lever = LEVER_BY_ID.get("vat_rate")!;
      let newRate = current;

      // "porter la TVA à X" → valeur absolue
      // "hausser/augmenter la TVA de X" → relatif (+)
      // "baisser/réduire la TVA de X" → relatif (−)
      const isAbsolu = /porter.*à\s+\d/i.test(match[0]) || /à\s+\d/.test(match[0]) && !/de\s+\d/i.test(match[0]);
      if (isAbsolu) {
        newRate = value;
      } else if (dir.includes("hausse") || dir.includes("augment")) {
        newRate = current + value;
      } else if (dir.includes("baisse") || dir.includes("redui")) {
        newRate = current - value;
      } else {
        newRate = value > 0 ? value : current;
      }

      return {
        deltas: [{
          leverId: "vat_rate",
          leverName: lever.name,
          absoluteChange: newRate,
          relativeChange: newRate - current,
          unit: "%",
        }],
        fiscalCost: 0,
      };
    },
  },
  {
    description: "Porter le taux directeur à X",
    keywords: ["taux directeur", "taux d'intérêt", "taux d'interet"],
    apply: (match, levers) => {
      const current = levers.interest_rate ?? 2.5;
      const target = parseFloat(match[1] || "2.5");
      const lever = LEVER_BY_ID.get("interest_rate")!;
      return {
        deltas: [{
          leverId: "interest_rate",
          leverName: lever.name,
          absoluteChange: target,
          relativeChange: target - current,
          unit: "%",
        }],
        fiscalCost: 0,
      };
    },
  },
  {
    description: "Recruter N médecins",
    keywords: ["médecin", "medecin", "médecins", "medecins"],
    apply: (match, levers) => {
      const n = parseInt(match[1] || "100", 10);
      const current = levers.doctors_per_1k ?? 0.7;
      const newRate = current + (n / 37800); // 37.8M hab
      const lever = LEVER_BY_ID.get("doctors_per_1k")!;
      return {
        deltas: [{
          leverId: "doctors_per_1k",
          leverName: lever.name,
          absoluteChange: newRate,
          relativeChange: newRate - current,
          unit: "médecins",
        }],
        fiscalCost: n * 0.00012, // ~120k MAD/an par médecin de budget
      };
    },
  },
  // ── NOUVEAUX PATTERNS (V3.1) ──
  {
    description: "Baisser / réduire les impôts de X%",
    keywords: ["impôt", "impot", "impôts", "impots"],
    apply: (match, levers) => {
      const pts = parseFloat(match[1] || "1");
      const dir = (match[2] || "").toLowerCase();
      const isLower = dir.includes("baisse") || dir.includes("redui") || /réduire|reduire/i.test(match[0]);
      const factor = isLower ? -1 : 1;
      const lever = LEVER_BY_ID.get("corporate_tax_rate")!;
      const current = levers.corporate_tax_rate ?? 31;
      const newRate = Math.max(0, current + factor * pts);
      return {
        deltas: [{
          leverId: "corporate_tax_rate",
          leverName: lever.name,
          absoluteChange: newRate,
          relativeChange: newRate - current,
          unit: "%",
        }],
        fiscalCost: 0,
      };
    },
  },
  {
    description: "Réformer le système de retraite / porter l'âge à X",
    keywords: ["retraite", "pension"],
    apply: (match, levers) => {
      const current = levers.retirement_age ?? 62;
      const target = parseFloat(match[1] || "62");
      const lever = LEVER_BY_ID.get("retirement_age")!;
      return {
        deltas: [{
          leverId: "retirement_age",
          leverName: lever.name,
          absoluteChange: target,
          relativeChange: target - current,
          unit: "ans",
        }],
        fiscalCost: 0,
      };
    },
  },
  {
    description: "Doubler le budget éducation",
    keywords: ["budget éducation", "budget education", "éducation"],
    apply: (match, levers) => {
      const current = levers.education_budget_share ?? 6.4;
      const isDouble = (match as any).isDouble;
      const pts = parseFloat(match[1] || "1");
      let newShare: number;
      if (isDouble) {
        newShare = current * 2;
      } else {
        newShare = current + pts;
      }
      const lever = LEVER_BY_ID.get("education_budget_share")!;
      return {
        deltas: [{
          leverId: "education_budget_share",
          leverName: lever.name,
          absoluteChange: newShare,
          relativeChange: newShare - current,
          unit: "%",
        }],
        fiscalCost: (newShare - current) / 100 * 1400,
      };
    },
  },
  {
    description: "Doubler le budget santé",
    keywords: ["budget santé", "budget sante", "système de santé", "systeme de sante"],
    apply: (match, levers) => {
      const current = levers.health_budget_share ?? 6.8;
      const isDouble = (match as any).isDouble;
      const pts = parseFloat(match[1] || "1");
      let newShare: number;
      if (isDouble) {
        newShare = current * 2;
      } else {
        newShare = current + pts;
      }
      const lever = LEVER_BY_ID.get("health_budget_share")!;
      return {
        deltas: [{
          leverId: "health_budget_share",
          leverName: lever.name,
          absoluteChange: newShare,
          relativeChange: newShare - current,
          unit: "%",
        }],
        fiscalCost: (newShare - current) / 100 * 1400,
      };
    },
  },
  {
    description: "Augmenter le SMIG de X%",
    keywords: ["smig", "salaire minimum"],
    apply: (match, levers) => {
      const current = levers.minimum_wage ?? 3330;
      const isPercent = (match as any).isPercent;
      const value = parseFloat(match[1] || "10");
      // Si pourcentage et direction hausse : current * (1 + value/100)
      // Si pourcentage et direction baisse : current * (1 - value/100)
      // Si valeur absolue ("porter le SMIG à 4000") : value
      const dir = (match[2] || "").toLowerCase();
      let newWage: number;
      if (isPercent) {
        const factor = dir.includes("baisse") ? (1 - value / 100) : (1 + value / 100);
        newWage = current * factor;
      } else if (value > 1000) {
        // Valeur absolue (SMIG realistiquement > 1000 MAD)
        newWage = value;
      } else {
        // Petit nombre sans % → ajout absolu
        newWage = current + value;
      }
      const lever = LEVER_BY_ID.get("minimum_wage")!;
      return {
        deltas: [{
          leverId: "minimum_wage",
          leverName: lever.name,
          absoluteChange: newWage,
          relativeChange: newWage - current,
          unit: "MAD",
        }],
        fiscalCost: 0,
      };
    },
  },
  {
    description: "Porter le taux directeur à X / hausser les taux",
    keywords: ["taux", "taux directeur", "banque centrale"],
    apply: (match, levers) => {
      const current = levers.interest_rate ?? 2.5;
      const target = parseFloat(match[1] || "2.5");
      const lever = LEVER_BY_ID.get("interest_rate")!;
      return {
        deltas: [{
          leverId: "interest_rate",
          leverName: lever.name,
          absoluteChange: target,
          relativeChange: target - current,
          unit: "%",
        }],
        fiscalCost: 0,
      };
    },
  },
  {
    description: "Lancer un programme de logements sociaux",
    keywords: ["logement social", "logements sociaux", "habitat"],
    apply: (match, levers) => {
      const n = parseInt(match[1] || "50000", 10);
      const current = levers.social_housing_units ?? 100000;
      const newUnits = current + n;
      const lever = LEVER_BY_ID.get("social_housing_units")!;
      return {
        deltas: [{
          leverId: "social_housing_units",
          leverName: lever.name,
          absoluteChange: newUnits,
          relativeChange: n,
          unit: "logements",
        }],
        fiscalCost: n * 0.0003,
      };
    },
  },
  {
    description: "Investir dans les énergies renouvelables",
    keywords: ["renouvelable", "solaire", "éolien", "eolien", "vert"],
    apply: (match, levers) => {
      const pts = parseFloat(match[1] || "10");
      const current = levers.renewable_energy_share ?? 37;
      const newShare = Math.min(100, current + pts);
      const lever = LEVER_BY_ID.get("renewable_energy_share")!;
      return {
        deltas: [{
          leverId: "renewable_energy_share",
          leverName: lever.name,
          absoluteChange: newShare,
          relativeChange: newShare - current,
          unit: "%",
        }],
        fiscalCost: pts * 0.8, // ~0.8 Mrd par point de renouvelable
      };
    },
  },
  {
    description: "Instaurer une taxe carbone",
    keywords: ["carbone", "taxe carbone", "co2"],
    apply: (match, levers) => {
      const target = parseFloat(match[1] || "100");
      const current = levers.carbon_tax ?? 50;
      const lever = LEVER_BY_ID.get("carbon_tax")!;
      return {
        deltas: [{
          leverId: "carbon_tax",
          leverName: lever.name,
          absoluteChange: target,
          relativeChange: target - current,
          unit: "MAD/tonne",
        }],
        fiscalCost: 0,
      };
    },
  },
  {
    description: "Renforcer la lutte anti-corruption",
    keywords: ["corruption", "anti-corruption", "anticorruption"],
    apply: (match, levers) => {
      const pts = parseFloat(match[1] || "10");
      const current = levers.anti_corruption_index ?? 45;
      const newIndex = Math.min(100, current + pts);
      const lever = LEVER_BY_ID.get("anti_corruption_index")!;
      return {
        deltas: [{
          leverId: "anti_corruption_index",
          leverName: lever.name,
          absoluteChange: newIndex,
          relativeChange: newIndex - current,
          unit: "/100",
        }],
        fiscalCost: pts * 0.3,
      };
    },
  },
  {
    description: "Augmenter le budget militaire",
    keywords: ["militaire", "armée", "armee", "défense", "defense"],
    apply: (match, levers) => {
      const pts = parseFloat(match[1] || "1");
      const current = levers.military_budget_share ?? 3.5;
      const newShare = Math.min(12, current + pts);
      const lever = LEVER_BY_ID.get("military_budget_share")!;
      return {
        deltas: [{
          leverId: "military_budget_share",
          leverName: lever.name,
          absoluteChange: newShare,
          relativeChange: newShare - current,
          unit: "%",
        }],
        fiscalCost: pts / 100 * 1400,
      };
    },
  },
  {
    description: "Étendre l'accès à l'eau potable",
    keywords: ["eau potable", "eau", "assainissement"],
    apply: (match, levers) => {
      const pts = parseFloat(match[1] || "5");
      const current = levers.water_access ?? 87;
      const newAccess = Math.min(100, current + pts);
      const lever = LEVER_BY_ID.get("water_access")!;
      return {
        deltas: [{
          leverId: "water_access",
          leverName: lever.name,
          absoluteChange: newAccess,
          relativeChange: newAccess - current,
          unit: "%",
        }],
        fiscalCost: pts * 0.5,
      };
    },
  },
  {
    description: "Digitaliser l'administration",
    keywords: ["digital", "numérique", "numerique", "digitaliser"],
    apply: (match, levers) => {
      const pts = parseFloat(match[1] || "2");
      const current = levers.digital_admin_budget ?? 3.8;
      const newBudget = current + pts;
      const lever = LEVER_BY_ID.get("digital_admin_budget")!;
      return {
        deltas: [{
          leverId: "digital_admin_budget",
          leverName: lever.name,
          absoluteChange: newBudget,
          relativeChange: pts,
          unit: "Mrd MAD",
        }],
        fiscalCost: pts,
      };
    },
  },
  {
    description: "Augmenter les allocations familiales",
    keywords: ["allocations", "familiales", "famille"],
    apply: (match, levers) => {
      const target = parseFloat(match[1] || "600");
      const current = levers.family_benefits_per_child ?? 400;
      const lever = LEVER_BY_ID.get("family_benefits_per_child")!;
      return {
        deltas: [{
          leverId: "family_benefits_per_child",
          leverName: lever.name,
          absoluteChange: target,
          relativeChange: target - current,
          unit: "MAD/mois",
        }],
        fiscalCost: (target - current) * 8e6 * 12 / 1e9, // ~8M enfants
      };
    },
  },
  {
    description: "Étendre la couverture vaccinale",
    keywords: ["vaccination", "vaccin", "vacciner"],
    apply: (match, levers) => {
      const target = parseFloat(match[1] || "95");
      const current = levers.vaccination_rate ?? 89;
      const lever = LEVER_BY_ID.get("vaccination_rate")!;
      return {
        deltas: [{
          leverId: "vaccination_rate",
          leverName: lever.name,
          absoluteChange: Math.min(100, target),
          relativeChange: Math.min(100, target) - current,
          unit: "%",
        }],
        fiscalCost: Math.max(0, target - current) * 0.1,
      };
    },
  },
  // ── DÉCRETS COMPOSÉS (multi-leviers) ──
  {
    description: "Plan de relance économique",
    keywords: ["plan de relance", "relance économique", "relance economique", "stimulus"],
    apply: (match, levers) => {
      // Baisser les impôts + hausser investissement public + baisser taux
      const fiscalCost = 0;
      const deltas: DecreeDelta[] = [];
      const corpLever = LEVER_BY_ID.get("corporate_tax_rate")!;
      const invLever = LEVER_BY_ID.get("public_investment")!;
      const intLever = LEVER_BY_ID.get("interest_rate")!;
      const corpCurrent = levers.corporate_tax_rate ?? 31;
      const invCurrent = levers.public_investment ?? 150;
      const intCurrent = levers.interest_rate ?? 2.5;
      deltas.push({ leverId: "corporate_tax_rate", leverName: corpLever.name, absoluteChange: corpCurrent - 3, relativeChange: -3, unit: "%" });
      deltas.push({ leverId: "public_investment", leverName: invLever.name, absoluteChange: invCurrent + 50, relativeChange: 50, unit: "Mrd MAD" });
      deltas.push({ leverId: "interest_rate", leverName: intLever.name, absoluteChange: Math.max(0, intCurrent - 1), relativeChange: -1, unit: "%" });
      return { deltas, fiscalCost: 50 + 3 * 1400 / 100 };
    },
  },
  {
    description: "Plan de rigueur budgétaire",
    keywords: ["plan de rigueur", "rigueur budgétaire", "austérité", "austerite"],
    apply: (match, levers) => {
      const deltas: DecreeDelta[] = [];
      const vatLever = LEVER_BY_ID.get("vat_rate")!;
      const subLever = LEVER_BY_ID.get("subsidies")!;
      const invLever = LEVER_BY_ID.get("public_investment")!;
      const vatCurrent = levers.vat_rate ?? 20;
      const subCurrent = levers.subsidies ?? 45;
      const invCurrent = levers.public_investment ?? 150;
      deltas.push({ leverId: "vat_rate", leverName: vatLever.name, absoluteChange: vatCurrent + 2, relativeChange: 2, unit: "%" });
      deltas.push({ leverId: "subsidies", leverName: subLever.name, absoluteChange: Math.max(0, subCurrent - 20), relativeChange: -20, unit: "Mrd MAD" });
      deltas.push({ leverId: "public_investment", leverName: invLever.name, absoluteChange: Math.max(0, invCurrent - 30), relativeChange: -30, unit: "Mrd MAD" });
      return { deltas, fiscalCost: -40 };
    },
  },
  {
    description: "Réforme du système de santé",
    keywords: ["réforme santé", "reforme sante", "système de santé", "systeme de sante"],
    apply: (match, levers) => {
      const deltas: DecreeDelta[] = [];
      const hbLever = LEVER_BY_ID.get("health_budget_share")!;
      const bedLever = LEVER_BY_ID.get("hospital_beds_per_1k")!;
      const docLever = LEVER_BY_ID.get("doctors_per_1k")!;
      const hbCurrent = levers.health_budget_share ?? 6.8;
      const bedCurrent = levers.hospital_beds_per_1k ?? 1.1;
      const docCurrent = levers.doctors_per_1k ?? 0.7;
      deltas.push({ leverId: "health_budget_share", leverName: hbLever.name, absoluteChange: hbCurrent + 2, relativeChange: 2, unit: "%" });
      deltas.push({ leverId: "hospital_beds_per_1k", leverName: bedLever.name, absoluteChange: bedCurrent + 0.5, relativeChange: 0.5, unit: "lits" });
      deltas.push({ leverId: "doctors_per_1k", leverName: docLever.name, absoluteChange: docCurrent + 0.3, relativeChange: 0.3, unit: "médecins" });
      return { deltas, fiscalCost: 2 * 1400 / 100 + 0.5 * 0.15 + 0.3 * 0.00012 * 37800 / 1000 };
    },
  },
  {
    description: "Transition énergétique verte",
    keywords: ["transition énergétique", "transition energetique", "plan vert", "plan climat"],
    apply: (match, levers) => {
      const deltas: DecreeDelta[] = [];
      const reLever = LEVER_BY_ID.get("renewable_energy_share")!;
      const ctLever = LEVER_BY_ID.get("carbon_tax")!;
      const prLever = LEVER_BY_ID.get("pollution_regulation")!;
      const reCurrent = levers.renewable_energy_share ?? 37;
      const ctCurrent = levers.carbon_tax ?? 50;
      const prCurrent = levers.pollution_regulation ?? 50;
      deltas.push({ leverId: "renewable_energy_share", leverName: reLever.name, absoluteChange: Math.min(100, reCurrent + 15), relativeChange: 15, unit: "%" });
      deltas.push({ leverId: "carbon_tax", leverName: ctLever.name, absoluteChange: ctCurrent + 150, relativeChange: 150, unit: "MAD/tonne" });
      deltas.push({ leverId: "pollution_regulation", leverName: prLever.name, absoluteChange: Math.min(100, prCurrent + 20), relativeChange: 20, unit: "/100" });
      return { deltas, fiscalCost: 15 * 0.8 };
    },
  },
  {
    description: "Plan national éducation",
    keywords: ["plan national éducation", "plan national education", "réforme éducation", "reforme education", "plan éducation", "plan education"],
    apply: (match, levers) => {
      const deltas: DecreeDelta[] = [];
      const ebLever = LEVER_BY_ID.get("education_budget_share")!;
      const tcLever = LEVER_BY_ID.get("teachers_per_1k_students")!;
      const rdLever = LEVER_BY_ID.get("rd_investment_share")!;
      const ebCurrent = levers.education_budget_share ?? 6.4;
      const tcCurrent = levers.teachers_per_1k_students ?? 42;
      const rdCurrent = levers.rd_investment_share ?? 0.7;
      deltas.push({ leverId: "education_budget_share", leverName: ebLever.name, absoluteChange: ebCurrent + 1.5, relativeChange: 1.5, unit: "%" });
      deltas.push({ leverId: "teachers_per_1k_students", leverName: tcLever.name, absoluteChange: tcCurrent + 8, relativeChange: 8, unit: "enseignants" });
      deltas.push({ leverId: "rd_investment_share", leverName: rdLever.name, absoluteChange: Math.min(5, rdCurrent + 0.5), relativeChange: 0.5, unit: "%" });
      return { deltas, fiscalCost: 1.5 * 1400 / 100 };
    },
  },
  {
    description: "Politique nataliste",
    keywords: ["politique nataliste", "nataliste", "encourager natalité", "encourager natalite"],
    apply: (match, levers) => {
      const deltas: DecreeDelta[] = [];
      const fbLever = LEVER_BY_ID.get("family_benefits_per_child")!;
      const sbLever = LEVER_BY_ID.get("social_programs_budget")!;
      const fbCurrent = levers.family_benefits_per_child ?? 400;
      const sbCurrent = levers.social_programs_budget ?? 25;
      deltas.push({ leverId: "family_benefits_per_child", leverName: fbLever.name, absoluteChange: fbCurrent + 200, relativeChange: 200, unit: "MAD/mois" });
      deltas.push({ leverId: "social_programs_budget", leverName: sbLever.name, absoluteChange: sbCurrent + 5, relativeChange: 5, unit: "Mrd MAD" });
      return { deltas, fiscalCost: 200 * 8e6 * 12 / 1e9 + 5 };
    },
  },
  // ── NOUVEAUX PATTERNS V11 ──
  {
    description: "Nationaliser un secteur",
    keywords: ["nationaliser", "nationalisation"],
    apply: (match, levers) => {
      const deltas: DecreeDelta[] = [];
      const corpLever = LEVER_BY_ID.get("corporate_tax_rate")!;
      const current = levers.corporate_tax_rate ?? 31;
      deltas.push({ leverId: "corporate_tax_rate", leverName: corpLever.name, absoluteChange: Math.min(50, current + 10), relativeChange: 10, unit: "%" });
      return { deltas, fiscalCost: 0 };
    },
  },
  {
    description: "Privatiser les entreprises publiques",
    keywords: ["privatiser", "privatisation"],
    apply: (match, levers) => {
      const deltas: DecreeDelta[] = [];
      const corpLever = LEVER_BY_ID.get("corporate_tax_rate")!;
      const current = levers.corporate_tax_rate ?? 31;
      deltas.push({ leverId: "corporate_tax_rate", leverName: corpLever.name, absoluteChange: Math.max(0, current - 5), relativeChange: -5, unit: "%" });
      return { deltas, fiscalCost: -30 };
    },
  },
  {
    description: "Lancer un grand projet d'infrastructure",
    keywords: ["grand projet", "grandes infrastructures", "chantier national"],
    apply: (match, levers) => {
      const deltas: DecreeDelta[] = [];
      const invLever = LEVER_BY_ID.get("public_investment")!;
      const roadLever = LEVER_BY_ID.get("road_paved_share")!;
      const railLever = LEVER_BY_ID.get("rail_network_km")!;
      const invCurrent = levers.public_investment ?? 150;
      deltas.push({ leverId: "public_investment", leverName: invLever.name, absoluteChange: invCurrent + 80, relativeChange: 80, unit: "Mrd MAD" });
      deltas.push({ leverId: "road_paved_share", leverName: roadLever.name, absoluteChange: Math.min(100, (levers.road_paved_share ?? 70) + 5), relativeChange: 5, unit: "%" });
      deltas.push({ leverId: "rail_network_km", leverName: railLever.name, absoluteChange: (levers.rail_network_km ?? 2210) + 300, relativeChange: 300, unit: "km" });
      return { deltas, fiscalCost: 80 };
    },
  },
  {
    description: "Réforme fiscale globale",
    keywords: ["réforme fiscale", "reforme fiscale"],
    apply: (match, levers) => {
      const deltas: DecreeDelta[] = [];
      const vatLever = LEVER_BY_ID.get("vat_rate")!;
      const corpLever = LEVER_BY_ID.get("corporate_tax_rate")!;
      const incomeLever = LEVER_BY_ID.get("income_tax_rate_top")!;
      const compLever = LEVER_BY_ID.get("tax_compliance_rate")!;
      deltas.push({ leverId: "vat_rate", leverName: vatLever.name, absoluteChange: (levers.vat_rate ?? 20) - 2, relativeChange: -2, unit: "%" });
      deltas.push({ leverId: "corporate_tax_rate", leverName: corpLever.name, absoluteChange: (levers.corporate_tax_rate ?? 31) - 3, relativeChange: -3, unit: "%" });
      deltas.push({ leverId: "income_tax_rate_top", leverName: incomeLever.name, absoluteChange: (levers.income_tax_rate_top ?? 38) + 2, relativeChange: 2, unit: "%" });
      deltas.push({ leverId: "tax_compliance_rate", leverName: compLever.name, absoluteChange: Math.min(100, (levers.tax_compliance_rate ?? 65) + 5), relativeChange: 5, unit: "%" });
      return { deltas, fiscalCost: -20 };
    },
  },
  {
    description: "Programme de lutte contre la pauvreté",
    keywords: ["lutte contre la pauvreté", "lutte contre la pauvrete", "éradication de la pauvreté"],
    apply: (match, levers) => {
      const deltas: DecreeDelta[] = [];
      const minLever = LEVER_BY_ID.get("minimum_income_guarantee")!;
      const socialLever = LEVER_BY_ID.get("social_programs_budget")!;
      const housingLever = LEVER_BY_ID.get("social_housing_units")!;
      deltas.push({ leverId: "minimum_income_guarantee", leverName: minLever.name, absoluteChange: (levers.minimum_income_guarantee ?? 500) + 300, relativeChange: 300, unit: "MAD/mois" });
      deltas.push({ leverId: "social_programs_budget", leverName: socialLever.name, absoluteChange: (levers.social_programs_budget ?? 25) + 10, relativeChange: 10, unit: "Mrd MAD" });
      deltas.push({ leverId: "social_housing_units", leverName: housingLever.name, absoluteChange: (levers.social_housing_units ?? 100000) + 50000, relativeChange: 50000, unit: "logements" });
      return { deltas, fiscalCost: 35 };
    },
  },
  {
    description: "Plan de modernisation de l'armée",
    keywords: ["modernisation armée", "modernisation armee", "modernisation militaire"],
    apply: (match, levers) => {
      const deltas: DecreeDelta[] = [];
      const milLever = LEVER_BY_ID.get("military_budget_share")!;
      deltas.push({ leverId: "military_budget_share", leverName: milLever.name, absoluteChange: Math.min(12, (levers.military_budget_share ?? 3.5) + 1.5), relativeChange: 1.5, unit: "%" });
      return { deltas, fiscalCost: 1.5 * 1400 / 100 };
    },
  },
  {
    description: "Ouverture économique internationale",
    keywords: ["ouverture économique", "ouverture economique", "libéralisation commerciale"],
    apply: (match, levers) => {
      const deltas: DecreeDelta[] = [];
      const exLever = LEVER_BY_ID.get("exchange_rate")!;
      const current = levers.exchange_rate ?? 10.2;
      deltas.push({ leverId: "exchange_rate", leverName: exLever.name, absoluteChange: Math.max(5, current - 1), relativeChange: -1, unit: "MAD" });
      return { deltas, fiscalCost: 0 };
    },
  },
  {
    description: "Politique de souveraineté alimentaire",
    keywords: ["souveraineté alimentaire", "souverainete alimentaire", "autonomie alimentaire"],
    apply: (match, levers) => {
      const deltas: DecreeDelta[] = [];
      const agriLever = LEVER_BY_ID.get("agriculture_subsidies")!;
      const waterLever = LEVER_BY_ID.get("water_management_budget")!;
      deltas.push({ leverId: "agriculture_subsidies", leverName: agriLever.name, absoluteChange: (levers.agriculture_subsidies ?? 18) + 10, relativeChange: 10, unit: "Mrd MAD" });
      deltas.push({ leverId: "water_management_budget", leverName: waterLever.name, absoluteChange: (levers.water_management_budget ?? 8.5) + 3, relativeChange: 3, unit: "Mrd MAD" });
      return { deltas, fiscalCost: 13 };
    },
  },
  {
    description: "Réforme du marché du travail",
    keywords: ["marché du travail", "marche du travail", "code du travail", "flexibilité travail", "réforme travail", "reforme travail"],
    apply: (match, levers) => {
      const deltas: DecreeDelta[] = [];
      const smigLever = LEVER_BY_ID.get("minimum_wage")!;
      const retireLever = LEVER_BY_ID.get("retirement_age")!;
      const current = levers.minimum_wage ?? 3330;
      deltas.push({ leverId: "minimum_wage", leverName: smigLever.name, absoluteChange: Math.round(current * 0.95), relativeChange: -current * 0.05, unit: "MAD" });
      deltas.push({ leverId: "retirement_age", leverName: retireLever.name, absoluteChange: (levers.retirement_age ?? 62) + 1, relativeChange: 1, unit: "ans" });
      return { deltas, fiscalCost: 0 };
    },
  },
  {
    description: "Plan d'urgence climatique",
    keywords: ["urgence climatique", "plan climat", "adaptation climatique"],
    apply: (match, levers) => {
      const deltas: DecreeDelta[] = [];
      const reLever = LEVER_BY_ID.get("renewable_energy_share")!;
      const ctLever = LEVER_BY_ID.get("carbon_tax")!;
      const forestLever = LEVER_BY_ID.get("forest_protection_budget")!;
      deltas.push({ leverId: "renewable_energy_share", leverName: reLever.name, absoluteChange: Math.min(100, (levers.renewable_energy_share ?? 37) + 20), relativeChange: 20, unit: "%" });
      deltas.push({ leverId: "carbon_tax", leverName: ctLever.name, absoluteChange: (levers.carbon_tax ?? 50) + 300, relativeChange: 300, unit: "MAD/tonne" });
      deltas.push({ leverId: "forest_protection_budget", leverName: forestLever.name, absoluteChange: (levers.forest_protection_budget ?? 1.5) + 3, relativeChange: 3, unit: "Mrd MAD" });
      return { deltas, fiscalCost: 20 };
    },
  },
];

// ──────────────────────────────────────────────────────────────────────────
//  PARSING — tente de reconnaître un décret en langage naturel
// ──────────────────────────────────────────────────────────────────────────

export interface ParsedDecree {
  matched: boolean;
  pattern?: DecreePattern;
  match?: RegExpMatchArray;
  rawText: string;
}

export function parseDecree(text: string): ParsedDecree {
  const lower = text.toLowerCase().trim();
  const isPercent = /%/i.test(lower);
  const isDouble = /doubler/i.test(lower);
  const isTriple = /tripler/i.test(lower);
  const isRaise = /hausser|hausse|augmenter|augmentation|porter|investir|étendre|etendre|renforcer|lancer|instaurer|digitaliser|créer|creer|nationaliser|privatiser|ouvrir|ouverture|lutter|moderniser|modernisation/i.test(lower);
  const isLower = /baisser|baisse|r[ée]duire|r[ée]duction|couper|supprimer/i.test(lower);
  // Déclencheurs pour décrets composés (pas de nombre requis)
  const isCompound = /plan|r[ée]forme|politique|programme|strat[ée]gie|transition|stimulus|aust[ée]rit[ée]|rigueur|relance|nationalis|privatis|ouverture|souverainet[ée]|urgence|chantier|grand projet/i.test(lower);

  // Extraire tous les nombres du texte
  const allNumbers = lower.match(/\d+[.,]?\d*/g) || [];
  const firstNumber = allNumbers[0] || "0";

  // Les patterns composés (multi-leviers) sont essayés EN PREMIER car leurs
  // keywords peuvent matcher plusieurs patterns simples. On les distingue par
  // la présence d'un déclencheur composé (plan/réforme/politique...).
  if (isCompound) {
    for (const pattern of PATTERNS) {
      // Un pattern composé a un apply qui ignore match[1] (utilise les valeurs courantes)
      // On les identifie par leur description qui contient des mots-clés composés
      if (!/plan|r[ée]forme|transition|politique|programme|nationalis|privatis|ouverture|souverainet|urgence|chantier|lutte|modernis|grand projet|marché du travail/i.test(pattern.description)) continue;
      for (const kw of pattern.keywords) {
        if (!lower.includes(kw)) continue;
        const fakeMatch: RegExpMatchArray = [lower, "0", undefined, undefined] as any;
        return { matched: true, pattern, match: fakeMatch, rawText: text };
      }
    }
  }

  for (const pattern of PATTERNS) {
    for (const kw of pattern.keywords) {
      if (!lower.includes(kw)) continue;

      // 1. Pattern "doubler/tripler kw" — multiplie la valeur courante
      if (isDouble || isTriple) {
        const fakeMatch: RegExpMatchArray = [lower, firstNumber, undefined, undefined] as any;
        (fakeMatch as any).isDouble = isDouble;
        (fakeMatch as any).isTriple = isTriple;
        fakeMatch[2] = isRaise ? "hausser" : (isLower ? "baisser" : undefined);
        return { matched: true, pattern, match: fakeMatch, rawText: text };
      }

      // 2. Pattern "construire/recruter/créer N [unités] kw"
      const regexCount = new RegExp(
        `(?:construire|recruter|cr[ée]er|construisons)\\s+(\\d+[\\.,]?\\d*)\\s*(?:[a-zàâäéèêëïîôöùûüç]+\\s+){0,2}${kw}`,
        "i"
      );
      const mCount = lower.match(regexCount);
      if (mCount) {
        const fakeMatch: RegExpMatchArray = [lower, mCount[1], undefined, undefined] as any;
        return { matched: true, pattern, match: fakeMatch, rawText: text };
      }

      // 3. Pattern "verbe [le/la] kw (à|de) N" — capture le nombre APRÈS le keyword
      const regexTarget = new RegExp(
        `(?:porter|hausser|hausse|augmenter|augmentation|baisser|baisse|r[ée]duire|r[ée]duction|instaurer|renforcer|étendre|etendre|investir|digitaliser|r[ée]former)\\s+(?:le|la|l'|les|du|de la|de l'|au|à l')?\\s*(?:[a-zàâäéèêëïîôöùûüç]+\\s+){0,3}${kw}\\s+(?:à|a|de)?\\s*(\\d+[\\.,]?\\d*)`,
        "i"
      );
      const mTarget = lower.match(regexTarget);
      if (mTarget) {
        const fakeMatch: RegExpMatchArray = [lower, mTarget[1], undefined, undefined] as any;
        if (isRaise) fakeMatch[2] = "hausser";
        else if (isLower) fakeMatch[2] = "baisser";
        if (isPercent) (fakeMatch as any).isPercent = true;
        return { matched: true, pattern, match: fakeMatch, rawText: text };
      }

      // 4. Pattern "verbe N (points|%|Mrd) kw" — nombre AVANT le keyword
      const regexNumBefore = new RegExp(
        `(?:hausser|augmenter|baisser|r[ée]duire|investir|étendre|etendre|renforcer|instaurer|digitaliser)\\s+(\\d+[\\.,]?\\d*)\\s*(?:points?|%|mrd|mad|ans|/100)?\\s*(?:de|dans|en|sur|au|à)?\\s*(?:[a-zàâäéèêëïîôöùûüç]+\\s+){0,3}${kw}`,
        "i"
      );
      const mNumBefore = lower.match(regexNumBefore);
      if (mNumBefore) {
        const fakeMatch: RegExpMatchArray = [lower, mNumBefore[1], undefined, undefined] as any;
        if (isRaise) fakeMatch[2] = "hausser";
        else if (isLower) fakeMatch[2] = "baisser";
        if (isPercent) (fakeMatch as any).isPercent = true;
        return { matched: true, pattern, match: fakeMatch, rawText: text };
      }

      // 5. Fallback : keyword présent + verbe d'action, utiliser le premier nombre du texte
      if ((isRaise || isLower) && allNumbers.length > 0) {
        const fakeMatch: RegExpMatchArray = [lower, firstNumber, undefined, undefined] as any;
        if (isRaise) fakeMatch[2] = "hausser";
        else if (isLower) fakeMatch[2] = "baisser";
        if (isPercent) (fakeMatch as any).isPercent = true;
        return { matched: true, pattern, match: fakeMatch, rawText: text };
      }

      // 6. Fallback décrets composés : keyword présent + déclencheur composé (plan/réforme/politique...)
      //    Pas de nombre requis — les deltas sont calculés par le pattern lui-même.
      if (isCompound) {
        const fakeMatch: RegExpMatchArray = [lower, "0", undefined, undefined] as any;
        return { matched: true, pattern, match: fakeMatch, rawText: text };
      }
    }
  }
  return { matched: false, rawText: text };
}

// ──────────────────────────────────────────────────────────────────────────
//  EXÉCUTION — applique le décret, vérifie la faisabilité, projette les effets
// ──────────────────────────────────────────────────────────────────────────

export function executeDecree(
  text: string,
  currentLevers: Levers,
  currentDebt: number,
): DecreeResult {
  const parsed = parseDecree(text);

  if (!parsed.matched || !parsed.pattern || !parsed.match) {
    return {
      accepted: false,
      reason: "Décret non reconnu. Exemples : « Construire 10 hôpitaux », « Hausser la TVA de 2 points », « Porter le SMIG à 4000 », « Augmenter le budget santé de 2 % ».",
      deltas: [],
      immediateGdpImpact: 0,
      immediateBudgetImpact: 0,
      immediateDebtImpact: 0,
      projectedStabilityDelta: 0,
      fiscalCost: 0,
      summary: "Décret incompris.",
    };
  }

  const { deltas, fiscalCost } = parsed.pattern.apply(parsed.match, currentLevers);

  // Vérifier les bornes des leviers
  for (const d of deltas) {
    const lever = LEVER_BY_ID.get(d.leverId);
    if (!lever) continue;
    if (d.absoluteChange > lever.max) {
      return {
        accepted: false,
        reason: `Le levier « ${lever.name} » ne peut dépasser ${lever.max} ${lever.unit}.`,
        deltas,
        immediateGdpImpact: 0,
        immediateBudgetImpact: 0,
        immediateDebtImpact: 0,
        projectedStabilityDelta: 0,
        fiscalCost: 0,
        summary: "Décret refusé : dépassement de borne.",
      };
    }
    if (d.absoluteChange < lever.min) {
      return {
        accepted: false,
        reason: `Le levier « ${lever.name} » ne peut descendre sous ${lever.min} ${lever.unit}.`,
        deltas,
        immediateGdpImpact: 0,
        immediateBudgetImpact: 0,
        immediateDebtImpact: 0,
        projectedStabilityDelta: 0,
        fiscalCost: 0,
        summary: "Décret refusé : sous le minimum.",
      };
    }
  }

  // Appliquer les deltas pour calculer les effets immédiats
  const newLevers: Levers = { ...currentLevers };
  for (const d of deltas) {
    newLevers[d.leverId] = d.absoluteChange;
  }

  const oldGdp = computeGDP(currentLevers);
  const newGdp = computeGDP(newLevers);
  const oldSpending = computePublicSpending(currentLevers);
  const newSpending = computePublicSpending(newLevers);
  const oldRevenue = computeTaxRevenue(currentLevers);
  const newRevenue = computeTaxRevenue(newLevers);

  const immediateGdpImpact = newGdp - oldGdp;
  const immediateBudgetImpact = (newRevenue - oldRevenue) - (newSpending - oldSpending) - fiscalCost;
  const immediateDebtImpact = fiscalCost; // le coût est financé par la dette si déficit

  // Résumé
  const deltaDescriptions = deltas.map((d) => {
    const sign = d.relativeChange > 0 ? "+" : "";
    return `${d.leverName} ${sign}${d.relativeChange.toFixed(2)} ${d.unit}`;
  }).join(", ");

  const costDesc = fiscalCost > 0 ? ` Coût budgétaire : ${fiscalCost.toFixed(2)} Mrd MAD (ajouté à la dette).` : "";
  const summary = `Décret appliqué : ${deltaDescriptions}.${costDesc} Impact PIB : ${immediateGdpImpact > 0 ? "+" : ""}${immediateGdpImpact.toFixed(1)} Mrd MAD.`;

  return {
    accepted: true,
    deltas,
    immediateGdpImpact,
    immediateBudgetImpact,
    immediateDebtImpact: fiscalCost,
    projectedStabilityDelta: 0, // calculé par le moteur de propagation sur les ticks suivants
    fiscalCost,
    summary,
  };
}
