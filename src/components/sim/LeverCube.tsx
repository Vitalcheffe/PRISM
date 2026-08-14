"use client";

// LeverCube.tsx — Un cube (carré 2D vu de dessus) du panneau nucléaire.
//
// - Fill height = ((value - min) / (max - min)) * 100%
// - Fill color: ink (normal), ochre (hot), muted grey opacity 0.5 (cold), bordeaux (crisis)
// - Hover: scale 1.12 + tooltip
// - Click: select + zoom into category
// - Ripple: brief opacity pulse 200ms
//
// Memoïsé avec React.memo. Props primitives seulement (sauf leverDef stable).

import * as React from "react";
import type { LeverDef, LeverState } from "@/lib/sim-types";
import { formatLeverValue } from "@/lib/sim-types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface LeverCubeProps {
  lever: LeverDef;
  value: number;
  state: LeverState;
  selected: boolean;
  rippling: boolean;
  size?: number; // 32 (overview) ou 64 (zoom)
  onClick?: (id: string) => void;
  showLabel?: boolean; // en zoom mode
}

const STATE_LABEL: Record<LeverState, string> = {
  normal: "SAIN",
  hot: "CHAUD",
  cold: "FROID",
  crisis: "CRISE",
};

function fillHeightPct(value: number, min: number, max: number): number {
  if (max === min) return 50;
  const pct = ((value - min) / (max - min)) * 100;
  return Math.max(0, Math.min(100, pct));
}

export const LeverCube = React.memo(function LeverCube({
  lever,
  value,
  state,
  selected,
  rippling,
  size = 32,
  onClick,
  showLabel = false,
}: LeverCubeProps) {
  const pct = fillHeightPct(value, lever.min, lever.max);
  const handleClick = React.useCallback(() => {
    onClick?.(lever.id);
  }, [onClick, lever.id]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick?.(lever.id);
      }
    },
    [onClick, lever.id],
  );

  const fillClass =
    state === "hot"
      ? "hot"
      : state === "crisis"
        ? "crisis"
        : state === "cold"
          ? "cold"
          : "";

  const formattedValue = formatLeverValue(value, lever.displayFormat, lever.unit);
  // Pour le format percent, formatLeverValue renvoie déjà "20.0 %" (avec le %),
  // donc on ne répète pas l'unité. Pour les autres formats, on l'ajoute.
  const displayValue =
    lever.displayFormat === "percent"
      ? formattedValue
      : `${formattedValue} ${lever.unit}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={`sd-cube ${selected ? "is-selected" : ""} ${rippling ? "is-rippling" : ""}`}
          style={{ width: size, height: size }}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          aria-label={`${lever.name} : ${displayValue}. État ${STATE_LABEL[state]}. ${
            selected ? "Sélectionné." : "Cliquer pour sélectionner."
          }`}
          aria-pressed={selected}
          tabIndex={0}
        >
          <div
            className={`sd-cube-fill ${fillClass}`}
            style={{ height: `${pct}%` }}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="sd-cube-tooltip">
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold">{lever.name}</span>
          <span>{displayValue}</span>
          <span style={{ opacity: 0.7 }}>{STATE_LABEL[state]}</span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
});
