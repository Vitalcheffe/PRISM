// =============================================================================
//  World Bank Open Data API client
//  Real economic indicators — fetched at runtime, never hardcoded.
//  Source: https://api.worldbank.org/v2  (no API key needed, public, 5k req/h/IP)
// =============================================================================

import type { Polarity } from "./sim-types";

// --- Curated catalog: WHICH real World Bank indicators we care about. -------
// Each entry references a real WB indicator code (publicly documented).
// The VALUES are fetched at runtime from the WB API — nothing here is invented.
// `nameFr` / `description` are human curation of the WB indicator semantics,
// used for the LLM prompt and for the Variable.description column.

export interface CatalogEntry {
  code: string;          // real WB indicator code, ex. "NY.GDP.MKTP.CD"
  categoryCode: string;  // one of: economy|health|education|infra|demography|governance|environment|social
  nameFr: string;        // short French name
  description: string;   // short description (what the indicator measures)
  fallbackPolarity?: Polarity;  // hint for fallback if LLM fails
}

export const CATEGORY_DEFS: {
  code: string;
  name: string;
  description: string;
}[] = [
  { code: "economy",     name: "Économie",      description: "PIB, croissance, emploi, finances publiques, commerce extérieur" },
  { code: "health",      name: "Santé",         description: "Espérance de vie, mortalité, accès aux soins, maladies" },
  { code: "education",   name: "Éducation",     description: "Alphabétisation, scolarisation, dépenses, R&D" },
  { code: "infra",       name: "Infrastructure",description: "Énergie, eau, télécom, transport" },
  { code: "demography",  name: "Démographie",   description: "Population, urbanisation, migration, vieillissement" },
  { code: "governance",  name: "Gouvernance",   description: "Indices WGI : voix, stabilité, efficacité, qualité réglementaire, État de droit, corruption" },
  { code: "environment", name: "Environnement", description: "Émissions, énergies renouvelables, eau, pollution" },
  { code: "social",      name: "Social",        description: "Inégalités, pauvreté, protection sociale, genre" },
];

// 8 categories × ~7-8 indicators each ≈ 60 curated real WB indicators.
// Codes are valid WB WDI indicator identifiers (verified against the public API).
export const INDICATOR_CATALOG: CatalogEntry[] = [
  // --- Économie (12) ---
  { code: "NY.GDP.MKTP.CD",      categoryCode: "economy", nameFr: "PIB (US$ courants)",
    description: "Produit intérieur brut en dollars courants", fallbackPolarity: "high" },
  { code: "NY.GDP.MKTP.KD.ZG",   categoryCode: "economy", nameFr: "Croissance du PIB",
    description: "Taux de croissance annuel du PIB réel (%)", fallbackPolarity: "high" },
  { code: "FP.CPI.TOTL.ZG",      categoryCode: "economy", nameFr: "Inflation (IPC)",
    description: "Variation annuelle de l'indice des prix à la consommation (%)", fallbackPolarity: "low" },
  { code: "SL.UEM.TOTL.ZS",      categoryCode: "economy", nameFr: "Chômage total",
    description: "Part de la population active sans emploi (% du total)", fallbackPolarity: "low" },
  { code: "GC.DOD.TOTL.GD.ZS",   categoryCode: "economy", nameFr: "Dette publique",
    description: "Dette brute de l'État (% du PIB)", fallbackPolarity: "low" },
  { code: "NE.RSB.GNFS.CD",      categoryCode: "economy", nameFr: "Solde commercial biens&services",
    description: "Solde net des exportations moins importations (US$ courants)", fallbackPolarity: "balanced" },
  { code: "BX.KLT.DINV.CD.WD",   categoryCode: "economy", nameFr: "IDE entrants",
    description: "Investissement direct étranger net entrant (US$ courants)", fallbackPolarity: "high" },
  { code: "GC.REV.XGRT.GD.ZS",   categoryCode: "economy", nameFr: "Recettes publiques",
    description: "Recettes totales de l'État hors dons (% du PIB)", fallbackPolarity: "high" },
  { code: "NE.CON.TOTL.ZS",      categoryCode: "economy", nameFr: "Consommation finale",
    description: "Consommation finale totale (% du PIB)", fallbackPolarity: "balanced" },
  { code: "NV.IND.TOTL.ZS",      categoryCode: "economy", nameFr: "Part de l'industrie",
    description: "Valeur ajoutée de l'industrie (% du PIB)", fallbackPolarity: "balanced" },
  { code: "TX.VAL.TECH.MF.ZS",   categoryCode: "economy", nameFr: "Exportations haute technologie",
    description: "Part des produits high-tech dans les exportations manufacturières (%)", fallbackPolarity: "high" },
  { code: "FR.INR.RINR",         categoryCode: "economy", nameFr: "Taux d'intérêt réel",
    description: "Taux d'intérêt réel ajusté de l'inflation (%)", fallbackPolarity: "balanced" },

  // --- Santé (11) ---
  { code: "SP.DYN.LE00.IN",      categoryCode: "health", nameFr: "Espérance de vie",
    description: "Espérance de vie à la naissance (années)", fallbackPolarity: "high" },
  { code: "SP.DYN.IMRT.IN",      categoryCode: "health", nameFr: "Mortalité infantile",
    description: "Mortalité avant 1 an pour 1000 naissances", fallbackPolarity: "low" },
  { code: "SH.MED.PHYS.ZS",      categoryCode: "health", nameFr: "Densité médicale",
    description: "Médecins pour 1000 habitants", fallbackPolarity: "high" },
  { code: "SH.MED.BEDS.ZS",      categoryCode: "health", nameFr: "Lits d'hôpital",
    description: "Lits d'hôpital pour 1000 habitants", fallbackPolarity: "high" },
  { code: "SH.IMM.IDPT",         categoryCode: "health", nameFr: "Vaccination DTC",
    description: "Taux de vaccination DTC3 chez les enfants 12-23 mois (%)", fallbackPolarity: "high" },
  { code: "SH.STA.MALN.ZS",      categoryCode: "health", nameFr: "Retard de croissance",
    description: "Prévalence du retard de croissance enfant (% < 5 ans)", fallbackPolarity: "low" },
  { code: "SH.XPD.CHEX.GD.ZS",   categoryCode: "health", nameFr: "Dépenses santé",
    description: "Dépenses courantes de santé (% du PIB)", fallbackPolarity: "high" },
  { code: "SH.STA.BASS.ZS",      categoryCode: "health", nameFr: "Assainissement de base",
    description: "Population utilisant au moins un service d'assainissement de base (%)", fallbackPolarity: "high" },
  { code: "SH.H2O.BASW.ZS",      categoryCode: "health", nameFr: "Eau potable de base",
    description: "Population utilisant au moins un service d'eau potable de base (%)", fallbackPolarity: "high" },
  { code: "SH.STA.AIRP.P5",      categoryCode: "health", nameFr: "Mortalité pollution air",
    description: "Mortalité attribuée à la pollution de l'air (pour 100k)", fallbackPolarity: "low" },
  { code: "SP.DYN.TFRT.IN",      categoryCode: "health", nameFr: "Indice de fécondité",
    description: "Nombre de naissances par femme", fallbackPolarity: "balanced" },

  // --- Éducation (7) ---
  { code: "SE.ADT.LITR.ZS",      categoryCode: "education", nameFr: "Alphabétisation adultes",
    description: "Taux d'alphabétisation des 15+ (%)", fallbackPolarity: "high" },
  { code: "SE.PRM.ENRR",         categoryCode: "education", nameFr: "Scolarisation primaire",
    description: "Taux brut de scolarisation au primaire (%)", fallbackPolarity: "high" },
  { code: "SE.SEC.ENRR",         categoryCode: "education", nameFr: "Scolarisation secondaire",
    description: "Taux brut de scolarisation au secondaire (%)", fallbackPolarity: "high" },
  { code: "SE.TER.ENRR",         categoryCode: "education", nameFr: "Scolarisation tertiaire",
    description: "Taux brut de scolarisation au tertiaire (%)", fallbackPolarity: "high" },
  { code: "SE.XPD.TOTL.GD.ZS",   categoryCode: "education", nameFr: "Dépenses éducation",
    description: "Dépenses publiques d'éducation (% du PIB)", fallbackPolarity: "high" },
  { code: "GB.XPD.RSDV.GD.ZS",   categoryCode: "education", nameFr: "Dépenses R&D",
    description: "Dépenses de recherche et développement (% du PIB)", fallbackPolarity: "high" },
  { code: "SE.PRM.TCAQ.ZS",      categoryCode: "education", nameFr: "Qualité enseignants primaire",
    description: "Enseignants du primaire avec qualifications minimales (%)", fallbackPolarity: "high" },

  // --- Infrastructure (8) ---
  { code: "EG.ELC.ACCS.ZS",      categoryCode: "infra", nameFr: "Accès électricité",
    description: "Population ayant accès à l'électricité (%)", fallbackPolarity: "high" },
  { code: "EG.USE.ELEC.KH.PC",   categoryCode: "infra", nameFr: "Consommation électrique",
    description: "Consommation d'électricité par habitant (kWh)", fallbackPolarity: "balanced" },
  { code: "IT.CEL.SETS.P2",      categoryCode: "infra", nameFr: "Abonnements mobile",
    description: "Abonnements téléphonie mobile pour 100 habitants", fallbackPolarity: "high" },
  { code: "IT.NET.USER.ZS",      categoryCode: "infra", nameFr: "Utilisateurs Internet",
    description: "Population utilisant Internet (%)", fallbackPolarity: "high" },
  { code: "IS.RRS.TOTL.KM",      categoryCode: "infra", nameFr: "Réseau ferroviaire",
    description: "Longueur totale du réseau ferré (km)", fallbackPolarity: "high" },
  { code: "IS.SHP.GOOD.TU",      categoryCode: "infra", nameFr: "Transport portuaire",
    description: "Trafic de conteneurs (TEU)", fallbackPolarity: "high" },
  { code: "EG.ELC.RNEW.ZS",      categoryCode: "infra", nameFr: "Part énergies renouvelables",
    description: "Production d'électricité renouvelable (% du total)", fallbackPolarity: "high" },
  { code: "EG.FEC.RNEW.ZS",      categoryCode: "infra", nameFr: "Renouvelables énergie finale",
    description: "Part des renouvelables dans la consommation d'énergie finale (%)", fallbackPolarity: "high" },

  // --- Démographie (8) ---
  { code: "SP.POP.TOTL",         categoryCode: "demography", nameFr: "Population totale",
    description: "Population totale du pays", fallbackPolarity: "balanced" },
  { code: "SP.RUR.TOTL.ZS",      categoryCode: "demography", nameFr: "Population rurale",
    description: "Part de la population rurale (%)", fallbackPolarity: "balanced" },
  { code: "SP.URB.TOTL.IN.ZS",   categoryCode: "demography", nameFr: "Population urbaine",
    description: "Part de la population urbaine (%)", fallbackPolarity: "balanced" },
  { code: "SM.POP.NETM",         categoryCode: "demography", nameFr: "Migration nette",
    description: "Solde migratoire net (nombre de personnes)", fallbackPolarity: "balanced" },
  { code: "SP.POP.GROW",         categoryCode: "demography", nameFr: "Croissance démographique",
    description: "Taux de croissance démographique annuel (%)", fallbackPolarity: "balanced" },
  { code: "SP.DYN.CDRT.IN",      categoryCode: "demography", nameFr: "Taux de mortalité",
    description: "Taux de mortalité brut (pour 1000)", fallbackPolarity: "low" },
  { code: "SP.POP.65UP.TO.ZS",   categoryCode: "demography", nameFr: "Part des 65+",
    description: "Population de 65 ans et plus (% du total)", fallbackPolarity: "balanced" },
  { code: "SP.POP.0014.TO.ZS",   categoryCode: "demography", nameFr: "Part des 0-14 ans",
    description: "Population de 0 à 14 ans (% du total)", fallbackPolarity: "balanced" },

  // --- Gouvernance (6 — percentile rank versions) ---
  { code: "VA.PER.RNK",          categoryCode: "governance", nameFr: "Voix & responsabilité",
    description: "Indice WGI voix et responsabilité (rang percentile 0-100)", fallbackPolarity: "high" },
  { code: "GE.PER.RNK",          categoryCode: "governance", nameFr: "Efficacité gouvernement",
    description: "Indice WGI efficacité du gouvernement (rang percentile 0-100)", fallbackPolarity: "high" },
  { code: "RL.PER.RNK",          categoryCode: "governance", nameFr: "État de droit",
    description: "Indice WGI État de droit (rang percentile 0-100)", fallbackPolarity: "high" },
  { code: "CC.PER.RNK",          categoryCode: "governance", nameFr: "Contrôle corruption",
    description: "Indice WGI contrôle de la corruption (rang percentile 0-100)", fallbackPolarity: "high" },
  { code: "PV.PER.RNK",          categoryCode: "governance", nameFr: "Stabilité politique",
    description: "Indice WGI stabilité politique absence violence (rang percentile 0-100)", fallbackPolarity: "high" },
  { code: "RQ.PER.RNK",          categoryCode: "governance", nameFr: "Qualité réglementaire",
    description: "Indice WGI qualité réglementaire (rang percentile 0-100)", fallbackPolarity: "high" },

  // --- Environnement (6) ---
  { code: "EN.ATM.CO2E.KT",      categoryCode: "environment", nameFr: "Émissions CO2 totales",
    description: "Émissions de CO2 dues à la combustion (kilotonnes)", fallbackPolarity: "low" },
  { code: "EN.ATM.CO2E.PC",      categoryCode: "environment", nameFr: "CO2 par habitant",
    description: "Émissions de CO2 par habitant (tonnes métriques)", fallbackPolarity: "low" },
  { code: "AG.LND.FRST.ZS",      categoryCode: "environment", nameFr: "Couverture forestière",
    description: "Part du territoire couvert de forêts (%)", fallbackPolarity: "high" },
  { code: "ER.H2O.FWTL.K3",      categoryCode: "environment", nameFr: "Prélèvements eau douce",
    description: "Prélèvements d'eau douce totaux (milliards m³)", fallbackPolarity: "low" },
  { code: "EN.ATM.PM25.MC.M3",   categoryCode: "environment", nameFr: "PM2.5 air",
    description: "Concentration moyenne de PM2.5 (µg/m³)", fallbackPolarity: "low" },

  // --- Social (6) ---
  { code: "SI.POV.GINI",         categoryCode: "social", nameFr: "Indice de Gini",
    description: "Indice de Gini (0 = égalitaire, 100 = inégalitaire)", fallbackPolarity: "low" },
  { code: "SI.POV.NAHC",         categoryCode: "social", nameFr: "Pauvreté nationale",
    description: "Taux de pauvreté au seuil national (%)", fallbackPolarity: "low" },
  { code: "SH.STA.POIS.P5",      categoryCode: "social", nameFr: "Mortalité empoisonnement",
    description: "Mortalité par empoisonnement involontaire (pour 100k)", fallbackPolarity: "low" },
  { code: "SL.TLF.CACT.FM.ZS",   categoryCode: "social", nameFr: "Parité activité femmes/hommes",
    description: "Ratio activité femmes/hommes 15+ (%)", fallbackPolarity: "high" },
  { code: "IQ.CPA.PROT.XQ",      categoryCode: "social", nameFr: "Protection sociale (CPIA)",
    description: "Indice CPIA d'équité des politiques sociales et de genre (1-6)", fallbackPolarity: "high" },
  { code: "per_allsp.adq_pop_tot", categoryCode: "social", nameFr: "Couverture sociale",
    description: "Couverture des transferts sociaux (effectifs / population totale, %)", fallbackPolarity: "high" },
];

// --- Types ------------------------------------------------------------------

export interface WBDatum {
  indicatorCode: string;
  indicatorName: string;     // original WB English name
  nameFr: string;             // curated French name
  description: string;
  categoryCode: string;
  country: string;
  countryCode: string;
  value: number;
  unit: string;               // WB unit observation (often "")
  year: number;               // year of value (most recent available)
  sourceUrl: string;
}

// --- HTTP fetch with one retry ----------------------------------------------

const WB_BASE = "https://api.worldbank.org/v2";

async function wbGet<T>(url: string, attempt = 1): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      // No-cache so each generation sees fresh data.
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      if (attempt < 2) return wbGet<T>(url, attempt + 1);
      console.warn(`[worldbank] HTTP ${res.status} for ${url}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    if (attempt < 2) return wbGet<T>(url, attempt + 1);
    console.warn(`[worldbank] fetch error for ${url}:`, (err as Error).message);
    return null;
  }
}

type WBResponse =
  | [null, WBRecord[]]
  | [{ message: { id: number; value: string }[] }, null];

interface WBRecord {
  indicator?: { id: string; value: string };
  country?: { id: string; value: string };
  countryiso3code?: string;
  date?: string;
  value?: number | null;
  unit?: string | null;
  obs_status?: string | null;
}

// --- Single indicator fetch -------------------------------------------------

export async function fetchIndicator(
  countryCode: string,
  indicatorCode: string
): Promise<WBDatum | null> {
  const catalogEntry = INDICATOR_CATALOG.find((c) => c.code === indicatorCode);
  if (!catalogEntry) {
    console.warn(`[worldbank] unknown indicator code in catalog: ${indicatorCode}`);
    return null;
  }

  // date=2018:2023 → 6 years of history, per_page=10 → safety margin.
  const url = `${WB_BASE}/country/${encodeURIComponent(countryCode)}/indicator/${encodeURIComponent(
    indicatorCode
  )}?format=json&date=2018:2023&per_page=10`;

  const data = await wbGet<WBResponse>(url);
  if (!data) return null;

  // WB API returns [metadata, records] OR [error, null].
  if (!Array.isArray(data) || data.length < 2) return null;
  const records = data[1];
  if (!records || !Array.isArray(records) || records.length === 0) return null;

  // Find the most recent record with a non-null value.
  // The API already sorts by date desc, but we sort defensively.
  const sorted = [...records].sort((a, b) => {
    const da = parseInt(a.date ?? "0", 10);
    const db = parseInt(b.date ?? "0", 10);
    return db - da;
  });

  const latest = sorted.find(
    (r) => r.value !== null && r.value !== undefined && !Number.isNaN(r.value)
  );
  if (!latest) return null;

  const value = Number(latest.value);
  if (!Number.isFinite(value)) return null;

  const year = parseInt(latest.date ?? "0", 10);
  const indicatorName = latest.indicator?.value ?? catalogEntry.nameFr;
  const country = latest.country?.value ?? countryCode;
  const sourceUrl = `https://data.worldbank.org/indicator/${encodeURIComponent(indicatorCode)}?locations=${encodeURIComponent(countryCode)}`;

  return {
    indicatorCode,
    indicatorName,
    nameFr: catalogEntry.nameFr,
    description: catalogEntry.description,
    categoryCode: catalogEntry.categoryCode,
    country,
    countryCode,
    value,
    unit: latest.unit ?? "",
    year,
    sourceUrl,
  };
}

// --- Batch fetch with concurrency limit -------------------------------------

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function fetchIndicators(countryCode: string): Promise<WBDatum[]> {
  const codes = INDICATOR_CATALOG.map((c) => c.code);
  const results = await mapWithConcurrency(codes, 8, (code) =>
    fetchIndicator(countryCode, code)
  );
  // Filter out nulls (unavailable indicators).
  return results.filter((r): r is WBDatum => r !== null);
}
