"use client";

// AnimatedNumber.tsx — Affiche un nombre qui s'anime vers sa nouvelle valeur.
//
// Au lieu de sauter instantanément de 9.5% à 9.7%, le nombre compte
// 9.50 → 9.55 → 9.60 → 9.65 → 9.70 sur ~400ms avec easing.
// C'est le détail qui sépare "dashboard" de "instrument".

import * as React from "react";

interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  duration?: number; // ms
  format?: (n: number) => string;
}

export function AnimatedNumber({
  value,
  decimals = 1,
  duration = 400,
  format,
}: AnimatedNumberProps) {
  const [display, setDisplay] = React.useState(value);
  const fromRef = React.useRef(value);
  const rafRef = React.useRef<number>(0);

  React.useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    const t0 = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic

    const tick = (now: number) => {
      const elapsed = now - t0;
      const t = Math.min(1, elapsed / duration);
      const eased = ease(t);
      const current = from + (to - from) * eased;
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  if (format) return <>{format(display)}</>;
  return <>{display.toFixed(decimals)}</>;
}
