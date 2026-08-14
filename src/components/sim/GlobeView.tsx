"use client";

// GlobeView.tsx — Vue centrale GLOBE (remplace NuclearPanel).
//
// Le Maroc est un GLOBE au centre de l'écran. Les ~47 leviers sont disposés en
// anneau radial autour de lui, regroupés en 8 secteurs angulaires (un par
// catégorie). Les arêtes causales se dessinent comme des rayons (spokes) du
// levier vers le globe, et comme des lignes directes entre deux leviers quand
// un ripple se propage (effet papillon visible).
//
// Structure SVG (viewBox centré sur 0,0) :
//   1. Globe central (r ~80) — cercle dont la couleur encode la stabilité
//   2. 8 lignes de division radiale séparant les secteurs
//   3. Spokes (0.5px gris très clair) de chaque levier vers le centre
//   4. Ring de cubes (47 × 10×10px à r ~220) — fill height = value %
//   5. Labels de catégorie à r ~260
//   6. Lignes d'ripple actives (1px ink, 300ms) entre deux positions
//
// Interactions :
//   - Hover cube : agrandit à 14px, tooltip, spoke 1px ink, arêtes sortantes
//   - Click cube : sélectionne le levier → panneau DROITE
//   - Wheel : zoom in/out (labels apparaissent à fort zoom)
//   - Click empty : désélectionne

import * as React from "react";
import { useSimulation, type CausalEdge } from "@/hooks/use-simulation";
import type { LeverDef, LeverState, CategoryDef } from "@/lib/sim-types";
import { formatLeverValue } from "@/lib/sim-types";

// ──────────────────────────────────────────────────────────────────────────
//  Géométrie — constantes du globe
// ──────────────────────────────────────────────────────────────────────────

const GLOBE_R = 80;             // rayon du globe
const RING_R = 220;             // rayon de l'anneau de cubes (centre du cube)
const LABEL_R = 275;            // rayon des labels de catégorie (assez loin des cubes pour éviter les chevauchements de bbox)
const DIVIDER_OUTER_R = 295;    // extension des lignes de division radiale
const CUBE_SIZE = 10;           // taille du cube au repos
const CUBE_SIZE_HOVER = 14;     // taille du cube survolé
const VIEWBOX = 600;            // viewBox = -300 -300 600 600

const SECTOR_START_DEG = -90;   // commence en haut (12h)
const SECTOR_WIDTH_DEG = 360 / 8; // 45° par secteur

function degToRad(d: number): number {
  return (d * Math.PI) / 180;
}

// ──────────────────────────────────────────────────────────────────────────
//  Couleurs d'état
// ──────────────────────────────────────────────────────────────────────────

function stateFill(state: LeverState): string {
  switch (state) {
    case "hot":
      return "var(--state-tension)";
    case "crisis":
      return "var(--state-crisis)";
    case "cold":
      return "var(--ink-faint)";
    default:
      return "var(--ink)";
  }
}

function stateFillOpacity(state: LeverState): number {
  return state === "cold" ? 0.5 : 1;
}

function stabilityTone(value: number): string {
  if (value < 30) return "var(--state-crisis)";
  if (value < 60) return "var(--state-tension)";
  return "var(--ink)";
}

// ──────────────────────────────────────────────────────────────────────────
//  Layout — calcul des positions des cubes (memo sur le schéma)
// ──────────────────────────────────────────────────────────────────────────

interface LeverPosition {
  lever: LeverDef;
  x: number;
  y: number;
  angleDeg: number;
  categoryIndex: number;
}

interface CategorySector {
  category: CategoryDef;
  startDeg: number;
  endDeg: number;
  midDeg: number;
  labelX: number;
  labelY: number;
  // Direction radiale unitaire (du centre vers le label) — pour placer
  // le point de santé côté centre. Les labels restent HORIZONTAUX (zéro
  // rotation) afin de ne jamais être à l'envers.
  ux: number;
  uy: number;
  leverCount: number;
}

interface GlobeLayout {
  positions: LeverPosition[];
  sectors: CategorySector[];
  positionById: Map<string, LeverPosition>;
}

const CATEGORY_ORDER: LeverDef["category"][] = [
  "economy",
  "health",
  "education",
  "infrastructure",
  "demographics",
  "governance",
  "environment",
  "social",
];

function useGlobeLayout(): GlobeLayout {
  const levers = useSimulation((s) => s.levers);
  const categories = useSimulation((s) => s.categories);

  return React.useMemo(() => {
    const positions: LeverPosition[] = [];
    const sectors: CategorySector[] = [];
    const positionById = new Map<string, LeverPosition>();

    // Indexer les catégories selon l'ordre canonique (8 secteurs égaux).
    const orderedCats: CategoryDef[] = CATEGORY_ORDER.map(
      (code) => categories.find((c) => c.code === code) ?? { code, name: code, description: "" },
    );

    orderedCats.forEach((category, ci) => {
      const startDeg = SECTOR_START_DEG + ci * SECTOR_WIDTH_DEG;
      const endDeg = startDeg + SECTOR_WIDTH_DEG;
      const midDeg = startDeg + SECTOR_WIDTH_DEG / 2;
      const sectorLevers = levers.filter((l) => l.category === category.code);
      const n = sectorLevers.length;

      // Position du label de catégorie (au milieu du secteur, rayon LABEL_R).
      // Les labels sont TOUJOURS horizontaux (pas de rotation tangentielle)
      // — c'est l'approche la plus robuste contre le texte à l'envers.
      const labelRad = degToRad(midDeg);
      const ux = Math.cos(labelRad);
      const uy = Math.sin(labelRad);
      const labelX = LABEL_R * ux;
      const labelY = LABEL_R * uy;

      sectors.push({
        category,
        startDeg,
        endDeg,
        midDeg,
        labelX,
        labelY,
        ux,
        uy,
        leverCount: n,
      });

      // Position de chaque cube dans le secteur
      sectorLevers.forEach((lever, i) => {
        const angleDeg =
          n === 1
            ? midDeg
            : startDeg + ((i + 0.5) / n) * SECTOR_WIDTH_DEG;
        const rad = degToRad(angleDeg);
        const x = RING_R * Math.cos(rad);
        const y = RING_R * Math.sin(rad);
        const pos: LeverPosition = { lever, x, y, angleDeg, categoryIndex: ci };
        positions.push(pos);
        positionById.set(lever.id, pos);
      });
    });

    return { positions, sectors, positionById };
  }, [levers, categories]);
}

// ──────────────────────────────────────────────────────────────────────────
//  Ripples récents (Set des toIds touchés dans les 2 derniers ticks)
// ──────────────────────────────────────────────────────────────────────────

function useActiveRipples(): { active: Set<string>; pairs: Array<{ fromId: string; toId: string }> } {
  const ripples = useSimulation((s) => s.state.ripples);
  const tick = useSimulation((s) => s.state.tick);

  return React.useMemo(() => {
    const active = new Set<string>();
    const pairs: Array<{ fromId: string; toId: string }> = [];
    const seen = new Set<string>();
    for (const r of ripples) {
      if (tick - r.tick <= 2) {
        active.add(r.toId);
        const key = `${r.fromId}>${r.toId}`;
        if (!seen.has(key)) {
          seen.add(key);
          pairs.push({ fromId: r.fromId, toId: r.toId });
        }
      }
    }
    return { active, pairs };
  }, [ripples, tick]);
}

// ──────────────────────────────────────────────────────────────────────────
//  Cube radial (mémoïsé, props primitives)
// ──────────────────────────────────────────────────────────────────────────

interface LeverCubeRadialProps {
  leverId: string;
  leverName: string;
  unit: string;
  displayFormat: LeverDef["displayFormat"];
  min: number;
  max: number;
  value: number;
  state: LeverState;
  x: number;
  y: number;
  selected: boolean;
  hovered: boolean;
  rippling: boolean;
  showLabel: boolean;
  abbreviated: string;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

function fillPct(value: number, min: number, max: number): number {
  if (max === min) return 50;
  const p = ((value - min) / (max - min)) * 100;
  return Math.max(0, Math.min(100, p));
}

function abbreviate(name: string): string {
  // 4-5 chars : on garde les premières lettres significatives.
  const clean = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  // Si le nom contient un "/", on prend la première partie.
  const head = clean.split(/[/(-]/)[0].trim();
  const tokens = head.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    return (tokens[0][0] + tokens[1].slice(0, 3)).slice(0, 5);
  }
  return head.replace(/[^A-Z0-9]/g, "").slice(0, 5);
}

const LeverCubeRadial = React.memo(function LeverCubeRadial({
  leverId,
  leverName,
  unit,
  displayFormat,
  min,
  max,
  value,
  state,
  x,
  y,
  selected,
  hovered,
  rippling,
  showLabel,
  abbreviated,
  onSelect,
  onHover,
}: LeverCubeRadialProps) {
  const pct = fillPct(value, min, max);
  const size = hovered ? CUBE_SIZE_HOVER : CUBE_SIZE;
  const half = size / 2;
  const fillH = (size * pct) / 100;

  const fill = stateFill(state);
  const fillOpacity = stateFillOpacity(state);

  const handleClick = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect(leverId);
    },
    [onSelect, leverId],
  );

  const handleEnter = React.useCallback(() => onHover(leverId), [onHover, leverId]);
  const handleLeave = React.useCallback(() => onHover(null), [onHover]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        onSelect(leverId);
      }
    },
    [onSelect, leverId],
  );

  const formatted = formatLeverValue(value, displayFormat, unit);
  const displayValue =
    displayFormat === "percent" ? formatted : `${formatted} ${unit}`;
  const stateTxt =
    state === "normal"
      ? "SAIN"
      : state === "hot"
        ? "CHAUD"
        : state === "cold"
          ? "FROID"
          : "CRISE";

  // Label HORIZONTAL : positionné selon le côté du cercle où se trouve le
  // cube, avec text-anchor adapté pour ne jamais chevaucher le cube ni les
  // labels adjacents.
  //   - Moitié droite  (|angle| < 60°)   : anchor="start", label à droite
  //   - Moitié gauche  (|angle| > 120°)  : anchor="end", label à gauche
  //   - Haut / bas     (sinon)           : anchor="middle", label au-dessus
  //                                         ou en-dessous du cube
  // L'angle est calculé depuis la position (x, y) du cube par rapport au
  // centre du globe.
  const angleDeg = (Math.atan2(y, x) * 180) / Math.PI;
  const gap = half + 4;
  const vGap = half + 10;
  let labelX = 0;
  let labelY = 0;
  let labelAnchor: "start" | "middle" | "end" = "middle";
  if (angleDeg > -60 && angleDeg < 60) {
    // Moitié droite
    labelX = gap;
    labelY = 0;
    labelAnchor = "start";
  } else if (angleDeg > 120 || angleDeg < -120) {
    // Moitié gauche
    labelX = -gap;
    labelY = 0;
    labelAnchor = "end";
  } else if (y > 0) {
    // Bas
    labelX = 0;
    labelY = vGap;
    labelAnchor = "middle";
  } else {
    // Haut
    labelX = 0;
    labelY = -vGap;
    labelAnchor = "middle";
  }

  return (
    <g
      transform={`translate(${x} ${y})`}
      style={{ cursor: "pointer" }}
      onClick={handleClick}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`${leverName} : ${displayValue}. État ${stateTxt}. ${
        selected ? "Sélectionné." : "Cliquer pour sélectionner."
      }`}
      aria-pressed={selected}
      focusable="true"
    >
      {/* Halo de sélection (anneau 1px ink) */}
      {selected && (
        <rect
          x={-half - 3}
          y={-half - 3}
          width={size + 6}
          height={size + 6}
          fill="none"
          stroke="var(--ink)"
          strokeWidth={1}
        />
      )}
      {/* Fond du cube (surface blanche) */}
      <rect
        x={-half}
        y={-half}
        width={size}
        height={size}
        fill="var(--surface)"
        stroke="var(--rule)"
        strokeWidth={1}
        className="sd-cube-radial"
        style={{
          transition: "width 200ms cubic-bezier(0.4,0,0.2,1), height 200ms cubic-bezier(0.4,0,0.2,1), x 200ms cubic-bezier(0.4,0,0.2,1), y 200ms cubic-bezier(0.4,0,0.2,1)",
        }}
      />
      {/* Fill (du bas vers le haut) */}
      <rect
        x={-half}
        y={half - fillH}
        width={size}
        height={fillH}
        fill={fill}
        opacity={fillOpacity}
        style={{ transition: "height 200ms cubic-bezier(0.4,0,0.2,1), y 200ms cubic-bezier(0.4,0,0.2,1), fill 200ms" }}
      />
      {/* Ripple : flash d'opacité */}
      {rippling && (
        <rect
          x={-half - 2}
          y={-half - 2}
          width={size + 4}
          height={size + 4}
          fill="none"
          stroke="var(--ink)"
          strokeWidth={1}
          className="sd-cube-ripple"
        />
      )}
      {/* Label (uniquement si showLabel) — horizontal, anchor selon le côté */}
      {showLabel && (
        <text
          x={labelX}
          y={labelY}
          textAnchor={labelAnchor}
          dominantBaseline="middle"
          className="sd-cube-radial-label"
        >
          {abbreviated}
        </text>
      )}
      {/* Title pour accessibilité (SVG natif) */}
      <title>{`${leverName} — ${displayValue} — ${stateTxt}`}</title>
    </g>
  );
});

// ──────────────────────────────────────────────────────────────────────────
//  Globe central — cercle + stabilité + readouts
// ──────────────────────────────────────────────────────────────────────────

function GlobeCenter() {
  const stability = useSimulation((s) => s.state.indicators.stability ?? 50);
  const stabilityState = useSimulation((s) => s.state.indicatorStates.stability);
  const gdp = useSimulation((s) => s.state.indicators.gdp);
  const unemployment = useSimulation((s) => s.state.indicators.unemployment);
  const debtToGdp = useSimulation((s) => s.state.indicators.debt_to_gdp);

  const tone = stabilityTone(stability);
  const isCrisis = stability < 30;

  return (
    <g>
      {/* Disque de fond — fill couleur de stabilité (opacité faible), bord encre */}
      <circle
        cx={0}
        cy={0}
        r={GLOBE_R}
        fill={tone}
        fillOpacity={0.08}
        stroke="var(--ink)"
        strokeWidth={1}
        className={isCrisis ? "sd-pulse-ink" : undefined}
      />
      {/* Anneau intérieur en pointillés (zone sûre) */}
      <circle
        cx={0}
        cy={0}
        r={GLOBE_R - 8}
        fill="none"
        stroke="var(--rule-strong)"
        strokeWidth={1}
        strokeDasharray="2 3"
        opacity={0.7}
      />

      {/* Stabilité — grand chiffre */}
      <text
        x={0}
        y={-22}
        textAnchor="middle"
        className="sd-globe-value"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 28,
          fontWeight: 600,
          fill: tone,
          transition: "fill 200ms",
        }}
      >
        {stability.toFixed(0)}
      </text>
      <text
        x={0}
        y={-8}
        textAnchor="middle"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          fill: "var(--ink-mute)",
          letterSpacing: "0.1em",
        }}
      >
        STABILITÉ
      </text>

      {/* Readouts compacts — labels courts pour rester dans le globe (r=80) */}
      <GlobeReadout y={14} label="PIB" value={`${gdp != null ? gdp.toFixed(0) : "—"}`} unit="Mrd" />
      <GlobeReadout y={32} label="CHÔM" value={`${unemployment != null ? unemployment.toFixed(1) : "—"}`} unit="%" />
      <GlobeReadout y={50} label="D/PIB" value={`${debtToGdp != null ? debtToGdp.toFixed(0) : "—"}`} unit="%" />

      {/* Pastille d'état en haut */}
      <text
        x={0}
        y={-GLOBE_R + 14}
        textAnchor="middle"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          fill: tone,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
        }}
      >
        {stabilityState === "critical" ? "CRISE" : stabilityState === "warning" ? "TENSION" : "STABLE"}
      </text>
    </g>
  );
}

function GlobeReadout({ y, label, value, unit }: { y: number; label: string; value: string; unit: string }) {
  return (
    <g transform={`translate(0 ${y})`}>
      <text
        x={-38}
        y={0}
        textAnchor="end"
        dominantBaseline="middle"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          fill: "var(--ink-mute)",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </text>
      <text
        x={-32}
        y={0}
        textAnchor="start"
        dominantBaseline="middle"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fill: "var(--ink)",
          fontWeight: 500,
        }}
      >
        {value}
      </text>
      <text
        x={36}
        y={0}
        textAnchor="end"
        dominantBaseline="middle"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          fill: "var(--ink-faint)",
        }}
      >
        {unit}
      </text>
    </g>
  );
}

// ──────────────────────────────────────────────────────────────────────────
//  Secteur de catégorie — label + halo au survol
// ──────────────────────────────────────────────────────────────────────────

function CategoryLabel({
  sector,
  healthTone,
  onHover,
}: {
  sector: CategorySector;
  healthTone: string;
  onHover: (code: string | null) => void;
}) {
  // Labels HORIZENTAUX : zéro rotation, text-anchor middle.
  // Le point de santé est placé 14px vers le centre depuis le label.
  const dotOffset = 14;
  return (
    <g
      transform={`translate(${sector.labelX} ${sector.labelY})`}
      style={{ cursor: "default" }}
      onMouseEnter={() => onHover(sector.category.code)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Petit point de santé (4px de diamètre, vers le centre) */}
      <circle
        cx={-sector.ux * dotOffset}
        cy={-sector.uy * dotOffset}
        r={2}
        fill={healthTone}
      />
      <text
        x={0}
        y={0}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fill: "var(--ink-mute)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          fontWeight: 500,
        }}
      >
        {sector.category.name}
      </text>
    </g>
  );
}

// ──────────────────────────────────────────────────────────────────────────
//  Secteur halo (fond gris très clair au survol d'une catégorie)
// ──────────────────────────────────────────────────────────────────────────

function SectorArc({ sector, highlighted }: { sector: CategorySector; highlighted: boolean }) {
  if (!highlighted) return null;
  const r1 = GLOBE_R;
  const r2 = DIVIDER_OUTER_R;
  const a1 = degToRad(sector.startDeg);
  const a2 = degToRad(sector.endDeg);
  const x1 = r1 * Math.cos(a1);
  const y1 = r1 * Math.sin(a1);
  const x2 = r2 * Math.cos(a1);
  const y2 = r2 * Math.sin(a1);
  const x3 = r2 * Math.cos(a2);
  const y3 = r2 * Math.sin(a2);
  const x4 = r1 * Math.cos(a2);
  const y4 = r1 * Math.sin(a2);
  const d = `M ${x1} ${y1} L ${x2} ${y2} A ${r2} ${r2} 0 0 1 ${x3} ${y3} L ${x4} ${y4} A ${r1} ${r1} 0 0 0 ${x1} ${y1} Z`;
  return <path d={d} fill="rgba(0,0,0,0.03)" pointerEvents="none" />;
}

// ──────────────────────────────────────────────────────────────────────────
//  Tooltip HTML (suit le cube survolé)
// ──────────────────────────────────────────────────────────────────────────

function HoverTooltip({
  leverId,
  layout,
  zoom,
  svgRef,
}: {
  leverId: string | null;
  layout: GlobeLayout;
  zoom: number;
  svgRef: React.RefObject<SVGSVGElement | null>;
}) {
  const levers = useSimulation((s) => s.levers);
  const values = useSimulation((s) => s.state.levers);
  const states = useSimulation((s) => s.state.leverStates);

  const [box, setBox] = React.useState<{ left: number; top: number } | null>(null);

  React.useEffect(() => {
    if (!leverId) {
      setBox(null);
      return;
    }
    const pos = layout.positionById.get(leverId);
    const svg = svgRef.current;
    if (!pos || !svg) {
      setBox(null);
      return;
    }
    // getBoundingClientRect() retourne le rectangle post-transform (incluant le scale).
    // Donc `rect.width / VIEWBOX` est déjà le facteur d'échelle visuel (zoom inclus).
    // On n'a pas besoin de multiplier à nouveau par `zoom`.
    const rect = svg.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const scale = rect.width / VIEWBOX;
    const left = cx + pos.x * scale;
    const top = cy + pos.y * scale;
    setBox({ left, top });
  }, [leverId, layout, zoom, svgRef]);

  if (!leverId || !box) return null;
  const lever = levers.find((l) => l.id === leverId);
  if (!lever) return null;
  const value = values[leverId] ?? lever.baseline;
  const state: LeverState = states[leverId] ?? "normal";
  const formatted = formatLeverValue(value, lever.displayFormat, lever.unit);
  const displayValue =
    lever.displayFormat === "percent" ? formatted : `${formatted} ${lever.unit}`;
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
    <div
      className="sd-cube-tooltip sd-fade-in"
      style={{
        position: "fixed",
        left: box.left,
        top: box.top - 14,
        transform: "translate(-50%, -100%)",
        pointerEvents: "none",
        zIndex: 50,
      }}
      role="tooltip"
    >
      <div style={{ fontWeight: 600 }}>{lever.name}</div>
      <div>{displayValue}</div>
      <div style={{ color: tone, opacity: 0.95 }}>{stateTxt}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
//  Composant principal GlobeView
// ──────────────────────────────────────────────────────────────────────────

export function GlobeView() {
  const layout = useGlobeLayout();
  const edges = useSimulation((s) => s.edges);
  const leverValues = useSimulation((s) => s.state.levers);
  const leverStates = useSimulation((s) => s.state.leverStates);
  const selectedLeverId = useSimulation((s) => s.selectedLeverId);
  const setSelectedLeverId = useSimulation((s) => s.setSelectedLeverId);
  const rippling = useActiveRipples();

  const [hoveredLever, setHoveredLever] = React.useState<string | null>(null);
  const [hoveredCategory, setHoveredCategory] = React.useState<string | null>(null);
  const [zoom, setZoom] = React.useState(1);

  const svgRef = React.useRef<SVGSVGElement | null>(null);

  // Index des arêtes par source, pour afficher les arêtes sortantes au survol.
  const outgoingBySource = React.useMemo(() => {
    const m = new Map<string, CausalEdge[]>();
    for (const e of edges) {
      if (!m.has(e.source)) m.set(e.source, []);
      m.get(e.source)!.push(e);
    }
    return m;
  }, [edges]);

  // Index des arêtes par target, pour afficher les arêtes entrantes au survol.
  const incomingByTarget = React.useMemo(() => {
    const m = new Map<string, CausalEdge[]>();
    for (const e of edges) {
      if (!m.has(e.target)) m.set(e.target, []);
      m.get(e.target)!.push(e);
    }
    return m;
  }, [edges]);

  // Santé agrégée par catégorie (pour le point de couleur à côté du label).
  const categoryHealthTone = React.useMemo(() => {
    const tones = new Map<string, string>();
    for (const sector of layout.sectors) {
      let crisis = 0;
      let tension = 0;
      for (const pos of layout.positions) {
        if (pos.lever.category !== sector.category.code) continue;
        const st = leverStates[pos.lever.id] ?? "normal";
        if (st === "crisis") crisis++;
        else if (st === "hot" || st === "cold") tension++;
      }
      let tone = "var(--ink)";
      if (crisis > 0) tone = "var(--state-crisis)";
      else if (tension > 0) tone = "var(--state-tension)";
      tones.set(sector.category.code, tone);
    }
    return tones;
  }, [layout, leverStates]);

  // Le cube survolé est-il aussi sélectionné ? On dessine un spoke 1px ink
  // du cube survolé vers le globe.
  const handleSelect = React.useCallback(
    (id: string) => setSelectedLeverId(id),
    [setSelectedLeverId],
  );

  const handleBackgroundClick = React.useCallback(() => {
    setSelectedLeverId(null);
    setHoveredLever(null);
  }, [setSelectedLeverId]);

  const handleWheel = React.useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => {
      const next = z - e.deltaY * 0.0015;
      return Math.max(0.6, Math.min(2.5, next));
    });
  }, []);

  // Apparition des labels : si zoom > 1.3, tous les cubes affichent leur label.
  const showAllLabels = zoom > 1.3;

  // Arêtes à dessiner au survol : sortantes + entrantes du cube survolé.
  const hoverEdges = React.useMemo(() => {
    if (!hoveredLever) return [] as Array<{ from: string; to: string; coefficient: number }>;
    const out = outgoingBySource.get(hoveredLever) ?? [];
    const inc = incomingByTarget.get(hoveredLever) ?? [];
    const arr: Array<{ from: string; to: string; coefficient: number }> = [];
    for (const e of out) arr.push({ from: e.source, to: e.target, coefficient: e.coefficient });
    for (const e of inc) arr.push({ from: e.source, to: e.target, coefficient: e.coefficient });
    return arr;
  }, [hoveredLever, outgoingBySource, incomingByTarget]);

  // Ripples actifs : paires from→to, on dessine une ligne entre leurs positions.
  const rippleLines = React.useMemo(() => {
    const lines: Array<{ id: string; x1: number; y1: number; x2: number; y2: number }> = [];
    for (const p of rippling.pairs) {
      const from = layout.positionById.get(p.fromId);
      const to = layout.positionById.get(p.toId);
      if (from && to) {
        lines.push({
          id: `${p.fromId}>${p.toId}`,
          x1: from.x,
          y1: from.y,
          x2: to.x,
          y2: to.y,
        });
      }
    }
    return lines;
  }, [rippling.pairs, layout.positionById]);

  if (layout.positions.length === 0) {
    return (
      <div
        className="h-full flex items-center justify-center font-mono text-[var(--ink-faint)]"
        style={{ fontSize: 11 }}
      >
        En attente du modèle…
      </div>
    );
  }

  return (
    <div
      className="relative h-full w-full flex items-center justify-center bg-[var(--paper)] overflow-hidden"
      onClick={handleBackgroundClick}
      aria-label="Globe — vue radiale des leviers autour du Maroc"
    >
      {/* Badge d'aide en haut à gauche */}
      <div
        className="absolute top-2 left-3 font-mono pointer-events-none"
        style={{ fontSize: 9, color: "var(--ink-faint)", letterSpacing: "0.05em" }}
      >
        GLOBE · {layout.positions.length} leviers · {edges.length} arêtes causales
      </div>
      {/* Indicateur de zoom en haut à droite */}
      <div
        className="absolute top-2 right-3 font-mono pointer-events-none"
        style={{ fontSize: 9, color: "var(--ink-faint)" }}
      >
        ZOOM {(zoom * 100).toFixed(0)}%
      </div>
      {/* Légende en bas */}
      <div
        className="absolute bottom-2 left-3 font-mono flex items-center gap-3 pointer-events-none"
        style={{ fontSize: 9, color: "var(--ink-faint)" }}
      >
        <span className="flex items-center gap-1">
          <span style={{ display: "inline-block", width: 6, height: 6, background: "var(--ink)" }} />
          SAIN
        </span>
        <span className="flex items-center gap-1">
          <span style={{ display: "inline-block", width: 6, height: 6, background: "var(--state-tension)" }} />
          CHAUD
        </span>
        <span className="flex items-center gap-1">
          <span style={{ display: "inline-block", width: 6, height: 6, background: "var(--state-crisis)" }} />
          CRISE
        </span>
        <span className="hidden md:inline">· molette pour zoomer</span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`${-VIEWBOX / 2} ${-VIEWBOX / 2} ${VIEWBOX} ${VIEWBOX}`}
        className="sd-globe-svg"
        style={{
          width: "min(100%, calc(100vh - 96px))",
          height: "min(100%, calc(100vh - 96px))",
          maxWidth: "100%",
          maxHeight: "100%",
          transform: `scale(${zoom})`,
          transformOrigin: "center",
          transition: "transform 200ms cubic-bezier(0.4,0,0.2,1)",
        }}
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
        role="group"
        aria-label="Anneau radial des leviers macroéconomiques"
      >
        {/* Halos de secteurs survolés */}
        {layout.sectors.map((s) => (
          <SectorArc
            key={`arc-${s.category.code}`}
            sector={s}
            highlighted={hoveredCategory === s.category.code}
          />
        ))}

        {/* Lignes de division radiale (8) */}
        {layout.sectors.map((s) => {
          const rad = degToRad(s.startDeg);
          const x1 = GLOBE_R * Math.cos(rad);
          const y1 = GLOBE_R * Math.sin(rad);
          const x2 = DIVIDER_OUTER_R * Math.cos(rad);
          const y2 = DIVIDER_OUTER_R * Math.sin(rad);
          return (
            <line
              key={`div-${s.category.code}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--rule)"
              strokeWidth={1}
              pointerEvents="none"
            />
          );
        })}

        {/* Cercle extérieur (anneau de cubes) */}
        <circle
          cx={0}
          cy={0}
          r={RING_R}
          fill="none"
          stroke="var(--rule-soft)"
          strokeWidth={1}
          strokeDasharray="1 4"
          pointerEvents="none"
        />

        {/* Spokes : de chaque levier vers le bord du globe.
            Au survol / sélection d'un cube, son spoke passe en encre 1px et
            les autres spokes s'estompent (effet "focus"). */}
        {layout.positions.map((pos) => {
          const norm = Math.hypot(pos.x, pos.y) || 1;
          const ux = pos.x / norm;
          const uy = pos.y / norm;
          const x1 = GLOBE_R * ux;
          const y1 = GLOBE_R * uy;
          const isHovered = hoveredLever === pos.lever.id;
          const isSelected = selectedLeverId === pos.lever.id;
          const isAccent = isHovered || isSelected;
          // Quand un cube est accentué, les autres spokes s'estompent.
          const dimOthers = !!hoveredLever || !!selectedLeverId;
          const opacity = isAccent ? 0.95 : dimOthers ? 0.25 : 1;
          return (
            <line
              key={`spoke-${pos.lever.id}`}
              x1={x1}
              y1={y1}
              x2={pos.x}
              y2={pos.y}
              stroke={isAccent ? "var(--ink)" : "var(--rule-soft)"}
              strokeWidth={isAccent ? 1 : 0.5}
              opacity={opacity}
              pointerEvents="none"
              style={{ transition: "stroke 200ms, stroke-width 200ms, opacity 200ms" }}
            />
          );
        })}

        {/* Arêtes causales survolées (entre deux leviers) */}
        {hoverEdges.map((e) => {
          const from = layout.positionById.get(e.from);
          const to = layout.positionById.get(e.to);
          if (!from || !to) return null;
          const positive = e.coefficient >= 0;
          return (
            <line
              key={`he-${e.from}>${e.to}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={positive ? "var(--ink)" : "var(--state-tension)"}
              strokeWidth={1}
              strokeDasharray={positive ? "none" : "3 2"}
              opacity={0.7}
              pointerEvents="none"
              className="sd-fade-in"
            />
          );
        })}

        {/* Ripple actifs : lignes directes entre deux positions */}
        {rippleLines.map((l) => (
          <line
            key={`rip-${l.id}`}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke="var(--ink)"
            strokeWidth={1}
            opacity={0.8}
            className="sd-ripple-line"
            pointerEvents="none"
          />
        ))}

        {/* Globe central */}
        <GlobeCenter />

        {/* Cubes radiaux */}
        {layout.positions.map((pos) => {
          const v = leverValues[pos.lever.id] ?? pos.lever.baseline;
          const st = leverStates[pos.lever.id] ?? "normal";
          const isHovered = hoveredLever === pos.lever.id;
          const showLabel = showAllLabels || isHovered;
          return (
            <LeverCubeRadial
              key={pos.lever.id}
              leverId={pos.lever.id}
              leverName={pos.lever.name}
              unit={pos.lever.unit}
              displayFormat={pos.lever.displayFormat}
              min={pos.lever.min}
              max={pos.lever.max}
              value={v}
              state={st}
              x={pos.x}
              y={pos.y}
              selected={selectedLeverId === pos.lever.id}
              hovered={isHovered}
              rippling={rippling.active.has(pos.lever.id)}
              showLabel={showLabel}
              abbreviated={abbreviate(pos.lever.name)}
              onSelect={handleSelect}
              onHover={setHoveredLever}
            />
          );
        })}

        {/* Labels de catégorie */}
        {layout.sectors.map((s) => (
          <CategoryLabel
            key={`cat-${s.category.code}`}
            sector={s}
            healthTone={categoryHealthTone.get(s.category.code) ?? "var(--ink)"}
            onHover={setHoveredCategory}
          />
        ))}
      </svg>

      {/* Tooltip HTML overlay (suit le cube survolé) */}
      <HoverTooltip leverId={hoveredLever} layout={layout} zoom={zoom} svgRef={svgRef} />
    </div>
  );
}
