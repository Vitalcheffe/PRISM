// =============================================================================
//  LLM analysis: from raw WB indicators → variable metadata + causal edges +
//  regime archetypes. Uses z-ai-web-dev-sdk (server-side only).
//
//  Robustness:
//   - The LLM may return malformed JSON. We extract the JSON block, parse
//     defensively, validate structure, drop invalid items.
//   - To get enough edges (80-150), we call the LLM in 3 rounds focused on
//     different category-pair clusters, then merge.
//   - If the LLM fails entirely, fall back to a minimal analysis (polarity
//     inferred from keywords, weight=0.5, no edges). The system still
//     produces a model.
// =============================================================================

import type { Polarity } from "./sim-types";
import type { WBDatum, CatalogEntry } from "./worldbank";
import { INDICATOR_CATALOG, CATEGORY_DEFS } from "./worldbank";
import { normalizeValue, ensureUniqueSlugs, slugFromIndicatorCode } from "./normalize";

// --- Output types (used by generate.ts) -------------------------------------

export interface AnalyzedVariable {
  indicatorCode: string;
  slug: string;
  name: string;       // French name
  categoryCode: string;
  description: string;
  rawValue: number;
  rawUnit: string;
  rawYear: number;
  normalizedValue: number;
  polarity: Polarity;
  weight: number;     // ∈ [0,1]
  rationale: string;
  sourceName: string;
  sourceUrl: string;
}

export interface AnalyzedEdge {
  source: string;     // indicator code
  target: string;     // indicator code
  sign: "positive" | "negative";
  magnitude: number;  // ∈ [0,1]
  delayYears: number;
  confidence: number; // ∈ [0,1]
  rationale: string;
}

export interface AnalyzedRegime {
  code: string;
  name: string;
  description: string;
  biasShift: Record<string, number>;
  weightMask: Record<string, number>;
  volatility: number;  // ∈ [0.5, 2.0]
  inertia: number;     // ∈ [0.5, 2.0]
}

export interface AnalysisResult {
  variables: AnalyzedVariable[];
  edges: AnalyzedEdge[];
  regimes: AnalyzedRegime[];
  llmModel: string;     // for provenance
  llmUsed: boolean;     // false if fallback
}

// --- SDK lazy load (so unit tests can mock the module) ----------------------

let _zaiPromise: Promise<any> | null = null;
async function getZAI(): Promise<any> {
  if (!_zaiPromise) {
    const mod = await import("z-ai-web-dev-sdk");
    const ZAI = (mod as any).default || mod.ZAI || mod;
    _zaiPromise = ZAI.create();
  }
  return _zaiPromise;
}

// --- Defensive JSON parsing -------------------------------------------------

function extractJsonBlock(text: string): string {
  // 1. Fenced code block ```json ... ``` (greedy).
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) return fence[1].trim();
  // 2. First { to last }.
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    return text.slice(first, last + 1);
  }
  // 3. First [ to last ] (array shape).
  const firstA = text.indexOf("[");
  const lastA = text.lastIndexOf("]");
  if (firstA !== -1 && lastA !== -1 && lastA > firstA) {
    return text.slice(firstA, lastA + 1);
  }
  return text;
}

function safeParse(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    try {
      // Strip trailing commas.
      const cleaned = text.replace(/,\s*([}\]])/g, "$1");
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
}

function clamp(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

// --- LLM call helper --------------------------------------------------------

async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.4
): Promise<string | null> {
  try {
    const zai = await getZAI();
    const resp = await zai.chat.completions.create({
      model: "glm-4.5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
      thinking: { type: "disabled" },
    });
    // Standard OpenAI-style response shape.
    const content: string | undefined =
      resp?.choices?.[0]?.message?.content ??
      resp?.message?.content ??
      resp?.content ??
      (typeof resp === "string" ? resp : undefined);
    return content ?? null;
  } catch (err) {
    console.warn("[analyze] LLM call error:", (err as Error).message);
    return null;
  }
}

// --- Variable analysis prompt ----------------------------------------------

const SYSTEM_PROMPT_VARIABLES = `Tu es un économiste senior spécialiste des modèles macroéconomiques. 
Tu analyses un ensemble d'indicateurs réels de la Banque Mondiale pour un pays donné.
Ta réponse doit être UNIQUEMENT du JSON valide (pas de texte autour, pas de markdown).
Schéma attendu :
{
  "variables": [
    {
      "indicatorCode": "string (code WB exact)",
      "polarity": "high" | "low" | "balanced",
      "weight": "number ∈ [0,1] (importance pour la stabilité nationale)",
      "rationale": "string, UNE phrase justifiant polarité + poids"
    }
  ]
}
- "high" : une valeur élevée est bonne (PIB, espérance de vie, scolarisation).
- "low" : une valeur basse est bonne (chômage, inflation, dette, mortalité).
- "balanced" : valeur optimale autour d'un point milieu (taux d'intérêt, urbanisation).
- "weight" reflète l'importance économique/politique de l'indicateur pour la STABILITÉ du pays.
Réponds uniquement avec le JSON.`;

const SYSTEM_PROMPT_EDGES = `Tu es un économètre spécialiste des systèmes dynamiques et des modèles causaux.
On te donne une liste d'indicateurs macroéconomiques réels (codes WB + noms français + valeurs).
Tu dois extraire les relations CAUSALES les plus importantes entre ces variables.
Ta réponse doit être UNIQUEMENT du JSON valide :
{
  "edges": [
    {
      "source": "code WB exact de la cause",
      "target": "code WB exact de l'effet",
      "sign": "positive" | "negative",
      "magnitude": "number ∈ [0,1] (force de l'effet)",
      "delay_years": "number (délai moyen en années, 0.5 à 5)",
      "confidence": "number ∈ [0,1] (confiance dans la causalité)",
      "rationale": "string, UNE phrase citant le mécanisme économique"
    }
  ]
}
Règles :
- "positive" : une hausse de source → hausse de target. "negative" : hausse → baisse.
- Pas d'auto-boucle (source ≠ target).
- Source et target doivent faire partie de la liste fournie.
- Privilégie des causalités bien établies (loi d'Okun, courbe de Phillips, effet d'éviction, etc.).
- Vise 25-40 relations pertinentes.`;

const SYSTEM_PROMPT_REGIMES = `Tu es un politiste spécialiste des régimes politiques et de leur impact sur l'économie.
Génère 5 archétypes de régimes politiques avec leurs paramètres d'effet sur le modèle macroéconomique.
Ta réponse doit être UNIQUEMENT du JSON valide :
{
  "regimes": [
    {
      "code": "string court (ex: democracy)",
      "name": "string (nom français)",
      "description": "string, UNE phrase",
      "biasShift": { "economy": "number", "health": "number", ... },
      "weightMask": { "economy": "number ∈ [0.5,1.5]", ... },
      "volatility": "number ∈ [0.5,2.0] (facteur sur la raideur de la sigmoïde)",
      "inertia": "number ∈ [0.5,2.0] (facteur sur l'inertie du système)"
    }
  ]
}
Les 5 régimes attendus : democracy, monarchy, technocracy, authoritarian, transition.
"biasShift" : décalage des biais par catégorie (∈ [-0.1,0.1] typiquement).
"weightMask" : multiplicateur des poids par catégorie (1.0 = neutre).
"volatility" : 1.0 = neutre, >1 = plus nerveux, <1 = plus stable.
"inertia" : 1.0 = neutre, >1 = plus lent à changer, <1 = plus réactif.
Pour chaque catégorie (8 au total : economy, health, education, infra, demography, governance, environment, social),
donne UNE valeur dans biasShift et UNE dans weightMask.
Réponds uniquement avec le JSON.`;

// --- Variable metadata building ---------------------------------------------

function buildVariableListPrompt(data: WBDatum[], countryName: string): string {
  const lines = data.map((d) =>
    `- code=${d.indicatorCode} | nom="${d.nameFr}" | cat=${d.categoryCode} | valeur=${d.value} | unité="${d.unit || "n/a"}" | année=${d.year} | description=${d.description}`
  );
  return `Pays : ${countryName}
Voici ${data.length} indicateurs réels de la Banque Mondiale :
${lines.join("\n")}

Pour CHAQUE indicateur, renvoie un objet {indicatorCode, polarity, weight, rationale}.
Le champ indicatorCode doit EXACTEMENT correspondre au code fourni.
Réponds uniquement avec le JSON.`;
}

// --- Edge prompt with category focus ----------------------------------------

function buildEdgePrompt(data: WBDatum[], focusCategories: string[]): string {
  const subset =
    focusCategories.length === 0
      ? data
      : data.filter((d) => focusCategories.includes(d.categoryCode));
  const lines = subset.map(
    (d) => `- ${d.indicatorCode} | "${d.nameFr}" (${d.categoryCode}) = ${d.value}`
  );
  return `Indicateurs disponibles (codes WB exacts) :
${lines.join("\n")}

IMPORTANT : source et target DOIVENT être des codes présents dans cette liste (codes exacts).
Extrait 25-40 relations CAUSALES fortes entre ces variables.
Réponds uniquement avec le JSON.`;
}

// --- Parse helpers ----------------------------------------------------------

function parseVariables(raw: any, data: WBDatum[]): AnalyzedVariable[] {
  const list = Array.isArray(raw?.variables) ? raw.variables : Array.isArray(raw) ? raw : [];
  const byCode = new Map(data.map((d) => [d.indicatorCode, d] as const));
  const slugMap = ensureUniqueSlugs(data.map((d) => d.indicatorCode));

  const out: AnalyzedVariable[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const code = String(item.indicatorCode ?? item.code ?? "").trim();
    const datum = byCode.get(code);
    if (!datum) continue;

    let polarityRaw = String(item.polarity ?? "").toLowerCase().trim();
    if (polarityRaw === "high" || polarityRaw === "low" || polarityRaw === "balanced") {
      // ok
    } else {
      // Infer from normalization table.
      polarityRaw = normalizeValue(datum.value, datum.unit, datum.indicatorCode).polarity;
    }
    const weight = clamp(item.weight, 0, 1, 0.5);
    const rationale = String(item.rationale ?? item.justification ?? "").slice(0, 500) ||
      `${datum.nameFr} — indicateur ${datum.categoryCode}.`;

    const { normalized, polarity: normPolarity } = normalizeValue(
      datum.value,
      datum.unit,
      datum.indicatorCode
    );
    // If LLM polarity seems valid, prefer it; otherwise use inferred.
    const polarity: Polarity = polarityRaw as Polarity;

    out.push({
      indicatorCode: datum.indicatorCode,
      slug: slugMap.get(datum.indicatorCode) ?? slugFromIndicatorCode(datum.indicatorCode),
      name: datum.nameFr,
      categoryCode: datum.categoryCode,
      description: datum.description,
      rawValue: datum.value,
      rawUnit: datum.unit || "",
      rawYear: datum.year,
      normalizedValue: normalized,
      polarity: polarity || normPolarity,
      weight: Math.round(weight * 1e3) / 1e3,
      rationale,
      sourceName: `Banque Mondiale, WDI ${datum.year}`,
      sourceUrl: datum.sourceUrl,
    });
  }
  return out;
}

function parseEdges(raw: any, validCodes: Set<string>): AnalyzedEdge[] {
  const list = Array.isArray(raw?.edges) ? raw.edges : Array.isArray(raw) ? raw : [];
  const out: AnalyzedEdge[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const source = String(item.source ?? "").trim();
    const target = String(item.target ?? "").trim();
    if (!source || !target) continue;
    if (source === target) continue;
    if (!validCodes.has(source) || !validCodes.has(target)) continue;
    const key = `${source}->${target}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const signRaw = String(item.sign ?? "").toLowerCase().trim();
    const sign: "positive" | "negative" =
      signRaw === "negative" || signRaw === "-" || signRaw === -1 ? "negative" : "positive";
    const magnitude = clamp(item.magnitude ?? item.strength, 0, 1, 0.5);
    const delayYears = clamp(item.delay_years ?? item.delayYears ?? item.delay, 0.25, 8, 1.5);
    const confidence = clamp(item.confidence, 0, 1, 0.6);
    const rationale = String(item.rationale ?? "").slice(0, 500) || "Mécanisme économique documenté.";

    out.push({ source, target, sign, magnitude, delayYears, confidence, rationale });
  }
  return out;
}

function parseRegimes(raw: any): AnalyzedRegime[] {
  const list = Array.isArray(raw?.regimes) ? raw.regimes : Array.isArray(raw) ? raw : [];
  const catCodes = CATEGORY_DEFS.map((c) => c.code);
  const out: AnalyzedRegime[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const code = String(item.code ?? "").toLowerCase().trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const name = String(item.name ?? code).slice(0, 100);
    const description = String(item.description ?? "").slice(0, 500);

    const biasShift: Record<string, number> = {};
    const weightMask: Record<string, number> = {};
    const rawBias = (item.biasShift ?? item.bias_shift ?? {}) as Record<string, any>;
    const rawMask = (item.weightMask ?? item.weight_mask ?? {}) as Record<string, any>;
    for (const cc of catCodes) {
      biasShift[cc] = Math.round(clamp(rawBias[cc] ?? 0, -0.2, 0.2, 0) * 1e3) / 1e3;
      weightMask[cc] = Math.round(clamp(rawMask[cc] ?? 1, 0.3, 2.5, 1) * 1e3) / 1e3;
    }
    const volatility = Math.round(clamp(item.volatility, 0.5, 2.5, 1) * 1e3) / 1e3;
    const inertia = Math.round(clamp(item.inertia, 0.5, 2.5, 1) * 1e3) / 1e3;

    out.push({ code, name, description, biasShift, weightMask, volatility, inertia });
  }
  return out;
}

// --- Fallback analysis (no LLM) ---------------------------------------------

function fallbackVariables(data: WBDatum[]): AnalyzedVariable[] {
  const slugMap = ensureUniqueSlugs(data.map((d) => d.indicatorCode));
  return data.map((d) => {
    const { normalized, polarity } = normalizeValue(d.value, d.unit, d.indicatorCode);
    return {
      indicatorCode: d.indicatorCode,
      slug: slugMap.get(d.indicatorCode) ?? slugFromIndicatorCode(d.indicatorCode),
      name: d.nameFr,
      categoryCode: d.categoryCode,
      description: d.description,
      rawValue: d.value,
      rawUnit: d.unit || "",
      rawYear: d.year,
      normalizedValue: normalized,
      polarity,
      weight: 0.5,
      rationale: `Indicateur réel de la Banque Mondiale (${d.year}). Polarité ${polarity} inférée du domaine.`,
      sourceName: `Banque Mondiale, WDI ${d.year}`,
      sourceUrl: d.sourceUrl,
    };
  });
}

function fallbackRegimes(): AnalyzedRegime[] {
  const catCodes = CATEGORY_DEFS.map((c) => c.code);
  const mk = (
    code: string,
    name: string,
    description: string,
    biasShift: Record<string, number>,
    weightMask: Record<string, number>,
    volatility: number,
    inertia: number
  ): AnalyzedRegime => {
    const bs: Record<string, number> = {};
    const wm: Record<string, number> = {};
    for (const cc of catCodes) {
      bs[cc] = biasShift[cc] ?? 0;
      wm[cc] = weightMask[cc] ?? 1;
    }
    return { code, name, description, biasShift: bs, weightMask: wm, volatility, inertia };
  };
  return [
    mk("democracy", "Démocratie", "Régime représentatif, contre-pouvoirs, dépenses sociales modérées.",
      { governance: 0.04, social: 0.03 },
      { governance: 1.1, social: 1.1 }, 1.0, 1.0),
    mk("monarchy", "Monarchie", "Continuité institutionnelle, redistribution patronale.",
      { governance: 0.02, economy: 0.02 },
      { economy: 1.1, governance: 1.05 }, 0.95, 1.05),
    mk("technocracy", "Technocratie", "Gouvernance par experts, focus productivité, social négligé.",
      { economy: 0.05, social: -0.03 },
      { economy: 1.25, infra: 1.15, social: 0.85 }, 0.9, 0.95),
    mk("authoritarian", "Autoritaire", "Décisions rapides, contrôle social, inertie forte.",
      { governance: -0.05, social: -0.04, economy: 0.03 },
      { governance: 1.2, social: 0.8 }, 1.05, 1.15),
    mk("transition", "Transition", "Régime instable post-crise, forte volatilité, faibles masques.",
      { governance: -0.04, economy: -0.02 },
      { governance: 0.9, social: 0.9 }, 1.35, 0.85),
  ];
}

// --- Public entry point -----------------------------------------------------

export async function analyzeWithLLM(
  wbData: WBDatum[],
  countryName: string
): Promise<AnalysisResult> {
  // --- Round 1: variables (polarity + weight + rationale) ---
  let variables: AnalyzedVariable[] = [];
  let llmUsed = false;
  try {
    const userPrompt = buildVariableListPrompt(wbData, countryName);
    const raw = await callLLM(SYSTEM_PROMPT_VARIABLES, userPrompt, 0.3);
    if (raw) {
      const parsed = safeParse(extractJsonBlock(raw));
      if (parsed) {
        variables = parseVariables(parsed, wbData);
        if (variables.length >= wbData.length * 0.6) {
          llmUsed = true;
        }
      }
    }
  } catch (err) {
    console.warn("[analyze] variable LLM round failed:", (err as Error).message);
  }

  if (!llmUsed || variables.length === 0) {
    console.warn("[analyze] falling back to inferred variables (LLM unavailable or low yield).");
    variables = fallbackVariables(wbData);
  }

  // --- Round 2 & 3: edges (two category-cluster rounds + a broad round) ---
  const validCodes = new Set(variables.map((v) => v.indicatorCode));
  const wbForEdges = wbData.filter((d) => validCodes.has(d.indicatorCode));

  const edgeRounds: { focus: string[]; temp: number }[] = [
    { focus: ["economy", "demography", "social", "governance"], temp: 0.4 },
    { focus: ["health", "education", "infra", "environment"], temp: 0.4 },
    { focus: [], temp: 0.5 }, // broad cross-category sweep
  ];

  const allEdges: AnalyzedEdge[] = [];
  const seenEdges = new Set<string>();
  for (const round of edgeRounds) {
    try {
      const userPrompt = buildEdgePrompt(wbForEdges, round.focus);
      const raw = await callLLM(SYSTEM_PROMPT_EDGES, userPrompt, round.temp);
      if (!raw) continue;
      const parsed = safeParse(extractJsonBlock(raw));
      if (!parsed) continue;
      const roundEdges = parseEdges(parsed, validCodes);
      for (const e of roundEdges) {
        const key = `${e.source}->${e.target}`;
        if (seenEdges.has(key)) continue;
        seenEdges.add(key);
        allEdges.push(e);
      }
    } catch (err) {
      console.warn(`[analyze] edge round (focus=${round.focus.join(",")}) failed:`, (err as Error).message);
    }
  }

  // --- Round 4: regimes ---
  let regimes: AnalyzedRegime[] = [];
  try {
    const raw = await callLLM(SYSTEM_PROMPT_REGIMES, `Génère les 5 archétypes de régimes. Pays cible : ${countryName}.`, 0.5);
    if (raw) {
      const parsed = safeParse(extractJsonBlock(raw));
      if (parsed) {
        regimes = parseRegimes(parsed);
      }
    }
  } catch (err) {
    console.warn("[analyze] regime LLM round failed:", (err as Error).message);
  }
  if (regimes.length < 5) {
    console.warn("[analyze] using fallback regimes.");
    regimes = fallbackRegimes();
  }

  return {
    variables,
    edges: allEdges,
    regimes,
    llmModel: llmUsed ? "glm-4.5" : "fallback",
    llmUsed,
  };
}

// Exported for testing/inspection.
export const __testing = {
  parseVariables,
  parseEdges,
  parseRegimes,
  fallbackVariables,
  fallbackRegimes,
  extractJsonBlock,
  safeParse,
};
