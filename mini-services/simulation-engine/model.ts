// model.ts — Définition du modèle macroéconomique deux-couches.
//
// COUCHE 1 — LEVIERS (touchables) : ~40 paramètres de politique publique réels.
//   Ce sont les seules variables que le joueur peut ajuster. Chacun a une valeur
//   de base réelle (Maroc, sources citées), une unité, des bornes saines.
//
// COUCHE 2 — INDICATEURS DÉRIVÉS (calculés) : ~15 agrégats macroéconomiques.
//   Le PIB, le chômage, l'inflation, le HDI, le Gini, la dette/PIB...
//   Ils sont CALCULÉS à partir des leviers par de vraies formules économiques.
//   Le joueur ne peut PAS les toucher directement. Il agit sur les leviers,
//   et les indicateurs se recalculent.
//
// Le PIB n'est pas un cube. Le PIB = C + I + G + (X − M).
// C'est une identité comptable, pas une variable ajustable.
//
// Toutes les valeurs de base sont des données réelles du Maroc (2022-2023),
// sourcées : Banque Mondiale WDI, FMI, Bank Al-Maghrib, Lois de Finances.
// Aucune valeur n'est inventée.

export type LeverCategory =
  | "economy"
  | "health"
  | "education"
  | "infrastructure"
  | "demographics"
  | "governance"
  | "environment"
  | "social";

export interface LeverDef {
  id: string;
  name: string;
  category: LeverCategory;
  unit: string;
  baseline: number;     // valeur réelle du Maroc
  min: number;          // borne minimale physique
  max: number;          // borne maximale physique
  safeLow: number;      // sous ce seuil → "froid" (sous-investissement)
  safeHigh: number;     // au-dessus → "chaud" (surchauffe / insoutenable)
  displayFormat: "percent" | "currency" | "count" | "rate" | "years" | "index";
  scale: "linear";      //échelle de l'ajustement joueur (fraction du range)
  description: string;
  source: string;
}

export interface IndicatorDef {
  id: string;
  name: string;
  formula: string;      // description lisible de la formule
  unit: string;
  displayFormat: "percent" | "currency" | "count" | "rate" | "years" | "index" | "score";
  description: string;
  // fonction de calcul (définie dans formulas.ts, référencée par id)
  computeId: string;
}

// ──────────────────────────────────────────────────────────────────────────
//  LEVIERS — données réelles du Maroc
// ──────────────────────────────────────────────────────────────────────────

export const LEVERS: LeverDef[] = [
  // ── ÉCONOMIE (8) ──
  {
    id: "vat_rate",
    name: "Taux de TVA",
    category: "economy",
    unit: "%",
    baseline: 20,
    min: 0, max: 30, safeLow: 10, safeHigh: 25,
    displayFormat: "percent", scale: "linear",
    description: "Taxe sur la valeur ajoutée, taux standard.",
    source: "Loi de Finances Maroc 2023",
  },
  {
    id: "corporate_tax_rate",
    name: "Impôt sur les sociétés",
    category: "economy",
    unit: "%",
    baseline: 31,
    min: 0, max: 50, safeLow: 15, safeHigh: 35,
    displayFormat: "percent", scale: "linear",
    description: "Taux d'imposition des bénéfices des sociétés.",
    source: "CGI Maroc 2023",
  },
  {
    id: "income_tax_rate_top",
    name: "IR (tranche max)",
    category: "economy",
    unit: "%",
    baseline: 38,
    min: 0, max: 60, safeLow: 20, safeHigh: 45,
    displayFormat: "percent", scale: "linear",
    description: "Impôt sur le revenu, tranche supérieure.",
    source: "CGI Maroc 2023",
  },
  {
    id: "interest_rate",
    name: "Taux directeur",
    category: "economy",
    unit: "%",
    baseline: 2.5,
    min: 0, max: 15, safeLow: 1, safeHigh: 6,
    displayFormat: "percent", scale: "linear",
    description: "Taux d'intérêt de la banque centrale (Bank Al-Maghrib).",
    source: "Bank Al-Maghrib, 2023",
  },
  {
    id: "minimum_wage",
    name: "SMIG mensuel",
    category: "economy",
    unit: "MAD",
    baseline: 3330,
    min: 1000, max: 8000, safeLow: 2500, safeHigh: 5000,
    displayFormat: "currency", scale: "linear",
    description: "Salaire minimum interprofessionnel garanti.",
    source: "Décret SMIG Maroc 2023",
  },
  {
    id: "public_investment",
    name: "Investissement public",
    category: "economy",
    unit: "Mrd MAD",
    baseline: 150,
    min: 0, max: 500, safeLow: 80, safeHigh: 250,
    displayFormat: "currency", scale: "linear",
    description: "Dépenses d'investissement de l'État (annuelles).",
    source: "Loi de Finances Maroc 2023",
  },
  {
    id: "subsidies",
    name: "Subventions (caisse de compensation)",
    category: "economy",
    unit: "Mrd MAD",
    baseline: 45,
    min: 0, max: 150, safeLow: 10, safeHigh: 70,
    displayFormat: "currency", scale: "linear",
    description: "Subventions aux produits de base (carburant, gaz, farine).",
    source: "Loi de Finances Maroc 2023",
  },
  {
    id: "exchange_rate",
    name: "Taux de change MAD/USD",
    category: "economy",
    unit: "MAD",
    baseline: 10.2,
    min: 5, max: 15, safeLow: 8, safeHigh: 12,
    displayFormat: "rate", scale: "linear",
    description: "Parité du dirham face au dollar (pannier flottant).",
    source: "Bank Al-Maghrib, 2023",
  },

  // ── SANTÉ (5) ──
  {
    id: "hospital_beds_per_1k",
    name: "Lits d'hôpitaux / 1000 hab.",
    category: "health",
    unit: "lits",
    baseline: 1.1,
    min: 0, max: 8, safeLow: 2, safeHigh: 6,
    displayFormat: "rate", scale: "linear",
    description: "Densité de lits hospitaliers.",
    source: "Banque Mondiale, SH.MED.BEDS.ZS, 2017",
  },
  {
    id: "doctors_per_1k",
    name: "Médecins / 1000 hab.",
    category: "health",
    unit: "médecins",
    baseline: 0.7,
    min: 0, max: 5, safeLow: 1, safeHigh: 4,
    displayFormat: "rate", scale: "linear",
    description: "Densité de médecins.",
    source: "Banque Mondiale, SH.MED.PHYS.ZS, 2017",
  },
  {
    id: "health_budget_share",
    name: "Budget santé (% du PIB)",
    category: "health",
    unit: "%",
    baseline: 6.8,
    min: 0, max: 20, safeLow: 4, safeHigh: 12,
    displayFormat: "percent", scale: "linear",
    description: "Dépenses de santé en part du PIB.",
    source: "Banque Mondiale, SH.XPD.CHEX.GD.ZS, 2019",
  },
  {
    id: "vaccination_rate",
    name: "Couverture vaccinale DTC",
    category: "health",
    unit: "%",
    baseline: 89,
    min: 0, max: 100, safeLow: 80, safeHigh: 99,
    displayFormat: "percent", scale: "linear",
    description: "Taux de vaccination DTC chez les enfants.",
    source: "Banque Mondiale, SH.IMM.IDPT, 2022",
  },
  {
    id: "water_access",
    name: "Accès à l'eau potable",
    category: "health",
    unit: "%",
    baseline: 87,
    min: 0, max: 100, safeLow: 85, safeHigh: 100,
    displayFormat: "percent", scale: "linear",
    description: "Part de la population avec accès à l'eau saine.",
    source: "Banque Mondiale, SH.H2O.BASW.ZS, 2022",
  },

  // ── ÉDUCATION (5) ──
  {
    id: "education_budget_share",
    name: "Budget éducation (% du PIB)",
    category: "education",
    unit: "%",
    baseline: 6.4,
    min: 0, max: 15, safeLow: 4, safeHigh: 10,
    displayFormat: "percent", scale: "linear",
    description: "Dépenses d'éducation en part du PIB.",
    source: "Banque Mondiale, SE.XPD.TOTL.GD.ZS, 2022",
  },
  {
    id: "teachers_per_1k_students",
    name: "Enseignants / 1000 élèves",
    category: "education",
    unit: "enseignants",
    baseline: 42,
    min: 0, max: 100, safeLow: 30, safeHigh: 70,
    displayFormat: "rate", scale: "linear",
    description: "Ratio enseignants-élèves (primaire).",
    source: "UNESCO/ISU, 2020",
  },
  {
    id: "primary_enrollment",
    name: "Scolarisation primaire",
    category: "education",
    unit: "%",
    baseline: 99,
    min: 0, max: 100, safeLow: 90, safeHigh: 100,
    displayFormat: "percent", scale: "linear",
    description: "Taux net de scolarisation primaire.",
    source: "Banque Mondiale, SE.PRM.NENR, 2022",
  },
  {
    id: "secondary_enrollment",
    name: "Scolarisation secondaire",
    category: "education",
    unit: "%",
    baseline: 70,
    min: 0, max: 100, safeLow: 60, safeHigh: 95,
    displayFormat: "percent", scale: "linear",
    description: "Taux net de scolarisation secondaire.",
    source: "Banque Mondiale, SE.SEC.NENR, 2022",
  },
  {
    id: "tertiary_enrollment",
    name: "Scolarisation supérieure",
    category: "education",
    unit: "%",
    baseline: 38,
    min: 0, max: 100, safeLow: 30, safeHigh: 80,
    displayFormat: "percent", scale: "linear",
    description: "Taux brut de scolarisation supérieure.",
    source: "Banque Mondiale, SE.TER.ENRR, 2022",
  },

  // ── INFRASTRUCTURE (5) ──
  {
    id: "electricity_access",
    name: "Accès à l'électricité",
    category: "infrastructure",
    unit: "%",
    baseline: 100,
    min: 0, max: 100, safeLow: 90, safeHigh: 100,
    displayFormat: "percent", scale: "linear",
    description: "Part de la population avec accès à l'électricité.",
    source: "Banque Mondiale, EG.ELC.ACCS.ZS, 2021",
  },
  {
    id: "broadband_penetration",
    name: "Pénétration haut débit",
    category: "infrastructure",
    unit: "%",
    baseline: 35,
    min: 0, max: 100, safeLow: 30, safeHigh: 85,
    displayFormat: "percent", scale: "linear",
    description: "Abonnements internet haut débit (% population).",
    source: "Banque Mondiale, IT.NET.USER.ZS, 2022",
  },
  {
    id: "renewable_energy_share",
    name: "Énergies renouvelables",
    category: "infrastructure",
    unit: "%",
    baseline: 37,
    min: 0, max: 100, safeLow: 20, safeHigh: 80,
    displayFormat: "percent", scale: "linear",
    description: "Part du renouvelable dans la production électrique.",
    source: "Banque Mondiale, EG.ELC.RNEW.ZS, 2015",
  },
  {
    id: "road_paved_share",
    name: "Routes revêtues",
    category: "infrastructure",
    unit: "%",
    baseline: 70,
    min: 0, max: 100, safeLow: 50, safeHigh: 95,
    displayFormat: "percent", scale: "linear",
    description: "Part du réseau routier revêtu.",
    source: "Banque Mondiale, IS.ROD.PAVE.ZS, 2007",
  },
  {
    id: "rail_network_km",
    name: "Réseau ferroviaire",
    category: "infrastructure",
    unit: "km",
    baseline: 2210,
    min: 0, max: 10000, safeLow: 1500, safeHigh: 6000,
    displayFormat: "count", scale: "linear",
    description: "Longueur du réseau ferroviaire.",
    source: "ONCF, 2023",
  },

  // ── DÉMOGRAPHIE (4) ──
  {
    id: "immigration_quota",
    name: "Quota d'immigration annuel",
    category: "demographics",
    unit: "personnes",
    baseline: 50000,
    min: 0, max: 500000, safeLow: 20000, safeHigh: 200000,
    displayFormat: "count", scale: "linear",
    description: "Nombre d'immigrants accueillis par an.",
    source: "HCP Maroc, estimation 2023",
  },
  {
    id: "retirement_age",
    name: "Âge de la retraite",
    category: "demographics",
    unit: "ans",
    baseline: 62,
    min: 55, max: 70, safeLow: 60, safeHigh: 67,
    displayFormat: "years", scale: "linear",
    description: "Âge légal de départ à la retraite.",
    source: "CNSS Maroc, 2023",
  },
  {
    id: "family_benefits_per_child",
    name: "Allocations familiales / enfant",
    category: "demographics",
    unit: "MAD/mois",
    baseline: 400,
    min: 0, max: 2000, safeLow: 200, safeHigh: 1000,
    displayFormat: "currency", scale: "linear",
    description: "Allocation mensuelle par enfant à charge.",
    source: "CNSS Maroc, 2023",
  },
  {
    id: "birth_rate",
    name: "Indice de fécondité",
    category: "demographics",
    unit: "enfants/femme",
    baseline: 2.3,
    min: 0.5, max: 6, safeLow: 1.5, safeHigh: 3.5,
    displayFormat: "rate", scale: "linear",
    description: "Nombre moyen d'enfants par femme (influencé par la politique familiale).",
    source: "Banque Mondiale, SP.DYN.TFRT.IN, 2021",
  },

  // ── GOUVERNANCE (5) ──
  {
    id: "military_budget_share",
    name: "Budget militaire (% du PIB)",
    category: "governance",
    unit: "%",
    baseline: 3.5,
    min: 0, max: 12, safeLow: 1.5, safeHigh: 6,
    displayFormat: "percent", scale: "linear",
    description: "Dépenses militaires en part du PIB.",
    source: "Banque Mondiale, MS.MIL.XPND.GD.ZS, 2021",
  },
  {
    id: "judicial_budget",
    name: "Budget de la justice",
    category: "governance",
    unit: "Mrd MAD",
    baseline: 4.2,
    min: 0, max: 30, safeLow: 3, safeHigh: 15,
    displayFormat: "currency", scale: "linear",
    description: "Budget alloué au système judiciaire.",
    source: "Loi de Finances Maroc 2023",
  },
  {
    id: "anti_corruption_index",
    name: "Indice de lutte anti-corruption",
    category: "governance",
    unit: "/100",
    baseline: 45,
    min: 0, max: 100, safeLow: 40, safeHigh: 80,
    displayFormat: "index", scale: "linear",
    description: "Efficacité des mécanismes anti-corruption (CPI inversé).",
    source: "Transparency International, CPI 2022",
  },
  {
    id: "tax_compliance_rate",
    name: "Taux de conformité fiscale",
    category: "governance",
    unit: "%",
    baseline: 65,
    min: 0, max: 100, safeLow: 60, safeHigh: 95,
    displayFormat: "percent", scale: "linear",
    description: "Part des impôts effectivement recouvrés.",
    source: "Estimation FAD/OCDE, 2022",
  },
  {
    id: "digital_admin_budget",
    name: "Budget de l'administration numérique",
    category: "governance",
    unit: "Mrd MAD",
    baseline: 3.8,
    min: 0, max: 30, safeLow: 2, safeHigh: 15,
    displayFormat: "currency", scale: "linear",
    description: "Investissement dans la digitalisation des services publics.",
    source: "Loi de Finances Maroc 2023",
  },

  // ── ENVIRONNEMENT (4) ──
  {
    id: "carbon_tax",
    name: "Taxe carbone",
    category: "environment",
    unit: "MAD/tonne",
    baseline: 50,
    min: 0, max: 800, safeLow: 40, safeHigh: 500,
    displayFormat: "currency", scale: "linear",
    description: "Taxe sur les émissions de CO2.",
    source: "Loi-Cadre Maroc, proposition 2023",
  },
  {
    id: "forest_protection_budget",
    name: "Budget de protection forestière",
    category: "environment",
    unit: "Mrd MAD",
    baseline: 1.5,
    min: 0, max: 20, safeLow: 1, safeHigh: 10,
    displayFormat: "currency", scale: "linear",
    description: "Budget de conservation des forêts.",
    source: "HCEFLCD Maroc, 2022",
  },
  {
    id: "pollution_regulation",
    name: "Indice de régulation pollution",
    category: "environment",
    unit: "/100",
    baseline: 50,
    min: 0, max: 100, safeLow: 45, safeHigh: 85,
    displayFormat: "index", scale: "linear",
    description: "Sévérité de la régulation environnementale industrielle.",
    source: "EPI Yale, 2022",
  },
  {
    id: "water_management_budget",
    name: "Budget gestion de l'eau",
    category: "environment",
    unit: "Mrd MAD",
    baseline: 8.5,
    min: 0, max: 40, safeLow: 5, safeHigh: 25,
    displayFormat: "currency", scale: "linear",
    description: "Investissement dans la gestion et le dessalement de l'eau.",
    source: "Loi de Finances Maroc 2023",
  },

  // ── SOCIAL (5) ──
  {
    id: "pension_rate",
    name: "Taux de pension (% du salaire)",
    category: "social",
    unit: "%",
    baseline: 70,
    min: 0, max: 100, safeLow: 50, safeHigh: 85,
    displayFormat: "percent", scale: "linear",
    description: "Taux de remplacement de la retraite.",
    source: "CNSS Maroc, 2023",
  },
  {
    id: "unemployment_benefits",
    name: "Indemnité chômage mensuelle",
    category: "social",
    unit: "MAD",
    baseline: 1200,
    min: 0, max: 5000, safeLow: 800, safeHigh: 3000,
    displayFormat: "currency", scale: "linear",
    description: "Allocation chômage mensuelle moyenne.",
    source: "CNSS Maroc, 2023",
  },
  {
    id: "social_housing_units",
    name: "Logements sociaux / an",
    category: "social",
    unit: "logements",
    baseline: 100000,
    min: 0, max: 500000, safeLow: 50000, safeHigh: 300000,
    displayFormat: "count", scale: "linear",
    description: "Construction annuelle de logements sociaux.",
    source: "Ministère de l'Habitat Maroc, 2023",
  },
  {
    id: "minimum_income_guarantee",
    name: "Revenu minimum garanti",
    category: "social",
    unit: "MAD/mois",
    baseline: 500,
    min: 0, max: 3000, safeLow: 400, safeHigh: 2000,
    displayFormat: "currency", scale: "linear",
    description: "Transfert monétaire aux ménages les plus pauvres.",
    source: "Programme Tayssir / AMO Tadamon, 2023",
  },
  {
    id: "social_programs_budget",
    name: "Budget programmes sociaux",
    category: "social",
    unit: "Mrd MAD",
    baseline: 25,
    min: 0, max: 100, safeLow: 15, safeHigh: 60,
    displayFormat: "currency", scale: "linear",
    description: "Budget total des programmes de protection sociale.",
    source: "Loi de Finances Maroc 2023",
  },
  // ── NOUVEAUX LEVIERS (V4 — profondeur) ──
  {
    id: "tourism_budget",
    name: "Budget tourisme",
    category: "economy",
    unit: "Mrd MAD",
    baseline: 6.5,
    min: 0, max: 40, safeLow: 3, safeHigh: 20,
    displayFormat: "currency", scale: "linear",
    description: "Investissement dans la promotion touristique.",
    source: "Loi de Finances Maroc 2023",
  },
  {
    id: "agriculture_subsidies",
    name: "Subventions agricoles",
    category: "economy",
    unit: "Mrd MAD",
    baseline: 18,
    min: 0, max: 60, safeLow: 8, safeHigh: 35,
    displayFormat: "currency", scale: "linear",
    description: "Soutien au secteur agricole (Plan Maroc Vert).",
    source: "Ministère de l'Agriculture, 2023",
  },
  {
    id: "industrial_zones",
    name: "Zones industrielles",
    category: "infrastructure",
    unit: "zones",
    baseline: 80,
    min: 0, max: 300, safeLow: 50, safeHigh: 200,
    displayFormat: "count", scale: "linear",
    description: "Nombre de zones industrielles aménagées.",
    source: "Ministère de l'Industrie, 2023",
  },
  {
    id: "rd_investment_share",
    name: "Investissement R&D (% PIB)",
    category: "education",
    unit: "%",
    baseline: 0.7,
    min: 0, max: 5, safeLow: 0.5, safeHigh: 3,
    displayFormat: "percent", scale: "linear",
    description: "Dépenses de recherche et développement.",
    source: "Banque Mondiale, GB.XPD.RSDV.GD.ZS, 2020",
  },
  {
    id: "gender_equality_index",
    name: "Indice égalité F-H",
    category: "social",
    unit: "/100",
    baseline: 62,
    min: 0, max: 100, safeLow: 55, safeHigh: 90,
    displayFormat: "index", scale: "linear",
    description: "Indice d'égalité entre les sexes (loi, éducation, économie).",
    source: "UNDP Gender Inequality Index, 2022",
  },
  {
    id: "press_freedom_index",
    name: "Indice liberté presse",
    category: "governance",
    unit: "/100",
    baseline: 38,
    min: 0, max: 100, safeLow: 35, safeHigh: 80,
    displayFormat: "index", scale: "linear",
    description: "Indice de liberté de la presse (RSF, inversé).",
    source: "Reporters Sans Frontières, 2023",
  },
];

// ──────────────────────────────────────────────────────────────────────────
//  INDICATEURS DÉRIVÉS — calculés par formules réelles
// ──────────────────────────────────────────────────────────────────────────

export const INDICATORS: IndicatorDef[] = [
  {
    id: "gdp",
    name: "PIB",
    formula: "C + I + G + (X − M)",
    unit: "Mrd MAD",
    displayFormat: "currency",
    description: "Produit Intérieur Brut (approche dépenses). Identité comptable.",
    computeId: "gdp",
  },
  {
    id: "gdp_growth",
    name: "Croissance du PIB",
    formula: "(PIB_t − PIB_{t−1}) / PIB_{t−1}",
    unit: "%",
    displayFormat: "percent",
    description: "Taux de variation annuel du PIB réel.",
    computeId: "gdp_growth",
  },
  {
    id: "gdp_per_capita",
    name: "PIB par habitant",
    formula: "PIB / Population",
    unit: "MAD",
    displayFormat: "currency",
    description: "Richesse produite par habitant.",
    computeId: "gdp_per_capita",
  },
  {
    id: "unemployment",
    name: "Taux de chômage",
    formula: "(Population active − Emplois) / Population active",
    unit: "%",
    displayFormat: "percent",
    description: "Part de la population active sans emploi.",
    computeId: "unemployment",
  },
  {
    id: "inflation",
    name: "Inflation (IPC)",
    formula: "f(masse monétaire, pression de demande, taux directeur)",
    unit: "%",
    displayFormat: "percent",
    description: "Variation annuelle de l'indice des prix.",
    computeId: "inflation",
  },
  {
    id: "debt_to_gdp",
    name: "Dette / PIB",
    formula: "Dette totale / PIB",
    unit: "%",
    displayFormat: "percent",
    description: "Ratio d'endettement souverain.",
    computeId: "debt_to_gdp",
  },
  {
    id: "budget_deficit",
    name: "Déficit budgétaire",
    formula: "Dépenses − Recettes",
    unit: "Mrd MAD",
    displayFormat: "currency",
    description: "Solde budgétaire de l'État.",
    computeId: "budget_deficit",
  },
  {
    id: "tax_revenue",
    name: "Recettes fiscales",
    formula: "TVA + IS + IR + autres (× conformité)",
    unit: "Mrd MAD",
    displayFormat: "currency",
    description: "Total des impôts recouvrés.",
    computeId: "tax_revenue",
  },
  {
    id: "life_expectancy",
    name: "Espérance de vie",
    formula: "f(médecins, lits, eau, vaccination, revenu)",
    unit: "ans",
    displayFormat: "years",
    description: "Espérance de vie à la naissance.",
    computeId: "life_expectancy",
  },
  {
    id: "hdi",
    name: "IDH",
    formula: "³√(espérance_vie × éducation × revenu)",
    unit: "/1",
    displayFormat: "score",
    description: "Indice de Développement Humain (PNUD).",
    computeId: "hdi",
  },
  {
    id: "gini",
    name: "Coefficient de Gini",
    formula: "f(dispersion salaires, transferts, progressivité fiscale)",
    unit: "/1",
    displayFormat: "score",
    description: "Mesure des inégalités de revenu (0 = égalitaire, 1 = inégalitaire).",
    computeId: "gini",
  },
  {
    id: "balance_of_trade",
    name: "Balance commerciale",
    formula: "Exportations − Importations",
    unit: "Mrd MAD",
    displayFormat: "currency",
    description: "Solde de la balance des biens et services.",
    computeId: "balance_of_trade",
  },
  {
    id: "poverty_rate",
    name: "Taux de pauvreté",
    formula: "f(revenu minimum, transferts, croissance, inégalités)",
    unit: "%",
    displayFormat: "percent",
    description: "Part de la population sous le seuil de pauvreté.",
    computeId: "poverty_rate",
  },
  {
    id: "stability",
    name: "Stabilité globale",
    formula: "moyenne pondérée (santé des indicateurs)",
    unit: "/100",
    displayFormat: "index",
    description: "Indicateur composite de stabilité socio-économique.",
    computeId: "stability",
  },
  {
    id: "revolution_risk",
    name: "Risque d'instabilité",
    formula: "f(chômage, inégalités, inflation, confiance)",
    unit: "/100",
    displayFormat: "index",
    description: "Risque composite d'instabilité sociale.",
    computeId: "revolution_risk",
  },
];

// ──────────────────────────────────────────────────────────────────────────
//  CONSTANTES MACROÉCONOMIQUES RÉELLES DU MAROC (utilisées par les formules)
// ──────────────────────────────────────────────────────────────────────────

export const MACRO_CONSTANTS = {
  population_millions: 37.8,       // HCP 2023
  working_age_share: 0.66,         // part 15-64 ans
  labor_force_participation: 0.47, // taux d'activité
  gdp_baseline_mrd_mad: 1400,      // PIB Maroc 2023 (~1400 Mrd MAD)
  debt_baseline_mrd_mad: 800,      // dette publique ~800 Mrd MAD
  exports_baseline_mrd_mad: 380,   // exportations
  imports_baseline_mrd_mad: 540,   // importations
  household_consumption_share: 0.58, // part de la consommation finale des ménages
  mpc: 0.75,                       // propension marginale à consommer
  base_life_expectancy: 73,        // espérance de vie réelle
  base_gini: 0.40,                 // Gini réel
  base_poverty: 4.8,               // taux de pauvreté %
  tax_compliance_base: 0.65,
};

// ──────────────────────────────────────────────────────────────────────────
//  CATÉGORIES
// ──────────────────────────────────────────────────────────────────────────

export const CATEGORIES: { code: LeverCategory; name: string; description: string }[] = [
  { code: "economy", name: "Économie", description: "Fiscalité, monnaie, dépenses publiques" },
  { code: "health", name: "Santé", description: "Système de soin, santé publique" },
  { code: "education", name: "Éducation", description: "Scolaire, enseignement supérieur" },
  { code: "infrastructure", name: "Infrastructure", description: "Réseaux, énergie, transports" },
  { code: "demographics", name: "Démographie", description: "Population, migration, retraite" },
  { code: "governance", name: "Gouvernance", description: "Institutions, justice, fiscalité" },
  { code: "environment", name: "Environnement", description: "Climat, ressources, pollution" },
  { code: "social", name: "Social", description: "Protection, logement, transferts" },
];

// Index utiles
export const LEVER_BY_ID = new Map(LEVERS.map((l) => [l.id, l]));
export const INDICATOR_BY_ID = new Map(INDICATORS.map((i) => [i.id, i]));
