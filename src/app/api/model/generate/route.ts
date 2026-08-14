// POST /api/model/generate
// Triggers a full model generation: WB fetch + LLM analysis + persistence.
// Long-running (~30-60s due to LLM). Returns { runId }.

import { NextRequest, NextResponse } from "next/server";
import { generateModel } from "@/lib/generate";

export const maxDuration = 300; // 5 minutes — generous for WB API + 4 LLM rounds.
export const dynamic = "force-dynamic";

interface GenerateBody {
  country?: string;
  countryName?: string;
}

const COUNTRY_NAMES: Record<string, string> = {
  MAR: "Maroc",
  TUN: "Tunisie",
  DZA: "Algérie",
  EGY: "Égypte",
  SEN: "Sénégal",
  CIV: "Côte d'Ivoire",
  FRA: "France",
};

export async function POST(req: NextRequest) {
  let body: GenerateBody = {};
  try {
    const text = await req.text();
    if (text.trim()) body = JSON.parse(text) as GenerateBody;
  } catch {
    // Empty body is fine — defaults apply.
  }

  const country = (body.country ?? "MAR").toUpperCase().slice(0, 3);
  const countryName = body.countryName ?? COUNTRY_NAMES[country] ?? country;

  try {
    const runId = await generateModel(country, countryName);
    return NextResponse.json({ runId, country, countryName });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("[api/model/generate] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
