// formulas.ts — La calculatrice économique.
//
// Ces fonctions implémentent de VRAIES formules économiques qui dérivent les
// indicateurs macroéconomiques à partir des leviers de politique publique.
// Ce ne sont pas des heuristiques — ce sont des identités comptables (PIB) et
// des modèles économétriques standard (Okun, Phillips, HDI).
//
// Le joueur ne peut PAS toucher ces valeurs. Il ajuste les leviers, et ces
// fonctions recalculent les indicateurs en temps réel.

import { LEVER_BY_ID, MACRO_CONSTANTS } from "./model.js";

export type Levers = Record<string, number>; // leverId → valeur courante

// Helper pour lire un levier
function L(levers: Levers, id: string): number {
  return levers[id] ?? LEVER_BY_ID.get(id)?.baseline ?? 0;
}

// ──────────────────────────────────────────────────────────────────────────
//  RECETTES FISCALES
//  TVA + IS + IR × taux de conformité fiscale
// ──────────────────────────────────────────────────────────────────────────

export function computeTaxRevenue(levers: Levers): number {
  const gdp = computeGDP(levers); // Mrd MAD
  const vatRate = L(levers, "vat_rate") / 100;
  const corpTaxRate = L(levers, "corporate_tax_rate") / 100;
  const incomeTaxRate = L(levers, "income_tax_rate_top") / 100;
  const compliance = L(levers, "tax_compliance_rate") / 100;

  // Bases imposables (parts du PIB)
  const consumptionBase = gdp * MACRO_CONSTANTS.household_consumption_share;
  const corporateProfitsBase = gdp * 0.22; // ~22% du PIB = profits des sociétés
  const wagesBase = gdp * 0.36;            // ~36% du PIB = masse salariale

  // Recettes brutes (Mrd MAD)
  const vatRevenue = consumptionBase * vatRate;
  const corpRevenue = corporateProfitsBase * corpTaxRate;
  const incomeRevenue = wagesBase * incomeTaxRate;

  // Autres recettes (droits de douane, taxes locales, recettes non fiscales,
  // monopoles). ~9% du PIB au Maroc (recettes non fiscales + douanes + taxes locales).
  const otherRevenue = gdp * 0.09;

  const gross = vatRevenue + corpRevenue + incomeRevenue + otherRevenue;
  return gross * compliance;
}

// ──────────────────────────────────────────────────────────────────────────
//  PIB — approche par les dépenses : PIB = C + I + G + (X − M)
//  Identité comptable. C, I, G, X, M sont des fonctions des leviers.
// ──────────────────────────────────────────────────────────────────────────

export function computeGDP(levers: Levers): number {
  const baseline = MACRO_CONSTANTS.gdp_baseline_mrd_mad;

  // C — Consommation des ménages
  // = f(revenu disponible) ; revenu disponible = salaires + transferts − impôts
  const minimumWage = L(levers, "minimum_wage");
  const popMillions = MACRO_CONSTANTS.population_millions;
  const workforceMillions = popMillions * MACRO_CONSTANTS.working_age_share * MACRO_CONSTANTS.labor_force_participation;
  const avgWageMonthly = minimumWage * 2.1; // salaire moyen ≈ 2.1× SMIG
  const annualWages = avgWageMonthly * 12 * workforceMillions * 1e-3 / 1e3; // Mrd MAD
  const transfers = (L(levers, "unemployment_benefits") + L(levers, "minimum_income_guarantee") + L(levers, "family_benefits_per_child")) * popMillions * 1e6 * 12 / 1e9;
  const vatBurden = annualWages * (L(levers, "vat_rate") / 100) * 0.6;
  const incomeTaxBurden = annualWages * (L(levers, "income_tax_rate_top") / 100) * 0.35; // effet progressif moyen
  const disposableIncome = annualWages + transfers - vatBurden - incomeTaxBurden;
  const C = disposableIncome * MACRO_CONSTANTS.mpc;

  // I — Investissement privé
  // = f(taux d'intérêt, profits, climat) ; inverse au taux d'intérêt
  const interestRate = L(levers, "interest_rate");
  const corpTaxRate = L(levers, "corporate_tax_rate");
  const baseInvestment = baseline * 0.27; // ~27% du PIB = investissement
  const interestDampening = Math.max(0.4, 1 - (interestRate - 2.5) * 0.08);
  const taxDampening = Math.max(0.5, 1 - (corpTaxRate - 30) * 0.015);
  const I = baseInvestment * interestDampening * taxDampening;

  // G — Dépenses publiques (somme des budgets)
  const G = computePublicSpending(levers);

  // X — Exportations
  // = f(compétitivité, change) ; un MAD faible aide les exportations
  const exchangeRate = L(levers, "exchange_rate");
  const competitiveness = 1 + (10.2 - exchangeRate) * 0.04; // MAD faible = + compétitif
  const X = MACRO_CONSTANTS.exports_baseline_mrd_mad * Math.max(0.7, Math.min(1.3, competitiveness));

  // M — Importations
  // = f(demande intérieure, change) ; un MAD fort augmente les importations
  const importDemand = (C + I + G) / (baseline * 1.15);
  const importRate = Math.max(0.6, Math.min(1.4, importDemand));
  const M = MACRO_CONSTANTS.imports_baseline_mrd_mad * importRate;

  return C + I + G + (X - M);
}

// ──────────────────────────────────────────────────────────────────────────
//  DÉPENSES PUBLIQUES G — somme de tous les budgets de l'État
// ──────────────────────────────────────────────────────────────────────────

export function computePublicSpending(levers: Levers): number {
  const gdp = MACRO_CONSTANTS.gdp_baseline_mrd_mad; // référence pour les budgets en % du PIB

  // Les budgets sectoriels en % du PIB (santé, édu, militaire) incluent DÉJÀ
  // la masse salariale de ces secteurs. On ne l'ajoute pas séparément.
  const healthBudget = (L(levers, "health_budget_share") / 100) * gdp;
  const eduBudget = (L(levers, "education_budget_share") / 100) * gdp;
  const militaryBudget = (L(levers, "military_budget_share") / 100) * gdp;

  // Investissement public (déjà en Mrd MAD, n'inclut pas les salaires ci-dessus)
  const publicInvestment = L(levers, "public_investment");
  const subsidies = L(levers, "subsidies");

  // Budgets de fonctionnement spécifiques (justice, digital, forêts, eau, social)
  // Ces budgets incluent leurs propres salaires — pas de double-comptage.
  const judicialBudget = L(levers, "judicial_budget");
  const digitalBudget = L(levers, "digital_admin_budget");
  const forestBudget = L(levers, "forest_protection_budget");
  const waterBudget = L(levers, "water_management_budget");
  const socialBudget = L(levers, "social_programs_budget");

  // Service de la dette (~3.5% du PIB au Maroc, sur la dette courante)
  const debtService = gdp * 0.035;

  // Les budgets sectoriels en % du PIB (santé 6.8% = 95, édu 6.4% = 90, militaire 3.5% = 49)
  // couvrent déjà la masse salariale de ces secteurs. L'investissement public
  // (215 Mrd) et les budgets de fonctionnement ci-dessus complètent.
  // Total cible au baseline : ~570 Mrd (~40% du PIB), déficit ~5%.
  return (
    healthBudget + eduBudget + militaryBudget + publicInvestment + subsidies +
    judicialBudget + digitalBudget + forestBudget + waterBudget + socialBudget +
    debtService
  );
}

// ──────────────────────────────────────────────────────────────────────────
//  DÉFICIT BUDGÉTAIRE = Dépenses − Recettes
// ──────────────────────────────────────────────────────────────────────────

export function computeBudgetDeficit(levers: Levers): number {
  return computePublicSpending(levers) - computeTaxRevenue(levers);
}

// ──────────────────────────────────────────────────────────────────────────
//  DETTE / PIB — accumule le déficit au fil du temps (simplifié : baseline + déficit)
// ──────────────────────────────────────────────────────────────────────────

export function computeDebtToGDP(levers: Levers, accumulatedDebt?: number): number {
  const gdp = computeGDP(levers);
  const debt = accumulatedDebt ?? MACRO_CONSTANTS.debt_baseline_mrd_mad;
  return (debt / gdp) * 100;
}

// ──────────────────────────────────────────────────────────────────────────
//  CHÔMAGE — Loi d'Okun : croissance ↑ ⇒ chômage ↓
//  chômage = chômage_naturel − k × (croissance − croissance_potentielle)
// ──────────────────────────────────────────────────────────────────────────

export function computeUnemployment(levers: Levers, gdpGrowth: number): number {
  const naturalUnemployment = 9.5; // chômage structurel Maroc
  const potentialGrowth = 4.0;     // croissance potentielle
  const okunCoefficient = 0.5;     // 1 pt de croissance au-dessus du potentiel = -0.5 pt de chômage

  // Effet du salaire minimum sur l'emploi (élasticité)
  const minimumWage = L(levers, "minimum_wage");
  const wageGap = (minimumWage - 3330) / 3330;
  const wageEffect = wageGap * 0.4; // +10% SMIG → +4% chômage (effet différé, simplifié ici)

  const cyclical = -okunCoefficient * (gdpGrowth - potentialGrowth);
  return Math.max(2, Math.min(35, naturalUnemployment + cyclical + wageEffect));
}

// ──────────────────────────────────────────────────────────────────────────
//  INFLATION — équation de Phillips + pression de demande
//  inflation = inflation_naturelle + pression_demande − effet_taux_directeur
// ──────────────────────────────────────────────────────────────────────────

export function computeInflation(levers: Levers, gdpGrowth: number): number {
  const naturalInflation = 2.0;
  const potentialGrowth = 4.0;
  const demandPressure = (gdpGrowth - potentialGrowth) * 0.6; // surchauffe si croissance > potentiel

  // Effet du taux directeur (politique monétaire)
  const interestRate = L(levers, "interest_rate");
  const monetaryEffect = -(interestRate - 2.5) * 0.5;

  // Effet des subventions (subventions ↓ ⇒ inflation ↑)
  const subsidies = L(levers, "subsidies");
  const subsidyEffect = -(subsidies - 45) * 0.05;

  // Effet du change (MAD faible ⇒ importations coûteuses ⇒ inflation)
  const exchangeRate = L(levers, "exchange_rate");
  const exchangeEffect = (exchangeRate - 10.2) * 0.3;

  // Effet TVA
  const vatEffect = (L(levers, "vat_rate") - 20) * 0.15;

  return Math.max(-2, Math.min(25, naturalInflation + demandPressure + monetaryEffect + subsidyEffect + exchangeEffect + vatEffect));
}

// ──────────────────────────────────────────────────────────────────────────
//  ESPÉRANCE DE VIE — fonction de production de santé
//  f(médecins, lits, eau, vaccination, revenu, pollution)
// ──────────────────────────────────────────────────────────────────────────

export function computeLifeExpectancy(levers: Levers): number {
  const base = MACRO_CONSTANTS.base_life_expectancy;
  const doctors = L(levers, "doctors_per_1k");
  const beds = L(levers, "hospital_beds_per_1k");
  const water = L(levers, "water_access");
  const vacc = L(levers, "vaccination_rate");
  const pollution = L(levers, "pollution_regulation");

  // Contributions (chacune bornée)
  const doctorEffect = Math.min(3, (doctors - 0.7) * 3);
  const bedEffect = Math.min(3, (beds - 1.1) * 2);
  const waterEffect = (water - 87) * 0.05;
  const vaccEffect = (vacc - 89) * 0.03;
  const pollutionEffect = (pollution - 50) * 0.02;

  return Math.max(55, Math.min(90, base + doctorEffect + bedEffect + waterEffect + vaccEffect + pollutionEffect));
}

// ──────────────────────────────────────────────────────────────────────────
//  IDH — Indice de Développement Humain (formule PNUD)
//  IDH = ³√(I_vie × I_éducation × I_revenu)
// ──────────────────────────────────────────────────────────────────────────

export function computeHDI(levers: Levers): number {
  // Indice de vie
  const lifeExp = computeLifeExpectancy(levers);
  const lifeIndex = (lifeExp - 20) / (85 - 20);

  // Indice d'éducation = (Moyenne(scolarisation, attendue)) — simplifié
  const primary = L(levers, "primary_enrollment") / 100;
  const secondary = L(levers, "secondary_enrollment") / 100;
  const tertiary = L(levers, "tertiary_enrollment") / 100;
  const eduIndex = (primary * 0.4 + secondary * 0.35 + tertiary * 0.25);

  // Indice de revenu = ln(revenu par tête) normalisé
  const gdp = computeGDP(levers);
  const gdpPerCapita = gdp * 1e9 / (MACRO_CONSTANTS.population_millions * 1e6); // MAD/hab
  const gniPpp = gdpPerCapita * 0.22; // approximation PPP en USD
  const incomeIndex = Math.max(0, Math.min(1, (Math.log(Math.max(100, gniPpp)) - Math.log(100)) / (Math.log(75000) - Math.log(100))));

  return Math.cbrt(Math.max(0, lifeIndex * eduIndex * incomeIndex));
}

// ──────────────────────────────────────────────────────────────────────────
//  GINI — inégalités de revenu
//  f(dispersion salariale, transferts, progressivité fiscale, chômage)
// ──────────────────────────────────────────────────────────────────────────

export function computeGini(levers: Levers, unemployment: number): number {
  const base = MACRO_CONSTANTS.base_gini;

  // SMIG élevé réduit les inégalités (effet redistributif)
  const minWage = L(levers, "minimum_wage");
  const wageEffect = -(minWage - 3330) / 3330 * 0.05;

  // Transferts sociaux réduisent le Gini
  const socialBudget = L(levers, "social_programs_budget");
  const transferEffect = -(socialBudget - 25) * 0.003;

  // Progressivité fiscale
  const topRate = L(levers, "income_tax_rate_top");
  const progressivityEffect = -(topRate - 38) * 0.002;

  // Chômage augmente les inégalités
  const unemploymentEffect = (unemployment - 9.5) * 0.008;

  // Corruption augmente les inégalités
  const corruption = L(levers, "anti_corruption_index");
  const corruptionEffect = -(corruption - 45) * 0.001;

  return Math.max(0.2, Math.min(0.7, base + wageEffect + transferEffect + progressivityEffect + unemploymentEffect + corruptionEffect));
}

// ──────────────────────────────────────────────────────────────────────────
//  BALANCE COMMERCIALE = X − M
// ──────────────────────────────────────────────────────────────────────────

export function computeBalanceOfTrade(levers: Levers): number {
  const gdp = computeGDP(levers);
  const baseline = MACRO_CONSTANTS.gdp_baseline_mrd_mad;
  const exchangeRate = L(levers, "exchange_rate");
  const competitiveness = Math.max(0.7, Math.min(1.3, 1 + (10.2 - exchangeRate) * 0.04));
  const X = MACRO_CONSTANTS.exports_baseline_mrd_mad * competitiveness;
  const importDemand = (computeGDP(levers) * 0.9 + computePublicSpending(levers)) / (baseline * 1.15);
  const importRate = Math.max(0.6, Math.min(1.4, importDemand));
  const M = MACRO_CONSTANTS.imports_baseline_mrd_mad * importRate;
  return X - M;
}

// ──────────────────────────────────────────────────────────────────────────
//  PAUVRETÉ — fonction de revenu, transferts, inégalités
// ──────────────────────────────────────────────────────────────────────────

export function computePovertyRate(levers: Levers, gini: number, unemployment: number): number {
  const base = MACRO_CONSTANTS.base_poverty;
  const minIncome = L(levers, "minimum_income_guarantee");
  const socialBudget = L(levers, "social_programs_budget");
  const housing = L(levers, "social_housing_units");

  const transferEffect = -(minIncome - 500) / 500 * 1.2;
  const budgetEffect = -(socialBudget - 25) * 0.08;
  const housingEffect = -(housing - 100000) / 100000 * 0.5;
  const inequalityEffect = (gini - 0.40) * 20;
  const unemploymentEffect = (unemployment - 9.5) * 0.3;

  return Math.max(0.5, Math.min(40, base + transferEffect + budgetEffect + housingEffect + inequalityEffect + unemploymentEffect));
}

// ──────────────────────────────────────────────────────────────────────────
//  STABILITÉ GLOBALE — composite [0,100]
// ──────────────────────────────────────────────────────────────────────────

export function computeStability(
  unemployment: number,
  inflation: number,
  debtToGdp: number,
  lifeExp: number,
  hdi: number,
  gini: number,
  poverty: number,
): number {
  // Normaliser chaque indicateur en [0,1] (1 = sain)
  const uHealth = Math.max(0, 1 - (unemployment - 5) / 20);      // 5% = sain, 25% = nul
  const iHealth = Math.max(0, 1 - Math.abs(inflation - 2) / 15);  // 2% = sain
  const dHealth = Math.max(0, 1 - (debtToGdp - 40) / 80);         // 40% = sain, 120% = nul
  const lHealth = Math.max(0, (lifeExp - 55) / 35);               // 55-90
  const hHealth = hdi;                                              // 0-1
  const gHealth = Math.max(0, 1 - (gini - 0.25) / 0.45);          // 0.25 = sain
  const pHealth = Math.max(0, 1 - poverty / 25);                  // 0% = sain

  const stability = (uHealth * 0.18 + iHealth * 0.12 + dHealth * 0.15 + lHealth * 0.12 + hHealth * 0.15 + gHealth * 0.15 + pHealth * 0.13) * 100;
  return Math.max(0, Math.min(100, stability));
}

// ──────────────────────────────────────────────────────────────────────────
//  RISQUE D'INSTABILITÉ — composite [0,100]
// ──────────────────────────────────────────────────────────────────────────

export function computeRevolutionRisk(
  unemployment: number,
  inflation: number,
  gini: number,
  poverty: number,
  stability: number,
): number {
  const uRisk = Math.max(0, (unemployment - 5) / 20) * 30;
  const iRisk = Math.max(0, Math.abs(inflation - 2) / 15) * 15;
  const gRisk = Math.max(0, (gini - 0.25) / 0.45) * 20;
  const pRisk = Math.max(0, poverty / 25) * 15;
  const sRisk = Math.max(0, (60 - stability) / 60) * 20;
  return Math.max(0, Math.min(100, uRisk + iRisk + gRisk + pRisk + sRisk));
}

// ──────────────────────────────────────────────────────────────────────────
//  CALCUL COMPLET — exécute toutes les formules et retourne tous les indicateurs
// ──────────────────────────────────────────────────────────────────────────

export interface ComputedIndicators {
  gdp: number;
  gdp_growth: number;
  gdp_per_capita: number;
  unemployment: number;
  inflation: number;
  debt_to_gdp: number;
  budget_deficit: number;
  tax_revenue: number;
  life_expectancy: number;
  hdi: number;
  gini: number;
  balance_of_trade: number;
  poverty_rate: number;
  stability: number;
  revolution_risk: number;
  public_spending: number;
}

export function computeAllIndicators(
  levers: Levers,
  prevGdp: number,
  accumulatedDebt: number,
): ComputedIndicators {
  const gdp = computeGDP(levers);
  const gdpGrowth = prevGdp > 0 ? ((gdp - prevGdp) / prevGdp) * 100 : 0;
  const gdpPerCapita = (gdp * 1e9) / (MACRO_CONSTANTS.population_millions * 1e6);
  const unemployment = computeUnemployment(levers, gdpGrowth);
  const inflation = computeInflation(levers, gdpGrowth);
  const debtToGdp = (accumulatedDebt / gdp) * 100;
  const budgetDeficit = computeBudgetDeficit(levers);
  const taxRevenue = computeTaxRevenue(levers);
  const lifeExp = computeLifeExpectancy(levers);
  const hdi = computeHDI(levers);
  const gini = computeGini(levers, unemployment);
  const balanceOfTrade = computeBalanceOfTrade(levers);
  const poverty = computePovertyRate(levers, gini, unemployment);
  const stability = computeStability(unemployment, inflation, debtToGdp, lifeExp, hdi, gini, poverty);
  const revolutionRisk = computeRevolutionRisk(unemployment, inflation, gini, poverty, stability);
  const publicSpending = computePublicSpending(levers);

  return {
    gdp,
    gdp_growth: gdpGrowth,
    gdp_per_capita: gdpPerCapita,
    unemployment,
    inflation,
    debt_to_gdp: debtToGdp,
    budget_deficit: budgetDeficit,
    tax_revenue: taxRevenue,
    life_expectancy: lifeExp,
    hdi,
    gini,
    balance_of_trade: balanceOfTrade,
    poverty_rate: poverty,
    stability,
    revolution_risk: revolutionRisk,
    public_spending: publicSpending,
  };
}

// ──────────────────────────────────────────────────────────────────────────
//  PROPAGATION CAUSALE — comment un changement de levier affecte d'autres leviers
//  (pas les indicateurs — ceux-ci sont recalculés instantanément par les formules)
//  Ces arêtes décrivent les effets DIFFÉRÉS entre leviers.
// ──────────────────────────────────────────────────────────────────────────

export interface CausalEdge {
  source: string;
  target: string;
  coefficient: number; // ∂(target)/∂(source) normalisé
  delayTicks: number;
  rationale: string;
}

export const CAUSAL_EDGES: CausalEdge[] = [
  // Taux d'intérêt
  { source: "interest_rate", target: "public_investment", coefficient: -0.15, delayTicks: 8, rationale: "Taux élevé → emprunt public coûteux → investissement réduit." },
  { source: "interest_rate", target: "broadband_penetration", coefficient: -0.05, delayTicks: 12, rationale: "Taux élevé → investissement privé en infra réduit." },
  // SMIG
  { source: "minimum_wage", target: "social_programs_budget", coefficient: 0.10, delayTicks: 6, rationale: "SMIG élevé → coût du travail ↑ → pression sur les programmes." },
  // Budgets santé
  { source: "health_budget_share", target: "hospital_beds_per_1k", coefficient: 0.20, delayTicks: 12, rationale: "Budget santé ↑ → construction d'équipements (délai)." },
  { source: "health_budget_share", target: "doctors_per_1k", coefficient: 0.15, delayTicks: 24, rationale: "Budget ↑ → formation/recrutement médical (long délai)." },
  // Budgets éducation
  { source: "education_budget_share", target: "teachers_per_1k_students", coefficient: 0.18, delayTicks: 8, rationale: "Budget édu ↑ → recrutement d'enseignants." },
  { source: "education_budget_share", target: "primary_enrollment", coefficient: 0.05, delayTicks: 4, rationale: "Budget ↑ → accès élargi." },
  { source: "education_budget_share", target: "tertiary_enrollment", coefficient: 0.10, delayTicks: 16, rationale: "Budget ↑ → capacités universitaires (long délai)." },
  // Renouvelables
  { source: "renewable_energy_share", target: "pollution_regulation", coefficient: 0.05, delayTicks: 12, rationale: "Transition verte → normes plus strictes." },
  { source: "carbon_tax", target: "renewable_energy_share", coefficient: 0.15, delayTicks: 16, rationale: "Taxe carbone ↑ → incitation au renouvelable." },
  // Anti-corruption
  { source: "anti_corruption_index", target: "tax_compliance_rate", coefficient: 0.20, delayTicks: 10, rationale: "Lutte anti-corruption ↑ → confiance fiscale ↑." },
  { source: "judicial_budget", target: "anti_corruption_index", coefficient: 0.10, delayTicks: 12, rationale: "Justice renforcée → effet anti-corruption." },
  // Digital
  { source: "digital_admin_budget", target: "tax_compliance_rate", coefficient: 0.08, delayTicks: 14, rationale: "Digitalisation → fraude plus difficile." },
  { source: "digital_admin_budget", target: "broadband_penetration", coefficient: 0.12, delayTicks: 10, rationale: "Investissement numérique ↑ → accès haut débit." },
  // Subventions
  { source: "subsidies", target: "renewable_energy_share", coefficient: -0.08, delayTicks: 18, rationale: "Subventions aux carburants fossiles freinent la transition." },
  // Politique familiale
  { source: "family_benefits_per_child", target: "birth_rate", coefficient: 0.10, delayTicks: 20, rationale: "Allocations ↑ → incitation à la natalité (délai long)." },
  // Eau
  { source: "water_management_budget", target: "water_access", coefficient: 0.12, delayTicks: 10, rationale: "Investissement eau ↑ → accès élargi." },
  { source: "water_management_budget", target: "forest_protection_budget", coefficient: 0.05, delayTicks: 8, rationale: "Gestion de l'eau et forêts liées." },
  // Retraite
  { source: "retirement_age", target: "social_programs_budget", coefficient: -0.10, delayTicks: 6, rationale: "Âge de retraite ↑ → économies sur les pensions." },
  // Logement social
  { source: "social_housing_units", target: "minimum_income_guarantee", coefficient: 0.03, delayTicks: 12, rationale: "Logement social → effet sur le revenu disponible des plus pauvres." },
  // Pollution
  { source: "pollution_regulation", target: "renewable_energy_share", coefficient: 0.08, delayTicks: 16, rationale: "Normes strictes → poussée vers le propre." },
  // ── NOUVELLES ARÊTES V4 ──
  // Tourisme
  { source: "tourism_budget", target: "road_paved_share", coefficient: 0.06, delayTicks: 10, rationale: "Tourisme ↑ → infrastructures routières améliorées." },
  { source: "tourism_budget", target: "broadband_penetration", coefficient: 0.05, delayTicks: 8, rationale: "Tourisme ↑ → numérique développé." },
  // Agriculture
  { source: "agriculture_subsidies", target: "water_management_budget", coefficient: 0.12, delayTicks: 8, rationale: "Agriculture consommatrice d'eau → pression sur la gestion." },
  { source: "agriculture_subsidies", target: "forest_protection_budget", coefficient: -0.08, delayTicks: 12, rationale: "Expansion agricole → déforestation." },
  // Zones industrielles
  { source: "industrial_zones", target: "road_paved_share", coefficient: 0.10, delayTicks: 8, rationale: "Zones industrielles → routes d'accès." },
  { source: "industrial_zones", target: "pollution_regulation", coefficient: -0.10, delayTicks: 10, rationale: "Industrie → pression pour assouplir les normes." },
  { source: "industrial_zones", target: "broadband_penetration", coefficient: 0.08, delayTicks: 6, rationale: "Zones industrielles → connectivité." },
  // R&D
  { source: "rd_investment_share", target: "tertiary_enrollment", coefficient: 0.12, delayTicks: 20, rationale: "R&D ↑ → attractivité de l'enseignement supérieur." },
  { source: "rd_investment_share", target: "renewable_energy_share", coefficient: 0.10, delayTicks: 24, rationale: "R&D → innovation verte." },
  { source: "rd_investment_share", target: "industrial_zones", coefficient: 0.08, delayTicks: 18, rationale: "R&D → attractivité industrielle." },
  // Égalité F-H
  { source: "gender_equality_index", target: "tertiary_enrollment", coefficient: 0.10, delayTicks: 12, rationale: "Égalité ↑ → scolarisation supérieure des femmes." },
  { source: "gender_equality_index", target: "minimum_wage", coefficient: 0.08, delayTicks: 10, rationale: "Égalité économique → pression à la hausse des salaires." },
  // Liberté presse
  { source: "press_freedom_index", target: "anti_corruption_index", coefficient: 0.15, delayTicks: 8, rationale: "Presse libre → dénonciation de la corruption." },
  { source: "press_freedom_index", target: "tax_compliance_rate", coefficient: 0.08, delayTicks: 12, rationale: "Transparence → confiance fiscale." },
  // Presse ↔ Justice
  { source: "judicial_budget", target: "press_freedom_index", coefficient: 0.10, delayTicks: 10, rationale: "Justice indépendante → protection des journalistes." },
];

export const OUTGOING: Map<string, CausalEdge[]> = (() => {
  const m = new Map<string, CausalEdge[]>();
  for (const e of CAUSAL_EDGES) {
    if (!m.has(e.source)) m.set(e.source, []);
    m.get(e.source)!.push(e);
  }
  return m;
})();

export const INCOMING: Map<string, CausalEdge[]> = (() => {
  const m = new Map<string, CausalEdge[]>();
  for (const e of CAUSAL_EDGES) {
    if (!m.has(e.target)) m.set(e.target, []);
    m.get(e.target)!.push(e);
  }
  return m;
})();
