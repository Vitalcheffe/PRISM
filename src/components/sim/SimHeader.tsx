"use client";

// SimHeader.tsx — Header sticky (48px), pleine largeur.
//
// Gauche : titre "SYSTÈME DYNAMIQUE" (mono 13px) + sous-titre (9px).
// Droite : tick T#### + dot de connexion + pause/play + reset.
// Le centre est vide — le globe EST le centre de l'écran désormais.

import * as React from "react";
import { Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useSimulation } from "@/hooks/use-simulation";
import { ViewSwitcher } from "./ViewSwitcher";
import { useGenerativeAudio } from "./GenerativeAudio";

function ConnectionDot({ connected }: { connected: boolean }) {
  return (
    <span
      aria-label={connected ? "Connecté" : "Déconnecté"}
      title={connected ? "Connecté" : "Déconnecté"}
      className="inline-block"
      style={{
        width: 6,
        height: 6,
        borderRadius: "9999px",
        border: connected ? "none" : "1px solid var(--ink-mute)",
        backgroundColor: connected ? "var(--ink)" : "transparent",
      }}
    />
  );
}

export function SimHeader() {
  const tick = useSimulation((s) => s.state.tick);
  const paused = useSimulation((s) => s.state.paused);
  const gameOver = useSimulation((s) => s.state.gameOver);
  const connected = useSimulation((s) => s.connected);
  const leversCount = useSimulation((s) => s.levers.length);
  const indicatorsCount = useSimulation((s) => s.indicators.length);
  const pause = useSimulation((s) => s.pause);
  const resume = useSimulation((s) => s.resume);
  const reset = useSimulation((s) => s.reset);
  const stability = useSimulation((s) => s.state.stability);
  const revolutionRisk = useSimulation((s) => s.state.indicators?.revolution_risk ?? 0);
  const inflation = useSimulation((s) => s.state.indicators?.inflation ?? 0);
  const unemployment = useSimulation((s) => s.state.indicators?.unemployment ?? 0);
  const lastBlackSwan = useSimulation((s) => s.state.lastBlackSwan);
  const audio = useGenerativeAudio();
  const audioEnabled = audio.enabled;
  const audioUpdate = audio.update;
  const audioTrigger = audio.triggerImpact;
  const audioToggle = audio.toggle;

  // Mettre à jour l'audio à chaque changement d'état (deps primitives seulement)
  React.useEffect(() => {
    if (audioEnabled) {
      audioUpdate(stability, revolutionRisk, inflation, unemployment);
    }
  }, [stability, revolutionRisk, inflation, unemployment, audioEnabled, audioUpdate]);

  // Percussion quand un cygne noir frappe
  const lastSwanTick = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (lastBlackSwan && lastBlackSwan.tick !== lastSwanTick.current) {
      lastSwanTick.current = lastBlackSwan.tick;
      audioTrigger(lastBlackSwan.severity);
    }
  }, [lastBlackSwan, audioTrigger]);

  const tickStr = `T${String(tick).padStart(4, "0")}`;

  const handlePauseToggle = React.useCallback(() => {
    if (paused) resume();
    else pause();
  }, [paused, pause, resume]);

  const handleAudioToggle = React.useCallback(() => {
    audioToggle();
  }, [audioToggle]);

  return (
    <header
      className="sticky top-0 z-30 bg-[var(--paper)]"
      style={{
        height: 48,
        borderBottom: "1px solid var(--rule)",
      }}
    >
      <div className="h-full flex items-center justify-between gap-4 px-3 lg:px-5">
        {/* GAUCHE — titre + sous-titre */}
        <div className="flex flex-col min-w-0">
          <h1
            className="font-mono font-medium text-[var(--ink)] leading-none truncate"
            style={{ fontSize: 12, letterSpacing: "0.06em" }}
          >
            PRISM
          </h1>
          <p
            className="font-mono text-[var(--ink-mute)] truncate mt-1"
            style={{ fontSize: 8, letterSpacing: "0.04em" }}
          >
            Morocco · {leversCount} levers · {indicatorsCount} indicators
          </p>
        </div>

        {/* CENTRE — view switcher */}
        <div className="hidden md:flex flex-1 justify-center">
          <ViewSwitcher />
        </div>

        {/* DROITE — contrôles */}
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/Vitalcheffe/PRISM"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[var(--ink-mute)] hover:text-[var(--ink)] transition-colors hidden lg:inline"
            style={{ fontSize: 10, letterSpacing: "0.08em", textDecoration: "none" }}
            aria-label="GitHub repository"
            title="GitHub — source, docs, gallery, interactive map"
          >
            GITHUB ↗
          </a>
          <div className="flex items-center gap-1.5">
            <span
              className="font-mono text-[var(--ink)]"
              style={{ fontSize: 11, letterSpacing: "0.05em" }}
              aria-label="Tick courant"
            >
              {tickStr}
            </span>
            <ConnectionDot connected={connected} />
          </div>
          <button
            type="button"
            onClick={handleAudioToggle}
            className="text-[var(--ink)] hover:opacity-70 transition-opacity p-1"
            aria-label={audio.enabled ? "Couper l'audio génératif" : "Activer l'audio génératif"}
            title={audio.enabled ? "Couper l'audio" : "Activer l'audio (symphonie du chaos)"}
          >
            {audio.enabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <button
            type="button"
            onClick={handlePauseToggle}
            className="text-[var(--ink)] hover:opacity-70 transition-opacity p-1"
            aria-label={paused ? "Reprendre" : "Pause"}
            title={paused ? "Reprendre" : "Pause"}
            disabled={!!gameOver}
          >
            {paused ? <Play size={14} /> : <Pause size={14} />}
          </button>
          <button
            type="button"
            onClick={reset}
            className="text-[var(--ink)] hover:opacity-70 transition-opacity p-1"
            aria-label="Réinitialiser"
            title="Réinitialiser"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>
      {/* View switcher sur mobile (seconde ligne) */}
      <div className="md:hidden flex items-center gap-3 px-3 pb-1.5 overflow-x-auto">
        <ViewSwitcher />
      </div>
    </header>
  );
}
