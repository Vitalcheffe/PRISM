"use client";

// NuclearPanel.tsx — Vue centrale PANNEAU. Le panneau nucléaire vu de dessus.
//
// Deux modes :
//   OVERVIEW (default) : tous les leviers en petits cubes (32×32px), groupés par 8 catégories.
//   ZOOM : une catégorie expanded — cubes 64×64px avec labels + mini-sliders.
//
// Cube :
//   - Fill height = ((value - min) / (max - min)) * 100%
//   - Fill color : ink (normal) / ochre (hot) / muted grey opacity 0.5 (cold) / bordeaux (crisis)
//   - Hover : scale 1.12 + tooltip
//   - Click : select + zoom into category
//   - Ripple : brief opacity pulse 200ms

import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { useSimulation } from "@/hooks/use-simulation";
import type { LeverDef, LeverState } from "@/lib/sim-types";
import { formatLeverValue } from "@/lib/sim-types";
import { LeverCube } from "./LeverCube";
import { Slider } from "@/components/ui/slider";

interface CategoryHealth {
  sain: number;
  tension: number;
  crise: number;
  total: number;
  label: "sain" | "tension" | "crise";
}

function computeCategoryHealth(
  levers: LeverDef[],
  leverStates: Record<string, LeverState>,
): CategoryHealth {
  let sain = 0;
  let tension = 0;
  let crise = 0;
  for (const l of levers) {
    const st = leverStates[l.id] ?? "normal";
    if (st === "crisis") crise++;
    else if (st === "hot" || st === "cold") tension++;
    else sain++;
  }
  const total = levers.length;
  let label: CategoryHealth["label"] = "sain";
  if (crise > 0) label = "crise";
  else if (tension > 0) label = "tension";
  return { sain, tension, crise, total, label };
}

function healthLabelTone(label: CategoryHealth["label"]): string {
  if (label === "crise") return "var(--state-crisis)";
  if (label === "tension") return "var(--state-tension)";
  return "var(--ink)";
}

function healthLabelTxt(label: CategoryHealth["label"]): string {
  if (label === "crise") return "CRISE";
  if (label === "tension") return "TENSION";
  return "SAIN";
}

// Hook : Set des leverIds ayant reçu un ripple récent (tick - r.tick <= 2).
function useRecentRipples(): Set<string> {
  const ripples = useSimulation((s) => s.state.ripples);
  const tick = useSimulation((s) => s.state.tick);

  return React.useMemo(() => {
    const s = new Set<string>();
    for (const r of ripples) {
      if (tick - r.tick <= 2) {
        s.add(r.toId);
      }
    }
    return s;
  }, [ripples, tick]);
}

// --- Overview mode ---

function CategorySection({ catCode }: { catCode: string }) {
  const category = useSimulation((s) =>
    s.categories.find((c) => c.code === catCode),
  );
  // ATTENTION: ne pas faire `s.levers.filter(...)` directement dans le sélecteur —
  // cela crée un nouveau tableau à chaque appel et provoque une boucle infinie
  // (useSyncExternalStore détecte une référence différente). On extrait la référence
  // stable de `s.levers` puis on filtre via useMemo.
  const allLevers = useSimulation((s) => s.levers);
  const levers = React.useMemo(
    () => allLevers.filter((l) => l.category === catCode),
    [allLevers, catCode],
  );
  const leverValues = useSimulation((s) => s.state.levers);
  const leverStates = useSimulation((s) => s.state.leverStates);
  const selectedLeverId = useSimulation((s) => s.selectedLeverId);
  const zoomedCategory = useSimulation((s) => s.zoomedCategory);
  const setSelectedLeverId = useSimulation((s) => s.setSelectedLeverId);
  const setZoomedCategory = useSimulation((s) => s.setZoomedCategory);
  const ripplingSet = useRecentRipples();

  const health = React.useMemo(
    () => computeCategoryHealth(levers, leverStates),
    [levers, leverStates],
  );

  // Si on est déjà zoomé sur une autre catégorie, on estompe.
  const isFaded = zoomedCategory !== null && zoomedCategory !== catCode;

  const handleClick = React.useCallback(
    (leverId: string) => {
      setSelectedLeverId(leverId);
      setZoomedCategory(catCode);
    },
    [setSelectedLeverId, setZoomedCategory, catCode],
  );

  if (!category || levers.length === 0) return null;

  const tone = healthLabelTone(health.label);

  return (
    <section
      className={`px-3 py-2.5 border-b border-[var(--rule)] transition-opacity ${
        isFaded ? "opacity-30" : "opacity-100"
      }`}
    >
      <header className="flex items-center gap-2 mb-2">
        <h3
          className="font-mono uppercase tracking-wider text-[var(--ink)]"
          style={{ fontSize: 10, fontWeight: 600 }}
        >
          {category.name}
        </h3>
        <span className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 9 }}>
          · {health.total} leviers
        </span>
        {/* Mini-barre de santé agrégée */}
        <div className="flex items-center gap-0.5 ml-auto">
          <div
            style={{
              width: 24,
              height: 2,
              backgroundColor: "var(--rule)",
              position: "relative",
            }}
          >
            {/* Partie saine */}
            <div
              style={{
                position: "absolute",
                left: 0,
                bottom: 0,
                width: `${(health.sain / health.total) * 100}%`,
                height: "100%",
                backgroundColor: "var(--ink)",
              }}
            />
            {/* Partie tension */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: `${(health.sain / health.total) * 100}%`,
                width: `${(health.tension / health.total) * 100}%`,
                height: "100%",
                backgroundColor: "var(--state-tension)",
              }}
            />
            {/* Partie crise */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: `${((health.sain + health.tension) / health.total) * 100}%`,
                width: `${(health.crise / health.total) * 100}%`,
                height: "100%",
                backgroundColor: "var(--state-crisis)",
              }}
            />
          </div>
          <span
            className="font-mono"
            style={{ fontSize: 9, color: tone, minWidth: 40 }}
          >
            {healthLabelTxt(health.label)}
          </span>
        </div>
      </header>
      <div className="flex flex-wrap gap-1.5">
        {levers.map((l) => (
          <LeverCube
            key={l.id}
            lever={l}
            value={leverValues[l.id] ?? l.baseline}
            state={leverStates[l.id] ?? "normal"}
            selected={selectedLeverId === l.id}
            rippling={ripplingSet.has(l.id)}
            size={32}
            onClick={handleClick}
          />
        ))}
      </div>
    </section>
  );
}

function OverviewMode() {
  const categories = useSimulation((s) => s.categories);

  return (
    <div className="h-full overflow-y-auto sd-scroll">
      <div className="px-3 py-2 border-b border-[var(--rule)] flex items-center justify-between sticky top-0 bg-[var(--paper)] z-10">
        <span
          className="font-mono uppercase tracking-wider text-[var(--ink-mute)]"
          style={{ fontSize: 9 }}
        >
          Panneau — vue d&apos;ensemble
        </span>
        <span className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 9 }}>
          Cliquer un cube pour zoomer
        </span>
      </div>
      {categories.map((c) => (
        <CategorySection key={c.code} catCode={c.code} />
      ))}
    </div>
  );
}

// --- Zoom mode ---

function ZoomedCube({
  lever,
  value,
  state,
  selected,
  rippling,
  onSelect,
  onAdjust,
}: {
  lever: LeverDef;
  value: number;
  state: LeverState;
  selected: boolean;
  rippling: boolean;
  onSelect: (id: string) => void;
  onAdjust: (id: string, value: number) => void;
}) {
  // Slider local pour UI instantanée ; émet l'ajust au serveur (debounce géré côté parent).
  const [localValue, setLocalValue] = React.useState(value);

  // Sync depuis serveur (quand value change sans qu'on touche le slider).
  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Debounce ~150ms via timeout.
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleChange = React.useCallback(
    (arr: number[]) => {
      const v = arr[0];
      setLocalValue(v);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        onAdjust(lever.id, v);
      }, 150);
    },
    [lever.id, onAdjust],
  );

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const step = React.useMemo(() => {
    const range = lever.max - lever.min;
    if (range >= 100) return 1;
    if (range >= 10) return 0.5;
    if (range >= 1) return 0.05;
    return 0.001;
  }, [lever.max, lever.min]);

  const formatted = formatLeverValue(localValue, lever.displayFormat, lever.unit);
  const stateTxt =
    state === "normal" ? "SAIN" : state === "hot" ? "CHAUD" : state === "cold" ? "FROID" : "CRISE";
  const tone =
    state === "crisis"
      ? "var(--state-crisis)"
      : state === "hot"
        ? "var(--state-tension)"
        : state === "cold"
          ? "var(--ink-faint)"
          : "var(--ink)";

  return (
    <div className="flex flex-col items-center" style={{ width: 80 }}>
      <LeverCube
        lever={lever}
        value={value}
        state={state}
        selected={selected}
        rippling={rippling}
        size={64}
        onClick={onSelect}
        showLabel
      />
      <span
        className="font-mono text-[var(--ink)] mt-1.5 text-center leading-tight truncate w-full"
        style={{ fontSize: 10 }}
        title={lever.name}
      >
        {lever.name}
      </span>
      <span
        className="font-mono mt-0.5 sd-value-trans"
        style={{ fontSize: 11, color: tone }}
      >
        {formatted}
      </span>
      <span
        className="font-mono uppercase"
        style={{ fontSize: 8, color: tone, letterSpacing: "0.05em" }}
      >
        {stateTxt}
      </span>
      <div className="w-full mt-1.5 px-1">
        <Slider
          className="sd-mini-slider"
          min={lever.min}
          max={lever.max}
          step={step}
          value={[localValue]}
          onValueChange={handleChange}
          aria-label={`Ajuster ${lever.name}`}
        />
      </div>
    </div>
  );
}

function ZoomMode({ catCode }: { catCode: string }) {
  const category = useSimulation((s) =>
    s.categories.find((c) => c.code === catCode),
  );
  // ATTENTION: ne pas faire `s.levers.filter(...)` dans le sélecteur (boucle infinie).
  const allLevers = useSimulation((s) => s.levers);
  const levers = React.useMemo(
    () => allLevers.filter((l) => l.category === catCode),
    [allLevers, catCode],
  );
  const leverValues = useSimulation((s) => s.state.levers);
  const leverStates = useSimulation((s) => s.state.leverStates);
  const selectedLeverId = useSimulation((s) => s.selectedLeverId);
  const setSelectedLeverId = useSimulation((s) => s.setSelectedLeverId);
  const setZoomedCategory = useSimulation((s) => s.setZoomedCategory);
  const adjustLever = useSimulation((s) => s.adjustLever);
  const ripplingSet = useRecentRipples();

  const health = React.useMemo(
    () => computeCategoryHealth(levers, leverStates),
    [levers, leverStates],
  );

  if (!category) return null;

  const tone = healthLabelTone(health.label);

  return (
    <div className="h-full overflow-y-auto sd-scroll">
      <div className="px-3 py-2 border-b border-[var(--rule)] flex items-center gap-3 sticky top-0 bg-[var(--paper)] z-10">
        <button
          type="button"
          onClick={() => setZoomedCategory(null)}
          className="flex items-center gap-1 font-mono text-[var(--ink)] hover:opacity-70 transition-opacity"
          style={{ fontSize: 11 }}
          aria-label="Retour à la vue d'ensemble"
        >
          <ArrowLeft size={12} />
          Retour
        </button>
        <span
          className="font-mono uppercase tracking-wider text-[var(--ink)]"
          style={{ fontSize: 11, fontWeight: 600 }}
        >
          {category.name}
        </span>
        <span className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 9 }}>
          · {health.total} leviers
        </span>
        <span
          className="font-mono ml-auto"
          style={{ fontSize: 9, color: tone, textTransform: "uppercase" }}
        >
          {healthLabelTxt(health.label)}
        </span>
      </div>
      <div className="px-4 py-5 flex flex-wrap gap-4 justify-start">
        {levers.map((l) => (
          <ZoomedCube
            key={l.id}
            lever={l}
            value={leverValues[l.id] ?? l.baseline}
            state={leverStates[l.id] ?? "normal"}
            selected={selectedLeverId === l.id}
            rippling={ripplingSet.has(l.id)}
            onSelect={setSelectedLeverId}
            onAdjust={adjustLever}
          />
        ))}
      </div>
      {category.description && (
        <p
          className="px-4 py-3 font-mono text-[var(--ink-mute)] border-t border-[var(--rule)]"
          style={{ fontSize: 10 }}
        >
          {category.description}
        </p>
      )}
    </div>
  );
}

export function NuclearPanel() {
  const zoomedCategory = useSimulation((s) => s.zoomedCategory);
  const leversCount = useSimulation((s) => s.levers.length);

  if (leversCount === 0) {
    return (
      <div
        className="h-full flex items-center justify-center font-mono text-[var(--ink-faint)]"
        style={{ fontSize: 11 }}
      >
        En attente du modèle…
      </div>
    );
  }

  if (zoomedCategory) {
    return <ZoomMode catCode={zoomedCategory} />;
  }
  return <OverviewMode />;
}
