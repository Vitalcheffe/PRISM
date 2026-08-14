// GET /api/model/latest
// Returns the full ModelSchema of the most recent ModelRun.
// Fresh data — never cached.

import { NextResponse } from "next/server";
import { loadLatestModelSchema } from "@/lib/generate";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const schema = await loadLatestModelSchema();
    if (!schema) {
      return NextResponse.json(
        { error: "Aucun modèle généré pour le moment. Appelez POST /api/model/generate d'abord." },
        { status: 404 }
      );
    }
    return NextResponse.json(schema);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("[api/model/latest] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
