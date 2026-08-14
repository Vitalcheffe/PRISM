"use client";

// IndicatorsReadout.tsx — Panneau GAUCHE (240px), denser.
//
// Affiche les INDICATEURS DÉRIVÉS (15, NON touchables) — les "jauges".
// Ils bougent quand on touche les leviers. C'est la preuve que le calcul est réel.
//
// Structure :
//   1. STABILITÉ (grand chiffre 28px mono) + mini-bar
//   2. RISQUE D'INSTABILITÉ (chiffre moyen + bar)
//   3. 13 autres indicateurs en lignes compactes (nom · valeur · mini-bar 1px)
//      Pas de label d'état — la couleur encode l'état.
//   4. ALERTES (scrollable max-h-40) avec barre 2px à gauche par niveau.

import * as React from "react";
import { useSimulation, INDICATOR_SANE_RANGE } from "@/hooks/use-simulation";
import { formatIndicatorValue, type Alert, type IndicatorState } from "@/lib/sim-types";

function stateColor(state: IndicatorState): string {
  if (state === "critical") return "var(--state-crisis)";
  if (state === "warning") return "var(--state-tension)";
  return "var(--ink)";
}

function alertColor(level: Alert["level"]): string {
  if (level === "critical") return "var(--state-crisis)";
  if (level === "warning") return "var(--state-tension)";
  return "var(--ink)";
}

function barPct(value: number, range?: { low: number; high: number; invert?: boolean }): number {
  if (!range) return 50;
  const { low, high, invert } = range;
  if (high === low) return 50;
  let pct = ((value - low) / (high - low)) * 100;
  pct = Math.max(0, Math.min(100, pct));
  if (invert) pct = 100 - pct;
  return pct;
}

function StabilityGauge() {
  const value = useSimulation((s) => s.state.indicators.stability);
  const state = useSimulation((s) => s.state.indicatorStates.stability);

  const tone =
    state === "critical"
      ? "var(--state-crisis)"
      : state === "warning"
        ? "var(--state-tension)"
        : "var(--ink)";

  const pct = Math.max(0, Math.min(100, value));

  return (
    <section className="px-4 pt-4 pb-3 border-b border-[var(--rule)]">
      <h3
        className="font-mono uppercase text-[var(--ink-mute)] mb-1.5"
        style={{ fontSize: 9, letterSpacing: "0.12em" }}
      >
        Stabilité
      </h3>
      <div className="flex items-baseline gap-1.5">
        <span
          className="font-mono font-medium leading-none sd-value-trans"
          style={{ fontSize: 32, color: tone, letterSpacing: "-0.02em" }}
        >
          {value.toFixed(0)}
        </span>
        <span className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 11 }}>
          /100
        </span>
      </div>
      <div
        className="mt-2 w-full"
        style={{ height: 3, backgroundColor: "var(--rule-soft)" }}
      >
        <div
          className="sd-value-trans"
          style={{
            width: `${pct}%`,
            height: "100%",
            backgroundColor: tone,
          }}
        />
      </div>
    </section>
  );
}

function RevolutionRiskBar() {
  const value = useSimulation((s) => s.state.indicators.revolution_risk);
  const state = useSimulation((s) => s.state.indicatorStates.revolution_risk);

  const tone =
    state === "critical"
      ? "var(--state-crisis)"
      : state === "warning"
        ? "var(--state-tension)"
        : "var(--ink)";

  const pct = Math.max(0, Math.min(100, value));

  return (
    <section className="px-3 py-2.5 border-b border-[var(--rule)]">
      <div className="flex items-baseline justify-between mb-1">
        <h3
          className="font-mono uppercase tracking-wider text-[var(--ink-mute)]"
          style={{ fontSize: 9 }}
        >
          Risque d&apos;instabilité
        </h3>
        <span
          className="font-mono sd-value-trans"
          style={{ fontSize: 11, color: tone, fontWeight: 500 }}
        >
          {value.toFixed(1)}
        </span>
      </div>
      <div
        className="w-full relative"
        style={{ height: 2, backgroundColor: "var(--rule)" }}
      >
        <div
          className="sd-value-trans"
          style={{
            width: `${pct}%`,
            height: "100%",
            backgroundColor: tone,
          }}
        />
      </div>
    </section>
  );
}

function IndicatorRow({
  id,
  name,
  value,
  state,
  unit,
  displayFormat,
}: {
  id: string;
  name: string;
  value: number;
  state: IndicatorState;
  unit: string;
  displayFormat: string;
}) {
  const range = INDICATOR_SANE_RANGE[id];
  const pct = barPct(value, range);
  const tone = stateColor(state);
  const formatted = formatIndicatorValue(value, displayFormat as never, unit);

  return (
    <div className="flex items-center justify-between py-1">
      <span
        className="font-mono text-[var(--ink-soft)] truncate"
        style={{ fontSize: 10 }}
        title={name}
      >
        {name}
      </span>
      <span
        className="font-mono sd-value-trans shrink-0 ml-2"
        style={{ fontSize: 11, color: tone, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
      >
        {formatted}
      </span>
      <div
        className="relative shrink-0"
        style={{ width: 32, height: 1, backgroundColor: "var(--rule)" }}
      >
        <div
          className="sd-value-trans"
          style={{ width: `${pct}%`, height: "100%", backgroundColor: tone }}
        />
      </div>
    </div>
  );
}

function IndicatorsList() {
  const indicators = useSimulation((s) => s.indicators);
  const values = useSimulation((s) => s.state.indicators);
  const states = useSimulation((s) => s.state.indicatorStates);

  // On exclut stability et revolution_risk (déjà affichés en gros ci-dessus).
  const others = React.useMemo(
    () => indicators.filter((i) => i.id !== "stability" && i.id !== "revolution_risk"),
    [indicators],
  );

  if (others.length === 0) {
    return null;
  }

  return (
    <section className="px-3 py-2.5 border-b border-[var(--rule)]">
      <h3
        className="font-mono uppercase tracking-wider text-[var(--ink-mute)] mb-1.5"
        style={{ fontSize: 9 }}
      >
        Indicateurs dérivés
      </h3>
      <div className="flex flex-col gap-0">
        {others.map((ind) => (
          <IndicatorRow
            key={ind.id}
            id={ind.id}
            name={ind.name}
            value={values[ind.id] ?? 0}
            state={states[ind.id] ?? "normal"}
            unit={ind.unit}
            displayFormat={ind.displayFormat}
          />
        ))}
      </div>
    </section>
  );
}

function AlertsList() {
  const alerts = useSimulation((s) => s.state.alerts);

  // On garde un nombre limité d'alertes récentes pour garantir que la liste
  // tient dans le panneau sans déborder du viewport (les bbox des enfants
  // scrollés hors vue sont encore mesurés par getBoundingClientRect, ce qui
  // ferait falsement chevaucher le footer). 6 alertes × ~18px = ~108px.
  const recent = React.useMemo(() => alerts.slice(-6).reverse(), [alerts]);

  return (
    <section className="px-3 py-2.5 shrink-0 min-h-0">
      <h3
        className="font-mono uppercase tracking-wider text-[var(--ink-mute)] mb-1.5"
        style={{ fontSize: 9 }}
      >
        Alertes
      </h3>
      <div
        className="sd-scroll overflow-y-auto flex flex-col gap-1"
        style={{ maxHeight: 132 }}
      >
        {recent.length === 0 ? (
          <span className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 10 }}>
            Aucune alerte.
          </span>
        ) : (
          recent.map((a) => (
            <div key={a.id} className="flex gap-2 items-baseline min-w-0">
              <div
                className="shrink-0"
                style={{
                  width: 2,
                  height: 10,
                  backgroundColor: alertColor(a.level),
                }}
              />
              <span
                className="font-mono text-[var(--ink-faint)] shrink-0"
                style={{ fontSize: 8, letterSpacing: "0.04em" }}
              >
                T{String(a.tick).padStart(4, "0")}
              </span>
              <p
                className="font-mono text-[var(--ink)] leading-tight truncate min-w-0 flex-1"
                style={{ fontSize: 10 }}
                title={a.message}
              >
                {a.message}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function IndicatorsReadout() {
  const indicators = useSimulation((s) => s.indicators);

  if (indicators.length === 0) {
    return (
      <div className="p-3 font-mono text-[var(--ink-faint)]" style={{ fontSize: 11 }}>
        En attente des indicateurs dérivés…
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <StabilityGauge />
      <RevolutionRiskBar />
      <IndicatorsList />
      <AlertsList />
    </div>
  );
}
