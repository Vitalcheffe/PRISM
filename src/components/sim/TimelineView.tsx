"use client";

// TimelineView.tsx — Vue TRAJECTOIRE : séries temporelles globales du run.
//
// Montre l'évolution des indicateurs clés (stabilité, dette/PIB, PIB, chômage,
// inflation, risque) sur toute la durée du run. Le joueur voit où sa politique
// mène le pays sur le long terme.
//
// L'historique est maintenu côté client (historyBuffer dans le hook) — le
// serveur n'envoie que les valeurs courantes. On accumule jusqu'à 200 points.

import * as React from "react";
import { useSimulation } from "@/hooks/use-simulation";

const MAX_POINTS = 200;

interface Series {
  id: string;
  label: string;
  color: string;
  data: number[];
  unit: string;
  min: number;
  max: number;
}

function extractSeries(history: Record<string, number[]>): Series[] {
  const get = (key: string) => {
    const arr = history[key];
    return Array.isArray(arr) ? arr.slice(-MAX_POINTS) : [];
  };

  return [
    {
      id: "stability",
      label: "Stabilité",
      color: "var(--ink)",
      data: get("ind_stability"),
      unit: "/100",
      min: 0,
      max: 100,
    },
    {
      id: "debt",
      label: "Dette / PIB",
      color: "var(--state-tension)",
      data: get("ind_debt_to_gdp"),
      unit: "%",
      min: 0,
      max: 150,
    },
    {
      id: "gdp",
      label: "PIB",
      color: "var(--ink-soft)",
      data: get("ind_gdp"),
      unit: "Mrd",
      min: 800,
      max: 2500,
    },
    {
      id: "unemployment",
      label: "Chômage",
      color: "var(--state-crisis)",
      data: get("ind_unemployment"),
      unit: "%",
      min: 0,
      max: 30,
    },
    {
      id: "inflation",
      label: "Inflation",
      color: "var(--ink-mute)",
      data: get("ind_inflation"),
      unit: "%",
      min: -5,
      max: 20,
    },
    {
      id: "risk",
      label: "Risque instabilité",
      color: "var(--state-crisis)",
      data: get("ind_revolution_risk"),
      unit: "/100",
      min: 0,
      max: 100,
    },
  ];
}

function Sparkline({ series }: { series: Series }) {
  const data = series.data;
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-12 font-mono text-[var(--ink-faint)]" style={{ fontSize: 9 }}>
        En attente de données…
      </div>
    );
  }

  const w = 200;
  const h = 44;
  const range = series.max - series.min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const clamped = Math.max(series.min, Math.min(series.max, v));
      const y = h - ((clamped - series.min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const current = data[data.length - 1];
  const first = data[0];
  const delta = current - first;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="font-mono" style={{ fontSize: 9, color: "var(--ink-mute)" }}>
          {series.label}
        </span>
        <span className="font-mono font-semibold" style={{ fontSize: 11, color: series.color }}>
          {current.toFixed(series.unit === "Mrd" ? 0 : 1)}
          <span style={{ fontSize: 9, color: "var(--ink-faint)" }}> {series.unit}</span>
        </span>
      </div>
      <svg width={w} height={h} style={{ display: "block" }} aria-hidden>
        {/* Ligne de référence (valeur initiale) */}
        <line
          x1="0"
          y1={h - ((first - series.min) / range) * h}
          x2={w}
          y2={h - ((first - series.min) / range) * h}
          stroke="var(--rule-strong)"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
        {/* Courbe */}
        <polyline
          points={pts}
          fill="none"
          stroke={series.color}
          strokeWidth="1"
          style={{ vectorEffect: "non-scaling-stroke" }}
        />
        {/* Point final */}
        <circle
          cx={w}
          cy={h - ((current - series.min) / range) * h}
          r="2"
          fill={series.color}
        />
      </svg>
      <div className="flex items-baseline justify-between">
        <span className="font-mono" style={{ fontSize: 8, color: "var(--ink-faint)" }}>
          T0 → T{data.length - 1}
        </span>
        <span
          className="font-mono"
          style={{
            fontSize: 9,
            color: delta > 0 ? (series.id === "debt" || series.id === "unemployment" || series.id === "inflation" || series.id === "risk" ? "var(--state-tension)" : "var(--ink)") : delta < 0 ? (series.id === "debt" || series.id === "unemployment" || series.id === "inflation" || series.id === "risk" ? "var(--ink)" : "var(--state-tension)") : "var(--ink-faint)",
          }}
        >
          {delta > 0 ? "+" : ""}{delta.toFixed(series.unit === "Mrd" ? 0 : 1)}
        </span>
      </div>
    </div>
  );
}

export function TimelineView() {
  const history = useSimulation((s) => s.state.history);
  const tick = useSimulation((s) => s.state.tick);

  const series = React.useMemo(() => extractSeries(history), [history]);

  return (
    <div className="h-full w-full flex flex-col">
      {/* En-tête */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--rule)]">
        <h3 className="font-mono uppercase tracking-wider text-[var(--ink-mute)]" style={{ fontSize: 10 }}>
          Trajectoire du run
        </h3>
        <span className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 9 }}>
          T{String(tick ?? 0).padStart(4, "0")} · {series[0]?.data.length ?? 0} points
        </span>
      </div>

      {/* Grille de sparklines */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {series.map((s) => (
            <div
              key={s.id}
              className="p-3 border border-[var(--rule)]"
              style={{ background: "var(--surface)" }}
            >
              <Sparkline series={s} />
            </div>
          ))}
        </div>

        {/* Note explicative */}
        <div className="mt-4 p-3 border-l-2 border-[var(--rule-strong)]">
          <p className="font-mono leading-relaxed" style={{ fontSize: 10, color: "var(--ink-soft)" }}>
            Chaque courbe trace l'évolution d'un indicateur dérivé depuis le début du run.
            La ligne pointillée est la valeur initiale. Le point est la valeur courante.
            Un décret ou ajustement de levier modifie immédiatement les indicateurs —
            la trajectoire se met à jour en temps réel.
          </p>
        </div>
      </div>
    </div>
  );
}
