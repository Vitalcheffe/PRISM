"use client";

import * as React from "react";
import { useSimulation, type View } from "@/hooks/use-simulation";

const TABS: { id: View; label: string }[] = [
  { id: "panneau", label: "Graph" },
  { id: "network", label: "Network" },
  { id: "neural", label: "Neural" },
  { id: "metrics", label: "Metrics" },
  { id: "timeline", label: "Timeline" },
  { id: "methodology", label: "Methodology" },
];

export function ViewSwitcher() {
  const view = useSimulation((s) => s.view);
  const setView = useSimulation((s) => s.setView);

  return (
    <nav className="flex items-center gap-1" aria-label="Views">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setView(t.id)}
          aria-current={view === t.id ? "page" : undefined}
          className="font-mono transition-colors"
          style={{
            fontSize: 10,
            padding: "4px 10px",
            color: view === t.id ? "var(--ink)" : "var(--ink-mute)",
            borderBottom: view === t.id ? "1px solid var(--ink)" : "1px solid transparent",
            fontWeight: view === t.id ? 500 : 400,
            letterSpacing: "0.02em",
          }}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
