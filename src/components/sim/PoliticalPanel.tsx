"use client";

// PoliticalPanel.tsx — Panneau politique : paradigm + factions + menaces + équilibre.
//
// Affiche :
//   1. Le paradigm selector (5 régimes qui réécrivent la matrice)
//   2. L'équilibre thermodynamique (0 = chaotique, 1 = équilibré)
//   3. Les 8 factions avec puissance, mécontentement, loyauté
//   4. Les menaces politiques (coups, révolutions, grèves)

import * as React from "react";
import { useSimulation } from "@/hooks/use-simulation";

const PARADIGMS = [
  { id: "liberal", label: "Libéral" },
  { id: "planned", label: "Planifié" },
  { id: "technocracy", label: "Technocratie" },
  { id: "authoritarian", label: "Autoritaire" },
  { id: "transition", label: "Transition" },
];

function MiniBar({ value, max = 1, color = "var(--ink)" }: { value: number; max?: number; color?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div style={{ width: "100%", height: 2, background: "var(--rule)", position: "relative" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, transition: "width 300ms" }} />
    </div>
  );
}

export function PoliticalPanel() {
  const paradigm = useSimulation((s) => s.state.paradigm);
  const setParadigm = useSimulation((s) => s.setParadigm);
  const swarm = useSimulation((s) => s.state.swarm);
  const thermodynamicBalance = useSimulation((s) => s.state.thermodynamicBalance);
  const overoptimizedCount = useSimulation((s) => s.state.overoptimizedCount);
  const lastBlackSwan = useSimulation((s) => s.state.lastBlackSwan);
  const gameOver = useSimulation((s) => s.state.gameOver);

  const factions = swarm?.factions;
  const threats = swarm?.politicalThreats ?? [];

  return (
    <div className="border-t border-[var(--rule)]">
      {/* Paradigm selector */}
      <div className="px-3 py-2">
        <h3 className="font-mono uppercase tracking-wider text-[var(--ink-mute)] mb-1.5" style={{ fontSize: 9 }}>
          Régime
        </h3>
        <div className="flex flex-wrap gap-1">
          {PARADIGMS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setParadigm(p.id)}
              disabled={!!gameOver}
              className="font-mono px-1.5 py-0.5 transition-colors"
              style={{
                fontSize: 9,
                border: `1px solid ${paradigm === p.id ? "var(--ink)" : "var(--rule)"}`,
                background: paradigm === p.id ? "var(--ink)" : "var(--surface)",
                color: paradigm === p.id ? "var(--paper)" : "var(--ink-mute)",
                cursor: "pointer",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Équilibre thermodynamique */}
      <div className="px-3 py-2 border-t border-[var(--rule-soft)]">
        <div className="flex items-baseline justify-between mb-1">
          <span className="font-mono uppercase tracking-wider text-[var(--ink-mute)]" style={{ fontSize: 9 }}>
            Éq. thermodynamique
          </span>
          <span className="font-mono font-semibold" style={{
            fontSize: 11,
            color: (thermodynamicBalance ?? 0.5) > 0.6 ? "var(--ink)" : (thermodynamicBalance ?? 0.5) > 0.3 ? "var(--state-tension)" : "var(--state-crisis)",
          }}>
            {((thermodynamicBalance ?? 0.5) * 100).toFixed(0)}%
          </span>
        </div>
        <MiniBar
          value={thermodynamicBalance ?? 0.5}
          color={(thermodynamicBalance ?? 0.5) > 0.6 ? "var(--ink)" : (thermodynamicBalance ?? 0.5) > 0.3 ? "var(--state-tension)" : "var(--state-crisis)"}
        />
        {(overoptimizedCount ?? 0) > 5 && (
          <p className="font-mono mt-1" style={{ fontSize: 8, color: "var(--state-tension)" }}>
            ⚠ Sur-optimisation : {overoptimizedCount} leviers à &gt;90%
          </p>
        )}
      </div>

      {/* Factions */}
      {factions && (
        <div className="px-3 py-2 border-t border-[var(--rule-soft)]">
          <h3 className="font-mono uppercase tracking-wider text-[var(--ink-mute)] mb-1.5" style={{ fontSize: 9 }}>
            Factions ({swarm?.agentCount ?? 0} agents)
          </h3>
          <div className="flex flex-col gap-1">
            {Object.entries(factions).map(([id, f]: [string, any]) => {
              const grievanceColor = f.grievance > 0.6 ? "var(--state-crisis)" : f.grievance > 0.4 ? "var(--state-tension)" : "var(--ink)";
              return (
                <div key={id} className="flex flex-col gap-0.5">
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono truncate" style={{ fontSize: 9, color: "var(--ink-soft)" }}>
                      {f.name}
                    </span>
                    <span className="font-mono shrink-0" style={{ fontSize: 8, color: grievanceColor }}>
                      {f.grievance > 0.6 ? "⚠" : f.grievance > 0.4 ? "!" : "✓"}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <div className="flex-1">
                      <span className="font-mono" style={{ fontSize: 7, color: "var(--ink-faint)" }}>PWR</span>
                      <MiniBar value={f.power} color="var(--ink)" />
                    </div>
                    <div className="flex-1">
                      <span className="font-mono" style={{ fontSize: 7, color: "var(--ink-faint)" }}>GRV</span>
                      <MiniBar value={f.grievance} color={grievanceColor} />
                    </div>
                    <div className="flex-1">
                      <span className="font-mono" style={{ fontSize: 7, color: "var(--ink-faint)" }}>LOY</span>
                      <MiniBar value={f.loyalty} color="var(--ink-soft)" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Menaces politiques */}
      {threats.length > 0 && (
        <div className="px-3 py-2 border-t border-[var(--rule-soft)]">
          <h3 className="font-mono uppercase tracking-wider mb-1.5" style={{ fontSize: 9, color: "var(--state-crisis)" }}>
            ⚠ Menaces politiques
          </h3>
          <div className="flex flex-col gap-1">
            {threats.slice(0, 5).map((t: any, i: number) => (
              <div key={i} className="flex items-baseline justify-between">
                <span className="font-mono truncate" style={{ fontSize: 9, color: "var(--ink-soft)" }}>
                  {t.description.split(":")[0]}
                </span>
                <span className="font-mono shrink-0 font-semibold" style={{
                  fontSize: 10,
                  color: t.probability > 0.3 ? "var(--state-crisis)" : "var(--state-tension)",
                }}>
                  {(t.probability * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dernier cygne noir */}
      {lastBlackSwan && (
        <div className="px-3 py-2 border-t border-[var(--rule-soft)]">
          <h3 className="font-mono uppercase tracking-wider mb-1" style={{ fontSize: 9, color: "var(--state-crisis)" }}>
            🕊️ Dernier cygne noir
          </h3>
          <p className="font-mono" style={{ fontSize: 9, color: "var(--ink-soft)" }}>
            {lastBlackSwan.name} (T{String(lastBlackSwan.tick).padStart(4, "0")})
          </p>
          <p className="font-mono mt-0.5" style={{ fontSize: 8, color: "var(--ink-faint)" }}>
            Sévérité : {(lastBlackSwan.severity * 100).toFixed(0)}%
          </p>
        </div>
      )}
    </div>
  );
}
