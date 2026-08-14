// index.ts — Serveur socket.io du moteur de simulation (port 3003).
// Charge le modèle, exécute les calculs, diffuse l'état aux clients.
//
// Le moteur tourne maintenant à travers le PRISM Kernel : un cycle de 12
// phases par tick (BOOT, EXTRACT, NEURAL, NONLINEAR, SWARM, LIFECYCLE,
// GOVERN, BLACKSWAN, PARADIGM, COMMIT, EMIT, HALT). Le sous-système Life
// fait vivre 10 000 agents (naissances, vieillissement, mort) et le
// sous-système Governance gère 8 ministères avec budget réel.

import { createServer } from "http";
import { Server } from "socket.io";
import { SimulationEngine } from "./engine.js";
import { LEVERS, INDICATORS, CATEGORIES } from "./model.js";
import { executeDecree as executeDecreeForProjection } from "./decrees.js";
import { CAUSAL_EDGES } from "./formulas.js";
import { getNetworkStats } from "./neural-network.js";
import { createDefaultKernel, KERNEL_VERSION } from "./kernel.js";

const PORT = 3003;
const TICK_MS = 200;

const httpServer = createServer();
const io = new Server(httpServer, {
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

const engine = new SimulationEngine();

// ── LE KERNEL ──
// On enveloppe le moteur dans le Kernel. Le Kernel enregistre automatiquement
// les sous-systèmes Life et Governance. Chaque tick = un cycle kernel complet
// (12 phases). Le host.step() s'exécute pendant la phase NEURAL.
const kernel = createDefaultKernel(engine);

console.log(`[sim] PRISM Kernel v${KERNEL_VERSION} initialisé`);
console.log("[sim] Moteur V3 initialisé");
console.log(`     ${LEVERS.length} leviers (touchables) · ${INDICATORS.length} indicateurs dérivés (calculés)`);
console.log(`     ${CATEGORIES.length} catégories · ${CAUSAL_EDGES.length} arêtes causales`)
console.log(`     PIB initial = ${engine.indicators?.gdp.toFixed(0)} Mrd MAD`);
console.log(`     Dette/PIB = ${engine.indicators?.debt_to_gdp.toFixed(1)}%`);
console.log(`     Chômage = ${engine.indicators?.unemployment.toFixed(1)}%`);

// Tick loop — tourne à travers le Kernel.
// Chaque tick = un cycle kernel complet (12 phases). Le snapshot émis aux
// clients est enrichi avec les données du Kernel : phase actuelle, timings,
// données démographiques (Life) et de gouvernance (Governance).
setInterval(() => {
  try {
    const kernelState = kernel.cycle();
    const snapshot: any = engine.snapshot();
    if (!snapshot || typeof snapshot !== "object") {
      console.error("[sim] snapshot invalide");
      return;
    }
  // Enrichir le snapshot avec les données Kernel pour le frontend
  snapshot.kernel = {
    version: KERNEL_VERSION,
    phase: kernelState.phase,
    tick: kernelState.tick,
    uptimeMs: kernelState.uptimeMs,
    phaseTimings: kernelState.phaseTimings,
  };
  // Données démographiques du sous-système Life
  const lifeSubsystem = kernelState.subsystems.find((s: any) => s.id === "life");
  if (lifeSubsystem && typeof (lifeSubsystem as any).getDemographicStats === "function") {
    snapshot.demographics = (lifeSubsystem as any).getDemographicStats();
    snapshot.populationPyramid = (lifeSubsystem as any).getPopulationPyramid();
  }
  // Données de gouvernance du sous-système Governance
  const govSubsystem = kernelState.subsystems.find((s: any) => s.id === "governance");
  if (govSubsystem && typeof (govSubsystem as any).getGovernanceStats === "function") {
    snapshot.governance = (govSubsystem as any).getGovernanceStats();
    snapshot.ministries = (govSubsystem as any).getMinistries();
  }
  io.emit("state", snapshot);
  } catch (err: any) {
    // Log l'erreur mais ne crash pas le moteur — un tick raté ne doit pas
    // tuer la simulation. L'erreur est émise aux clients pour debug.
    console.error("[sim] ERREUR TICK:", err?.message || err);
    if (err?.stack) console.error(err.stack.split("\n").slice(0, 3).join("\n"));
  }
}, TICK_MS);

// Payload d'init envoyé à chaque connexion (et après reset).
// `edges` expose le graphe causal entre leviers pour le rendu du globe.
function buildInitPayload() {
  return {
    levers: LEVERS,
    indicators: INDICATORS,
    categories: CATEGORIES,
    edges: CAUSAL_EDGES,
    state: engine.snapshot(),
  };
}

// Connexions
io.on("connection", (socket) => {
  console.log(`[sim] client connecté: ${socket.id}`);

  // Envoyer le modèle + graphe causal + état initial
  try {
    const payload = buildInitPayload();
    socket.emit("init", payload);
    console.log(`[sim] init envoyé: ${payload.levers?.length || 0} leviers, ${payload.indicators?.length || 0} indicateurs`);
  } catch (err: any) {
    console.error("[sim] ERREUR INIT:", err?.message || err);
    if (err?.stack) console.error(err.stack.split("\n").slice(0, 3).join("\n"));
  }

  socket.on("command", (cmd: any) => {
    if (!cmd || typeof cmd !== "object") return;
    try {
      switch (cmd.type) {
        case "adjust":
          if (typeof cmd.leverId === "string" && typeof cmd.value === "number") {
            engine.adjustLever(cmd.leverId, cmd.value);
          }
          break;
        case "learn":
          // Nourrit le réseau neuronal avec un "document" (point de données).
          // cmd.levers = {leverId: value}, cmd.targets = {indicatorId: value}
          if (cmd.levers && cmd.targets) {
            const loss = engine.learnFromDocument(cmd.levers, cmd.targets);
            socket.emit("learn-result", { loss, accepted: true });
          }
          break;
        case "decree":
          if (typeof cmd.text === "string") {
            const result = engine.decree(cmd.text);
            io.emit("decree-result", result);
          }
          break;
        case "project":
          // Projection : simule N ticks en avant SANS modifier l'état réel.
          // cmd.leverDeltas = [{leverId, value}], cmd.extraDebt = number, cmd.ticks = number
          if (Array.isArray(cmd.leverDeltas) && typeof cmd.ticks === "number") {
            const result = engine.project(
              cmd.leverDeltas,
              typeof cmd.extraDebt === "number" ? cmd.extraDebt : 0,
              Math.min(240, Math.max(1, cmd.ticks)),
            );
            socket.emit("projection-result", result);
          }
          break;
        case "project-decree":
          // Projection d'un décret : parse le décret, puis projette sans appliquer
          if (typeof cmd.text === "string" && typeof cmd.ticks === "number") {
            const decreeResult = executeDecreeForProjection(cmd.text, engine.levers, engine.accumulatedDebt);
            if (!decreeResult.accepted) {
              socket.emit("projection-result", {
                trajectory: [],
                deltas: {},
                crashed: false,
                crashReason: null,
                verdict: { label: "défavorable", score: -1, reasoning: decreeResult.reason || "Décret refusé." },
                decreeResult,
              });
            } else {
              const proj = engine.project(
                decreeResult.deltas.map((d) => ({ leverId: d.leverId, value: d.absoluteChange })),
                decreeResult.fiscalCost,
                Math.min(240, Math.max(1, cmd.ticks)),
              );
              socket.emit("projection-result", { ...proj, decreeResult });
            }
          }
          break;
        case "pause":
          engine.pause();
          break;
        case "set-paradigm":
          // AUTOROUTE C : changement de régime (réécrit la matrice)
          if (typeof cmd.paradigmId === "string") engine.setParadigm(cmd.paradigmId);
          break;
        case "resume":
          engine.resume();
          break;
        case "reset":
          engine.reset();
          io.emit("init", buildInitPayload());
          break;
      }
    } catch (err) {
      console.error("[sim] erreur commande:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log(`[sim] client déconnecté: ${socket.id}`);
  });

  socket.on("error", (err: Error) => {
    console.error(`[sim] erreur socket ${socket.id}:`, err.message);
  });
});

// --- Endpoint HTTP pour sauvegarder/charger les poids du MLP ---
// socket.io utilise le path "/" — on intercepte les requêtes AVANT socket.io
// en ajoutant notre handler avec priorité.

const originalListeners = httpServer.listeners("request");
httpServer.removeAllListeners("request");

httpServer.on("request", (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Laisser socket.io gérer les requêtes WebSocket et polling
  const url = req.url || "";
  if (url.startsWith("/socket.io") || url === "/" || req.headers.upgrade === "websocket") {
    // Passer aux listeners originaux (socket.io)
    for (const listener of originalListeners) {
      listener.call(httpServer, req, res);
    }
    return;
  }

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (url === "/api/weights" && req.method === "GET") {
    const nn = engine.neuralNetwork;
    const stats = getNetworkStats(nn);
    const payload = {
      layers: nn.layers.map((l: any) => ({
        weights: Array.from(l.weights),
        biases: Array.from(l.biases),
        inSize: l.inSize,
        outSize: l.outSize,
      })),
      inputMean: Array.from(nn.inputMean),
      inputStd: Array.from(nn.inputStd),
      outputMean: Array.from(nn.outputMean),
      outputStd: Array.from(nn.outputStd),
      epoch: nn.epoch,
      totalSamples: nn.totalSamples,
      lastLoss: nn.lastLoss,
      architecture: stats.architecture,
      totalWeights: stats.totalWeights,
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
    return;
  }

  if (url === "/api/weights" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        const nn = engine.neuralNetwork;
        if (data.layers) {
          for (let i = 0; i < nn.layers.length && i < data.layers.length; i++) {
            const layer = nn.layers[i];
            const saved = data.layers[i];
            if (saved.weights) {
              for (let j = 0; j < layer.weights.length && j < saved.weights.length; j++) {
                layer.weights[j] = saved.weights[j];
              }
            }
            if (saved.biases) {
              for (let j = 0; j < layer.biases.length && j < saved.biases.length; j++) {
                layer.biases[j] = saved.biases[j];
              }
            }
          }
        }
        if (data.inputMean) for (let i = 0; i < nn.inputMean.length; i++) nn.inputMean[i] = data.inputMean[i] ?? nn.inputMean[i];
        if (data.inputStd) for (let i = 0; i < nn.inputStd.length; i++) nn.inputStd[i] = data.inputStd[i] ?? nn.inputStd[i];
        if (data.outputMean) for (let i = 0; i < nn.outputMean.length; i++) nn.outputMean[i] = data.outputMean[i] ?? nn.outputMean[i];
        if (data.outputStd) for (let i = 0; i < nn.outputStd.length; i++) nn.outputStd[i] = data.outputStd[i] ?? nn.outputStd[i];

        engine.recompute();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ loaded: true }));
      } catch (err: any) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Pour toute autre requête, passer aux listeners originaux
  for (const listener of originalListeners) {
    listener.call(httpServer, req, res);
  }
});

httpServer.listen(PORT, () => {
  console.log(`⚡ Système Dynamique V3 — moteur sur le port ${PORT}`);
  console.log(`   tick = ${TICK_MS}ms · calculatrice économique en temps réel`);
  console.log(`   PIB = C + I + G + (X − M) — identité comptable`);
  console.log(`   /api/weights — sauvegarder/charger les poids du MLP`);
});

process.on("SIGTERM", () => {
  console.log("[sim] SIGTERM, arrêt…");
  httpServer.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  console.log("[sim] SIGINT, arrêt…");
  httpServer.close(() => process.exit(0));
});
