// =============================================================================
//  Normalization of raw World Bank values to [0,1] for the simulation engine.
//
//  Each indicator family has "safe bounds" — empirical ranges based on world
//  distribution of the indicator. Values are clamped to [0,1] afterwards.
//  Polarity is inferred from indicator semantics (inverted for "bad" things).
// =============================================================================

import type { Polarity } from "./sim-types";
import { INDICATOR_CATALOG } from "./worldbank";

// --- Bounds per indicator family --------------------------------------------
// Two strategies:
//   1. Explicit per-code bounds (most accurate, taken from world distributions).
//   2. Family-based fallback bounds keyed by indicator code prefix.

interface Bounds {
  low: number;      // raw value considered worst
  high: number;     // raw value considered best
  polarity: Polarity;  // direction of "good"
}

// Explicit per-code bounds (curated from world distributions, WB WDI).
// Polarity is the direction where "good" is — high = more is better,
// low = less is better, balanced = around midpoint.
const EXPLICIT_BOUNDS: Record<string, Bounds> = {
  // --- Économie ---
  "NY.GDP.MKTP.CD":     { low: 5e9,    high: 5e11,   polarity: "high" },
  "NY.GDP.MKTP.KD.ZG":  { low: -5,     high: 8,      polarity: "high" },
  "FP.CPI.TOTL.ZG":     { low: 20,     high: 0,      polarity: "low" },
  "SL.UEM.TOTL.ZS":     { low: 25,     high: 2,      polarity: "low" },
  "GC.DOD.TOTL.GD.ZS":  { low: 100,    high: 20,     polarity: "low" },
  "NE.RSB.GNFS.CD":     { low: -5e10,  high: 5e10,   polarity: "balanced" },
  "BX.KLT.DINV.CD.WD":  { low: 0,      high: 5e10,   polarity: "high" },
  "GC.REV.XGRT.GD.ZS":  { low: 10,     high: 40,     polarity: "high" },
  "NE.CON.TOTL.ZS":     { low: 50,     high: 75,     polarity: "balanced" },
  "NV.IND.TOTL.ZS":     { low: 10,     high: 35,     polarity: "balanced" },
  "TX.VAL.TECH.MF.ZS":  { low: 1,      high: 40,     polarity: "high" },
  "FR.INR.RINR":        { low: -5,     high: 10,     polarity: "balanced" },

  // --- Santé ---
  "SP.DYN.LE00.IN":     { low: 50,     high: 85,     polarity: "high" },
  "SP.DYN.IMRT.IN":     { low: 60,     high: 2,      polarity: "low" },
  "SH.MED.PHYS.ZS":     { low: 0.1,    high: 4,      polarity: "high" },
  "SH.MED.BEDS.ZS":     { low: 0.5,    high: 6,      polarity: "high" },
  "SH.IMM.IDPT":        { low: 60,     high: 99,     polarity: "high" },
  "SH.STA.MALN.ZS":     { low: 30,     high: 2,      polarity: "low" },
  "SH.XPD.CHEX.GD.ZS":  { low: 2,      high: 12,     polarity: "high" },
  "SH.STA.BASS.ZS":     { low: 50,     high: 100,    polarity: "high" },
  "SH.H2O.BASW.ZS":     { low: 50,     high: 100,    polarity: "high" },
  "SH.STA.AIRP.P5":     { low: 120,    high: 5,      polarity: "low" },
  "SP.DYN.TFRT.IN":     { low: 1.2,    high: 2.5,    polarity: "balanced" },

  // --- Éducation ---
  "SE.ADT.LITR.ZS":     { low: 40,     high: 99,     polarity: "high" },
  "SE.PRM.ENRR":        { low: 80,     high: 110,    polarity: "high" },
  "SE.SEC.ENRR":        { low: 40,     high: 100,    polarity: "high" },
  "SE.TER.ENRR":        { low: 5,      high: 60,     polarity: "high" },
  "SE.XPD.TOTL.GD.ZS":  { low: 2,      high: 8,      polarity: "high" },
  "GB.XPD.RSDV.GD.ZS":  { low: 0.2,    high: 3,      polarity: "high" },
  "SE.PRM.TCAQ.ZS":     { low: 50,     high: 100,    polarity: "high" },

  // --- Infrastructure ---
  "EG.ELC.ACCS.ZS":     { low: 70,     high: 100,    polarity: "high" },
  "EG.USE.ELEC.KH.PC":  { low: 200,    high: 6000,   polarity: "balanced" },
  "IT.CEL.SETS.P2":     { low: 50,     high: 150,    polarity: "high" },
  "IT.NET.USER.ZS":     { low: 30,     high: 95,     polarity: "high" },
  "IS.RRS.TOTL.KM":     { low: 500,    high: 30000,  polarity: "high" },
  "IS.SHP.GOOD.TU":     { low: 100_000,high: 5_000_000, polarity: "high" },
  "EG.ELC.RNEW.ZS":     { low: 5,      high: 60,     polarity: "high" },
  "EG.FEC.RNEW.ZS":     { low: 5,      high: 50,     polarity: "high" },

  // --- Démographie ---
  "SP.POP.TOTL":        { low: 1e6,    high: 5e7,    polarity: "balanced" },
  "SP.RUR.TOTL.ZS":     { low: 70,     high: 20,     polarity: "balanced" },
  "SP.URB.TOTL.IN.ZS":  { low: 30,     high: 80,     polarity: "balanced" },
  "SM.POP.NETM":        { low: -200_000, high: 200_000, polarity: "balanced" },
  "SP.POP.GROW":        { low: 0.3,    high: 2,      polarity: "balanced" },
  "SP.DYN.CDRT.IN":     { low: 10,     high: 3,      polarity: "low" },
  "SP.POP.65UP.TO.ZS":  { low: 4,      high: 20,     polarity: "balanced" },
  "SP.POP.0014.TO.ZS":  { low: 40,     high: 18,     polarity: "balanced" },

  // --- Gouvernance (percentile rank 0-100, higher = better) ---
  "VA.PER.RNK":         { low: 10,     high: 90,     polarity: "high" },
  "GE.PER.RNK":         { low: 10,     high: 90,     polarity: "high" },
  "RL.PER.RNK":         { low: 10,     high: 90,     polarity: "high" },
  "CC.PER.RNK":         { low: 10,     high: 90,     polarity: "high" },
  "PV.PER.RNK":         { low: 10,     high: 90,     polarity: "high" },
  "RQ.PER.RNK":         { low: 10,     high: 90,     polarity: "high" },

  // --- Environnement ---
  "EN.ATM.CO2E.KT":     { low: 100_000, high: 5_000, polarity: "low" },
  "EN.ATM.CO2E.PC":     { low: 8,      high: 0.5,    polarity: "low" },
  "AG.LND.FRST.ZS":     { low: 5,      high: 50,     polarity: "high" },
  "ER.H2O.FWTL.K3":     { low: 20,     high: 3,      polarity: "low" },
  "EN.ATM.PM25.MC.M3":  { low: 60,     high: 5,      polarity: "low" },

  // --- Social ---
  "SI.POV.GINI":        { low: 55,     high: 25,     polarity: "low" },
  "SI.POV.NAHC":        { low: 30,     high: 3,      polarity: "low" },
  "SH.STA.POIS.P5":     { low: 8,      high: 0.5,    polarity: "low" },
  "SL.TLF.CACT.FM.ZS":  { low: 30,     high: 95,     polarity: "high" },
  "IQ.CPA.PROT.XQ":     { low: 2,      high: 5,      polarity: "high" },
  "per_allsp.adq_pop_tot": { low: 10,  high: 80,     polarity: "high" },
};

// Keyword-based fallback polarity inference (when no explicit bound matches).
function inferPolarityFromKeywords(name: string, description: string): Polarity {
  const text = `${name} ${description}`.toLowerCase();
  // "Bad" things — less is better.
  const lowKeywords = [
    "mortalité", "chômage", "inflation", "dette", "pauvreté",
    "inégalité", "gini", "pollution", "co2", "pm2.5", "malnutrition",
    "retard de croissance", "migration", "déficit", "prélèvement",
  ];
  // "Good" things — more is better.
  const highKeywords = [
    "espérance de vie", "scolarisation", "alphabétisation", "vaccination",
    "accès", "renouvelable", "forêt", "forestière", "dépenses",
    "recettes", "qualité", "responsabilité", "voix", "état de droit",
    "ide", "exportations", "internet", "électricité", "lit", "médecin",
    "indicateur cpi", "couverture",
  ];
  if (lowKeywords.some((k) => text.includes(k))) return "low";
  if (highKeywords.some((k) => text.includes(k))) return "high";
  return "balanced";
}

// --- Public API -------------------------------------------------------------

export function normalizeValue(
  rawValue: number,
  _unit: string,
  indicatorCode: string
): { normalized: number; polarity: Polarity } {
  const entry = INDICATOR_CATALOG.find((c) => c.code === indicatorCode);
  const bounds = EXPLICIT_BOUNDS[indicatorCode];

  let polarity: Polarity;
  let lo: number, hi: number;

  if (bounds) {
    polarity = bounds.polarity;
    // Bounds.low is the "worst" raw value, bounds.high is "best".
    // For high polarity: lo < hi; for low polarity: lo > hi (reversed).
    // We just clamp(value - lo) / (hi - lo); polarity decides direction implicitly.
    lo = bounds.low;
    hi = bounds.high;
  } else if (entry) {
    polarity = entry.fallbackPolarity ?? inferPolarityFromKeywords(entry.nameFr, entry.description);
    // Conservative fallback: assume percentage-like range 0..100.
    lo = 0;
    hi = 100;
  } else {
    polarity = "balanced";
    lo = 0;
    hi = Math.max(rawValue * 2, 1);
  }

  // Guard against zero range.
  if (hi === lo) {
    return { normalized: 0.5, polarity };
  }

  let norm = (rawValue - lo) / (hi - lo);
  // For "low" polarity (less is better), invert.
  if (polarity === "low") norm = 1 - norm;
  // For "balanced" polarity, distance-from-midpoint is symmetric — but here
  // we treat the bounds as 0..1 around midpoint 0.5.
  // Clamp to [0,1].
  norm = Math.max(0, Math.min(1, norm));

  // Round to 4 decimals to keep DB clean.
  return { normalized: Math.round(norm * 1e4) / 1e4, polarity };
}

// Build a slug from an indicator code: last segment, lowercased, alphanum only.
export function slugFromIndicatorCode(code: string): string {
  const last = code.split(".").pop() ?? code;
  return last
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 32);
}

// Ensure uniqueness by appending a numeric suffix if needed.
export function ensureUniqueSlugs(codes: string[]): Map<string, string> {
  const used = new Set<string>();
  const result = new Map<string, string>();
  for (const code of codes) {
    const base = slugFromIndicatorCode(code);
    let slug = base || "var";
    let i = 2;
    while (used.has(slug)) {
      slug = `${base}${i++}`;
    }
    used.add(slug);
    result.set(code, slug);
  }
  return result;
}
