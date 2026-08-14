"use client";

// DecreeInput.tsx — Champ texte + bouton "Émettre" pour les décrets.
//
// Le joueur tape une instruction en langage naturel ("Construire 10 hôpitaux").
// Le moteur LLM (backend) l'interprète et renvoie un DecreeResult :
//   - deltas[] (changements de leviers)
//   - immediateGdpImpact, immediateBudgetImpact, immediateDebtImpact, fiscalCost
//   - summary
//
// Affichage du résultat : "Décret appliqué : [lever] +X. Coût : Y Mrd MAD. Impact PIB : +Z Mrd."
// Ou "Refusé : [reason]" si accepted === false.

import * as React from "react";
import { useSimulation } from "@/hooks/use-simulation";
import { ProjectionPanel } from "./ProjectionPanel";

const EXAMPLES: string[] = [
  "Construire 10 hôpitaux",
  "Hausser la TVA de 2 points",
  "Porter le SMIG à 4000",
  "Doubler le budget éducation",
  "Recruter 500 médecins",
  "Instaurer une taxe carbone de 200 MAD",
];

function DecreeResultDisplay() {
  const result = useSimulation((s) => s.lastDecreeResult);

  if (!result) return null;

  if (!result.accepted) {
    return (
      <div
        className="mt-2 px-2 py-1.5 font-mono"
        style={{
          fontSize: 11,
          color: "var(--state-tension)",
          borderLeft: "2px solid var(--state-tension)",
          backgroundColor: "rgba(146, 64, 14, 0.04)",
        }}
      >
        <span className="font-semibold">Refusé.</span> {result.reason ?? "Raison non précisée."}
      </div>
    );
  }

  // Affichage des deltas appliqués
  const deltas = result.deltas ?? [];
  return (
    <div
      className="mt-2 px-2 py-1.5 font-mono"
      style={{
        fontSize: 11,
        color: "var(--ink)",
        borderLeft: "2px solid var(--ink)",
        backgroundColor: "rgba(0,0,0,0.02)",
      }}
    >
      <div className="font-semibold mb-0.5">Décret appliqué.</div>
      {deltas.length > 0 && (
        <ul className="flex flex-col gap-0.5 mb-1">
          {deltas.slice(0, 5).map((d, i) => (
            <li key={i} className="flex items-baseline gap-1">
              <span className="text-[var(--ink-soft)]">{d.leverName}</span>
              <span className={d.absoluteChange >= 0 ? "text-[var(--ink)]" : "text-[var(--state-crisis)]"}>
                {d.absoluteChange >= 0 ? "+" : ""}
                {d.absoluteChange.toFixed(2)} {d.unit}
              </span>
              <span className="text-[var(--ink-faint)]">
                ({d.relativeChange >= 0 ? "+" : ""}
                {(d.relativeChange * 100).toFixed(1)}%)
              </span>
            </li>
          ))}
          {deltas.length > 5 && (
            <li className="text-[var(--ink-faint)]">
              … et {deltas.length - 5} autres.
            </li>
          )}
        </ul>
      )}
      <div className="flex flex-col gap-0.5 text-[var(--ink-soft)]" style={{ fontSize: 10 }}>
        {result.fiscalCost !== 0 && (
          <span>
            Coût fiscal : <span className="text-[var(--ink)]">{result.fiscalCost.toFixed(1)} Mrd MAD</span>
          </span>
        )}
        {result.immediateGdpImpact !== 0 && (
          <span>
            Impact PIB :{" "}
            <span className={result.immediateGdpImpact >= 0 ? "text-[var(--ink)]" : "text-[var(--state-crisis)]"}>
              {result.immediateGdpImpact >= 0 ? "+" : ""}
              {result.immediateGdpImpact.toFixed(1)} Mrd
            </span>
          </span>
        )}
        {result.immediateBudgetImpact !== 0 && (
          <span>
            Budget :{" "}
            <span className={result.immediateBudgetImpact >= 0 ? "text-[var(--ink)]" : "text-[var(--state-crisis)]"}>
              {result.immediateBudgetImpact >= 0 ? "+" : ""}
              {result.immediateBudgetImpact.toFixed(1)} Mrd
            </span>
          </span>
        )}
        {result.immediateDebtImpact !== 0 && (
          <span>
            Dette :{" "}
            <span className={result.immediateDebtImpact >= 0 ? "text-[var(--state-tension)]" : "text-[var(--ink)]"}>
              {result.immediateDebtImpact >= 0 ? "+" : ""}
              {result.immediateDebtImpact.toFixed(1)} Mrd
            </span>
          </span>
        )}
        {result.summary && (
          <span className="text-[var(--ink-faint)] italic mt-0.5">{result.summary}</span>
        )}
      </div>
    </div>
  );
}

export function DecreeInput() {
  const decree = useSimulation((s) => s.decree);
  const projectDecree = useSimulation((s) => s.projectDecree);
  const clearProjection = useSimulation((s) => s.clearProjection);
  const projection = useSimulation((s) => s.projection);
  const projecting = useSimulation((s) => s.projecting);
  const gameOver = useSimulation((s) => s.state.gameOver);

  const [text, setText] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleSubmit = React.useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    decree(trimmed);
    setText("");
    clearProjection();
    setTimeout(() => setSubmitting(false), 600);
  }, [text, submitting, decree, clearProjection]);

  const handleProject = React.useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || projecting) return;
    // Projeter sur 48 ticks = 2 ans simulés
    projectDecree(trimmed, 48);
  }, [text, projecting, projectDecree]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const fillExample = React.useCallback((example: string) => {
    setText(example);
    inputRef.current?.focus();
  }, []);

  return (
    <section className="border-t border-[var(--rule)] px-4 py-3">
      <h3
        className="font-mono uppercase tracking-wider text-[var(--ink-mute)] mb-1.5"
        style={{ fontSize: 9 }}
      >
        Décret
      </h3>
      <div className="flex gap-1.5">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Construire 10 hôpitaux…"
          disabled={!!gameOver}
          className="flex-1 min-w-0 font-mono px-2 py-1.5 bg-[var(--surface)] border border-[var(--rule)] focus:border-[var(--ink)] outline-none transition-colors"
          style={{ fontSize: 11, borderRadius: "0.25rem" }}
          aria-label="Saisir un décret"
        />
        <button
          type="button"
          onClick={handleProject}
          disabled={!text.trim() || projecting || !!gameOver}
          className="sd-step-btn"
          style={{ minWidth: 56 }}
          aria-label="Projeter le décret sur 2 ans"
          title="Simuler l'impact sur 2 ans sans appliquer"
        >
          {projecting ? "…" : "Projeter"}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!text.trim() || submitting || !!gameOver}
          className="sd-step-btn sd-step-btn-primary"
          style={{ minWidth: 56 }}
          aria-label="Émettre le décret"
        >
          {submitting ? "…" : "Émettre"}
        </button>
      </div>
      {/* Chips d'exemples */}
      <div className="flex flex-wrap gap-1 mt-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => fillExample(ex)}
            className="sd-chip"
            disabled={!!gameOver}
          >
            {ex}
          </button>
        ))}
      </div>
      <DecreeResultDisplay />
      <ProjectionPanel
        result={projection}
        projecting={projecting}
        onApply={handleSubmit}
        onDismiss={clearProjection}
      />
    </section>
  );
}
