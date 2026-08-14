// =============================================================================
//  Generation orchestrator: real WB data → LLM analysis → normalization →
//  persistence to SQLite via Prisma. Produces a complete ModelRun.
//
//  This is a long-running operation (~30-60s due to LLM calls). It is invoked
//  from the POST /api/model/generate route, NOT from the tick loop.
// =============================================================================

import { db } from "@/lib/db";
import { fetchIndicators, CATEGORY_DEFS } from "@/lib/worldbank";
import { analyzeWithLLM, type AnalyzedVariable, type AnalyzedEdge, type AnalyzedRegime } from "@/lib/analyze";
import type { ModelSchema } from "@/lib/sim-types";

// Conversion: 1 tick ≈ 15 simulated days → ~24 ticks per simulated year.
const TICKS_PER_YEAR = 24;
const MIN_INDICATOR_COUNT = 30;

// --- Persistence ------------------------------------------------------------

interface PersistedIds {
  runId: string;
}

async function persistModel(
  country: string,
  countryName: string,
  sourceName: string,
  analysis: {
    variables: AnalyzedVariable[];
    edges: AnalyzedEdge[];
    regimes: AnalyzedRegime[];
    llmModel: string;
    llmUsed: boolean;
  }
): Promise<PersistedIds> {
  // 1. Create the ModelRun shell first.
  const run = await db.modelRun.create({
    data: {
      country,
      countryName,
      sourceName,
      variableCount: analysis.variables.length,
      edgeCount: analysis.edges.length,
      categoryCount: CATEGORY_DEFS.length,
      regimeCount: analysis.regimes.length,
      notes: JSON.stringify({
        generatedAt: new Date().toISOString(),
        llmModel: analysis.llmModel,
        llmUsed: analysis.llmUsed,
        indicatorCount: analysis.variables.length,
        ticksPerYear: TICKS_PER_YEAR,
      }),
    },
  });

  // 2. Create categories (with their own IDs).
  const categoryRows = await Promise.all(
    CATEGORY_DEFS.map((c) =>
      db.category.create({
        data: {
          modelRunId: run.id,
          code: c.code,
          name: c.name,
          description: c.description,
        },
      })
    )
  );

  // 3. Create variables in bulk-ish (sequential to keep slug uniqueness simple).
  const codeToVarId = new Map<string, string>();
  for (const v of analysis.variables) {
    const created = await db.variable.create({
      data: {
        modelRunId: run.id,
        indicatorCode: v.indicatorCode,
        slug: v.slug,
        name: v.name,
        categoryCode: v.categoryCode,
        rawValue: v.rawValue,
        rawUnit: v.rawUnit,
        rawYear: v.rawYear,
        normalizedValue: v.normalizedValue,
        polarity: v.polarity,
        weight: v.weight,
        description: v.description,
        rationale: v.rationale,
        sourceName: v.sourceName,
        sourceUrl: v.sourceUrl,
      },
    });
    codeToVarId.set(v.indicatorCode, created.id);
  }

  // 4. Validate & create edges.
  //    - no self-loop
  //    - both endpoints exist
  //    - no duplicate (source, target)
  const seen = new Set<string>();
  for (const e of analysis.edges) {
    if (e.source === e.target) continue;
    const sourceId = codeToVarId.get(e.source);
    const targetId = codeToVarId.get(e.target);
    if (!sourceId || !targetId) continue;
    const key = `${sourceId}->${targetId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const coefficient =
      (e.sign === "negative" ? -1 : 1) * e.magnitude * e.confidence;
    const delayTicks = Math.max(1, Math.round(e.delayYears * TICKS_PER_YEAR));

    await db.edge.create({
      data: {
        modelRunId: run.id,
        sourceId,
        targetId,
        coefficient: Math.round(coefficient * 1e4) / 1e4,
        delayTicks,
        confidence: Math.round(e.confidence * 1e4) / 1e4,
        rationale: e.rationale,
      },
    });
  }

  // 5. Create regimes.
  for (const r of analysis.regimes) {
    await db.regime.create({
      data: {
        modelRunId: run.id,
        code: r.code,
        name: r.name,
        description: r.description,
        config: JSON.stringify({
          biasShift: r.biasShift,
          weightMask: r.weightMask,
          volatility: r.volatility,
          inertia: r.inertia,
        }),
      },
    });
  }

  // 6. Re-count actual rows (some edges may have been dropped) and update ModelRun.
  const [vCount, eCount] = await Promise.all([
    db.variable.count({ where: { modelRunId: run.id } }),
    db.edge.count({ where: { modelRunId: run.id } }),
  ]);
  await db.modelRun.update({
    where: { id: run.id },
    data: { variableCount: vCount, edgeCount: eCount },
  });

  return { runId: run.id };
}

// --- Loader (used by API routes) -------------------------------------------

export async function loadModelSchema(runId: string): Promise<ModelSchema | null> {
  const run = await db.modelRun.findUnique({
    where: { id: runId },
    include: {
      categories: true,
      variables: true,
      edges: true,
      regimes: true,
    },
  });
  if (!run) return null;

  return {
    run: {
      id: run.id,
      createdAt: run.createdAt.toISOString(),
      country: run.country,
      countryName: run.countryName,
      sourceName: run.sourceName,
      variableCount: run.variableCount,
      edgeCount: run.edgeCount,
      categoryCount: run.categoryCount,
      regimeCount: run.regimeCount,
      notes: run.notes,
    },
    variables: run.variables.map((v) => ({
      id: v.id,
      slug: v.slug,
      indicatorCode: v.indicatorCode,
      name: v.name,
      categoryCode: v.categoryCode,
      rawValue: v.rawValue,
      rawUnit: v.rawUnit,
      rawYear: v.rawYear,
      normalizedValue: v.normalizedValue,
      polarity: v.polarity as "high" | "low" | "balanced",
      weight: v.weight,
      description: v.description,
      rationale: v.rationale,
      sourceName: v.sourceName,
      sourceUrl: v.sourceUrl,
    })),
    categories: run.categories.map((c) => ({
      code: c.code,
      name: c.name,
      description: c.description,
    })),
    edges: run.edges.map((e) => ({
      id: e.id,
      sourceId: e.sourceId,
      targetId: e.targetId,
      coefficient: e.coefficient,
      delayTicks: e.delayTicks,
      confidence: e.confidence,
      rationale: e.rationale,
    })),
    regimes: run.regimes.map((r) => {
      let cfg: any = {};
      try {
        cfg = JSON.parse(r.config);
      } catch {
        cfg = { biasShift: {}, weightMask: {}, volatility: 1, inertia: 1 };
      }
      return {
        code: r.code,
        name: r.name,
        description: r.description,
        config: {
          biasShift: cfg.biasShift ?? {},
          weightMask: cfg.weightMask ?? {},
          volatility: typeof cfg.volatility === "number" ? cfg.volatility : 1,
          inertia: typeof cfg.inertia === "number" ? cfg.inertia : 1,
        },
      };
    }),
  };
}

export async function loadLatestModelSchema(): Promise<ModelSchema | null> {
  const latest = await db.modelRun.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!latest) return null;
  return loadModelSchema(latest.id);
}

// --- Public orchestrator ----------------------------------------------------

export async function generateModel(
  countryCode: string = "MAR",
  countryName: string = "Maroc"
): Promise<string> {
  console.log(`[generate] starting generation for ${countryCode} (${countryName})`);

  // 1. Fetch real indicators from World Bank API.
  const wbData = await fetchIndicators(countryCode);
  console.log(`[generate] fetched ${wbData.length} indicators from WB`);

  // 2. Bail if insufficient data.
  if (wbData.length < MIN_INDICATOR_COUNT) {
    throw new Error(
      `Données insuffisantes : seulement ${wbData.length} indicateurs récupérés (min ${MIN_INDICATOR_COUNT} requis). L'API Banque Mondiale est peut-être indisponible.`
    );
  }

  // 3. LLM analysis (variables polarity/weight/rationale + edges + regimes).
  const analysis = await analyzeWithLLM(wbData, countryName);
  console.log(
    `[generate] analysis done — ${analysis.variables.length} variables, ${analysis.edges.length} edges, ${analysis.regimes.length} regimes (llmUsed=${analysis.llmUsed})`
  );

  // 4. Persist to SQLite via Prisma.
  const { runId } = await persistModel(
    countryCode,
    countryName,
    "World Bank WDI",
    analysis
  );
  console.log(`[generate] model persisted: runId=${runId}`);

  return runId;
}
