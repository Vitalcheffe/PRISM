"use client";

// GameOverlay.tsx — Overlay plein écran quand state.gameOver !== null.
// "FIN" mono 24px bordeaux · type · message · "Relancer" button (1px bordeaux border).

import * as React from "react";
import { useSimulation } from "@/hooks/use-simulation";

export function GameOverlay() {
  const gameOver = useSimulation((s) => s.state.gameOver);
  const reset = useSimulation((s) => s.reset);

  if (!gameOver) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        backgroundColor: "rgba(250, 250, 247, 0.95)",
        border: "1px solid var(--state-crisis)",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-over-title"
    >
      <div className="text-center px-8 py-6 max-w-md">
        <h2
          id="game-over-title"
          className="font-mono font-semibold mb-3"
          style={{ fontSize: 24, color: "var(--state-crisis)" }}
        >
          FIN
        </h2>
        <p
          className="font-mono uppercase tracking-wider text-[var(--ink-mute)] mb-2"
          style={{ fontSize: 10 }}
        >
          {gameOver.type}
        </p>
        <p
          className="font-mono text-[var(--ink)] mb-6 leading-relaxed"
          style={{ fontSize: 13 }}
        >
          {gameOver.message}
        </p>
        <button
          type="button"
          onClick={reset}
          className="font-mono px-6 py-2 bg-transparent hover:bg-[var(--state-crisis)] hover:text-[var(--paper)] transition-colors"
          style={{
            fontSize: 12,
            color: "var(--state-crisis)",
            border: "1px solid var(--state-crisis)",
            borderRadius: "0.25rem",
          }}
          aria-label="Relancer la simulation"
        >
          Relancer
        </button>
      </div>
    </div>
  );
}
