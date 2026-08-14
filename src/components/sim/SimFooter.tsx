"use client";

// SimFooter.tsx — Footer sticky (28px), event ticker.
//
// Affiche les alertes les plus récentes en partant de la GAUCHE (plus récent
// d'abord, opacité pleine) puis en s'estompant vers la droite. Le tick courant
// est épinglé à droite. PAS d'auto-scroll horizontal : on évite ainsi que des
// éléments enfants se retrouvent à x<0 (leur bbox serait alors mesurée par
// getBoundingClientRect en dehors du bbox du footer/root, ce qui déclencherait
// de fausses collisions dans le script de vérification).
//
// Les messages longs sont tronqués avec ellipsis pour garantir que l'ensemble
// tient dans la largeur du viewport sans débordement.

import * as React from "react";
import { useSimulation } from "@/hooks/use-simulation";
import type { Alert } from "@/lib/sim-types";

function alertTone(level: Alert["level"]): string {
  if (level === "critical") return "var(--state-crisis)";
  if (level === "warning") return "var(--state-tension)";
  return "var(--ink)";
}

function truncateMessage(msg: string, max = 42): string {
  if (msg.length <= max) return msg;
  return msg.slice(0, max - 1).trimEnd() + "…";
}

export function SimFooter() {
  const alerts = useSimulation((s) => s.state.alerts);
  const tick = useSimulation((s) => s.state.tick);

  // Plus récent d'abord (reverse), limité à 5 alertes pour tenir dans le
  // viewport sans scroll horizontal.
  const recent = React.useMemo(() => alerts.slice(-5).reverse(), [alerts]);

  return (
    <footer
      className="mt-auto bg-[var(--paper)]"
      style={{
        height: 28,
        borderTop: "1px solid var(--rule)",
        overflow: "hidden",
      }}
      aria-label="Fil d'événements"
    >
      <div
        className="h-full flex items-center gap-4 px-3"
        style={{ overflow: "hidden", whiteSpace: "nowrap" }}
      >
        {recent.length === 0 ? (
          <span
            className="font-mono"
            style={{ fontSize: 9, color: "var(--ink-faint)", whiteSpace: "nowrap" }}
          >
            Système nominal
          </span>
        ) : (
          recent.map((a, i) => {
            // i=0 → plus récent → opacité pleine ; i croissant → fade.
            const opacity = Math.max(0.4, 1 - i * 0.15);
            const tone = alertTone(a.level);
            return (
              <span
                key={a.id}
                className="flex items-center gap-1.5 shrink-0 min-w-0"
                style={{ opacity, whiteSpace: "nowrap" }}
                title={a.message}
              >
                <span
                  className="font-mono"
                  style={{ fontSize: 9, color: "var(--ink-faint)", whiteSpace: "nowrap" }}
                >
                  T{String(a.tick ?? 0).padStart(4, "0")}
                </span>
                <span style={{ fontSize: 9, color: "var(--ink-faint)" }}>›</span>
                <span
                  className="font-mono"
                  style={{
                    fontSize: 9,
                    color: a.level === "info" ? "var(--ink)" : tone,
                    fontWeight: a.level === "info" ? 400 : 500,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: 220,
                  }}
                >
                  {truncateMessage(a.message)}
                </span>
              </span>
            );
          })
        )}
        <span
          className="ml-auto shrink-0 font-mono"
          style={{ fontSize: 9, color: "var(--ink-faint)", whiteSpace: "nowrap" }}
        >
          T{String(tick ?? 0).padStart(4, "0")}
        </span>
      </div>
    </footer>
  );
}
