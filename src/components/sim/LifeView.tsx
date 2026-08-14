"use client";

// LifeView.tsx — Vue centrale VIE.
//
// Affiche la pyramide démographique live + les 7 étapes de vie + stats.
// Données depuis state.demographics et state.populationPyramid.
//
// Layout :
//   - Header : LIFE SYSTEM · population · median age
//   - Pyramide démographique (SVG) — barres par tranche d'âge
//   - 7 étapes de vie avec couleurs
//   - Stats : birth rate · death rate · dependency · growth
//   - Ligne heartbeat en bas

import * as React from "react";
import { useSimulation } from "@/hooks/use-simulation";

const LIFE_STAGES: { id: string; label: string; range: string; color: string }[] = [
  { id: "INFANT", label: "Infant", range: "0–4", color: "#06b6d4" },
  { id: "CHILD", label: "Child", range: "5–14", color: "#10b981" },
  { id: "STUDENT", label: "Student", range: "15–24", color: "#eab308" },
  { id: "WORKER", label: "Worker", range: "25–54", color: "#f59e0b" },
  { id: "MATURE", label: "Mature", range: "55–64", color: "#f97316" },
  { id: "RETIREE", label: "Retiree", range: "65–74", color: "#a855f7" },
  { id: "ELDER", label: "Elder", range: "75+", color: "#f43f5e" },
];

function ageGroupColor(group: string): string {
  // Extract first age number
  const m = group.match(/(\d+)/);
  if (!m) return "#6e7681";
  const age = parseInt(m[1], 10);
  if (age < 5) return "#06b6d4";
  if (age < 15) return "#10b981";
  if (age < 25) return "#eab308";
  if (age < 55) return "#f59e0b";
  if (age < 65) return "#f97316";
  if (age < 75) return "#a855f7";
  return "#f43f5e";
}

export function LifeView() {
  const demographics = useSimulation((s) => s.state.demographics);
  const pyramid = useSimulation((s) => s.state.populationPyramid);
  const tick = useSimulation((s) => s.state.tick);

  const population = demographics?.population ?? 10000;
  const medianAge = demographics?.medianAge ?? 0;
  const birthRate = demographics?.birthRate ?? 0;
  const deathRate = demographics?.deathRate ?? 0;
  const dependencyRatio = demographics?.dependencyRatio ?? 0;
  const populationGrowth = demographics?.populationGrowth ?? 0;

  // Pyramide : si pas de données serveur, on affiche un placeholder
  const pyramidData = pyramid && pyramid.length > 0 ? pyramid : [];

  // Calcul de la largeur max pour la pyramide
  const maxCount = pyramidData.length > 0
    ? Math.max(...pyramidData.map((g) => Math.max(g.male, g.female)))
    : 1;

  const pyrW = 360;
  const pyrH = 280;
  const barH = Math.max(8, Math.floor((pyrH - 20) / Math.max(1, pyramidData.length)) - 2);
  const centerX = pyrW / 2;
  const maxBarW = (pyrW / 2) - 40;

  return (
    <div className="h-full overflow-y-auto sd-scroll bg-[var(--paper)]">
      {/* Header */}
      <section className="px-4 py-3 border-b border-[var(--rule)]">
        <h2
          className="font-mono uppercase tracking-wider text-[var(--ink)]"
          style={{ fontSize: 11, fontWeight: 600 }}
        >
          Life System
        </h2>
        <p className="font-mono text-[var(--ink-soft)] mt-1" style={{ fontSize: 11 }}>
          population {population.toLocaleString()} · âge médian {medianAge.toFixed(1)} · tick {tick}
        </p>
      </section>

      {/* Pyramide démographique */}
      <section className="px-4 py-4 flex justify-center">
        <div className="flex gap-4 items-start">
          {/* Pyramide */}
          <svg width={pyrW} height={pyrH + 30} viewBox={`0 0 ${pyrW} ${pyrH + 30}`} aria-label="Population pyramid">
            {/* Axe central */}
            <line x1={centerX} y1="10" x2={centerX} y2={pyrH + 10} stroke="var(--rule)" strokeWidth="0.5" />

            {/* Barres */}
            {pyramidData.map((g, i) => {
              const y = 10 + i * (barH + 2);
              const maleW = (g.male / maxCount) * maxBarW;
              const femaleW = (g.female / maxCount) * maxBarW;
              const color = ageGroupColor(g.ageGroup);
              return (
                <g key={g.ageGroup}>
                  {/* Male (gauche) */}
                  <rect
                    x={centerX - maleW}
                    y={y}
                    width={maleW}
                    height={barH}
                    fill={color}
                    opacity="0.7"
                  />
                  {/* Female (droite) */}
                  <rect
                    x={centerX}
                    y={y}
                    width={femaleW}
                    height={barH}
                    fill={color}
                    opacity="0.5"
                  />
                  {/* Label tranche */}
                  <text
                    x={centerX}
                    y={y + barH / 2 + 3}
                    textAnchor="middle"
                    fill="var(--ink-faint)"
                    fontFamily="SF Mono, monospace"
                    fontSize="8"
                  >
                    {g.ageGroup}
                  </text>
                </g>
              );
            })}

            {/* Labels axes */}
            <text x="10" y={pyrH + 24} fill="var(--ink-faint)" fontFamily="SF Mono, monospace" fontSize="8">♂ MALE</text>
            <text x={pyrW - 10} y={pyrH + 24} textAnchor="end" fill="var(--ink-faint)" fontFamily="SF Mono, monospace" fontSize="8">FEMALE ♀</text>

            {pyramidData.length === 0 && (
              <text x={centerX} y={pyrH / 2} textAnchor="middle" fill="var(--ink-faint)" fontFamily="SF Mono, monospace" fontSize="10">
                en attente des données démographiques…
              </text>
            )}
          </svg>

          {/* Étapes de vie */}
          <div className="flex flex-col gap-1" style={{ minWidth: 140 }}>
            <h3
              className="font-mono uppercase tracking-wider text-[var(--ink-soft)] mb-1"
              style={{ fontSize: 9, fontWeight: 500 }}
            >
              Life stages
            </h3>
            {LIFE_STAGES.map((s) => (
              <div
                key={s.id}
                className="font-mono flex items-center gap-2"
                style={{ fontSize: 10, color: "var(--ink-soft)" }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: 1,
                    background: s.color,
                  }}
                />
                <span style={{ fontWeight: 500, color: "var(--ink)" }}>{s.label}</span>
                <span style={{ color: "var(--ink-faint)", marginLeft: "auto" }}>{s.range}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats démographiques */}
      <section className="px-4 py-3 border-t border-[var(--rule)]">
        <h3
          className="font-mono uppercase tracking-wider text-[var(--ink-soft)] mb-3"
          style={{ fontSize: 10, fontWeight: 500 }}
        >
          Demographic indicators
        </h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <div>
            <div className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Âge médian
            </div>
            <div className="font-mono text-[var(--ink)]" style={{ fontSize: 20, fontWeight: 600 }}>
              {medianAge.toFixed(1)}
            </div>
          </div>
          <div>
            <div className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Population
            </div>
            <div className="font-mono text-[var(--ink)]" style={{ fontSize: 20, fontWeight: 600 }}>
              {population.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Birth rate /1000
            </div>
            <div className="font-mono" style={{ fontSize: 16, fontWeight: 500, color: "#10b981" }}>
              {birthRate.toFixed(1)}
            </div>
          </div>
          <div>
            <div className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Death rate /1000
            </div>
            <div className="font-mono" style={{ fontSize: 16, fontWeight: 500, color: "#f43f5e" }}>
              {deathRate.toFixed(1)}
            </div>
          </div>
          <div>
            <div className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Dependency ratio
            </div>
            <div className="font-mono text-[var(--ink)]" style={{ fontSize: 16, fontWeight: 500 }}>
              {dependencyRatio.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Population growth %
            </div>
            <div
              className="font-mono"
              style={{
                fontSize: 16,
                fontWeight: 500,
                color: populationGrowth >= 0 ? "#10b981" : "#f43f5e",
              }}
            >
              {populationGrowth >= 0 ? "+" : ""}{populationGrowth.toFixed(2)}
            </div>
          </div>
        </div>
      </section>

      {/* Heartbeat */}
      <section className="px-4 py-3 border-t border-[var(--rule)]">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 9, letterSpacing: "0.15em" }}>
            LIFE SIGN
          </span>
          <svg width="200" height="20" viewBox="0 0 200 20" aria-label="Heartbeat">
            <path
              d="M 0,10 L 60,10 L 70,10 L 75,2 L 80,18 L 85,5 L 90,10 L 200,10"
              fill="none"
              stroke="var(--ochre)"
              strokeWidth="1"
              opacity="0.5"
            />
          </svg>
          <span className="font-mono" style={{ fontSize: 9, color: "var(--ochre)", letterSpacing: "0.1em" }}>
            STABLE
          </span>
        </div>
      </section>

      {!demographics && (
        <section className="px-4 py-4 border-t border-[var(--rule)]">
          <p className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 10 }}>
            En attente du sous-système Life… Le moteur doit tourner avec le Kernel câblé.
          </p>
        </section>
      )}
    </div>
  );
}
