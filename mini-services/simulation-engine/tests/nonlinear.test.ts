// nonlinear.test.ts — Tests for the 7 non-linear transfer functions.
//
// A linear system: double the input, double the output. PRISM's economy is not
// linear — it has thresholds, bifurcations, hysteresis, cascades, and runaway.
// These tests verify each non-linearity behaves the way its docstring promises:
//   - exponentialRunaway: 0 below threshold, explosive above
//   - bifurcation: near-discontinuous regime change
//   - feedbackLoop: gain saturates (does not exceed amplification)
//   - cascadeEffect: pass-through below threshold, amplified above
//   - criticalThreshold: exponential regime above threshold
//   - sigmoid: monotonic, in (0, 1)
//   - diminishingReturns: concave (marginal returns shrink)
//   - Hysteresis class: post-crisis memory

import { test, expect, describe } from "bun:test";
import {
  sigmoid,
  tanh,
  thresholdEffect,
  diminishingReturns,
  exponentialRunaway,
  bifurcation,
  feedbackLoop,
  cascadeEffect,
  criticalThreshold,
  Hysteresis,
} from "../nonlinear.ts";

// ──────────────────────────────────────────────────────────────────────────
//  sigmoid — monotonic, bounded
// ──────────────────────────────────────────────────────────────────────────

describe("sigmoid", () => {
  test("returns a value in (0, 1) for moderate inputs (|x| < 10)", () => {
    for (const x of [-9, -1, 0, 1, 9]) {
      const s = sigmoid(x);
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThan(1);
    }
  });

  test("saturates to [0, 1] for all finite inputs (closed range)", () => {
    for (const x of [-100, -10, -1, 0, 1, 10, 100]) {
      const s = sigmoid(x);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  test("is monotonic increasing", () => {
    let prev = sigmoid(-10);
    for (let x = -9; x <= 10; x += 0.5) {
      const s = sigmoid(x);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  test("returns 0.5 at x=0 (the inflection point)", () => {
    expect(sigmoid(0)).toBeCloseTo(0.5, 6);
  });

  test("saturates at 1 for very large inputs (≥ 10)", () => {
    expect(sigmoid(50)).toBe(1);
    expect(sigmoid(1000)).toBe(1);
  });

  test("saturates at 0 for very negative inputs (≤ -10)", () => {
    expect(sigmoid(-50)).toBe(0);
    expect(sigmoid(-1000)).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  tanh — bounded [-1, 1]
// ──────────────────────────────────────────────────────────────────────────

describe("tanh", () => {
  test("returns a value in [-1, 1]", () => {
    for (const x of [-10, -1, 0, 1, 10, 100]) {
      const t = tanh(x);
      expect(t).toBeGreaterThanOrEqual(-1);
      expect(t).toBeLessThanOrEqual(1);
    }
  });

  test("returns 0 at x=0", () => {
    expect(tanh(0)).toBeCloseTo(0, 6);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  thresholdEffect — step-like
// ──────────────────────────────────────────────────────────────────────────

describe("thresholdEffect", () => {
  test("returns 0.5 exactly at the threshold (sigmoid(0))", () => {
    expect(thresholdEffect(100, 100, 1)).toBeCloseTo(0.5, 6);
  });

  test("returns ~0 far below threshold, ~1 far above", () => {
    expect(thresholdEffect(0, 100, 1)).toBeCloseTo(0, 2);
    expect(thresholdEffect(200, 100, 1)).toBeCloseTo(1, 2);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  exponentialRunaway — 0 below threshold, positive above
// ──────────────────────────────────────────────────────────────────────────

describe("exponentialRunaway", () => {
  test("is 0 at or below the threshold", () => {
    expect(exponentialRunaway(50, 50, 0.5)).toBe(0);
    expect(exponentialRunaway(40, 50, 0.5)).toBe(0);
    expect(exponentialRunaway(0, 50, 0.5)).toBe(0);
  });

  test("is strictly positive above the threshold", () => {
    const r = exponentialRunaway(51, 50, 0.5);
    expect(r).toBeGreaterThan(0);
  });

  test("grows monotonically above the threshold (until saturation)", () => {
    // Use small steepness so saturation (cap = 1) is not hit immediately.
    let prev = exponentialRunaway(51, 50, 0.05);
    for (let v = 52; v <= 70; v++) {
      const r = exponentialRunaway(v, 50, 0.05);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
    // Final value must be strictly greater than the first (we actually grew).
    expect(exponentialRunaway(70, 50, 0.05)).toBeGreaterThan(exponentialRunaway(51, 50, 0.05));
  });

  test("is clamped at 1 (saturates)", () => {
    // exp(diff * steepness) - 1 with steepness=0.5 and diff=20 → e^10 ≈ 22026, clamped to 1
    expect(exponentialRunaway(100, 50, 0.5)).toBe(1);
  });

  test("models an inflation runaway: below threshold → 0, above → grows, far above → maxed", () => {
    // Realistic PRISM scenario: inflation threshold = 10%, steepness = 0.05
    // (gentle enough that we can see growth before saturation at 1).
    expect(exponentialRunaway(9, 10, 0.05)).toBe(0); // below
    expect(exponentialRunaway(10, 10, 0.05)).toBe(0); // at threshold
    const low = exponentialRunaway(12, 10, 0.05);
    const mid = exponentialRunaway(20, 10, 0.05);
    const high = exponentialRunaway(80, 10, 0.05); // far above → saturated
    expect(low).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(1);
    expect(high).toBeGreaterThanOrEqual(mid);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  bifurcation — discontinuous regime change
// ──────────────────────────────────────────────────────────────────────────

describe("bifurcation", () => {
  test("returns 0.5 exactly at the tipping point", () => {
    expect(bifurcation(50, 50, 10)).toBeCloseTo(0.5, 6);
  });

  test("produces a sharp transition: small input change near tipping point → large output swing", () => {
    // With sharpness=10, moving ±0.5 from tippingPoint takes output from ~0.0067 to ~0.9933
    const low = bifurcation(49.5, 50, 10);
    const high = bifurcation(50.5, 50, 10);
    expect(low).toBeLessThan(0.05);
    expect(high).toBeGreaterThan(0.95);
    // The swing across the tipping point is near-total — a near-discontinuous jump.
    expect(high - low).toBeGreaterThan(0.9);
  });

  test("the swing exceeds what a linear extrapolation from the saturation zone would predict", () => {
    // Far from the tipping point (deep in saturation), the slope is ~0.
    // If the function were linear there, moving by 1 unit would change output by ~0.
    // But near the tipping point, moving by 1 unit changes output by ~0.99 — vastly more.
    const slopeInSaturation = bifurcation(100, 50, 10) - bifurcation(99, 50, 10);
    const slopeAtTipping = bifurcation(50.5, 50, 10) - bifurcation(49.5, 50, 10);
    expect(slopeAtTipping).toBeGreaterThan(slopeInSaturation * 10);
  });

  test("is monotonic increasing", () => {
    let prev = bifurcation(0, 50, 5);
    for (let v = 1; v <= 100; v++) {
      const b = bifurcation(v, 50, 5);
      expect(b).toBeGreaterThanOrEqual(prev);
      prev = b;
    }
  });

  test("stays in [0, 1]", () => {
    for (const v of [-100, -1, 0, 25, 50, 75, 100, 1000]) {
      const b = bifurcation(v, 50, 5);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  feedbackLoop — gain saturates
// ──────────────────────────────────────────────────────────────────────────

describe("feedbackLoop", () => {
  test("output ≥ input for positive input with positive amplification", () => {
    const out = feedbackLoop(5, 2, 10);
    expect(out).toBeGreaterThan(5);
  });

  test("the multiplier (output/input) never exceeds (1 + amplificationFactor)", () => {
    // The feedback gain saturates at (1 + amplificationFactor). Output is bounded
    // by input * (1 + amplificationFactor). No infinite runaway.
    const amp = 2;
    const sat = 10;
    for (const input of [1, 10, 100, 1000, 1e6]) {
      const out = feedbackLoop(input, amp, sat);
      const multiplier = out / input;
      expect(multiplier).toBeLessThanOrEqual(1 + amp + 1e-9);
    }
  });

  test("the multiplier approaches (1 + amplificationFactor) as input grows", () => {
    const amp = 2;
    const sat = 10;
    const smallInput = feedbackLoop(1, amp, sat) / 1;
    const largeInput = feedbackLoop(1000, amp, sat) / 1000;
    // Large input should be CLOSER to the saturation value (1 + amp) than small input
    const target = 1 + amp;
    expect(Math.abs(largeInput - target)).toBeLessThan(Math.abs(smallInput - target));
    expect(largeInput).toBeGreaterThan(smallInput);
  });

  test("with amplificationFactor = 0, output equals input (no feedback)", () => {
    expect(feedbackLoop(7, 0, 10)).toBe(7);
  });

  test("is finite for large inputs (no explosion)", () => {
    const out = feedbackLoop(1e15, 5, 10);
    expect(Number.isFinite(out)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  cascadeEffect — pass-through below threshold, amplified above
// ──────────────────────────────────────────────────────────────────────────

describe("cascadeEffect", () => {
  test("passes input through unchanged when intensity is below the cascade threshold", () => {
    // No amplification below threshold (the system resists cascade).
    expect(cascadeEffect(5, 10, 3)).toBe(5);
    expect(cascadeEffect(0, 10, 3)).toBe(0);
    expect(cascadeEffect(9.99, 10, 3)).toBe(9.99);
  });

  test("amplifies the output when intensity is above the cascade threshold", () => {
    const out = cascadeEffect(15, 10, 3);
    expect(out).toBeGreaterThan(15);
  });

  test("amplification grows with the excess over threshold (non-linear cascade)", () => {
    const a = cascadeEffect(11, 10, 3);
    const b = cascadeEffect(20, 10, 3);
    // Per-unit-of-input amplification is much larger when far above threshold
    const ampPerUnitA = (a - 11) / 1;
    const ampPerUnitB = (b - 11) / 10;
    expect(ampPerUnitB).toBeGreaterThan(ampPerUnitA);
  });

  test("models the TVA-raise cascade: small hike → mild, big hike → cascade", () => {
    // 2 pt TVA raise → mild effect (no cascade, output == input)
    expect(cascadeEffect(2, 5, 4)).toBe(2);
    // 8 pt TVA raise → cascade triggers, output amplified
    const cascaded = cascadeEffect(8, 5, 4);
    expect(cascaded).toBeGreaterThan(8);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  criticalThreshold — exponential regime above threshold
// ──────────────────────────────────────────────────────────────────────────

describe("criticalThreshold", () => {
  test("scales linearly below threshold (returns baseEffect * value/threshold)", () => {
    // value=0 → 0; value=threshold/2 → baseEffect/2; value=threshold → baseEffect
    expect(criticalThreshold(0, 100, 1, 5)).toBe(0);
    expect(criticalThreshold(50, 100, 1, 5)).toBeCloseTo(0.5, 6);
    expect(criticalThreshold(100, 100, 1, 5)).toBeCloseTo(1, 6);
  });

  test("returns baseEffect at the threshold (continuity)", () => {
    expect(criticalThreshold(100, 100, 1, 5)).toBeCloseTo(1, 6);
  });

  test("above threshold, grows faster than linear extrapolation (exponential regime)", () => {
    // Linear extrapolation from threshold: baseEffect * (value/threshold)
    // Actual: baseEffect * (1 + criticalMultiplier * expm1(excess * 0.1))
    // For value > threshold, actual > linear.
    const threshold = 80;
    const value = 100;
    const baseEffect = 1;
    const mult = 5;
    const linear = baseEffect * (value / threshold);
    const actual = criticalThreshold(value, threshold, baseEffect, mult);
    expect(actual).toBeGreaterThan(linear);
  });

  test("debt-to-GDP scenario: 70% (below 80% threshold) → linear, 120% (above) → explosive", () => {
    const threshold = 80;
    const debtAt70 = criticalThreshold(70, threshold, 1, 5);
    const debtAt120 = criticalThreshold(120, threshold, 1, 5);
    // Below threshold: linear scaling, debtAt70 ≈ 0.875
    expect(debtAt70).toBeCloseTo(0.875, 3);
    // Above threshold: exponential — much more than linear (1.5)
    expect(debtAt120).toBeGreaterThan(1.5);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  diminishingReturns — concave (Michaelis-Menten)
// ──────────────────────────────────────────────────────────────────────────

describe("diminishingReturns", () => {
  test("returns 0 at value=0", () => {
    expect(diminishingReturns(0, 10)).toBe(0);
  });

  test("returns 0.5 at value = halfSaturation", () => {
    expect(diminishingReturns(10, 10)).toBeCloseTo(0.5, 6);
  });

  test("approaches 1 asymptotically (never reaches it for finite input)", () => {
    const big = diminishingReturns(1e6, 10);
    expect(big).toBeGreaterThan(0.99);
    expect(big).toBeLessThan(1);
  });

  test("is concave: marginal returns shrink as input grows", () => {
    // f(v+δ) - f(v) should DECREASE as v increases
    const K = 10;
    const delta = 5;
    const marginalLow = diminishingReturns(delta, K) - diminishingReturns(0, K);
    const marginalMid = diminishingReturns(20 + delta, K) - diminishingReturns(20, K);
    const marginalHigh = diminishingReturns(100 + delta, K) - diminishingReturns(100, K);
    expect(marginalLow).toBeGreaterThan(marginalMid);
    expect(marginalMid).toBeGreaterThan(marginalHigh);
  });

  test("the first 10 hospitals have more effect than the next 10 (diminishing returns)", () => {
    const K = 50; // half-saturation at 50 hospitals
    const first10 = diminishingReturns(10, K) - diminishingReturns(0, K);
    const next10 = diminishingReturns(110, K) - diminishingReturns(100, K);
    expect(first10).toBeGreaterThan(next10 * 5);
  });

  test("is monotonic increasing", () => {
    let prev = diminishingReturns(0, 10);
    for (let v = 1; v <= 200; v += 5) {
      const d = diminishingReturns(v, 10);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  Hysteresis — post-crisis memory
// ──────────────────────────────────────────────────────────────────────────

describe("Hysteresis", () => {
  test("with no prior crisis, hysteresisEffect returns 0 below threshold", () => {
    const h = new Hysteresis();
    h.update(50); // never above threshold 70
    expect(h.hysteresisEffect(50, 70, 0.1)).toBe(0);
  });

  test("after a crisis (value exceeded threshold), hysteresisEffect returns 1 at threshold", () => {
    const h = new Hysteresis();
    h.update(80); // crisis: exceeded threshold 70
    expect(h.hysteresisEffect(70, 70, 0.1)).toBe(1);
  });

  test("after a crisis + recovery, hysteresisEffect returns > 0 (system remembers)", () => {
    const h = new Hysteresis();
    h.update(90); // crisis
    h.update(60); // recovery (below threshold)
    const effect = h.hysteresisEffect(60, 70, 0.1);
    expect(effect).toBeGreaterThan(0);
    expect(effect).toBeLessThan(1);
  });

  test("two paths reaching the same current value can have different hysteresis effects (memory)", () => {
    // Path A: crisis → recovery to 60
    const crisisPath = new Hysteresis();
    crisisPath.update(90);
    crisisPath.update(60);
    // Path B: stable at 60 (no crisis)
    const stablePath = new Hysteresis();
    stablePath.update(60);
    stablePath.update(60);

    const effectA = crisisPath.hysteresisEffect(60, 70, 0.1);
    const effectB = stablePath.hysteresisEffect(60, 70, 0.1);
    expect(effectA).toBeGreaterThan(0);
    expect(effectB).toBe(0);
    expect(effectA).toBeGreaterThan(effectB);
  });

  test("the memory decays with distance from threshold (further below = weaker memory)", () => {
    const h = new Hysteresis();
    h.update(90); // crisis
    const close = h.hysteresisEffect(65, 70, 0.1); // gap = 5
    const far = h.hysteresisEffect(50, 70, 0.1); // gap = 20
    expect(close).toBeGreaterThan(far);
    expect(close).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(0); // still some memory, but less
  });

  test("update() tracks min and max values seen", () => {
    const h = new Hysteresis();
    h.update(30);
    h.update(90);
    h.update(50);
    const state = h.update(20);
    expect(state.maxValue).toBe(90);
    expect(state.minValue).toBe(20);
    expect(state.range).toBe(70);
  });

  test("reset() clears memory (forgets history)", () => {
    const h = new Hysteresis();
    h.update(90);
    expect(h.hysteresisEffect(60, 70, 0.1)).toBeGreaterThan(0);
    h.reset();
    expect(h.hysteresisEffect(60, 70, 0.1)).toBe(0);
  });
});
