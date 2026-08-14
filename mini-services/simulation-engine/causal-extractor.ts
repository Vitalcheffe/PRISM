// causal-extractor.ts — Le Distillateur de Causalité (NLP to Causal Graph).
//
// Au lieu de coder 37 arêtes causales à la main, ce module lit de vrais rapports
// économiques (FMI, Banque Mondiale, ONU) via le LLM (z-ai-web-dev-sdk) et
// extrait automatiquement des triplets causaux quantifiés :
//
//   A (variable source) → B (variable cible)
//   W_ij : coefficient d'impact [-1, 1]
//   τ    : délai en mois avant répercussion
//   σ    : indice de certitude [0, 1]
//   rationale : justification courte
//
// Les arêtes extraites sont persistées en base puis chargées par le moteur.

import ZAI from "z-ai-web-dev-sdk";
import { LEVERS, INDICATORS } from "./model.js";

// --- Types ---

export interface ExtractedEdge {
  sourceName: string;      // nom de la variable source (ex: "Taux de TVA")
  targetName: string;      // nom de la variable cible (ex: "Consommation des ménages")
  sourceLeverId: string | null;  // ID du levier source (si matché)
  targetLeverId: string | null;  // ID du levier cible (si matché)
  coefficient: number;     // [-1, 1] signé
  delayMonths: number;     // délai en mois
  confidence: number;      // [0, 1]
  rationale: string;       // justification
  source: string;          // URL ou titre du document source
}

export interface ExtractionResult {
  documentTitle: string;
  documentUrl: string;
  edges: ExtractedEdge[];
  variablesIdentified: string[];
  llmModel: string;
  extractedAt: string;
}

// --- Matching : associer un nom de variable extrait à un levier réel ---

function matchLever(name: string): string | null {
  const lower = name.toLowerCase().trim();
  // Match direct sur le nom du levier
  for (const lever of LEVERS) {
    if (lever.name.toLowerCase() === lower) return lever.id;
    if (lever.name.toLowerCase().includes(lower) && lower.length > 3) return lever.id;
    if (lower.includes(lever.name.toLowerCase()) && lever.name.length > 3) return lever.id;
  }
  // Match sur mots-clés
  const keywordMap: Record<string, string> = {
    "tva": "vat_rate",
    "impôt": "corporate_tax_rate",
    "impot": "corporate_tax_rate",
    "fiscal": "corporate_tax_rate",
    "smig": "minimum_wage",
    "salaire": "minimum_wage",
    "wage": "minimum_wage",
    "taux directeur": "interest_rate",
    "taux d'intérêt": "interest_rate",
    "taux d'interet": "interest_rate",
    "interest rate": "interest_rate",
    "investissement": "public_investment",
    "investment": "public_investment",
    "subvention": "subsidies",
    "hôpital": "hospital_beds_per_1k",
    "hopital": "hospital_beds_per_1k",
    "hospital": "hospital_beds_per_1k",
    "lit": "hospital_beds_per_1k",
    "médecin": "doctors_per_1k",
    "medecin": "doctors_per_1k",
    "doctor": "doctors_per_1k",
    "santé budget": "health_budget_share",
    "health budget": "health_budget_share",
    "vaccin": "vaccination_rate",
    "eau": "water_access",
    "water": "water_access",
    "éducation budget": "education_budget_share",
    "education budget": "education_budget_share",
    "enseignant": "teachers_per_1k_students",
    "teacher": "teachers_per_1k_students",
    "scolaire": "primary_enrollment",
    "scolarisat": "primary_enrollment",
    "universit": "tertiary_enrollment",
    "électricité": "electricity_access",
    "electricite": "electricity_access",
    "electricity": "electricity_access",
    "internet": "broadband_penetration",
    "broadband": "broadband_penetration",
    "renouvelable": "renewable_energy_share",
    "renewable": "renewable_energy_share",
    "route": "road_paved_share",
    "road": "road_paved_share",
    "ferroviaire": "rail_network_km",
    "rail": "rail_network_km",
    "retraite": "retirement_age",
    "retirement": "retirement_age",
    "militaire": "military_budget_share",
    "military": "military_budget_share",
    "justice": "judicial_budget",
    "corruption": "anti_corruption_index",
    "conformité": "tax_compliance_rate",
    "compliance": "tax_compliance_rate",
    "digital": "digital_admin_budget",
    "numérique": "digital_admin_budget",
    "numerique": "digital_admin_budget",
    "carbone": "carbon_tax",
    "carbon": "carbon_tax",
    "forêt": "forest_protection_budget",
    "foret": "forest_protection_budget",
    "forest": "forest_protection_budget",
    "pollution": "pollution_regulation",
    "eau budget": "water_management_budget",
    "pension": "pension_rate",
    "chômage": "unemployment_benefits",
    "chomage": "unemployment_benefits",
    "logement": "social_housing_units",
    "housing": "social_housing_units",
    "revenu minimum": "minimum_income_guarantee",
    "allocations": "family_benefits_per_child",
    "tourisme": "tourism_budget",
    "agricole": "agriculture_subsidies",
    "agriculture": "agriculture_subsidies",
    "industrielle": "industrial_zones",
    "industrial": "industrial_zones",
    "recherche": "rd_investment_share",
    "r&d": "rd_investment_share",
    "égalité": "gender_equality_index",
    "gender": "gender_equality_index",
    "presse": "press_freedom_index",
    "press freedom": "press_freedom_index",
  };
  for (const [kw, id] of Object.entries(keywordMap)) {
    if (lower.includes(kw)) return id;
  }
  return null;
}

// --- Extraction principale ---

export async function extractCausalEdges(
  documentText: string,
  documentTitle: string,
  documentUrl: string,
): Promise<ExtractionResult> {
  const zai = await ZAI.create();

  // Construire la liste des variables connues pour aider le LLM
  const knownVariables = LEVERS.map((l) => l.name).join(", ");
  const knownIndicators = INDICATORS.map((i) => i.name).join(", ");

  const prompt = `Tu es un économètre expert. Analyse le texte suivant et extrais TOUTES les relations causales entre variables économiques.

Variables connues dans le système : ${knownVariables}
Indicateurs connus : ${knownIndicators}

Pour chaque relation causale identifiée dans le texte, produit un objet JSON avec :
- sourceName : nom de la variable qui CAUSE l'effet (ex: "Taux de TVA")
- targetName : nom de la variable qui SUBIT l'effet (ex: "Consommation des ménages")
- coefficient : nombre entre -1 et 1 (positif = effet dans le même sens, négatif = effet inverse)
- delayMonths : délai en mois avant que l'effet se manifeste (0 = immédiat, 12 = 1 an)
- confidence : ta certitude entre 0 et 1 (basée sur la clarté du texte)
- rationale : une phrase courte justifiant la relation (ex: "La hausse de la TVA réduit le pouvoir d'achat")

Retourne UNIQUEMENT un tableau JSON valide, sans texte supplémentaire :
[{"sourceName":"...","targetName":"...","coefficient":0.5,"delayMonths":3,"confidence":0.8,"rationale":"..."}]

Texte à analyser (extrait) :
${documentText.slice(0, 8000)}`;

  const response = await zai.chat.completions.create({
    messages: [
      {
        role: "system",
        content: "Tu es un assistant expert en économétrie. Tu extrais des relations causales quantifiées à partir de textes économiques. Tu réponds UNIQUEMENT en JSON valide.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    thinking: { type: "disabled" },
  });

  const content = response.choices[0]?.message?.content || "[]";

  // Parser le JSON de manière robuste
  let parsed: any[] = [];
  try {
    // Extraire le bloc JSON (au cas où le LLM ajoute du texte)
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      parsed = JSON.parse(content);
    }
  } catch (e) {
    console.error("[causal-extractor] Erreur parsing JSON:", e);
    console.error("[causal-extractor] Contenu:", content.slice(0, 500));
    parsed = [];
  }

  // Convertir en ExtractedEdge et matcher les leviers
  const edges: ExtractedEdge[] = parsed
    .filter((e: any) => e.sourceName && e.targetName && typeof e.coefficient === "number")
    .map((e: any) => {
      const sourceId = matchLever(e.sourceName);
      const targetId = matchLever(e.targetName);
      return {
        sourceName: e.sourceName,
        targetName: e.targetName,
        sourceLeverId: sourceId,
        targetLeverId: targetId,
        coefficient: Math.max(-1, Math.min(1, e.coefficient)),
        delayMonths: Math.max(0, Math.min(60, e.delayMonths || 0)),
        confidence: Math.max(0, Math.min(1, e.confidence || 0.5)),
        rationale: e.rationale || "",
        source: documentUrl || documentTitle,
      };
    });

  // Filtrer : garder seulement les arêtes où au moins un bout matche un levier réel
  const matchedEdges = edges.filter(
    (e) => e.sourceLeverId !== null || e.targetLeverId !== null,
  );

  const variablesIdentified = [
    ...new Set([
      ...edges.map((e) => e.sourceName),
      ...edges.map((e) => e.targetName),
    ]),
  ];

  return {
    documentTitle,
    documentUrl,
    edges: matchedEdges,
    variablesIdentified,
    llmModel: "glm-4.5",
    extractedAt: new Date().toISOString(),
  };
}

// --- Convertir les arêtes extraites au format du moteur ---

export function extractedToEngineEdges(edges: ExtractedEdge[]) {
  return edges
    .filter((e) => e.sourceLeverId && e.targetLeverId)
    .map((e) => ({
      source: e.sourceLeverId!,
      target: e.targetLeverId!,
      coefficient: e.coefficient,
      delayTicks: Math.max(1, Math.round(e.delayMonths / 0.5)), // 1 tick = ~15 jours = 0.5 mois
      confidence: e.confidence,
      rationale: e.rationale,
    }));
}
