"use client";

// GenesisModal.tsx — Modale plein écran si schema vide + connecting depuis >3s.
// "Connexion au moteur…" avec barre animée.

import * as React from "react";
import { useSimulation } from "@/hooks/use-simulation";

export function GenesisModal() {
  const leversCount = useSimulation((s) => s.levers.length);
  const connecting = useSimulation((s) => s.connecting);
  const connected = useSimulation((s) => s.connected);
  const init = useSimulation((s) => s.init);

  // Démarrage du compteur "depuis combien de temps on attend".
  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    if (leversCount > 0) return;
    const t0 = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - t0) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [leversCount]);

  // Initialiser la connexion si pas déjà fait (au cas où page.tsx n'a pas encore appelé init).
  React.useEffect(() => {
    if (leversCount === 0) init();
  }, [leversCount, init]);

  // Si on a déjà reçu le schéma, on n'affiche rien.
  if (leversCount > 0) return null;

  // Si on est connectés mais sans schéma depuis >5s, c'est probablement un backend vide.
  // On affiche quand même la modale "Connexion au moteur…" qui ne partira pas.
  // Mais on n'affiche la modale QUE si elapsed > 3 secondes (pour éviter le flash au démarrage).
  if (elapsed < 3) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "var(--paper)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="genesis-title"
    >
      <div className="text-center px-8 max-w-md">
        <h2
          id="genesis-title"
          className="font-mono font-semibold mb-1"
          style={{ fontSize: 16, color: "var(--ink)" }}
        >
          SYSTÈME DYNAMIQUE
        </h2>
        <p
          className="font-mono uppercase tracking-wider text-[var(--ink-mute)] mb-6"
          style={{ fontSize: 10 }}
        >
          Connexion au moteur…
        </p>
        {/* Barre animée */}
        <div
          className="relative w-64 mx-auto"
          style={{ height: 2, backgroundColor: "var(--rule)" }}
        >
          <div
            className="absolute top-0 left-0 sd-gen-bar"
            style={{
              width: 80,
              height: "100%",
              backgroundColor: "var(--ink)",
            }}
          />
        </div>
        <p
          className="font-mono text-[var(--ink-faint)] mt-4"
          style={{ fontSize: 10 }}
        >
          {connected ? "Connecté. En attente du modèle…" : `Connexion en cours… ${elapsed}s`}
        </p>
        {!connected && connecting && (
          <p
            className="font-mono text-[var(--ink-faint)] mt-2"
            style={{ fontSize: 9 }}
          >
            Le moteur de simulation (port 3003) doit être démarré.
          </p>
        )}
      </div>
    </div>
  );
}
