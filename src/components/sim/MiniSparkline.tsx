"use client";

// MiniSparkline.tsx — SVG polyline mémoïsé, 1px ink.
// Affiche une ligne pointillée optionnelle comme référence (baseline).
// Couleur par état : ink (normal), ochre (warning), bordeaux (critical).

import * as React from "react";

export type SparklineState = "normal" | "warning" | "critical";

interface MiniSparklineProps {
  values: number[];
  width?: number;
  height?: number;
  state?: SparklineState;
  referenceValue?: number; // ligne pointillée
  showDraw?: boolean; // animation draw-in 800ms
  className?: string;
}

const STATE_STROKE: Record<SparklineState, string> = {
  normal: "var(--ink)",
  warning: "var(--state-tension)",
  critical: "var(--state-crisis)",
};

export const MiniSparkline = React.memo(function MiniSparkline({
  values,
  width = 200,
  height = 50,
  state = "normal",
  referenceValue,
  showDraw = false,
  className,
}: MiniSparklineProps) {
  const id = React.useId();

  // Calculer la polyline. On garde au moins 2 points.
  const { points, minY, maxY, refY } = React.useMemo(() => {
    if (!values || values.length === 0) {
      return { points: "", minY: 0, maxY: 1, refY: null as number | null };
    }
    let mn = Math.min(...values);
    let mx = Math.max(...values);
    if (referenceValue !== undefined) {
      mn = Math.min(mn, referenceValue);
      mx = Math.max(mx, referenceValue);
    }
    if (mn === mx) {
      mn -= 1;
      mx += 1;
    }
    const pad = (mx - mn) * 0.1;
    mn -= pad;
    mx += pad;
    const padX = 1;
    const padY = 2;
    const w = width - padX * 2;
    const h = height - padY * 2;
    const n = values.length;
    const pts = values
      .map((v, i) => {
        const x = padX + (n === 1 ? w / 2 : (i / (n - 1)) * w);
        const y = padY + h - ((v - mn) / (mx - mn)) * h;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
    let computedRefY: number | null = null;
    if (referenceValue !== undefined) {
      computedRefY = padY + h - ((referenceValue - mn) / (mx - mn)) * h;
    }
    return { points: pts, minY: mn, maxY: mx, refY: computedRefY };
  }, [values, width, height, referenceValue]);

  if (!values || values.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={className}
        aria-hidden="true"
      >
        <line
          x1={1}
          y1={height / 2}
          x2={width - 1}
          y2={height / 2}
          style={{ stroke: "var(--rule-strong)", strokeWidth: 1 }}
        />
      </svg>
    );
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={`Tendance (${values.length} points, min ${minY.toFixed(2)}, max ${maxY.toFixed(2)})`}
    >
      {/* Ligne pointillée de référence (baseline) */}
      {refY !== null && (
        <line
          x1={1}
          y1={refY}
          x2={width - 1}
          y2={refY}
          className="sd-dashed-ref"
          style={{ stroke: "var(--ink-faint)", strokeWidth: 1 }}
        />
      )}
      {/* Polyline */}
      <polyline
        points={points}
        fill="none"
        style={{
          stroke: STATE_STROKE[state],
          strokeWidth: 1,
          strokeLinejoin: "round",
          strokeLinecap: "round",
        }}
        className={showDraw ? "sd-sparkline-draw" : undefined}
      />
      {/* Dernier point — petit marqueur */}
      {(() => {
        const lastIdx = values.length - 1;
        const padX = 1;
        const padY = 2;
        const w = width - padX * 2;
        const h = height - padY * 2;
        const x = padX + (lastIdx / (values.length - 1)) * w;
        const y = padY + h - ((values[lastIdx] - minY) / (maxY - minY)) * h;
        return <circle cx={x} cy={y} r={1.5} style={{ fill: STATE_STROKE[state] }} />;
      })()}
      <title>{`${values.length} points · min ${minY.toFixed(2)} · max ${maxY.toFixed(2)}`}</title>
    </svg>
  );
});
