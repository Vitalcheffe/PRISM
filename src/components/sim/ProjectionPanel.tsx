"use client";

import React, { useMemo } from "react";
import type { ProjectionResult } from "@/lib/sim-types";

interface ProjectionPanelProps {
  result: ProjectionResult | null;
  projecting: boolean;
  onApply?: () => void;
  onDismiss?: () => void;
}

const VERDICT_COLORS: Record<string, { fg: string; bg: string; label: string }> = {
  favorable: { fg: "var(--ink)", bg: "var(--surface)", label: "FAVORABLE" },
  mitigé: { fg: "var(--ink-soft)", bg: "var(--surface)", label: "MITIGÉ" },
  défavorable: { fg: "var(--state-tension)", bg: "var(--surface)", label: "DÉFAVORABLE" },
  catastrophique: { fg: "var(--state-crisis)", bg: "var(--surface)", label: "CATASTROPHIQUE" },
};

function fmt(n: number, decimals = 1): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(decimals)}`;
}

function fmtPct(n: number): string {
  return `${fmt(n, 1)} pt`;
}

function fmtMrd(n: number): string {
  return `${fmt(n, 0)} Mrd`;
}

function DeltaRow({
  label,
  value,
  unit,
  goodWhenPositive,
}: {
  label: string;
  value: number;
  unit: "pt" | "Mrd" | "ans" | "score";
  goodWhenPositive: boolean;
}) {
  const isPositive = value > 0.01;
  const isNegative = value < -0.01;
  const isGood = isPositive === goodWhenPositive;
  const isBad = !isGood && (isPositive || isNegative);
  const color = isBad ? "var(--state-tension)" : "var(--ink)";
  const display =
    unit === "pt" ? fmtPct(value) :
    unit === "Mrd" ? fmtMrd(value) :
    unit === "ans" ? fmt(value, 1) :
    fmt(value, 3);
  return (
    <div className="flex items-center justify-between py-1" style={{ borderBottom: "1px solid var(--rule-soft)" }}>
      <span className="font-mono text-[10px]" style={{ color: "var(--ink-mute)" }}>{label}</span>
      <span className="font-mono text-[11px] font-semibold" style={{ color }}>
        {display}
      </span>
    </div>
  );
}

function TrajectorySparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const w = 220;
  const h = 36;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }} aria-hidden>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1"
        style={{ vectorEffect: "non-scaling-stroke" }}
      />
      {/* Ligne de référence (valeur initiale) */}
      <line
        x1="0"
        y1={h - ((values[0] - min) / range) * h}
        x2={w}
        y2={h - ((values[0] - min) / range) * h}
        stroke="var(--rule-strong)"
        strokeWidth="1"
        strokeDasharray="2 2"
      />
    </svg>
  );
}

export function ProjectionPanel({ result, projecting, onApply, onDismiss }: ProjectionPanelProps) {
  if (projecting) {
    return (
      <div className="p-3" style={{ borderTop: "1px solid var(--rule)" }}>
        <p className="font-mono text-[10px]" style={{ color: "var(--ink-mute)" }}>
          PROJECTION EN COURS…
        </p>
        <div className="mt-2 h-px w-full" style={{ background: "var(--rule)" }}>
          <div
            className="h-px"
            style={{
              background: "var(--ink)",
              width: "40%",
              animation: "sd-pulse-ink 1s ease-in-out infinite",
            }}
          />
        </div>
      </div>
    );
  }

  if (!result) return null;

  const verdict = VERDICT_COLORS[result.verdict.label] || VERDICT_COLORS.mitigé;
  const t = result.trajectory;
  const stabilitySeries = t.map((p) => p.stability);
  const debtSeries = t.map((p) => p.debtToGdp);
  const gdpSeries = t.map((p) => p.gdp);
  const unempSeries = t.map((p) => p.unemployment);

  return (
    <div className="sd-fade-in p-3" style={{ borderTop: "1px solid var(--rule)" }}>
      {/* Verdict */}
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[9px] uppercase tracking-wider" style={{ color: "var(--ink-mute)" }}>
          PROJECTION · {t.length} TICKS
        </span>
        <span
          className="font-mono text-[10px] font-bold px-2 py-0.5"
          style={{ color: verdict.fg, border: `1px solid ${verdict.fg}` }}
        >
          {verdict.label.toUpperCase()}
        </span>
      </div>

      {result.crashed && (
        <p className="font-mono text-[10px] mb-2" style={{ color: "var(--state-crisis)" }}>
          ⚠ Effondrement : {result.crashReason}
        </p>
      )}

      {/* Score */}
      <div className="mb-3">
        <span className="font-mono text-[9px]" style={{ color: "var(--ink-mute)" }}>SCORE </span>
        <span className="font-mono text-[14px] font-bold" style={{ color: verdict.fg }}>
          {result.verdict.score > 0 ? "+" : ""}{result.verdict.score}/100
        </span>
      </div>

      {/* Deltas */}
      <div className="mb-3">
        <DeltaRow label="Stabilité" value={result.deltas.stability} unit="pt" goodWhenPositive />
        <DeltaRow label="PIB" value={result.deltas.gdp} unit="Mrd" goodWhenPositive />
        <DeltaRow label="Dette / PIB" value={result.deltas.debtToGdp} unit="pt" goodWhenPositive={false} />
        <DeltaRow label="Chômage" value={result.deltas.unemployment} unit="pt" goodWhenPositive={false} />
        <DeltaRow label="Inflation" value={result.deltas.inflation} unit="pt" goodWhenPositive={false} />
        <DeltaRow label="Risque instabilité" value={result.deltas.revolutionRisk} unit="pt" goodWhenPositive={false} />
        <DeltaRow label="IDH" value={result.deltas.hdi} unit="score" goodWhenPositive />
        <DeltaRow label="Espérance de vie" value={result.deltas.lifeExpectancy} unit="ans" goodWhenPositive />
      </div>

      {/* Sparklines */}
      <div className="mb-3 space-y-2">
        <div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px]" style={{ color: "var(--ink-mute)" }}>STABILITÉ</span>
            <span className="font-mono text-[9px]" style={{ color: "var(--ink-mute)" }}>
              {t[0]?.stability.toFixed(0)} → {t[t.length - 1]?.stability.toFixed(0)}
            </span>
          </div>
          <TrajectorySparkline values={stabilitySeries} color="var(--ink)" />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px]" style={{ color: "var(--ink-mute)" }}>DETTE / PIB</span>
            <span className="font-mono text-[9px]" style={{ color: "var(--ink-mute)" }}>
              {t[0]?.debtToGdp.toFixed(1)}% → {t[t.length - 1]?.debtToGdp.toFixed(1)}%
            </span>
          </div>
          <TrajectorySparkline values={debtSeries} color="var(--state-tension)" />
        </div>
      </div>

      {/* Reasoning */}
      <p className="font-mono text-[10px] leading-relaxed mb-3" style={{ color: "var(--ink-soft)" }}>
        {result.verdict.reasoning}
      </p>

      {/* Actions */}
      <div className="flex gap-2">
        {onApply && !result.crashed && result.verdict.label !== "catastrophique" && (
          <button
            type="button"
            onClick={onApply}
            className="flex-1 font-mono text-[10px] font-semibold py-2"
            style={{
              border: "1px solid var(--ink)",
              background: "var(--ink)",
              color: "var(--paper)",
            }}
          >
            APPLIQUER LE DÉCRET
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="flex-1 font-mono text-[10px] py-2"
            style={{
              border: "1px solid var(--rule-strong)",
              background: "var(--surface)",
              color: "var(--ink-soft)",
            }}
          >
            FERMER
          </button>
        )}
      </div>
    </div>
  );
}
