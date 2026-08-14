// GET /api/model/[id]
// Returns the full ModelSchema for a specific ModelRun.

import { NextRequest, NextResponse } from "next/server";
import { loadModelSchema } from "@/lib/generate";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "id manquant" }, { status: 400 });
  }
  try {
    const schema = await loadModelSchema(id);
    if (!schema) {
      return NextResponse.json({ error: `Modèle ${id} introuvable` }, { status: 404 });
    }
    return NextResponse.json(schema);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("[api/model/:id] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
