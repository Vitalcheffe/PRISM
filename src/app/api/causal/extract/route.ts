// /api/causal/extract — Extrait des arêtes causales d'un document web.
//
// POST /api/causal/extract
// Body: { "url": "https://..." }
//
// Le système :
//   1. Lit le contenu de l'URL (page_reader)
//   2. Analyse le texte avec le LLM pour extraire les relations causales
//   3. Matche les variables extraites avec les leviers réels du modèle
//   4. Persiste les arêtes dans SQLite (Edge) via Prisma, sur le dernier ModelRun
//   5. Retourne les arêtes au format du moteur + count des arêtes persistées

import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const LEVER_KEYWORDS: Record<string, string> = {
  "tva": "vat_rate", "impôt": "corporate_tax_rate", "impot": "corporate_tax_rate",
  "smig": "minimum_wage", "salaire minimum": "minimum_wage", "wage": "minimum_wage",
  "taux directeur": "interest_rate", "taux d'intérêt": "interest_rate", "interest rate": "interest_rate",
  "investissement public": "public_investment", "public investment": "public_investment",
  "subvention": "subsidies", "compensation": "subsidies",
  "hôpital": "hospital_beds_per_1k", "hopital": "hospital_beds_per_1k", "hospital bed": "hospital_beds_per_1k",
  "médecin": "doctors_per_1k", "medecin": "doctors_per_1k", "doctor": "doctors_per_1k",
  "budget santé": "health_budget_share", "health budget": "health_budget_share", "health spending": "health_budget_share",
  "vaccin": "vaccination_rate", "vaccination": "vaccination_rate",
  "eau potable": "water_access", "water access": "water_access", "accès à l'eau": "water_access",
  "budget éducation": "education_budget_share", "education budget": "education_budget_share",
  "enseignant": "teachers_per_1k_students", "teacher": "teachers_per_1k_students",
  "scolarisat": "primary_enrollment", "school enrollment": "primary_enrollment",
  "universit": "tertiary_enrollment", "higher education": "tertiary_enrollment",
  "électricité": "electricity_access", "electricite": "electricity_access", "electricity": "electricity_access",
  "internet": "broadband_penetration", "broadband": "broadband_penetration",
  "renouvelable": "renewable_energy_share", "renewable energy": "renewable_energy_share",
  "route": "road_paved_share", "road": "road_paved_share",
  "ferroviaire": "rail_network_km", "rail": "rail_network_km",
  "retraite": "retirement_age", "retirement": "retirement_age",
  "budget militaire": "military_budget_share", "military": "military_budget_share", "défense": "military_budget_share",
  "corruption": "anti_corruption_index",
  "taxe carbone": "carbon_tax", "carbon tax": "carbon_tax", "carbone": "carbon_tax",
  "forêt": "forest_protection_budget", "foret": "forest_protection_budget", "forest": "forest_protection_budget",
  "pollution": "pollution_regulation",
  "logement social": "social_housing_units", "social housing": "social_housing_units", "housing": "social_housing_units",
  "tourisme": "tourism_budget", "tourism": "tourism_budget",
  "subvention agricole": "agriculture_subsidies", "agricole": "agriculture_subsidies", "agriculture": "agriculture_subsidies",
  "recherche": "rd_investment_share", "r&d": "rd_investment_share",
  "liberté presse": "press_freedom_index", "press freedom": "press_freedom_index", "presse": "press_freedom_index",
  "digital": "digital_admin_budget", "numérique": "digital_admin_budget", "numerique": "digital_admin_budget",
  "pension": "pension_rate",
  "indemnité chômage": "unemployment_benefits", "chômage": "unemployment_benefits", "unemployment benefit": "unemployment_benefits",
  "allocations": "family_benefits_per_child", "family benefit": "family_benefits_per_child",
  "revenu minimum": "minimum_income_guarantee", "minimum income": "minimum_income_guarantee",
  "budget social": "social_programs_budget", "social program": "social_programs_budget",
  "zone industrielle": "industrial_zones", "industrial zone": "industrial_zones",
  "égalité": "gender_equality_index", "gender": "gender_equality_index",
  "conformité fiscale": "tax_compliance_rate", "tax compliance": "tax_compliance_rate",
  "justice": "judicial_budget",
  "échange": "exchange_rate", "exchange rate": "exchange_rate", "taux de change": "exchange_rate",
  "natalité": "birth_rate", "birth rate": "birth_rate", "fécondité": "birth_rate",
  "migration": "immigration_quota", "immigration": "immigration_quota",
};

function matchLever(name: string): string | null {
  const lower = name.toLowerCase().trim();
  // Match direct sur l'ID (si le LLM utilise déjà l'ID)
  const allIds = [...Object.values(LEVER_KEYWORDS), ...Object.values(INDICATOR_KEYWORDS)];
  if (allIds.includes(lower)) return lower;
  // Match par mots-clés
  for (const [kw, id] of Object.entries(LEVER_KEYWORDS)) {
    if (lower.includes(kw)) return id;
  }
  for (const [kw, id] of Object.entries(INDICATOR_KEYWORDS)) {
    if (lower.includes(kw)) return id;
  }
  return null;
}

const INDICATOR_KEYWORDS: Record<string, string> = {
  "gdp": "gdp", "pib": "gdp", "gdp_growth": "gdp_growth", "croissance": "gdp_growth",
  "gdp_per_capita": "gdp_per_capita", "pib par habitant": "gdp_per_capita",
  "unemployment": "unemployment", "chômage": "unemployment",
  "inflation": "inflation", "ipc": "inflation",
  "debt_to_gdp": "debt_to_gdp", "dette": "debt_to_gdp", "debt": "debt_to_gdp",
  "budget_deficit": "budget_deficit", "déficit": "budget_deficit", "deficit": "budget_deficit",
  "tax_revenue": "tax_revenue", "recettes fiscales": "tax_revenue",
  "life_expectancy": "life_expectancy", "espérance de vie": "life_expectancy",
  "hdi": "hdi", "idh": "hdi", "human development": "hdi",
  "gini": "gini", "inégalité": "gini", "inequality": "gini",
  "balance_of_trade": "balance_of_trade", "balance commerciale": "balance_of_trade",
  "poverty": "poverty_rate", "pauvreté": "poverty_rate",
  "stability": "stability", "stabilité": "stability",
  "revolution_risk": "revolution_risk", "risque": "revolution_risk",
  "productivity": "gdp_growth", "productivité": "gdp_growth",
  "economic_growth": "gdp_growth", "croissance économique": "gdp_growth",
  "growth": "gdp_growth",
};

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL requise" }, { status: 400 });
    }

    // 1. Lire le contenu de l'URL
    const zai = await ZAI.create();
    const pageResult = await zai.functions.invoke("page_reader", { url });
    const html = pageResult?.data?.html || "";
    const title = pageResult?.data?.title || url;

    // Nettoyer le HTML en texte
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (text.length < 100) {
      return NextResponse.json({ error: "Contenu trop court ou inaccessible" }, { status: 422 });
    }

    // 2. Extraire les relations causales avec le LLM
    const leverNames = Object.values(LEVER_KEYWORDS);
    const prompt = `Tu es un économètre expert. Analyse ce texte et extrais TOUTES les relations causales entre variables économiques.

IMPORTANT : Utilise ces noms de variables exacts quand possible :
${leverNames.join(", ")}

Pour chaque relation causale identifiée, produit un objet JSON :
- sourceName : nom de la variable qui cause l'effet (utilise un nom de la liste ci-dessus si possible)
- targetName : nom de la variable qui subit l'effet (utilise un nom de la liste ci-dessus si possible)
- coefficient : entre -1 et 1 (positif = même sens, négatif = sens inverse)
- delayMonths : délai en mois avant que l'effet se manifeste
- confidence : ta certitude entre 0 et 1
- rationale : une phrase courte justifiant la relation

Retourne UNIQUEMENT un tableau JSON valide :
[{"sourceName":"...","targetName":"...","coefficient":0.5,"delayMonths":3,"confidence":0.8,"rationale":"..."}]

Texte à analyser :
${text.slice(0, 6000)}`;

    const response = await zai.chat.completions.create({
      messages: [
        { role: "system", content: "Tu extrais des relations causales quantifiées. Tu réponds UNIQUEMENT en JSON valide." },
        { role: "user", content: prompt },
      ],
      thinking: { type: "disabled" },
    });

    const content = response.choices[0]?.message?.content || "[]";
    let parsed: any[] = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
    } catch {
      parsed = [];
    }

    // 3. Matcher avec les leviers réels
    const edges = parsed
      .filter((e: any) => e.sourceName && e.targetName && typeof e.coefficient === "number")
      .map((e: any) => ({
        sourceName: e.sourceName,
        targetName: e.targetName,
        sourceLeverId: matchLever(e.sourceName),
        targetLeverId: matchLever(e.targetName),
        coefficient: Math.max(-1, Math.min(1, e.coefficient)),
        delayMonths: Math.max(0, Math.min(60, e.delayMonths || 0)),
        delayTicks: Math.max(1, Math.round((e.delayMonths || 0) / 0.5)),
        confidence: Math.max(0, Math.min(1, e.confidence || 0.5)),
        rationale: e.rationale || "",
        source: url,
      }));

    const matchedEdges = edges.filter((e: any) => e.sourceLeverId || e.targetLeverId);

    // 4. Persister les arêtes extraites dans la table ExtractedEdge.
    //    Chaque arête est stockée avec son leverId, son URL source, et tous
    //    les paramètres quantifiés par le LLM. Pas besoin de matcher contre
    //    la table Variable — on stocke directement les leverIds.
    let persistedEdges = 0;
    try {
      for (const e of matchedEdges) {
        await db.extractedEdge.create({
          data: {
            sourceUrl: url,
            sourceTitle: title,
            sourceName: e.sourceName,
            targetName: e.targetName,
            sourceLeverId: e.sourceLeverId,
            targetLeverId: e.targetLeverId,
            coefficient: e.coefficient,
            delayMonths: e.delayMonths,
            delayTicks: e.delayTicks,
            confidence: e.confidence,
            rationale: e.rationale,
            llmModel: "glm-4.5",
          },
        });
        persistedEdges++;
      }
    } catch (dbError: any) {
      console.error("[causal-extract] DB persistence error:", dbError?.message);
    }

    return NextResponse.json({
      title,
      url,
      textLength: text.length,
      totalEdgesExtracted: edges.length,
      matchedEdges: matchedEdges.length,
      persistedEdges,
      edges: matchedEdges,
      extractedAt: new Date().toISOString(),
      llmModel: "glm-4.5",
    });
  } catch (error: any) {
    console.error("[causal-extract] Erreur:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
