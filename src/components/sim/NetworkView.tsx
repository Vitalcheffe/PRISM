"use client";

// NetworkView.tsx — Vue RÉSEAU : graphe causal complet.
//
// Contrairement à la vue PANNEAU (globe radial) où les arêtes n'apparaissent
// qu'au survol, cette vue montre TOUTES les 37 arêtes causales en permanence.
// Les 47 leviers sont positionnés par un layout circulaire (par catégorie).
// Les arêtes sont des courbes Bézier. Le joueur voit la topologie complète
// du système : quels leviers influencent quoi.
//
// Interactions :
//   - Survol d'un nœud → highlight de ses arêtes sortantes/entrantes
//   - Clic → sélection (remplit le panneau droit)
//   - Couleur des arêtes : encre (positif), ocre (négatif)
//   - Épaisseur : ∝ |coefficient| × confiance

import * as React from "react";
import { useSimulation } from "@/hooks/use-simulation";
import type { LeverDef, CausalEdge } from "@/hooks/use-simulation";

interface NodePosition {
  lever: LeverDef;
  x: number;
  y: number;
}

const RING_R = 200;
const VIEWBOX = 600;

function degToRad(d: number): number {
  return (d * Math.PI) / 180;
}

export function NetworkView() {
  const levers = useSimulation((s) => s.levers);
  const categories = useSimulation((s) => s.categories);
  const edges = useSimulation((s) => s.edges);
  const values = useSimulation((s) => s.state.levers);
  const leverStates = useSimulation((s) => s.state.leverStates);
  const selectedId = useSimulation((s) => s.selectedLeverId);
  const setSelectedId = useSimulation((s) => s.setSelectedLeverId);
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  // Positionner les leviers en cercle, groupés par catégorie
  const positions = React.useMemo(() => {
    const pos: NodePosition[] = [];
    const posById = new Map<string, NodePosition>();
    if (categories.length === 0) return { pos, posById };

    const sectorWidth = 360 / categories.length;
    categories.forEach((cat, ci) => {
      const startDeg = -90 + ci * sectorWidth;
      const midDeg = startDeg + sectorWidth / 2;
      const catLevers = levers.filter((l) => l.category === cat.code);
      const n = catLevers.length;
      catLevers.forEach((lever, i) => {
        const angleDeg =
          n === 1
            ? midDeg
            : startDeg + ((i + 0.5) / n) * sectorWidth;
        const rad = degToRad(angleDeg);
        const x = RING_R * Math.cos(rad);
        const y = RING_R * Math.sin(rad);
        const p = { lever, x, y };
        pos.push(p);
        posById.set(lever.id, p);
      });
    });
    return { pos, posById };
  }, [levers, categories]);

  const { posById } = positions;

  // Arêtes actives (highlight au survol/sélection)
  const activeId = hoveredId ?? selectedId;
  const activeEdgeIds = React.useMemo(() => {
    if (!activeId) return null;
    const ids = new Set<string>();
    for (const e of edges) {
      if (e.source === activeId || e.target === activeId) {
        ids.add(`${e.source}>${e.target}`);
      }
    }
    return ids;
  }, [activeId, edges]);

  // Couleur d'un nœud selon son état
  function nodeColor(leverId: string): string {
    const state = leverStates[leverId];
    if (state === "crisis") return "var(--state-crisis)";
    if (state === "hot") return "var(--state-tension)";
    if (state === "cold") return "var(--ink-faint)";
    return "var(--ink)";
  }

  return (
    <div className="h-full w-full flex flex-col">
      {/* En-tête */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--rule)]">
        <h3 className="font-mono uppercase tracking-wider text-[var(--ink-mute)]" style={{ fontSize: 10 }}>
          Réseau causal
        </h3>
        <span className="font-mono text-[var(--ink-faint)]" style={{ fontSize: 9 }}>
          {levers.length} nœuds · {edges.length} arêtes
        </span>
      </div>

      {/* SVG */}
      <div className="flex-1 relative overflow-hidden">
        <svg
          viewBox={`${-VIEWBOX / 2} ${-VIEWBOX / 2} ${VIEWBOX} ${VIEWBOX}`}
          className="w-full h-full"
          style={{ display: "block" }}
          aria-label="Réseau causal des leviers macroéconomiques"
        >
          {/* Arêtes (rendues en premier, derrière les nœuds) */}
          {edges.map((e: CausalEdge, i: number) => {
            const src = posById.get(e.source);
            const tgt = posById.get(e.target);
            if (!src || !tgt) return null;

            const isActive = activeEdgeIds?.has(`${e.source}>${e.target}`);
            const isDimmed = activeEdgeIds !== null && !isActive;

            // Courbe Bézier avec point de contrôle vers le centre
            const cx = (src.x + tgt.x) / 2 * 0.3;
            const cy = (src.y + tgt.y) / 2 * 0.3;

            const stroke = e.coefficient > 0 ? "var(--ink)" : "var(--state-tension)";
            const width = Math.max(0.3, Math.min(1.5, Math.abs(e.coefficient) * 1.2));
            const opacity = isDimmed ? 0.05 : isActive ? 0.9 : 0.15;

            return (
              <path
                key={i}
                d={`M ${src.x} ${src.y} Q ${cx} ${cy} ${tgt.x} ${tgt.y}`}
                fill="none"
                stroke={stroke}
                strokeWidth={width}
                strokeOpacity={opacity}
                pointerEvents="none"
              />
            );
          })}

          {/* Nœuds */}
          {positions.pos.map((p) => {
            const isHovered = hoveredId === p.lever.id;
            const isSelected = selectedId === p.lever.id;
            const isActive = activeId === p.lever.id;
            const isDimmed = activeId !== null && !isActive &&
              !edges.some(e => (e.source === activeId && e.target === p.lever.id) || (e.target === activeId && e.source === p.lever.id));
            const r = isHovered || isSelected ? 7 : 5;
            const fill = nodeColor(p.lever.id);
            const opacity = isDimmed ? 0.25 : 1;

            return (
              <g key={p.lever.id} transform={`translate(${p.x} ${p.y})`}>
                <circle
                  r={r}
                  fill={fill}
                  fillOpacity={opacity}
                  stroke={isSelected ? "var(--ink)" : "var(--surface)"}
                  strokeWidth={isSelected ? 1.5 : 1}
                  style={{ cursor: "pointer", transition: "r 150ms" }}
                  onMouseEnter={() => setHoveredId(p.lever.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => setSelectedId(isSelected ? null : p.lever.id)}
                />
                {/* Label au survol */}
                {isHovered && (
                  <text
                    y={p.y > 0 ? r + 10 : -r - 4}
                    textAnchor="middle"
                    className="font-mono"
                    style={{
                      fontSize: 9,
                      fill: "var(--ink)",
                      pointerEvents: "none",
                    }}
                  >
                    {p.lever.name.length > 20 ? p.lever.name.slice(0, 18) + "…" : p.lever.name}
                  </text>
                )}
              </g>
            );
          })}

          {/* Label de catégorie au centre du secteur */}
          {categories.map((cat, ci) => {
            const sectorWidth = 360 / categories.length;
            const midDeg = -90 + ci * sectorWidth + sectorWidth / 2;
            const rad = degToRad(midDeg);
            const lx = (RING_R + 30) * Math.cos(rad);
            const ly = (RING_R + 30) * Math.sin(rad);
            return (
              <text
                key={cat.code}
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                className="font-mono"
                style={{ fontSize: 9, fill: "var(--ink-mute)", pointerEvents: "none" }}
              >
                {cat.name.toUpperCase()}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Légende */}
      <div className="flex items-center gap-4 px-4 py-1.5 border-t border-[var(--rule)]">
        <span className="font-mono flex items-center gap-1.5" style={{ fontSize: 9, color: "var(--ink-mute)" }}>
          <span style={{ display: "inline-block", width: 12, height: 1, background: "var(--ink)" }} />
          effet positif
        </span>
        <span className="font-mono flex items-center gap-1.5" style={{ fontSize: 9, color: "var(--ink-mute)" }}>
          <span style={{ display: "inline-block", width: 12, height: 1, background: "var(--state-tension)" }} />
          effet négatif
        </span>
        <span className="font-mono ml-auto" style={{ fontSize: 9, color: "var(--ink-faint)" }}>
          {activeId ? `${edges.filter(e => e.source === activeId || e.target === activeId).length} arêtes actives` : "survolz un nœud"}
        </span>
      </div>
    </div>
  );
}
