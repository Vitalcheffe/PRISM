"use client";

// MetricsView.tsx — Vue centrale MÉTRIQUES.
//
// Grid 3×2 (ou responsive) de 15 sparkline cards, une par indicateur dérivé.
// Chaque carte :
//   - Title (10px mono uppercase, ink-mute)
//   - Current value (mono 16px, ink/ochre/bordeaux by state)
//   - Unit (10px, ink-faint)
//   - FORMULA in small mono 9px grey (proof it's computed)
//   - Sparkline (200×50px) of last 80 values from state.history["ind_"+id].
//   - Dashed reference line at baseline (initial computed value).

import * as React from "react";
import { useSimulation } from "@/hooks/use-simulation";
import { formatIndicatorValue } from "@/lib/sim-types";
import { MiniSparkline, type SparklineState } from "./MiniSparkline";

function MetricCard({
  id,
  name,
  formula,
  unit,
  displayFormat,
  description,
}: {
  id: string;
  name: string;
  formula: string;
  unit: string;
  displayFormat: string;
  description: string;
}) {
  const value = useSimulation((s) => s.state.indicators[id]);
  const state = useSimulation((s) => s.state.indicatorStates[id]);
  const history = useSimulation((s) => s.state.history[`ind_${id}`]);
  const baseline = useSimulation((s) => {
    // La première valeur de l'historique est le baseline.
    const arr = s.state.history[`ind_${id}`];
    return arr && arr.length > 0 ? arr[0] : undefined;
  });

  // Clamp l'historique à 80 valeurs (le serveur envoie la série complète).
  const series = React.useMemo(() => {
    if (!history || history.length === 0) return [];
    return history.slice(-80);
  }, [history]);

  const sparkState: SparklineState =
    state === "critical" ? "critical" : state === "warning" ? "warning" : "normal";

  const tone =
    state === "critical"
      ? "var(--state-crisis)"
      : state === "warning"
        ? "var(--state-tension)"
        : "var(--ink)";

  const formatted = formatIndicatorValue(value ?? 0, displayFormat as any, unit);

  return (
    <article
      className="bg-[var(--surface)] border border-[var(--rule)] p-3 flex flex-col gap-1.5"
      style={{ borderRadius: "0.25rem" }}
    >
      <header className="flex items-baseline justify-between">
        <h3
          className="font-mono uppercase tracking-wider text-[var(--ink-mute)]"
          style={{ fontSize: 10 }}
        >
          {name}
        </h3>
        <span className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 9 }}>
          {unit}
        </span>
      </header>
      <div className="flex items-baseline gap-1">
        <span
          className="font-mono font-semibold sd-value-trans"
          style={{ fontSize: 16, color: tone }}
        >
          {formatted}
        </span>
      </div>
      <p
        className="font-mono text-[var(--ink-faint)]"
        style={{ fontSize: 9 }}
        title={description}
      >
        {formula}
      </p>
      <div className="mt-1">
        <MiniSparkline
          values={series}
          width={220}
          height={50}
          state={sparkState}
          referenceValue={baseline}
          showDraw={series.length === 80}
        />
      </div>
    </article>
  );
}

export function MetricsView() {
  const indicators = useSimulation((s) => s.indicators);

  if (indicators.length === 0) {
    return (
      <div
        className="h-full flex items-center justify-center font-mono text-[var(--ink-faint)]"
        style={{ fontSize: 11 }}
      >
        En attente des indicateurs…
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto sd-scroll p-4">
      <header className="mb-4 flex items-baseline justify-between">
        <h2
          className="font-mono uppercase tracking-wider text-[var(--ink)]"
          style={{ fontSize: 11, fontWeight: 600 }}
        >
          Métriques dérivées
        </h2>
        <span className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 9 }}>
          {indicators.length} indicateurs · calculés à chaque tick
        </span>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {indicators.map((ind) => (
          <MetricCard
            key={ind.id}
            id={ind.id}
            name={ind.name}
            formula={ind.formula}
            unit={ind.unit}
            displayFormat={ind.displayFormat}
            description={ind.description}
          />
        ))}
      </div>
    </div>
  );
}
