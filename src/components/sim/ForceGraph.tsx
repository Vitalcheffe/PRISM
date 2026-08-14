"use client";

// ForceGraph.tsx — Graphe force-directed (style Obsidian + Astroneer).
//
// Le pays (Maroc) est un nœud central, gros comme une planète. Les 47 leviers
// orbitent autour de lui, reliés par les arêtes causales. Les 15 indicateurs
// dérivés sont des nœuds secondaires. Le tout est un graphe VIVANT : d3-force
// simule la répulsion, l'attraction des liens, la collision — les nœuds driftent
// doucement, comme un système solaire organique.
//
// Inspirations :
//   - Obsidian Graph View (force-directed, minimal, interactive)
//   - Astroneer (planètes propres, espace respirant)
//   - react-force-graph (vasturiano) — le standard d3-force + canvas
//
// Ici on rend en SVG (pas canvas) pour la netteté et l'accessibilité, avec
// d3-force pour la physique.

import * as React from "react";
import * as d3 from "d3-force";
import { useSimulation } from "@/hooks/use-simulation";
import type { LeverDef, CategoryDef, CausalEdge } from "@/hooks/use-simulation";

// --- Types ---

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  kind: "country" | "lever" | "indicator";
  label: string;
  categoryCode?: string;
  weight?: number;
  value?: number;
  state?: string;
  radius: number;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
  coefficient: number;
  kind: "causal" | "spoke" | "indicator";
}

const COUNTRY_NODE_ID = "__country__";

// --- Composant principal ---

export function ForceGraph() {
  const levers = useSimulation((s) => s.levers);
  const categories = useSimulation((s) => s.categories);
  const edges = useSimulation((s) => s.edges);
  const indicators = useSimulation((s) => s.indicators);
  const leverValues = useSimulation((s) => s.state.levers);
  const leverStates = useSimulation((s) => s.state.leverStates);
  const indicatorValues = useSimulation((s) => s.state.indicators);
  const indicatorStates = useSimulation((s) => s.state.indicatorStates);
  const stability = useSimulation((s) => s.state.stability);
  const ripples = useSimulation((s) => s.state.ripples);
  const selectedLeverId = useSimulation((s) => s.selectedLeverId);
  const setSelectedLeverId = useSimulation((s) => s.setSelectedLeverId);

  const [hoveredId, setHoveredId] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);
  const simulationRef = React.useRef<d3.Simulation<SimNode, SimLink> | null>(null);
  const [nodesState, setNodesState] = React.useState<SimNode[]>([]);
  const [linksState, setLinksState] = React.useState<SimLink[]>([]);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [dims, setDims] = React.useState({ w: 600, h: 600 });

  // Mesurer le conteneur
  React.useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      const r = containerRef.current!.getBoundingClientRect();
      setDims({ w: Math.max(300, r.width), h: Math.max(300, r.height) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Construire les nœuds et liens (une seule fois, ou quand le schéma change)
  React.useEffect(() => {
    if (levers.length === 0) return;

    const nodes: SimNode[] = [];
    const links: SimLink[] = [];

    // Nœud pays (central, gros comme une planète)
    nodes.push({
      id: COUNTRY_NODE_ID,
      kind: "country",
      label: "MAROC",
      radius: 28,
      value: stability,
    });

    // Nœuds leviers
    for (const lever of levers) {
      const range = lever.max - lever.min;
      const normalized = range > 0 ? (leverValues[lever.id] ?? lever.baseline - lever.min) / range : 0.5;
      nodes.push({
        id: lever.id,
        kind: "lever",
        label: lever.name,
        categoryCode: lever.category,
        weight: lever.weight,
        value: leverValues[lever.id] ?? lever.baseline,
        state: leverStates[lever.id] ?? "normal",
        radius: 5 + (lever.weight ?? 0.5) * 5,
      });
      // Spoke : chaque levier est relié au pays
      links.push({
        source: lever.id,
        target: COUNTRY_NODE_ID,
        coefficient: 0.3,
        kind: "spoke",
      });
    }

    // Nœuds indicateurs
    for (const ind of indicators) {
      nodes.push({
        id: `ind_${ind.id}`,
        kind: "indicator",
        label: ind.name,
        value: indicatorValues[ind.id] ?? 0,
        state: indicatorStates[ind.id] ?? "normal",
        radius: 4,
      });
      links.push({
        source: `ind_${ind.id}`,
        target: COUNTRY_NODE_ID,
        coefficient: 0.2,
        kind: "indicator",
      });
    }

    // Arêtes causales entre leviers
    for (const e of edges) {
      links.push({
        source: e.source,
        target: e.target,
        coefficient: e.coefficient,
        kind: "causal",
      });
    }

    setNodesState(nodes);
    setLinksState(links);

    // Créer la simulation d3-force
    const sim = d3.forceSimulation<SimNode, SimLink>(nodes)
      .force("link", d3.forceLink<SimNode, SimLink>(links)
        .id((d) => d.id)
        .distance((l) => {
          if (l.kind === "spoke") return 120;
          if (l.kind === "indicator") return 60;
          return 80;
        })
        .strength((l) => {
          if (l.kind === "spoke") return 0.15;
          if (l.kind === "indicator") return 0.2;
          return 0.3 * Math.abs(l.coefficient);
        })
      )
      .force("charge", d3.forceManyBody<SimNode>()
        .strength((d) => {
          if (d.kind === "country") return -400;
          if (d.kind === "indicator") return -30;
          return -80;
        })
      )
      .force("center", d3.forceCenter(0, 0))
      .force("collide", d3.forceCollide<SimNode>().radius((d) => d.radius + 4))
      .force("x", d3.forceX(0).strength(0.02))
      .force("y", d3.forceY(0).strength(0.02))
      .alphaDecay(0.02)
      .velocityDecay(0.3);

    sim.on("tick", () => {
      setTick((t) => (t + 1) % 1000000);
    });

    simulationRef.current = sim;

    return () => {
      sim.stop();
    };
  }, [levers, indicators, edges]);

  // Fixer le nœud pays au centre
  React.useEffect(() => {
    const sim = simulationRef.current;
    if (!sim || nodesState.length === 0) return;
    const country = nodesState.find((n) => n.id === COUNTRY_NODE_ID);
    if (country) {
      country.fx = 0;
      country.fy = 0;
    }
    sim.alpha(0.3).restart();
  }, [nodesState]);

  // Redémarrer la simulation quand les ripples changent (pour animer les arêtes actives)
  const activeRippleIds = React.useMemo(() => {
    if (ripples.length === 0) return new Set<string>();
    const now = Math.max(...ripples.map((r) => r.tick));
    const recent = ripples.filter((r) => now - r.tick <= 3);
    return new Set(recent.map((r) => `${r.fromId}>${r.toId}`));
  }, [ripples]);

  // Lire l'état live d'un nœud (sans muter le nœud)
  function getLiveState(node: SimNode): string {
    if (node.kind === "country") {
      if (stability < 30) return "crisis";
      if (stability < 50) return "hot";
      return "normal";
    }
    if (node.kind === "lever") return leverStates[node.id] ?? "normal";
    if (node.kind === "indicator") return indicatorStates[node.id.replace("ind_", "")] ?? "normal";
    return "normal";
  }

  function getLiveValue(node: SimNode): number | undefined {
    if (node.kind === "country") return stability;
    if (node.kind === "lever") return leverValues[node.id];
    if (node.kind === "indicator") return indicatorValues[node.id.replace("ind_", "")];
    return undefined;
  }

  // Couleur d'un nœud
  function nodeColor(node: SimNode): string {
    const state = getLiveState(node);
    if (state === "crisis") return "var(--state-crisis)";
    if (state === "hot") return "var(--state-tension)";
    if (state === "cold") return "var(--ink-faint)";
    return "var(--ink)";
  }

  // Nœud actif (hover ou sélection)
  const activeId = hoveredId ?? selectedLeverId;
  const activeConnectedIds = React.useMemo(() => {
    if (!activeId) return null;
    const ids = new Set<string>([activeId]);
    for (const l of linksState) {
      const s = typeof l.source === "string" ? l.source : l.source.id;
      const t = typeof l.target === "string" ? l.target : l.target.id;
      if (s === activeId) ids.add(t);
      if (t === activeId) ids.add(s);
    }
    return ids;
  }, [activeId, linksState]);

  const nodes = nodesState;
  const links = linksState;
  const cx = dims.w / 2;
  const cy = dims.h / 2;
  const scale = Math.min(dims.w, dims.h) / 700;

  return (
    <div ref={containerRef} className="h-full w-full relative overflow-hidden">
      <svg
        width={dims.w}
        height={dims.h}
        className="absolute inset-0"
        aria-label="Graphe force-directed du système macroéconomique"
      >
        <g transform={`translate(${cx} ${cy}) scale(${scale})`}>
          {/* Arêtes */}
          {links.map((l, i) => {
            const s = typeof l.source === "string" ? nodes.find((n) => n.id === l.source) : l.source as SimNode;
            const t = typeof l.target === "string" ? nodes.find((n) => n.id === l.target) : l.target as SimNode;
            if (!s || !t || s.x == null || s.y == null || t.x == null || t.y == null) return null;

            const sid = s.id;
            const tid = t.id;
            const isActive = activeId && (sid === activeId || tid === activeId);
            const isDimmed = activeId && !isActive && !activeConnectedIds?.has(sid) && !activeConnectedIds?.has(tid);
            const isRipple = activeRippleIds.has(`${sid}>${tid}`);

            let stroke = "var(--rule-strong)";
            let width = 0.5;
            let opacity = 0.2;

            if (l.kind === "causal") {
              stroke = l.coefficient > 0 ? "var(--ink)" : "var(--state-tension)";
              width = Math.max(0.4, Math.min(1.5, Math.abs(l.coefficient) * 1.5));
              opacity = 0.12;
            } else if (l.kind === "spoke") {
              stroke = "var(--rule-strong)";
              width = 0.4;
              opacity = 0.1;
            } else {
              stroke = "var(--rule-strong)";
              width = 0.3;
              opacity = 0.08;
            }

            if (isActive) {
              opacity = 0.8;
              width = Math.max(width, 1);
            }
            if (isDimmed) opacity = 0.03;
            if (isRipple) {
              opacity = 1;
              width = 1.5;
              stroke = "var(--ink)";
            }

            return (
              <line
                key={i}
                x1={s.x}
                y1={s.y}
                x2={t.x}
                y2={t.y}
                stroke={stroke}
                strokeWidth={width}
                strokeOpacity={opacity}
                pointerEvents="none"
              />
            );
          })}

          {/* Nœuds */}
          {nodes.map((node) => {
            if (node.x == null || node.y == null) return null;
            const isActive = node.id === activeId;
            const isDimmed = activeId && !isActive && !activeConnectedIds?.has(node.id);
            const r = node.radius * (isActive ? 1.4 : 1);
            const fill = nodeColor(node);
            const opacity = isDimmed ? 0.2 : 1;
            const isCountry = node.kind === "country";

            return (
              <g
                key={node.id}
                transform={`translate(${node.x} ${node.y})`}
                style={{ cursor: node.kind === "lever" ? "pointer" : "default", opacity }}
                onClick={node.kind === "lever" ? () => setSelectedLeverId(selectedLeverId === node.id ? null : node.id) : undefined}
                onMouseEnter={node.kind === "lever" ? () => setHoveredId(node.id) : undefined}
                onMouseLeave={node.kind === "lever" ? () => setHoveredId(null) : undefined}
              >
                {/* Anneau pour le nœud pays (atmosphère de planète) */}
                {isCountry && (
                  <>
                    <circle r={r + 8} fill="none" stroke="var(--rule)" strokeWidth={0.5} strokeDasharray="2 3" />
                    <circle r={r + 4} fill="none" stroke="var(--rule-strong)" strokeWidth={0.5} />
                  </>
                )}
                {/* Halo pour nœud actif */}
                {isActive && (
                  <circle r={r + 3} fill="none" stroke="var(--ink)" strokeWidth={0.5} strokeOpacity={0.4} />
                )}
                <circle
                  r={r}
                  fill={fill}
                  fillOpacity={isCountry ? 0.1 : 0.85}
                  stroke={fill}
                  strokeWidth={isCountry ? 1.5 : 0.5}
                />
                {/* Label au survol */}
                {(isActive || isCountry) && (
                  <text
                    y={r + 12}
                    textAnchor="middle"
                    className="font-mono"
                    style={{
                      fontSize: isCountry ? 11 : 9,
                      fill: "var(--ink)",
                      fontWeight: isCountry ? 600 : 400,
                      pointerEvents: "none",
                    }}
                  >
                    {node.label}
                    {!isCountry && node.kind === "lever" && (() => {
                      const v = getLiveValue(node);
                      return v != null ? <tspan style={{ fill: "var(--ink-mute)" }}> {v.toFixed(1)}</tspan> : null;
                    })()}
                  </text>
                )}
                {/* Cercle de sélection */}
                {node.id === selectedLeverId && (
                  <circle r={r + 2} fill="none" stroke="var(--ink)" strokeWidth={1} />
                )}
                {/* Zone cliquable invisible pour les leviers */}
                {node.kind === "lever" && (
                  <circle
                    r={Math.max(r + 6, 14)}
                    fill="transparent"
                    pointerEvents="all"
                    onMouseEnter={() => setHoveredId(node.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => setSelectedLeverId(selectedLeverId === node.id ? null : node.id)}
                  />
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Légende */}
      <div className="absolute bottom-2 left-2 flex items-center gap-3 px-2 py-1" style={{ background: "rgba(250,250,247,0.8)" }}>
        <span className="font-mono flex items-center gap-1" style={{ fontSize: 8, color: "var(--ink-mute)" }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--ink)" }} />
          levier
        </span>
        <span className="font-mono flex items-center gap-1" style={{ fontSize: 8, color: "var(--ink-mute)" }}>
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "var(--ink)", opacity: 0.1, border: "1px solid var(--ink)" }} />
          pays
        </span>
        <span className="font-mono flex items-center gap-1" style={{ fontSize: 8, color: "var(--ink-mute)" }}>
          <span style={{ display: "inline-block", width: 8, height: 1, background: "var(--ink)" }} />
          causal +
        </span>
        <span className="font-mono flex items-center gap-1" style={{ fontSize: 8, color: "var(--ink-mute)" }}>
          <span style={{ display: "inline-block", width: 8, height: 1, background: "var(--state-tension)" }} />
          causal −
        </span>
      </div>

      {/* Compteur */}
      <div className="absolute top-2 right-2 font-mono" style={{ fontSize: 8, color: "var(--ink-faint)" }}>
        {nodes.length} nœuds · {links.length} liens
      </div>
    </div>
  );
}
