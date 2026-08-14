"use client";

// NeuralView.tsx — Vue NEURONALE : visualise le MLP 47→32→32→15 (3008 transistors)
// qui calcule les indicateurs à partir des leviers, et permet de le nourrir.
//
// Trois sections :
//   A. Schéma de l'architecture (SVG, ~60% haut) — clusters d'entrée, colonnes
//      cachées, sortie. Connexions en faisceau. Couleurs sémantiques (encre /
//      ocre / bordeaux / gris). Look "circuit technique".
//   B. Métriques d'apprentissage (~40% bas-gauche) — params, poids actifs,
//      epochs, samples, loss + sparkline, max/avg poids.
//   C. "Nourrir le réseau" (~40% bas-droite) — injecter un document JSON,
//      presets, retour loss before → after.
//
// Couleurs : papier #FAFAF7, encre #1A1A1A, traits #E5E5E5.
// Sémantique : encre (normal), ocre #92400E (hot/warning), bordeaux #7F1D1D
// (crisis/critical), gris #A3A3A3 (cold). Pas de bleu, pas de fluo, pas de dark.

import * as React from "react";
import { useSimulation, type LearnResult } from "@/hooks/use-simulation";
import type { LeverDef, LeverState, IndicatorState } from "@/lib/sim-types";

// --- Architecture (constantes du MLP, hardcodées d'après le backend) ---

const LAYER_SIZES = [47, 32, 32, 15] as const;
const HIDDEN1_COUNT = LAYER_SIZES[1];
const HIDDEN2_COUNT = LAYER_SIZES[2];
const OUTPUT_COUNT = LAYER_SIZES[3];

// viewBox du schéma.
const VB_W = 720;
const VB_H = 420;

// Positions X des 4 colonnes.
const X_INPUT = 90;
const X_HIDDEN1 = 295;
const X_HIDDEN2 = 470;
const X_OUTPUT = 635;

// Bornes Y pour les colonnes (verticales).
const Y_TOP = 28;
const Y_BOTTOM = 388;
const Y_RANGE = Y_BOTTOM - Y_TOP;

// --- Labels courts des indicateurs (couche de sortie) ---

const OUTPUT_SHORT: Record<string, string> = {
  gdp: "PIB",
  gdp_growth: "%PIB",
  gdp_per_capita: "PIB/h",
  unemployment: "CHÔM",
  inflation: "INFL",
  debt_to_gdp: "D/PIB",
  budget_deficit: "DÉF",
  tax_revenue: "RECET",
  life_expectancy: "ESP",
  hdi: "IDH",
  gini: "GINI",
  balance_of_trade: "COM",
  poverty_rate: "PAUV",
  stability: "STAB",
  revolution_risk: "RÉV",
};

// --- Couleurs sémantiques (variables CSS du thème papier) ---

function leverStateColor(state: LeverState | undefined): string {
  switch (state) {
    case "crisis":
      return "var(--state-crisis)";
    case "hot":
      return "var(--state-tension)";
    case "cold":
      return "var(--ink-faint)";
    default:
      return "var(--ink)";
  }
}

function indicatorStateColor(state: IndicatorState | undefined): string {
  switch (state) {
    case "critical":
      return "var(--state-crisis)";
    case "warning":
      return "var(--state-tension)";
    default:
      return "var(--ink)";
  }
}

// --- Sélection déterministe de connexions (faisceau) ---
//
// Pour ne pas dessiner les 47×32 = 1504 lignes, on tire un sous-ensemble
// déterministe : pour chaque neurone source, on connecte à k destinations
// réparties de façon stable (basée sur l'index source). Comme ça le dessin
// ne saute pas d'un render à l'autre.

function pickDestinations(srcIdx: number, dstCount: number, k: number): number[] {
  const out: number[] = [];
  const step = dstCount / k;
  const offset = (srcIdx * 0.6180339887) % 1; // nombre d'or → répartition
  for (let i = 0; i < k; i++) {
    const dst = Math.floor((offset + i / k) * dstCount) % dstCount;
    out.push(dst);
  }
  return out;
}

// --- Précalcul des connexions (mémoïsé — ne dépend pas de l'état) ---

interface Conn {
  src: number;
  dst: number;
}

const INPUT_TO_H1: Conn[] = [];
const H1_TO_H2: Conn[] = [];
const H2_TO_OUT: Conn[] = [];

// 8 clusters d'entrée → 4 destinations chacun dans H1.
for (let i = 0; i < 8; i++) {
  for (const d of pickDestinations(i, HIDDEN1_COUNT, 4)) {
    INPUT_TO_H1.push({ src: i, dst: d });
  }
}
// Chaque H1 → 3 destinations dans H2.
for (let i = 0; i < HIDDEN1_COUNT; i++) {
  for (const d of pickDestinations(i, HIDDEN2_COUNT, 3)) {
    H1_TO_H2.push({ src: i, dst: d });
  }
}
// Chaque H2 → 2 destinations dans OUTPUT.
for (let i = 0; i < HIDDEN2_COUNT; i++) {
  for (const d of pickDestinations(i, OUTPUT_COUNT, 2)) {
    H2_TO_OUT.push({ src: i, dst: d });
  }
}

// Positions Y d'une colonne de n neurones.
function colY(i: number, n: number): number {
  if (n === 1) return (Y_TOP + Y_BOTTOM) / 2;
  return Y_TOP + (i / (n - 1)) * Y_RANGE;
}

// --- Composant : un petit cercle de cluster d'entrée ---

interface InputCluster {
  categoryId: string;
  categoryName: string;
  levers: LeverDef[];
  centerY: number;
}

// --- Section A : schéma SVG ---

function ArchitectureDiagram() {
  const levers = useSimulation((s) => s.levers);
  const categories = useSimulation((s) => s.categories);
  const leverStates = useSimulation((s) => s.state.leverStates);
  const indicatorStates = useSimulation((s) => s.state.indicatorStates);
  const indicators = useSimulation((s) => s.indicators);
  const avgWeight = useSimulation((s) => s.state.networkStats?.avgWeight ?? 0.02);
  const maxWeight = useSimulation((s) => s.state.networkStats?.maxWeight ?? 1);

  // Construire les 8 clusters d'entrée (un par catégorie).
  const clusters: InputCluster[] = React.useMemo(() => {
    if (categories.length === 0) return [];
    const n = categories.length;
    return categories.map((cat, i) => {
      const catLevers = levers.filter((l) => l.category === cat.code);
      return {
        categoryId: cat.code,
        categoryName: cat.name,
        levers: catLevers,
        centerY: Y_TOP + ((i + 0.5) / n) * Y_RANGE,
      };
    });
  }, [categories, levers]);

  // Position Y de chaque hidden1, hidden2, output neuron.
  const h1Y = React.useMemo(
    () => Array.from({ length: HIDDEN1_COUNT }, (_, i) => colY(i, HIDDEN1_COUNT)),
    [],
  );
  const h2Y = React.useMemo(
    () => Array.from({ length: HIDDEN2_COUNT }, (_, i) => colY(i, HIDDEN2_COUNT)),
    [],
  );
  const outY = React.useMemo(
    () => Array.from({ length: OUTPUT_COUNT }, (_, i) => colY(i, OUTPUT_COUNT)),
    [],
  );

  // Opacité d'un neurone caché basée sur le poids moyen (visualisation
  // purement indicative — on n'a pas l'activation par neurone côté client).
  const hiddenOpacity = React.useMemo(() => {
    // avgWeight est typiquement ~0.02 ; maxWeight ~0.96. On mappe vers [0.35, 1].
    const ratio = Math.min(1, Math.max(0, avgWeight / Math.max(0.001, maxWeight)));
    return 0.35 + ratio * 0.65;
  }, [avgWeight, maxWeight]);

  // --- Rendu ---
  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className="w-full h-full"
      style={{ display: "block" }}
      role="img"
      aria-label="Architecture du réseau de neurones : 47 entrées, deux couches cachées de 32, 15 sorties"
    >
      {/* En-têtes de colonnes */}
      <g style={{ fontFamily: "var(--font-mono)" }}>
        <text x={X_INPUT} y={14} textAnchor="middle" style={{ fontSize: 8, fill: "var(--ink-mute)", letterSpacing: "0.08em" }}>
          ENTRÉE · 47
        </text>
        <text x={X_HIDDEN1} y={14} textAnchor="middle" style={{ fontSize: 8, fill: "var(--ink-mute)", letterSpacing: "0.08em" }}>
          CACHEE 1 · 32
        </text>
        <text x={X_HIDDEN2} y={14} textAnchor="middle" style={{ fontSize: 8, fill: "var(--ink-mute)", letterSpacing: "0.08em" }}>
          CACHEE 2 · 32
        </text>
        <text x={X_OUTPUT} y={14} textAnchor="middle" style={{ fontSize: 8, fill: "var(--ink-mute)", letterSpacing: "0.08em" }}>
          SORTIE · 15
        </text>
      </g>

      {/* Axes verticaux (hairlines) — repères visuels de colonne */}
      <g style={{ stroke: "var(--rule-soft)", strokeWidth: 1 }}>
        <line x1={X_INPUT} y1={Y_TOP} x2={X_INPUT} y2={Y_BOTTOM} />
        <line x1={X_HIDDEN1} y1={Y_TOP} x2={X_HIDDEN1} y2={Y_BOTTOM} />
        <line x1={X_HIDDEN2} y1={Y_TOP} x2={X_HIDDEN2} y2={Y_BOTTOM} />
        <line x1={X_OUTPUT} y1={Y_TOP} x2={X_OUTPUT} y2={Y_BOTTOM} />
      </g>

      {/* --- Connexions INPUT → H1 (faisceaux par cluster) --- */}
      <g style={{ stroke: "var(--ink)", strokeWidth: 0.5, fill: "none" }}>
        {INPUT_TO_H1.map((c, i) => {
          const cluster = clusters[c.src];
          if (!cluster) return null;
          return (
            <line
              key={`i2h-${i}`}
              x1={X_INPUT + 12}
              y1={cluster.centerY}
              x2={X_HIDDEN1 - 5}
              y2={h1Y[c.dst]}
              strokeOpacity={0.18}
            />
          );
        })}
      </g>

      {/* --- Connexions H1 → H2 --- */}
      <g style={{ stroke: "var(--ink)", strokeWidth: 0.4, fill: "none" }}>
        {H1_TO_H2.map((c, i) => (
          <line
            key={`h1h2-${i}`}
            x1={X_HIDDEN1 + 5}
            y1={h1Y[c.src]}
            x2={X_HIDDEN2 - 5}
            y2={h2Y[c.dst]}
            strokeOpacity={0.1}
          />
        ))}
      </g>

      {/* --- Connexions H2 → OUT --- */}
      <g style={{ stroke: "var(--ink)", strokeWidth: 0.4, fill: "none" }}>
        {H2_TO_OUT.map((c, i) => (
          <line
            key={`h2o-${i}`}
            x1={X_HIDDEN2 + 5}
            y1={h2Y[c.src]}
            x2={X_OUTPUT - 6}
            y2={outY[c.dst]}
            strokeOpacity={0.12}
          />
        ))}
      </g>

      {/* --- Clusters d'entrée (8 catégories) --- */}
      {clusters.map((cluster) => {
        const visibleLevers = cluster.levers.slice(0, 6);
        const overflow = cluster.levers.length - visibleLevers.length;
        const stackTop = cluster.centerY - (visibleLevers.length - 1) * 3;
        return (
          <g key={cluster.categoryId}>
            {/* Label de catégorie */}
            <text
              x={X_INPUT - 14}
              y={cluster.centerY}
              textAnchor="end"
              dominantBaseline="middle"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fill: "var(--ink-soft)",
                letterSpacing: "0.04em",
              }}
            >
              {cluster.categoryName.length > 11
                ? cluster.categoryName.slice(0, 10) + "·"
                : cluster.categoryName.toUpperCase()}
            </text>
            {/* Mini-stack de cercles (les leviers) */}
            {visibleLevers.map((l, i) => {
              const y = stackTop + i * 6;
              const color = leverStateColor(leverStates[l.id]);
              return (
                <circle
                  key={l.id}
                  cx={X_INPUT}
                  cy={y}
                  r={2}
                  fill={color}
                  opacity={0.9}
                />
              );
            })}
            {/* Indicateur de débordement (+N) */}
            {overflow > 0 && (
              <text
                x={X_INPUT + 8}
                y={stackTop + (visibleLevers.length - 1) * 6 + 1}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 7,
                  fill: "var(--ink-faint)",
                }}
              >
                +{overflow}
              </text>
            )}
          </g>
        );
      })}

      {/* --- Couche cachée 1 (32 neurones) --- */}
      {h1Y.map((y, i) => (
        <circle
          key={`h1-${i}`}
          cx={X_HIDDEN1}
          cy={y}
          r={1.6}
          fill="var(--ink)"
          fillOpacity={hiddenOpacity}
        />
      ))}

      {/* --- Couche cachée 2 (32 neurones) --- */}
      {h2Y.map((y, i) => (
        <circle
          key={`h2-${i}`}
          cx={X_HIDDEN2}
          cy={y}
          r={1.6}
          fill="var(--ink)"
          fillOpacity={hiddenOpacity}
        />
      ))}

      {/* --- Couche de sortie (15 indicateurs) --- */}
      {indicators.map((ind, i) => {
        if (i >= OUTPUT_COUNT) return null;
        const y = outY[i];
        const color = indicatorStateColor(indicatorStates[ind.id]);
        const label = OUTPUT_SHORT[ind.id] ?? ind.id.slice(0, 6).toUpperCase();
        return (
          <g key={ind.id}>
            <circle cx={X_OUTPUT} cy={y} r={3} fill={color} fillOpacity={0.9} />
            <text
              x={X_OUTPUT + 9}
              y={y}
              dominantBaseline="middle"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                fill: "var(--ink-soft)",
                letterSpacing: "0.04em",
              }}
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// --- Section B : métriques d'apprentissage ---

// Mini-sparkline de la loss (50 derniers points). On stocke l'historique dans
// un useState mis à jour par useEffect sur lastLoss.
function LossSparkline({ loss }: { loss: number | undefined }) {
  const [values, setValues] = React.useState<number[]>([]);
  React.useEffect(() => {
    if (loss === undefined || !isFinite(loss)) return;
    setValues((prev) => {
      if (prev.length > 0 && prev[prev.length - 1] === loss) return prev;
      const next = [...prev, loss];
      if (next.length > 50) next.shift();
      return next;
    });
  }, [loss]);

  if (values.length < 2) {
    return (
      <div
        className="w-full border border-[var(--rule)] rounded-sm flex items-center justify-center"
        style={{ height: 32, background: "var(--surface)" }}
      >
        <span className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 9 }}>
          collecte…
        </span>
      </div>
    );
  }

  const W = 200;
  const H = 32;
  const padX = 1;
  const padY = 3;
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const span = mx - mn || 1;
  const n = values.length;
  const pts = values
    .map((v, i) => {
      const x = padX + (n === 1 ? 0 : (i / (n - 1)) * (W - padX * 2));
      const y = padY + (H - padY * 2) - ((v - mn) / span) * (H - padY * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const lastIdx = n - 1;
  const lastX = padX + (lastIdx / (n - 1)) * (W - padX * 2);
  const lastY = padY + (H - padY * 2) - ((values[lastIdx] - mn) / span) * (H - padY * 2);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      style={{ display: "block" }}
      role="img"
      aria-label={`Évolution de la loss sur ${n} points, min ${mn.toFixed(4)}, max ${mx.toFixed(4)}`}
    >
      <polyline
        points={pts}
        fill="none"
        stroke="var(--ink)"
        strokeWidth={1}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lastX} cy={lastY} r={1.5} fill="var(--ink)" />
    </svg>
  );
}

function MetricRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-[var(--rule-soft)] last:border-b-0">
      <div className="flex flex-col">
        <span
          className="font-mono text-[var(--ink-mute)] uppercase"
          style={{ fontSize: 9, letterSpacing: "0.06em" }}
        >
          {label}
        </span>
        {hint && (
          <span className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 8 }}>
            {hint}
          </span>
        )}
      </div>
      <span
        className="font-mono text-[var(--ink)] tabular-nums"
        style={{ fontSize: 12 }}
      >
        {value}
      </span>
    </div>
  );
}

function LearningMetrics() {
  const stats = useSimulation((s) => s.state.networkStats);

  const arch = stats?.architecture ?? "47→32→32→15";
  const params = stats?.parameters ?? 3008;
  const total = stats?.totalWeights ?? 3008;
  const active = stats?.activeWeights ?? 0;
  const epoch = stats?.epoch ?? 0;
  const samples = stats?.totalSamples ?? 0;
  const loss = stats?.lastLoss ?? 0;
  const maxW = stats?.maxWeight ?? 0;
  const avgW = stats?.avgWeight ?? 0;

  const activePct = total > 0 ? (active / total) * 100 : 0;

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-[var(--rule)]">
        <h3
          className="font-mono uppercase tracking-wider text-[var(--ink)]"
          style={{ fontSize: 10, fontWeight: 600 }}
        >
          Métriques d'apprentissage
        </h3>
        <p className="font-mono text-[var(--ink-faint)] mt-0.5" style={{ fontSize: 9 }}>
          MLP 47→32→32→15 · pré-entraîné sur formules
        </p>
      </div>

      <div className="flex-1 sd-scroll overflow-y-auto px-3 py-2">
        {/* Architecture + params (gros chiffres) */}
        <div className="mb-2 pb-2 border-b border-[var(--rule-soft)]">
          <div className="flex items-baseline gap-2">
            <span
              className="font-mono text-[var(--ink-mute)] uppercase"
              style={{ fontSize: 9, letterSpacing: "0.06em" }}
            >
              Architecture
            </span>
          </div>
          <div
            className="font-mono text-[var(--ink)] tabular-nums mt-0.5"
            style={{ fontSize: 16, letterSpacing: "0.04em" }}
          >
            {arch}
          </div>
          <div className="flex items-baseline justify-between mt-2">
            <span
              className="font-mono text-[var(--ink-mute)] uppercase"
              style={{ fontSize: 9, letterSpacing: "0.06em" }}
            >
              Transistors
            </span>
            <span
              className="font-mono text-[var(--ink)] tabular-nums font-semibold"
              style={{ fontSize: 20, letterSpacing: "0.02em" }}
            >
              {params.toLocaleString("fr-FR")}
            </span>
          </div>
        </div>

        {/* Poids actifs + barre */}
        <div className="mb-2 pb-2 border-b border-[var(--rule-soft)]">
          <div className="flex items-baseline justify-between">
            <span
              className="font-mono text-[var(--ink-mute)] uppercase"
              style={{ fontSize: 9, letterSpacing: "0.06em" }}
            >
              Poids actifs
            </span>
            <span className="font-mono text-[var(--ink)] tabular-nums" style={{ fontSize: 11 }}>
              {active.toLocaleString("fr-FR")} / {total.toLocaleString("fr-FR")}
            </span>
          </div>
          <div
            className="w-full mt-1 border border-[var(--rule)]"
            style={{ height: 6, background: "var(--surface)" }}
            role="progressbar"
            aria-valuenow={Math.round(activePct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Poids actifs"
          >
            <div
              style={{
                width: `${activePct.toFixed(2)}%`,
                height: "100%",
                background: "var(--ink)",
                transition: "width 200ms ease-out",
              }}
            />
          </div>
          <span className="font-mono text-[var(--ink-faint)] mt-0.5 block" style={{ fontSize: 8 }}>
            {activePct.toFixed(1)} % des synapses non nulles
          </span>
        </div>

        {/* Métriques simples */}
        <MetricRow label="Epochs" value={epoch.toLocaleString("fr-FR")} />
        <MetricRow
          label="Documents"
          value={samples.toLocaleString("fr-FR")}
          hint="points de données vus"
        />
        <MetricRow
          label="Loss (MSE)"
          value={loss.toFixed(4)}
          hint="erreur courante"
        />

        {/* Sparkline de la loss */}
        <div className="mt-2 pt-2 border-t border-[var(--rule-soft)]">
          <div className="flex items-baseline justify-between mb-1">
            <span
              className="font-mono text-[var(--ink-mute)] uppercase"
              style={{ fontSize: 9, letterSpacing: "0.06em" }}
            >
              Tendance loss
            </span>
            <span className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 8 }}>
              50 derniers ticks
            </span>
          </div>
          <LossSparkline loss={stats?.lastLoss} />
        </div>

        {/* Max + avg poids */}
        <div className="mt-2 pt-2 border-t border-[var(--rule-soft)] grid grid-cols-2 gap-2">
          <div>
            <span
              className="font-mono text-[var(--ink-mute)] uppercase block"
              style={{ fontSize: 9, letterSpacing: "0.06em" }}
            >
              Poids max
            </span>
            <span className="font-mono text-[var(--ink)] tabular-nums" style={{ fontSize: 13 }}>
              {maxW.toFixed(3)}
            </span>
          </div>
          <div>
            <span
              className="font-mono text-[var(--ink-mute)] uppercase block"
              style={{ fontSize: 9, letterSpacing: "0.06em" }}
            >
              Poids moyen
            </span>
            <span className="font-mono text-[var(--ink)] tabular-nums" style={{ fontSize: 13 }}>
              {avgW.toFixed(4)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Section C : nourrir le réseau ---

interface Preset {
  label: string;
  description: string;
  levers: Record<string, number>;
  targets: Record<string, number>;
}

const PRESETS: Preset[] = [
  {
    label: "Doc : croissance forte",
    description: "Cible croissance PIB +5 %",
    levers: { interest_rate: 1.5, public_investment: 350, corporate_tax_rate: 17 },
    targets: { gdp_growth: 5 },
  },
  {
    label: "Doc : crise inflation",
    description: "Cible inflation +8 %",
    levers: { vat_rate: 24, subsidies: 15, interest_rate: 1.0 },
    targets: { inflation: 8 },
  },
  {
    label: "Doc : plein emploi",
    description: "Cible chômage 5 %",
    levers: { public_investment: 320, minimum_wage: 3500, subsidies: 35 },
    targets: { unemployment: 5 },
  },
];

const DEFAULT_DOC = `{
  "levers": { "vat_rate": 22, "minimum_wage": 3500 },
  "targets": { "gdp": 1500, "unemployment": 8 }
}`;

function LearnResultBanner({ result }: { result: LearnResult | null }) {
  // Lit le totalSamples EN DIRECT depuis l'état (peut être rafraîchi par le
  // prochain tick `state` après l'événement `learn-result`).
  const liveTotalSamples = useSimulation((s) => s.state.networkStats?.totalSamples ?? 0);
  if (!result) return null;
  const before = result.lossBefore;
  const after = result.lossAfter;
  const improved = before !== null && after <= before;
  const total = Math.max(liveTotalSamples, result.totalSamples);
  return (
    <div
      className="mt-2 p-2 border rounded-sm"
      style={{
        borderColor: improved ? "var(--ink)" : "var(--state-tension)",
        background: "var(--surface)",
      }}
      role="status"
      aria-live="polite"
    >
      <div className="font-mono text-[var(--ink)]" style={{ fontSize: 10, fontWeight: 600 }}>
        {result.accepted ? "Réseau mis à jour" : "Apprentissage refusé"}
      </div>
      <div className="font-mono text-[var(--ink-soft)] mt-0.5 tabular-nums" style={{ fontSize: 10 }}>
        Loss :{" "}
        {before !== null ? before.toFixed(4) : "—"} →{" "}
        <span style={{ color: improved ? "var(--ink)" : "var(--state-tension)" }}>
          {after.toFixed(4)}
        </span>
      </div>
      <div className="font-mono text-[var(--ink-faint)] mt-0.5" style={{ fontSize: 9 }}>
        {total.toLocaleString("fr-FR")} documents au total
      </div>
    </div>
  );
}

function NourrirPanel() {
  const learn = useSimulation((s) => s.learn);
  const learnPending = useSimulation((s) => s.learnPending);
  const lastLearn = useSimulation((s) => s.lastLearnResult);

  const [doc, setDoc] = React.useState<string>(DEFAULT_DOC);
  const [error, setError] = React.useState<string | null>(null);

  const handleLearn = React.useCallback(() => {
    setError(null);
    let parsed: { levers?: Record<string, number>; targets?: Record<string, number> };
    try {
      parsed = JSON.parse(doc);
    } catch (e) {
      setError("JSON invalide — vérifiez la syntaxe");
      return;
    }
    if (!parsed || typeof parsed !== "object") {
      setError("Document vide");
      return;
    }
    const levers = parsed.levers;
    const targets = parsed.targets;
    if (
      !levers ||
      !targets ||
      typeof levers !== "object" ||
      typeof targets !== "object"
    ) {
      setError("Champs 'levers' et 'targets' requis (objets)");
      return;
    }
    // Sanitizer : ne garder que les nombres.
    const cleanLevers: Record<string, number> = {};
    for (const [k, v] of Object.entries(levers)) {
      if (typeof v === "number" && isFinite(v)) cleanLevers[k] = v;
    }
    const cleanTargets: Record<string, number> = {};
    for (const [k, v] of Object.entries(targets)) {
      if (typeof v === "number" && isFinite(v)) cleanTargets[k] = v;
    }
    if (Object.keys(cleanLevers).length === 0 || Object.keys(cleanTargets).length === 0) {
      setError("Au moins 1 levier et 1 cible requis");
      return;
    }
    learn(cleanLevers, cleanTargets);
  }, [doc, learn]);

  const handlePreset = React.useCallback(
    (p: Preset) => {
      setDoc(JSON.stringify({ levers: p.levers, targets: p.targets }, null, 2));
      setError(null);
      learn(p.levers, p.targets);
    },
    [learn],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-[var(--rule)]">
        <h3
          className="font-mono uppercase tracking-wider text-[var(--ink)]"
          style={{ fontSize: 10, fontWeight: 600 }}
        >
          Nourrir le réseau
        </h3>
        <p className="font-mono text-[var(--ink-faint)] mt-0.5" style={{ fontSize: 9 }}>
          Injecter un document — le MLP apprend 1 pas de gradient
        </p>
      </div>

      <div className="flex-1 sd-scroll overflow-y-auto px-3 py-2 flex flex-col gap-2">
        {/* Presets */}
        <div>
          <span
            className="font-mono text-[var(--ink-mute)] uppercase block mb-1"
            style={{ fontSize: 9, letterSpacing: "0.06em" }}
          >
            Documents pré-configurés
          </span>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className="sd-chip"
                onClick={() => handlePreset(p)}
                aria-label={`${p.label} — ${p.description}`}
                title={p.description}
                disabled={learnPending}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Éditeur JSON */}
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <span
              className="font-mono text-[var(--ink-mute)] uppercase"
              style={{ fontSize: 9, letterSpacing: "0.06em" }}
            >
              Document (JSON)
            </span>
            <span className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 8 }}>
              {`{ levers, targets }`}
            </span>
          </div>
          <textarea
            value={doc}
            onChange={(e) => setDoc(e.target.value)}
            spellCheck={false}
            aria-label="Document JSON à apprendre"
            className="w-full font-mono text-[var(--ink)] border border-[var(--rule)] rounded-sm px-2 py-1.5 sd-scroll"
            style={{
              fontSize: 10,
              minHeight: 96,
              resize: "vertical",
              background: "var(--surface)",
              lineHeight: 1.4,
            }}
          />
        </div>

        {/* Erreur de parsing */}
        {error && (
          <div
            className="font-mono px-2 py-1 border rounded-sm"
            style={{
              fontSize: 9,
              color: "var(--state-crisis)",
              borderColor: "var(--state-crisis)",
              background: "var(--surface)",
            }}
            role="alert"
          >
            {error}
          </div>
        )}

        {/* Bouton APPRENDRE */}
        <button
          type="button"
          onClick={handleLearn}
          disabled={learnPending}
          aria-label="Apprendre le document au réseau"
          className="font-mono uppercase border rounded-sm px-3 py-2 transition-colors disabled:opacity-50"
          style={{
            fontSize: 11,
            letterSpacing: "0.08em",
            color: learnPending ? "var(--ink-mute)" : "var(--paper)",
            background: learnPending ? "var(--rule)" : "var(--ink)",
            borderColor: "var(--ink)",
          }}
        >
          {learnPending ? "apprentissage…" : "apprendre"}
        </button>

        {/* Résultat */}
        <LearnResultBanner result={lastLearn} />
      </div>
    </div>
  );
}

// --- Composant principal ---

export function NeuralView() {
  return (
    <div className="h-full w-full flex flex-col">
      {/* En-tête */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--rule)] shrink-0">
        <h3
          className="font-mono uppercase tracking-wider text-[var(--ink)]"
          style={{ fontSize: 10, fontWeight: 600 }}
        >
          Réseau neuronal
        </h3>
        <span className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 9 }}>
          MLP 47→32→32→15 · 3008 transistors
        </span>
      </div>

      {/* Body — flex-col : diagramme en haut, deux panneaux en bas.
          Sur mobile, on stack verticalement avec hauteurs minimales ; sur
          desktop (lg+) on partage l'espace via flex. */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row sd-scroll overflow-y-auto lg:overflow-hidden">
        {/* Section A — schéma (pleine largeur en haut) */}
        <section
          className="lg:flex-[3] lg:min-h-0 border-b lg:border-b-0 lg:border-r border-[var(--rule)] relative shrink-0"
          style={{ height: 300, minHeight: 300 }}
          aria-label="Architecture du réseau"
        >
          <ArchitectureDiagram />
        </section>

        {/* Sections B + C — colonne de droite (desktop) ou dessous (mobile) */}
        <div className="lg:flex-[2] flex flex-col min-h-0">
          <section
            className="flex-1 border-b border-[var(--rule)] min-h-0"
            style={{ minHeight: 240 }}
            aria-label="Métriques d'apprentissage"
          >
            <LearningMetrics />
          </section>
          <section
            className="flex-1 min-h-0"
            style={{ minHeight: 280 }}
            aria-label="Nourrir le réseau"
          >
            <NourrirPanel />
          </section>
        </div>
      </div>
    </div>
  );
}
