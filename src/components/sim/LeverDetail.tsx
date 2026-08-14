"use client";

// LeverDetail.tsx — Panneau DROIT (320px), plus serré.
//
// Si pas de levier sélectionné : placeholder "Sélectionnez un levier".
// Si sélectionné :
//   1. Header (catégorie · nom · description)
//   2. Valeur courante (24px mono) + état + range bar avec safe zone
//   3. Provenance (SOURCE)
//   4. Ajustement (Slider + quick-step buttons)
//   5. Connexions causales (sortantes + entrantes, issues du graphe `edges`)
//   6. Tendance (sparkline de l'historique du levier)
//   7. DÉCRET input (via DecreeInput) + ProjectionPanel

import * as React from "react";
import { MousePointer2 } from "lucide-react";
import { useSimulation, type CausalEdge } from "@/hooks/use-simulation";
import { formatLeverValue, type LeverDef, type LeverState } from "@/lib/sim-types";
import { Slider } from "@/components/ui/slider";
import { DecreeInput } from "./DecreeInput";
import { MiniSparkline, type SparklineState } from "./MiniSparkline";

const STATE_LABEL: Record<LeverState, string> = {
  normal: "SAIN",
  hot: "CHAUD",
  cold: "FROID",
  crisis: "CRISE",
};

function stateTone(state: LeverState): string {
  if (state === "crisis") return "var(--state-crisis)";
  if (state === "hot") return "var(--state-tension)";
  if (state === "cold") return "var(--ink-faint)";
  return "var(--ink)";
}

function Placeholder() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
      <MousePointer2 size={26} className="text-[var(--ink-faint)]" />
      <p
        className="font-mono text-[var(--ink-mute)]"
        style={{ fontSize: 11 }}
      >
        Sélectionnez un levier sur le globe
      </p>
      <p className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 9 }}>
        Cliquez un cube de l&apos;anneau radial
      </p>
    </div>
  );
}

function ValueRangeBar({ lever, value }: { lever: LeverDef; value: number }) {
  const range = lever.max - lever.min;
  const valPct = range > 0 ? ((value - lever.min) / range) * 100 : 50;
  const safeLowPct = range > 0 ? ((lever.safeLow - lever.min) / range) * 100 : 0;
  const safeHighPct = range > 0 ? ((lever.safeHigh - lever.min) / range) * 100 : 100;

  return (
    <div className="mt-2">
      <div className="relative w-full" style={{ height: 6 }}>
        <div
          className="absolute left-0 right-0 top-1/2 -translate-y-1/2"
          style={{ height: 1, backgroundColor: "var(--rule-strong)" }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2"
          style={{
            left: `${Math.max(0, safeLowPct)}%`,
            width: `${Math.min(100, safeHighPct) - Math.max(0, safeLowPct)}%`,
            height: 3,
            backgroundColor: "var(--ink-faint)",
            opacity: 0.5,
          }}
          aria-hidden="true"
        />
        <div
          className="absolute top-0 bottom-0 sd-value-trans"
          style={{
            left: `${Math.max(0, Math.min(100, valPct))}%`,
            width: 1,
            backgroundColor: "var(--ink)",
          }}
          aria-hidden="true"
        />
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 9 }}>
          {lever.min}
        </span>
        <span className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 9 }}>
          {lever.max}
        </span>
      </div>
    </div>
  );
}

function Adjustment({
  lever,
  value,
  onAdjust,
}: {
  lever: LeverDef;
  value: number;
  onAdjust: (id: string, value: number) => void;
}) {
  const [localValue, setLocalValue] = React.useState(value);

  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleValueChange = React.useCallback(
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

  const range = lever.max - lever.min;
  const quickSteps = [
    { label: "−10%", delta: -0.1 * range },
    { label: "−5%", delta: -0.05 * range },
    { label: "+5%", delta: 0.05 * range },
    { label: "+10%", delta: 0.1 * range },
  ];

  const handleQuickStep = React.useCallback(
    (delta: number) => {
      const v = Math.max(lever.min, Math.min(lever.max, localValue + delta));
      setLocalValue(v);
      onAdjust(lever.id, v);
    },
    [lever.id, lever.min, lever.max, localValue, onAdjust],
  );

  return (
    <section className="px-3 py-2.5 border-t border-[var(--rule)]">
      <h3
        className="font-mono uppercase tracking-wider text-[var(--ink-mute)] mb-2"
        style={{ fontSize: 9 }}
      >
        Ajustement
      </h3>
      <div className="mb-1.5">
        <Slider
          className="sd-slider"
          min={lever.min}
          max={lever.max}
          step={step}
          value={[localValue]}
          onValueChange={handleValueChange}
          aria-label={`Ajuster ${lever.name}`}
        />
      </div>
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[var(--ink)]" style={{ fontSize: 11 }}>
          {lever.displayFormat === "percent"
            ? formatLeverValue(localValue, lever.displayFormat, lever.unit)
            : `${formatLeverValue(localValue, lever.displayFormat, lever.unit)} ${lever.unit}`}
        </span>
        <span className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 9 }}>
          [{lever.min} – {lever.max}]
        </span>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {quickSteps.map((qs) => (
          <button
            key={qs.label}
            type="button"
            onClick={() => handleQuickStep(qs.delta)}
            className="sd-step-btn"
          >
            {qs.label}
          </button>
        ))}
      </div>
    </section>
  );
}

// --- Connexions causales (sortantes + entrantes) ---

function ConnectionRow({
  edge,
  direction,
  leverName,
}: {
  edge: CausalEdge;
  direction: "out" | "in";
  leverName: string;
}) {
  const positive = edge.coefficient >= 0;
  const sign = positive ? "+" : "−";
  const coefficient = Math.abs(edge.coefficient).toFixed(2);
  const delayTxt = edge.delayTicks >= 12 ? `${(edge.delayTicks / 12).toFixed(1)} an` : `${edge.delayTicks} t`;

  return (
    <div
      className="flex items-start gap-1.5 py-1"
      style={{ borderBottom: "1px solid var(--rule-soft)" }}
      title={edge.rationale}
    >
      <span
        className="font-mono shrink-0"
        style={{
          fontSize: 9,
          color: positive ? "var(--ink)" : "var(--state-tension)",
          fontWeight: 600,
          width: 12,
        }}
      >
        {sign}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-1">
          <span
            className="font-mono text-[var(--ink)] truncate"
            style={{ fontSize: 10 }}
          >
            {leverName}
          </span>
          <span className="font-mono text-[var(--ink-faint)] shrink-0" style={{ fontSize: 9 }}>
            {coefficient} · {delayTxt}
          </span>
        </div>
        <p className="font-mono text-[var(--ink-mute)] truncate" style={{ fontSize: 9 }}>
          {edge.rationale}
        </p>
      </div>
    </div>
  );
}

function Connections({ leverId }: { leverId: string }) {
  const edges = useSimulation((s) => s.edges);
  const levers = useSimulation((s) => s.levers);

  const { outgoing, incoming } = React.useMemo(() => {
    const out: CausalEdge[] = [];
    const inc: CausalEdge[] = [];
    for (const e of edges) {
      if (e.source === leverId) out.push(e);
      if (e.target === leverId) inc.push(e);
    }
    return { outgoing: out, incoming: inc };
  }, [edges, leverId]);

  const nameById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const l of levers) m.set(l.id, l.name);
    return m;
  }, [levers]);

  if (outgoing.length === 0 && incoming.length === 0) return null;

  return (
    <section className="px-3 py-2.5 border-t border-[var(--rule)]">
      <h3
        className="font-mono uppercase tracking-wider text-[var(--ink-mute)] mb-1.5"
        style={{ fontSize: 9 }}
      >
        Connexions causales
      </h3>
      {outgoing.length > 0 && (
        <div className="mb-2">
          <p className="font-mono text-[var(--ink-faint)] mb-0.5" style={{ fontSize: 8, letterSpacing: "0.08em" }}>
            AFFECTE ({outgoing.length})
          </p>
          {outgoing.map((e, i) => (
            <ConnectionRow
              key={`out-${i}`}
              edge={e}
              direction="out"
              leverName={nameById.get(e.target) ?? e.target}
            />
          ))}
        </div>
      )}
      {incoming.length > 0 && (
        <div>
          <p className="font-mono text-[var(--ink-faint)] mb-0.5" style={{ fontSize: 8, letterSpacing: "0.08em" }}>
            AFFECTÉ PAR ({incoming.length})
          </p>
          {incoming.map((e, i) => (
            <ConnectionRow
              key={`in-${i}`}
              edge={e}
              direction="in"
              leverName={nameById.get(e.source) ?? e.source}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// --- Tendance (sparkline de l'historique du levier) ---

function TrendSparkline({ leverId }: { leverId: string }) {
  const history = useSimulation((s) => s.state.history[`lev_${leverId}`]);
  const state = useSimulation((s) => s.state.leverStates[leverId]);

  const series = React.useMemo(() => {
    if (!history || history.length === 0) return [];
    return history.slice(-80);
  }, [history]);

  const sparkState: SparklineState =
    state === "crisis" ? "critical" : state === "hot" ? "warning" : "normal";

  if (series.length < 2) return null;

  return (
    <section className="px-3 py-2.5 border-t border-[var(--rule)]">
      <h3
        className="font-mono uppercase tracking-wider text-[var(--ink-mute)] mb-1.5"
        style={{ fontSize: 9 }}
      >
        Tendance · {series.length} pts
      </h3>
      <MiniSparkline
        values={series}
        width={280}
        height={40}
        state={sparkState}
        showDraw
      />
    </section>
  );
}

function SelectedLever({ leverId }: { leverId: string }) {
  const lever = useSimulation((s) => s.levers.find((l) => l.id === leverId));
  const value = useSimulation((s) => s.state.levers[leverId]);
  const state = useSimulation((s) => s.state.leverStates[leverId]);
  const category = useSimulation((s) =>
    s.categories.find((c) => c.code === lever?.category),
  );
  const adjustLever = useSimulation((s) => s.adjustLever);

  if (!lever) {
    return <Placeholder />;
  }

  const v = value ?? lever.baseline;
  const st: LeverState = state ?? "normal";
  const tone = stateTone(st);
  const formatted = formatLeverValue(v, lever.displayFormat, lever.unit);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto sd-scroll">
        {/* Header */}
        <section className="px-3 py-2.5 border-b border-[var(--rule)]">
          <p
            className="font-mono uppercase tracking-wider text-[var(--ink-mute)] mb-1"
            style={{ fontSize: 9 }}
          >
            {category?.name ?? lever.category}
          </p>
          <h2
            className="font-mono font-semibold text-[var(--ink)] leading-tight"
            style={{ fontSize: 14 }}
          >
            {lever.name}
          </h2>
          <p
            className="font-mono text-[var(--ink-soft)] mt-1 leading-snug"
            style={{ fontSize: 10 }}
          >
            {lever.description}
          </p>
        </section>

        {/* Valeur courante */}
        <section className="px-3 py-2.5 border-b border-[var(--rule)]">
          <div className="flex items-baseline justify-between">
            <h3
              className="font-mono uppercase tracking-wider text-[var(--ink-mute)]"
              style={{ fontSize: 9 }}
            >
              Valeur courante
            </h3>
            <span
              className="font-mono uppercase"
              style={{ fontSize: 10, color: tone, letterSpacing: "0.05em" }}
            >
              {STATE_LABEL[st]}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span
              className="font-mono font-semibold sd-value-trans"
              style={{ fontSize: 24, color: tone, lineHeight: 1 }}
            >
              {formatted}
            </span>
            {lever.displayFormat !== "percent" && (
              <span className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 10 }}>
                {lever.unit}
              </span>
            )}
          </div>
          <ValueRangeBar lever={lever} value={v} />
        </section>

        {/* Provenance */}
        <section className="px-3 py-2.5 border-b border-[var(--rule)]">
          <h3
            className="font-mono uppercase tracking-wider text-[var(--ink-mute)] mb-1"
            style={{ fontSize: 9 }}
          >
            Source
          </h3>
          <p className="font-mono text-[var(--ink)]" style={{ fontSize: 10 }}>
            {lever.source}
          </p>
        </section>

        {/* Ajustement */}
        <Adjustment lever={lever} value={v} onAdjust={adjustLever} />

        {/* Connexions causales */}
        <Connections leverId={leverId} />

        {/* Tendance */}
        <TrendSparkline leverId={leverId} />
      </div>

      {/* DÉCRET — sticky en bas */}
      <DecreeInput />
    </div>
  );
}

export function LeverDetail() {
  const selectedLeverId = useSimulation((s) => s.selectedLeverId);

  if (!selectedLeverId) return <Placeholder />;
  return <SelectedLever leverId={selectedLeverId} />;
}
