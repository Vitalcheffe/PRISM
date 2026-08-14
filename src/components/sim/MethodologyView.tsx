"use client";

// MethodologyView.tsx — Vue centrale MÉTHODOLOGIE.
//
// - Résumé du modèle (41 leviers · 15 indicateurs · 8 catégories · données Maroc 2023).
// - Table LEVIERS : Nom · Catégorie · Valeur de base · Unité · Source · Bornes · Zone saine.
// - Table INDICATEURS : Nom · Formule · Unité · Description.
// - Note sur la provenance.

import * as React from "react";
import { useSimulation } from "@/hooks/use-simulation";
import { formatLeverValue } from "@/lib/sim-types";

function ModelSummary() {
  const levers = useSimulation((s) => s.levers);
  const indicators = useSimulation((s) => s.indicators);
  const categories = useSimulation((s) => s.categories);

  return (
    <section className="px-4 py-3 border-b border-[var(--rule)]">
      <h2
        className="font-mono uppercase tracking-wider text-[var(--ink)]"
        style={{ fontSize: 11, fontWeight: 600 }}
      >
        Modèle
      </h2>
      <p
        className="font-mono text-[var(--ink-soft)] mt-1"
        style={{ fontSize: 11 }}
      >
        {levers.length} leviers · {indicators.length} indicateurs dérivés ·{" "}
        {categories.length} catégories · données Maroc 2023
      </p>
    </section>
  );
}

function LeversTable() {
  const levers = useSimulation((s) => s.levers);
  const categories = useSimulation((s) => s.categories);

  const catName = React.useCallback(
    (code: string) => categories.find((c) => c.code === code)?.name ?? code,
    [categories],
  );

  if (levers.length === 0) return null;

  return (
    <section className="px-4 py-3 border-b border-[var(--rule)]">
      <h2
        className="font-mono uppercase tracking-wider text-[var(--ink)] mb-2"
        style={{ fontSize: 11, fontWeight: 600 }}
      >
        Leviers ({levers.length})
      </h2>
      <div
        className="sd-scroll overflow-y-auto"
        style={{ maxHeight: 320 }}
      >
        <table
          className="w-full font-mono border-collapse"
          style={{ fontSize: 10 }}
        >
          <thead className="sticky top-0 bg-[var(--paper)]">
            <tr className="text-left text-[var(--ink-mute)] border-b border-[var(--rule)]">
              <th className="py-1.5 pr-3 font-normal" style={{ fontSize: 9, textTransform: "uppercase" }}>
                Nom
              </th>
              <th className="py-1.5 pr-3 font-normal" style={{ fontSize: 9, textTransform: "uppercase" }}>
                Catégorie
              </th>
              <th className="py-1.5 pr-3 font-normal text-right" style={{ fontSize: 9, textTransform: "uppercase" }}>
                Base
              </th>
              <th className="py-1.5 pr-3 font-normal" style={{ fontSize: 9, textTransform: "uppercase" }}>
                Unité
              </th>
              <th className="py-1.5 pr-3 font-normal" style={{ fontSize: 9, textTransform: "uppercase" }}>
                Source
              </th>
              <th className="py-1.5 pr-3 font-normal" style={{ fontSize: 9, textTransform: "uppercase" }}>
                Bornes
              </th>
              <th className="py-1.5 pr-3 font-normal" style={{ fontSize: 9, textTransform: "uppercase" }}>
                Zone saine
              </th>
            </tr>
          </thead>
          <tbody>
            {levers.map((l) => (
              <tr key={l.id} className="sd-table-row">
                <td className="py-1.5 pr-3 text-[var(--ink)]">{l.name}</td>
                <td className="py-1.5 pr-3 text-[var(--ink-soft)]">{catName(l.category)}</td>
                <td className="py-1.5 pr-3 text-right text-[var(--ink)]">
                  {formatLeverValue(l.baseline, l.displayFormat, l.unit)}
                </td>
                <td className="py-1.5 pr-3 text-[var(--ink-faint)]">{l.unit}</td>
                <td className="py-1.5 pr-3 text-[var(--ink-soft)] truncate max-w-[160px]" title={l.source}>
                  {l.source}
                </td>
                <td className="py-1.5 pr-3 text-[var(--ink-faint)]">
                  {l.min}–{l.max}
                </td>
                <td className="py-1.5 pr-3 text-[var(--ink-faint)]">
                  {l.safeLow}–{l.safeHigh}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function IndicatorsTable() {
  const indicators = useSimulation((s) => s.indicators);

  if (indicators.length === 0) return null;

  return (
    <section className="px-4 py-3 border-b border-[var(--rule)]">
      <h2
        className="font-mono uppercase tracking-wider text-[var(--ink)] mb-2"
        style={{ fontSize: 11, fontWeight: 600 }}
      >
        Indicateurs dérivés ({indicators.length})
      </h2>
      <div
        className="sd-scroll overflow-y-auto"
        style={{ maxHeight: 320 }}
      >
        <table
          className="w-full font-mono border-collapse"
          style={{ fontSize: 10 }}
        >
          <thead className="sticky top-0 bg-[var(--paper)]">
            <tr className="text-left text-[var(--ink-mute)] border-b border-[var(--rule)]">
              <th className="py-1.5 pr-3 font-normal" style={{ fontSize: 9, textTransform: "uppercase" }}>
                Nom
              </th>
              <th className="py-1.5 pr-3 font-normal" style={{ fontSize: 9, textTransform: "uppercase" }}>
                Formule
              </th>
              <th className="py-1.5 pr-3 font-normal" style={{ fontSize: 9, textTransform: "uppercase" }}>
                Unité
              </th>
              <th className="py-1.5 pr-3 font-normal" style={{ fontSize: 9, textTransform: "uppercase" }}>
                Description
              </th>
            </tr>
          </thead>
          <tbody>
            {indicators.map((ind) => (
              <tr key={ind.id} className="sd-table-row">
                <td className="py-1.5 pr-3 text-[var(--ink)] align-top">{ind.name}</td>
                <td className="py-1.5 pr-3 text-[var(--state-tension)] align-top" style={{ fontWeight: 500 }}>
                  {ind.formula}
                </td>
                <td className="py-1.5 pr-3 text-[var(--ink-faint)] align-top">{ind.unit}</td>
                <td className="py-1.5 pr-3 text-[var(--ink-soft)] align-top">{ind.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProvenanceNote() {
  return (
    <section className="px-4 py-3">
      <h2
        className="font-mono uppercase tracking-wider text-[var(--ink)] mb-1.5"
        style={{ fontSize: 11, fontWeight: 600 }}
      >
        Provenance
      </h2>
      <p
        className="font-mono text-[var(--ink-soft)] leading-relaxed"
        style={{ fontSize: 10 }}
      >
        Les valeurs de base proviennent de sources réelles (Banque Mondiale, FMI,
        Bank Al-Maghrib, Lois de Finances). Les indicateurs sont calculés par des
        identités comptables et des modèles économétriques standard (Okun,
        Phillips, HDI).
      </p>
    </section>
  );
}

export function MethodologyView() {
  return (
    <div className="h-full overflow-y-auto sd-scroll">
      <ModelSummary />
      <LeversTable />
      <IndicatorsTable />
      <ProvenanceNote />
    </div>
  );
}
