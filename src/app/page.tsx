"use client";

// page.tsx — SYSTÈME DYNAMIQUE V3. Layout GLOBE-CENTRIC plein écran.
//
// Concept : le Maroc est un GLOBE au centre de l'écran. Les ~47 leviers
// orbitent en anneau radial autour de lui, regroupés en 8 secteurs par
// catégorie. Les arêtes causales se dessinent comme des rayons et des lignes
// directes entre cubes quand un ripple se propage.
//
// Layout (desktop lg+) :
//   - Root: min-h-screen flex flex-col bg-background text-foreground
//   - HEADER sticky 48px
//   - MAIN: flex flex-row, h-[calc(100vh-76px)] (header 48 + footer 28),
//     overflow-hidden. Chaque panneau scroll en interne.
//     · LEFT  (240px)  : IndicatorsReadout (15 indicateurs + alertes)
//     · CENTER (flex-1): GlobeView — le globe + anneau radial
//     · RIGHT (320px)  : LeverDetail (sélection + ajustement + décret)
//   - FOOTER sticky 28px (event ticker)
//   - GameOverlay / GenesisModal conditionnels
//
// Mobile : stack vertical, globe réduit à 400px de haut.

import * as React from "react";
import { useSimulation } from "@/hooks/use-simulation";
import { SimHeader } from "@/components/sim/SimHeader";
import { SimFooter } from "@/components/sim/SimFooter";
import { IndicatorsReadout } from "@/components/sim/IndicatorsReadout";
import { PoliticalPanel } from "@/components/sim/PoliticalPanel";
import { GlobeView } from "@/components/sim/GlobeView";
import { ForceGraph } from "@/components/sim/ForceGraph";
import { NetworkView } from "@/components/sim/NetworkView";
import { NeuralView } from "@/components/sim/NeuralView";
import { TimelineView } from "@/components/sim/TimelineView";
import { MetricsView } from "@/components/sim/MetricsView";
import { MethodologyView } from "@/components/sim/MethodologyView";
import { KernelView } from "@/components/sim/KernelView";
import { LifeView } from "@/components/sim/LifeView";
import { GovernanceView } from "@/components/sim/GovernanceView";
import { LeverDetail } from "@/components/sim/LeverDetail";
import { GameOverlay } from "@/components/sim/GameOverlay";
import { GenesisModal } from "@/components/sim/GenesisModal";

export default function Home() {
  const init = useSimulation((s) => s.init);
  const view = useSimulation((s) => s.view);

  React.useEffect(() => {
    init();
  }, [init]);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--paper)] text-[var(--ink)]">
      <SimHeader />

      <main
        className="flex-1 flex flex-col lg:flex-row lg:overflow-hidden min-h-0"
        style={{ height: "calc(100vh - 76px)" }}
      >
        {/* LEFT — indicateurs + politique + alertes (260px) */}
        <aside
          className="lg:w-[260px] lg:shrink-0 border-b lg:border-b-0 lg:border-r border-[var(--rule)] bg-[var(--paper)] lg:overflow-y-auto lg:min-h-0 flex flex-col sd-scroll"
          aria-label="Indicateurs, politique et alertes"
        >
          <IndicatorsReadout />
          <PoliticalPanel />
        </aside>

        {/* CENTER — vue switchable (flex-1) */}
        <section
          className="flex-1 min-h-0 lg:overflow-hidden bg-[var(--paper)] flex flex-col"
          aria-label="Vue centrale"
          style={{ minHeight: 400 }}
        >
          <div key={view} className="sd-view-in flex-1 min-h-0 flex flex-col">
          {view === "panneau" && <ForceGraph />}
          {view === "network" && <NetworkView />}
          {view === "neural" && <NeuralView />}
          {view === "timeline" && <TimelineView />}
          {view === "metrics" && <MetricsView />}
          {view === "kernel" && <KernelView />}
          {view === "life" && <LifeView />}
          {view === "governance" && <GovernanceView />}
          {view === "methodology" && <MethodologyView />}
          </div>
        </section>

        {/* RIGHT — levier sélectionné + décret (320px) */}
        <aside
          className="lg:w-[320px] lg:shrink-0 border-t lg:border-t-0 lg:border-l border-[var(--rule)] bg-[var(--paper)] lg:overflow-hidden lg:min-h-0 flex flex-col"
          aria-label="Détail du levier sélectionné"
        >
          <LeverDetail />
        </aside>
      </main>

      <SimFooter />
      <GameOverlay />
      <GenesisModal />
    </div>
  );
}
