"use client";

// KernelView.tsx — Vue centrale KERNEL.
//
// Affiche le cycle de 12 phases du PRISM Kernel, avec la phase active
// brillante. Données live depuis state.kernel (émis par le serveur).
//
// Layout :
//   - Header : KERNEL v1.0.0 · tick · uptime
//   - 12 phases en cercle (SVG) avec phase active en amber
//   - Détail des timings par phase (table monospace)
//   - Syscalls surface (liste des 8 syscalls disponibles)

import * as React from "react";
import { useSimulation } from "@/hooks/use-simulation";

const PHASES: { id: string; label: string; color: string }[] = [
  { id: "BOOT", label: "Boot", color: "#6e7681" },
  { id: "EXTRACT", label: "Extract", color: "#06b6d4" },
  { id: "NEURAL", label: "Neural", color: "#f59e0b" },
  { id: "NONLINEAR", label: "Nonlinear", color: "#10b981" },
  { id: "SWARM", label: "Swarm", color: "#a855f7" },
  { id: "LIFECYCLE", label: "Lifecycle", color: "#f43f5e" },
  { id: "GOVERN", label: "Govern", color: "#f97316" },
  { id: "BLACKSWAN", label: "Black Swan", color: "#eab308" },
  { id: "PARADIGM", label: "Paradigm", color: "#84cc16" },
  { id: "COMMIT", label: "Commit", color: "#6e7681" },
  { id: "EMIT", label: "Emit", color: "#6e7681" },
  { id: "HALT", label: "Halt", color: "#6e7681" },
];

const SYSCALLS = [
  "read_state",
  "set_lever",
  "get_phase",
  "get_uptime",
  "register_subsystem",
  "disable_phase",
  "enable_phase",
  "get_timings",
];

export function KernelView() {
  const kernel = useSimulation((s) => s.state.kernel);
  const tick = useSimulation((s) => s.state.tick);

  const activePhase = kernel?.phase ?? "EMIT";
  const phaseTimings = kernel?.phaseTimings ?? {};
  const uptimeMs = kernel?.uptimeMs ?? 0;

  // Positionne les 12 phases sur un cercle
  const cx = 250, cy = 220, r = 160;
  const phasePositions = PHASES.map((p, i) => {
    const angle = (i / 12) * 2 * Math.PI - Math.PI / 2;
    return {
      ...p,
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      active: p.id === activePhase,
    };
  });

  const uptimeStr = (uptimeMs / 1000).toFixed(1) + "s";

  return (
    <div className="h-full overflow-y-auto sd-scroll bg-[var(--paper)]">
      {/* Header */}
      <section className="px-4 py-3 border-b border-[var(--rule)]">
        <h2
          className="font-mono uppercase tracking-wider text-[var(--ink)]"
          style={{ fontSize: 11, fontWeight: 600 }}
        >
          PRISM Kernel {kernel?.version ? `v${kernel.version}` : ""}
        </h2>
        <p className="font-mono text-[var(--ink-soft)] mt-1" style={{ fontSize: 11 }}>
          tick {tick} · uptime {uptimeStr} · phase active :{" "}
          <span style={{ color: "var(--ochre)" }}>{activePhase}</span>
        </p>
      </section>

      {/* Cercle des phases */}
      <section className="px-4 py-4 flex justify-center">
        <svg width="500" height="440" viewBox="0 0 500 440" aria-label="Kernel phase cycle">
          {/* Cercle central */}
          <circle cx={cx} cy={cy} r="36" fill="rgba(245,158,11,0.04)" stroke="var(--ochre)" strokeWidth="0.8" opacity="0.5" />
          <circle cx={cx} cy={cy} r="44" fill="none" stroke="rgba(245,158,11,0.12)" strokeWidth="0.4" strokeDasharray="1,5" />
          <text x={cx} y={cy - 4} textAnchor="middle" fill="var(--ink)" fontFamily="SF Mono, monospace" fontSize="11" fontWeight="600">KERNEL</text>
          <text x={cx} y={cy + 10} textAnchor="middle" fill="var(--ink-faint)" fontFamily="SF Mono, monospace" fontSize="9">200ms</text>

          {/* Arc reliant les phases */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(245,158,11,0.2)" strokeWidth="0.5" strokeDasharray="2,4" />

          {/* Phases */}
          {phasePositions.map((p) => {
            const timing = phaseTimings[p.id] ?? 0;
            const isActive = p.active;
            const hasTiming = timing > 0;
            return (
              <g key={p.id}>
                {/* Halos pour phases actives ou avec timing */}
                {isActive && (
                  <circle cx={p.x} cy={p.y} r="22" fill={p.color} opacity="0.12" />
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="14"
                  fill={isActive ? p.color : "var(--paper)"}
                  stroke={p.color}
                  strokeWidth={isActive ? 1.5 : 0.8}
                  opacity={isActive ? 1 : hasTiming ? 0.7 : 0.35}
                />
                <text
                  x={p.x}
                  y={p.y + 3}
                  textAnchor="middle"
                  fill={isActive ? "var(--paper)" : p.color}
                  fontFamily="SF Mono, monospace"
                  fontSize="9"
                  fontWeight="600"
                  opacity={isActive ? 1 : 0.8}
                >
                  {String(PHASES.findIndex((ph) => ph.id === p.id) + 1).padStart(2, "0")}
                </text>
                {/* Label à l'extérieur */}
                <text
                  x={p.x + (p.x - cx) * 0.18}
                  y={p.y + (p.y - cy) * 0.18 + 3}
                  textAnchor={p.x > cx + 20 ? "start" : p.x < cx - 20 ? "end" : "middle"}
                  fill={isActive ? "var(--ink)" : "var(--ink-faint)"}
                  fontFamily="SF Mono, monospace"
                  fontSize="9"
                  fontWeight={isActive ? 600 : 400}
                  style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}
                >
                  {p.label}
                </text>
                {/* Timing affiché pour les phases qui ont tourné */}
                {hasTiming && (
                  <text
                    x={p.x + (p.x - cx) * 0.18}
                    y={p.y + (p.y - cy) * 0.18 + 14}
                    textAnchor={p.x > cx + 20 ? "start" : p.x < cx - 20 ? "end" : "middle"}
                    fill="var(--ink-faint)"
                    fontFamily="SF Mono, monospace"
                    fontSize="8"
                  >
                    {timing < 1 ? timing.toFixed(2) : timing.toFixed(1)}ms
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </section>

      {/* Table des timings */}
      <section className="px-4 py-3 border-t border-[var(--rule)]">
        <h3
          className="font-mono uppercase tracking-wider text-[var(--ink-soft)] mb-2"
          style={{ fontSize: 10, fontWeight: 500 }}
        >
          Phase timings (dernier tick)
        </h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1" style={{ fontSize: 10 }}>
          {PHASES.map((p) => {
            const t = phaseTimings[p.id] ?? 0;
            const isActive = p.id === activePhase;
            return (
              <div
                key={p.id}
                className="font-mono flex items-center justify-between"
                style={{ color: isActive ? "var(--ink)" : "var(--ink-faint)" }}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    style={{
                      display: "inline-block",
                      width: 6,
                      height: 6,
                      borderRadius: 1,
                      background: p.color,
                      opacity: isActive ? 1 : t > 0 ? 0.7 : 0.25,
                    }}
                  />
                  <span style={{ fontWeight: isActive ? 600 : 400 }}>{p.id}</span>
                </span>
                <span style={{ color: isActive ? "var(--ochre)" : "var(--ink-faint)" }}>
                  {t < 1 ? t.toFixed(3) : t.toFixed(1)}ms
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Syscalls */}
      <section className="px-4 py-3 border-t border-[var(--rule)]">
        <h3
          className="font-mono uppercase tracking-wider text-[var(--ink-soft)] mb-2"
          style={{ fontSize: 10, fontWeight: 500 }}
        >
          Syscalls disponibles
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {SYSCALLS.map((sc) => (
            <span
              key={sc}
              className="font-mono"
              style={{
                fontSize: 10,
                padding: "3px 8px",
                color: "var(--ink-soft)",
                background: "rgba(245,158,11,0.04)",
                borderRadius: 3,
              }}
            >
              <span style={{ color: "var(--ochre)", marginRight: 4 }}>·</span>
              {sc}
            </span>
          ))}
        </div>
      </section>

      {!kernel && (
        <section className="px-4 py-4 border-t border-[var(--rule)]">
          <p className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 10 }}>
            En attente des données Kernel… Le moteur doit tourner avec le Kernel câblé (commit 10+).
          </p>
        </section>
      )}
    </div>
  );
}
