// /api/model/save — Sauvegarde les poids du MLP en base SQLite.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST : sauvegarder les poids actuels du moteur
export async function POST(req: NextRequest) {
  try {
    // Récupérer les poids du moteur directement (port 3003)
    const res = await fetch("http://127.0.0.1:3003/api/weights");
    if (!res.ok) return NextResponse.json({ error: "Moteur injoignable" }, { status: 503 });
    const data = await res.json();

    const saved = await db.neuralWeight.create({
      data: {
        epoch: data.epoch || 0,
        totalSamples: data.totalSamples || 0,
        lastLoss: data.lastLoss || 0,
        weightsJson: JSON.stringify(data.layers),
        inputMean: JSON.stringify(data.inputMean),
        inputStd: JSON.stringify(data.inputStd),
        outputMean: JSON.stringify(data.outputMean),
        outputStd: JSON.stringify(data.outputStd),
        architecture: data.architecture || "47-32-32-15",
        totalWeights: data.totalWeights || 3008,
        source: "live-snapshot",
      },
    });

    return NextResponse.json({
      saved: true,
      id: saved.id,
      epoch: saved.epoch,
      totalSamples: saved.totalSamples,
      lastLoss: saved.lastLoss,
      totalWeights: saved.totalWeights,
      savedAt: saved.createdAt,
    });
  } catch (error: any) {
    console.error("[model/save] Erreur:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET : lister les snapshots sauvegardés
export async function GET() {
  try {
    const snapshots = await db.neuralWeight.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, createdAt: true, epoch: true, totalSamples: true, lastLoss: true, architecture: true, totalWeights: true, source: true },
    });
    return NextResponse.json({ count: snapshots.length, snapshots });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
