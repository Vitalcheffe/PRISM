"use client";

// ViewSwitcher.tsx — Tabs PANNEAU / MÉTRIQUES / MÉTHODOLOGIE.

import * as React from "react";
import { useSimulation, type View } from "@/hooks/use-simulation";

const TABS: { id: View; label: string }[] = [
  { id: "panneau", label: "PANNEAU" },
  { id: "network", label: "RÉSEAU" },
  { id: "neural", label: "NEURAL" },
  { id: "metrics", label: "MÉTRIQUES" },
  { id: "timeline", label: "TRAJECTOIRE" },
  { id: "methodology", label: "MÉTHODOLOGIE" },
];

export function ViewSwitcher() {
  const view = useSimulation((s) => s.view);
  const setView = useSimulation((s) => s.setView);

  return (
    <nav className="flex items-center gap-4" aria-label="Vues">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`sd-text-btn ${view === t.id ? "is-active" : ""}`}
          onClick={() => setView(t.id)}
          aria-current={view === t.id ? "page" : undefined}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
