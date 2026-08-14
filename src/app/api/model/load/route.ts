// /api/model/load — Charge les poids du MLP depuis la base vers le moteur.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST : charger le dernier snapshot dans le moteur
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const snapshotId = body.id;

    // Récupérer le snapshot (le plus récent si pas d'ID)
    const snapshot = snapshotId
      ? await db.neuralWeight.findUnique({ where: { id: snapshotId } })
      : await db.neuralWeight.findFirst({ orderBy: { createdAt: "desc" } });

    if (!snapshot) {
      return NextResponse.json({ error: "Aucun snapshot trouvé" }, { status: 404 });
    }

    // Envoyer les poids au moteur
    const payload = {
      layers: JSON.parse(snapshot.weightsJson),
      inputMean: JSON.parse(snapshot.inputMean),
      inputStd: JSON.parse(snapshot.inputStd),
      outputMean: JSON.parse(snapshot.outputMean),
      outputStd: JSON.parse(snapshot.outputStd),
    };

    const res = await fetch("http://localhost:3003/api/weights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) return NextResponse.json({ error: "Moteur n'a pas accepté les poids" }, { status: 502 });

    return NextResponse.json({
      loaded: true,
      id: snapshot.id,
      epoch: snapshot.epoch,
      totalSamples: snapshot.totalSamples,
      lastLoss: snapshot.lastLoss,
      loadedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
