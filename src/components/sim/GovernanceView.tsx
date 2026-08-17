"use client";

// GovernanceView.tsx — Vue centrale GESTION.
//
// Affiche les 8 ministères avec leurs budgets, efficacité, fuite.
// Données depuis state.ministries et state.governance.
//
// Layout :
//   - Header : GOVERNANCE · total budget · avg capacity
//   - 8 colonnes ministères (budget bar + spent bar + stats)
//   - Summary : total spent · leakage · corruption index
//   - Note sur la fuite (corruption)

import * as React from "react";
import { useSimulation } from "@/hooks/use-simulation";

const MINISTRY_COLORS: Record<string, string> = {
  education: "#10b981",
  health: "#f43f5e",
  infrastructure: "#f97316",
  interior: "#a855f7",
  finance: "#f59e0b",
  defense: "#06b6d4",
  agriculture: "#84cc16",
  social: "#eab308",
};

export function GovernanceView() {
  const ministries = useSimulation((s) => s.state.ministries);
  const governance = useSimulation((s) => s.state.governance);
  const paradigm = useSimulation((s) => s.state.paradigm);

  const mins = ministries && ministries.length > 0 ? ministries : [];
  const totalBudget = governance?.totalBudget ?? 500;
  const totalSpent = governance?.totalSpent ?? 0;
  const totalLeakage = governance?.totalLeakage ?? 0;
  const avgCapacity = governance?.avgCapacity ?? 0;
  const avgService = governance?.avgServiceQuality ?? 0;
  const avgEfficiency = governance?.avgEfficiency ?? 0;
  const corruption = governance?.corruptionIndex ?? 0;

  const leakPercent = totalBudget > 0 ? (totalLeakage / totalBudget) * 100 : 0;

  return (
    <div className="h-full overflow-y-auto sd-scroll bg-[var(--paper)]">
      {/* Header */}
      <section className="px-4 py-3 border-b border-[var(--rule)]">
        <h2
          className="font-mono uppercase tracking-wider text-[var(--ink)]"
          style={{ fontSize: 11, fontWeight: 600 }}
        >
          Governance System
        </h2>
        <p className="font-mono text-[var(--ink-soft)] mt-1" style={{ fontSize: 11 }}>
          {mins.length} ministères · budget {totalBudget.toFixed(0)} Mrd MAD · paradigme :{" "}
          <span style={{ color: "var(--ochre)" }}>{paradigm || "—"}</span>
        </p>
      </section>

      {/* Ministères */}
      <section className="px-4 py-4">
        {mins.length === 0 ? (
          <p className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 10 }}>
            En attente du sous-système Governance…
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {mins.map((m) => {
              const color = MINISTRY_COLORS[m.id] || "#6e7681";
              const allocH = 200; // hauteur fixe de la barre budget
              const fillH = Math.max(4, (m.allocatedBudget / totalBudget) * allocH);
              const spentH = Math.max(2, (m.spentBudget / m.allocatedBudget) * fillH);
              return (
                <div key={m.id} className="flex flex-col items-center" style={{ minWidth: 120 }}>
                  {/* Nom */}
                  <div
                    className="font-mono text-center mb-2"
                    style={{ fontSize: 10, fontWeight: 600, color, letterSpacing: "0.05em", textTransform: "uppercase" }}
                  >
                    {m.name}
                  </div>

                  {/* Barre budget + spent */}
                  <div className="relative flex items-end justify-center" style={{ height: allocH + 10, width: 40 }}>
                    {/* Allocated (pleine) */}
                    <div
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: 8,
                        width: 14,
                        height: fillH,
                        background: color,
                        opacity: 0.5,
                      }}
                    />
                    {/* Spent (par-dessus, plus étroit) */}
                    <div
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: 18,
                        width: 8,
                        height: spentH,
                        background: color,
                        opacity: 1,
                      }}
                    />
                  </div>

                  {/* Stats */}
                  <div className="font-mono text-center mt-2" style={{ fontSize: 9, lineHeight: 1.5 }}>
                    <div style={{ color: "var(--ink)" }}>{m.allocatedBudget.toFixed(0)} Mrd</div>
                    <div style={{ color: "var(--ink-soft)" }}>eff. {m.efficiency.toFixed(2)}</div>
                    <div style={{ color: m.leakage > 0.25 ? "#f43f5e" : "var(--ink-faint)" }}>
                      leak {m.leakage.toFixed(2)}
                    </div>
                    {/* Service quality dot */}
                    <div className="flex justify-center mt-1">
                      <span
                        style={{
                          display: "inline-block",
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: color,
                          opacity: Math.max(0.2, m.serviceQuality),
                          boxShadow: m.serviceQuality > 0.7 ? `0 0 8px ${color}` : "none",
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Légende */}
      <section className="px-4 py-2 border-t border-[var(--rule)]">
        <div className="flex flex-wrap gap-4 font-mono" style={{ fontSize: 9, color: "var(--ink-faint)" }}>
          <span className="flex items-center gap-1.5">
            <span style={{ display: "inline-block", width: 10, height: 8, background: "var(--ink)", opacity: 0.5 }} />
            allocated
          </span>
          <span className="flex items-center gap-1.5">
            <span style={{ display: "inline-block", width: 6, height: 8, background: "var(--ink)" }} />
            spent
          </span>
          <span className="flex items-center gap-1.5">
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--ink)" }} />
            service quality
          </span>
        </div>
      </section>

      {/* Summary */}
      {governance && (
        <section className="px-4 py-3 border-t border-[var(--rule)]">
          <h3
            className="font-mono uppercase tracking-wider text-[var(--ink-soft)] mb-3"
            style={{ fontSize: 10, fontWeight: 500 }}
          >
            Summary
          </h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            <div>
              <div className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Total budget
              </div>
              <div className="font-mono text-[var(--ink)]" style={{ fontSize: 16, fontWeight: 600 }}>
                {totalBudget.toFixed(0)} Mrd MAD
              </div>
            </div>
            <div>
              <div className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Total spent
              </div>
              <div className="font-mono" style={{ fontSize: 16, fontWeight: 500, color: "#10b981" }}>
                {totalSpent.toFixed(0)} Mrd
              </div>
            </div>
            <div>
              <div className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Total leakage
              </div>
              <div className="font-mono" style={{ fontSize: 16, fontWeight: 500, color: "#f43f5e" }}>
                {totalLeakage.toFixed(0)} Mrd ({leakPercent.toFixed(1)}%)
              </div>
            </div>
            <div>
              <div className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Corruption index
              </div>
              <div className="font-mono" style={{ fontSize: 16, fontWeight: 500, color: corruption > 25 ? "#f43f5e" : "var(--ink)" }}>
                {corruption.toFixed(1)}
              </div>
            </div>
            <div>
              <div className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Avg capacity
              </div>
              <div className="font-mono text-[var(--ink)]" style={{ fontSize: 16, fontWeight: 500 }}>
                {avgCapacity.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Avg service quality
              </div>
              <div className="font-mono text-[var(--ink)]" style={{ fontSize: 16, fontWeight: 500 }}>
                {avgService.toFixed(2)}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Note */}
      <section className="px-4 py-3 border-t border-[var(--rule)]">
        <p className="font-mono text-[var(--ink-soft)]" style={{ fontSize: 10, lineHeight: 1.5 }}>
          La fuite (leakage) représente la fraction du budget perdue à la corruption et à l'inefficacité bureaucratique.
          Une fuite &gt; 25% est critique. La capacité dérive avec l'effectivité gouvernementale ; la fuite dérive
          vers la cible anti-corruption.
        </p>
      </section>
    </div>
  );
}
