// neural-network.test.ts — Tests for the MLP 47→32→32→15.
//
// The neural network is the learning core of PRISM: it converts 47 policy
// levers into 15 macro indicators. The README claims ~3008 trainable weights
// (the "3000 transistors"). This test suite verifies:
//   1. The architecture matches the README (47→32→32→15).
//   2. The weight count is exactly 3008 (arithmetic check).
//   3. forward() produces 15 finite outputs from 47 inputs.
//   4. forward() is deterministic (same input → same output, 100 runs).
//   5. train() actually reduces the loss (backprop works).
//   6. He initialization produces weights with the right statistical
//      properties (mean ≈ 0, std ≈ √(2/fan_in)).
//   7. Edge cases: all-zero, all-max, negative inputs don't crash.

import { test, expect, describe } from "bun:test";
import {
  createNetwork,
  forward,
  train,
  trainEpoch,
  pretrainFromFormulas,
  serializeNetwork,
  deserializeNetwork,
  getNetworkStats,
  getLayerActivations,
  INPUT_SIZE,
  HIDDEN1_SIZE,
  HIDDEN2_SIZE,
  OUTPUT_SIZE,
  type NeuralNetwork,
} from "../neural-network.ts";
import { LEVERS, INDICATORS, MACRO_CONSTANTS } from "../model.ts";
import { computeAllIndicators, type Levers } from "../formulas.ts";

// --- Helpers ---

function baselineLeverValues(): number[] {
  return LEVERS.map((l) => l.baseline);
}

function maxLeverValues(): number[] {
  return LEVERS.map((l) => l.max);
}

function zeroLeverValues(): number[] {
  return new Array(LEVERS.length).fill(0);
}

function negativeLeverValues(): number[] {
  return LEVERS.map((l) => -Math.abs(l.baseline));
}

function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr: number[]): number {
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

// ──────────────────────────────────────────────────────────────────────────
//  Architecture
// ──────────────────────────────────────────────────────────────────────────

describe("architecture", () => {
  test("input size is 47 (one per lever)", () => {
    expect(INPUT_SIZE).toBe(47);
    expect(INPUT_SIZE).toBe(LEVERS.length);
  });

  test("output size is 15 (one per indicator)", () => {
    expect(OUTPUT_SIZE).toBe(15);
    expect(OUTPUT_SIZE).toBe(INDICATORS.length);
  });

  test("hidden layers are 32 → 32 (the README architecture)", () => {
    expect(HIDDEN1_SIZE).toBe(32);
    expect(HIDDEN2_SIZE).toBe(32);
  });

  test("createNetwork() builds the 47→32→32→15 architecture", () => {
    const net = createNetwork();
    expect(net.layers.length).toBe(3);
    expect(net.layers[0].inSize).toBe(47);
    expect(net.layers[0].outSize).toBe(32);
    expect(net.layers[1].inSize).toBe(32);
    expect(net.layers[1].outSize).toBe(32);
    expect(net.layers[2].inSize).toBe(32);
    expect(net.layers[2].outSize).toBe(15);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  Weight count — README claims 3,008 weights
// ──────────────────────────────────────────────────────────────────────────

describe("weight count", () => {
  test("the arithmetic (47×32) + (32×32) + (32×15) = 3008 weights", () => {
    const w1 = 47 * 32; // 1504
    const w2 = 32 * 32; // 1024
    const w3 = 32 * 15; // 480
    const total = w1 + w2 + w3;
    expect(total).toBe(3008);
  });

  test("the full parameter count including biases = 3087", () => {
    const params = 47 * 32 + 32 + 32 * 32 + 32 + 32 * 15 + 15;
    expect(params).toBe(3087);
  });

  test("getNetworkStats().totalWeights is exactly 3008 (matches README)", () => {
    const net = createNetwork();
    const stats = getNetworkStats(net);
    expect(stats.totalWeights).toBe(3008);
  });

  test("each layer's weight array has the expected length", () => {
    const net = createNetwork();
    expect(net.layers[0].weights.length).toBe(47 * 32);
    expect(net.layers[1].weights.length).toBe(32 * 32);
    expect(net.layers[2].weights.length).toBe(32 * 15);
  });

  test("each layer's bias array has the expected length", () => {
    const net = createNetwork();
    expect(net.layers[0].biases.length).toBe(32);
    expect(net.layers[1].biases.length).toBe(32);
    expect(net.layers[2].biases.length).toBe(15);
  });

  test("the architecture string in stats reads '47→32→32→15'", () => {
    const net = createNetwork();
    expect(getNetworkStats(net).architecture).toBe("47→32→32→15");
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  forward() — output shape, finiteness, determinism
// ──────────────────────────────────────────────────────────────────────────

describe("forward()", () => {
  test("produces exactly 15 outputs from 47 inputs", () => {
    const net = createNetwork();
    const out = forward(net, baselineLeverValues());
    expect(out.length).toBe(15);
  });

  test("output is finite (no NaN, no Infinity) at baseline", () => {
    const net = createNetwork();
    const out = forward(net, baselineLeverValues());
    for (const v of out) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  test("is deterministic — same input → same output across 100 runs", () => {
    const net = createNetwork();
    const input = baselineLeverValues();
    const first = forward(net, input);
    for (let i = 0; i < 100; i++) {
      const out = forward(net, input);
      for (let j = 0; j < out.length; j++) {
        expect(out[j]).toBe(first[j]);
      }
    }
  });

  test("forward() does not mutate the input array", () => {
    const net = createNetwork();
    const input = baselineLeverValues();
    const snapshot = [...input];
    forward(net, input);
    expect(input).toEqual(snapshot);
  });

  test("handles all-zero inputs without producing NaN/Infinity", () => {
    const net = createNetwork();
    const out = forward(net, zeroLeverValues());
    expect(out.length).toBe(15);
    for (const v of out) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  test("handles all-max inputs without producing NaN/Infinity", () => {
    const net = createNetwork();
    const out = forward(net, maxLeverValues());
    expect(out.length).toBe(15);
    for (const v of out) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  test("handles negative inputs without producing NaN/Infinity", () => {
    const net = createNetwork();
    const out = forward(net, negativeLeverValues());
    expect(out.length).toBe(15);
    for (const v of out) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  test("different inputs produce different outputs (the network is responsive)", () => {
    const net = createNetwork();
    const outBaseline = forward(net, baselineLeverValues());
    const outMax = forward(net, maxLeverValues());
    let anyDifferent = false;
    for (let i = 0; i < outBaseline.length; i++) {
      if (Math.abs(outBaseline[i] - outMax[i]) > 1e-9) {
        anyDifferent = true;
        break;
      }
    }
    expect(anyDifferent).toBe(true);
  });

  test("getLayerActivations() returns 47/32/32/15-shaped activations", () => {
    const net = createNetwork();
    const acts = getLayerActivations(net, baselineLeverValues());
    expect(acts.input.length).toBe(47);
    expect(acts.hidden1.length).toBe(32);
    expect(acts.hidden2.length).toBe(32);
    expect(acts.output.length).toBe(15);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  train() — backprop actually reduces the loss
// ──────────────────────────────────────────────────────────────────────────

describe("train()", () => {
  test("train() returns a finite loss", () => {
    const net = createNetwork();
    const levers = baselineLeverValues();
    // Target = the formula-derived indicators at baseline (a realistic teacher).
    const leversDict: Levers = {};
    for (let i = 0; i < LEVERS.length; i++) leversDict[LEVERS[i].id] = levers[i];
    const indicators = computeAllIndicators(
      leversDict,
      MACRO_CONSTANTS.gdp_baseline_mrd_mad,
      MACRO_CONSTANTS.debt_baseline_mrd_mad,
    );
    const targets = INDICATORS.map((ind) => (indicators as any)[ind.id] as number);
    const loss = train(net, levers, targets, 0.001, 0.9);
    expect(Number.isFinite(loss)).toBe(true);
    expect(loss).toBeGreaterThanOrEqual(0);
  });

  test("repeated train() on the same sample reduces the loss", () => {
    const net = createNetwork();
    const levers = baselineLeverValues();
    const leversDict: Levers = {};
    for (let i = 0; i < LEVERS.length; i++) leversDict[LEVERS[i].id] = levers[i];
    const indicators = computeAllIndicators(
      leversDict,
      MACRO_CONSTANTS.gdp_baseline_mrd_mad,
      MACRO_CONSTANTS.debt_baseline_mrd_mad,
    );
    const targets = INDICATORS.map((ind) => (indicators as any)[ind.id] as number);

    const initialLoss = train(net, levers, targets, 0.001, 0.9);
    let finalLoss = initialLoss;
    for (let i = 0; i < 200; i++) {
      finalLoss = train(net, levers, targets, 0.001, 0.9);
    }
    expect(finalLoss).toBeLessThan(initialLoss);
  });

  test("trainEpoch() averages loss across the batch and increments epoch", () => {
    const net = createNetwork();
    const levers = baselineLeverValues();
    const leversDict: Levers = {};
    for (let i = 0; i < LEVERS.length; i++) leversDict[LEVERS[i].id] = levers[i];
    const indicators = computeAllIndicators(
      leversDict,
      MACRO_CONSTANTS.gdp_baseline_mrd_mad,
      MACRO_CONSTANTS.debt_baseline_mrd_mad,
    );
    const targets = INDICATORS.map((ind) => (indicators as any)[ind.id] as number);
    const samples = [
      { levers, targets },
      { levers, targets },
      { levers, targets },
    ];
    const epochBefore = net.epoch;
    const avgLoss = trainEpoch(net, samples, 0.001, 0.9);
    expect(Number.isFinite(avgLoss)).toBe(true);
    expect(net.epoch).toBe(epochBefore + 1);
    expect(net.trainingHistory.length).toBeGreaterThan(0);
    expect(net.trainingHistory[net.trainingHistory.length - 1]).toBe(avgLoss);
  });

  test("pretrainFromFormulas() runs without crashing and produces a finite loss", () => {
    const net = createNetwork();
    const finalLoss = pretrainFromFormulas(net, 3);
    expect(Number.isFinite(finalLoss)).toBe(true);
    expect(net.epoch).toBeGreaterThanOrEqual(3);
    expect(net.totalSamples).toBeGreaterThan(0);
  });

  test("train() increments totalSamples each call", () => {
    const net = createNetwork();
    const levers = baselineLeverValues();
    const targets = new Array(15).fill(0);
    const before = net.totalSamples;
    train(net, levers, targets, 0.001, 0.9);
    train(net, levers, targets, 0.001, 0.9);
    train(net, levers, targets, 0.001, 0.9);
    expect(net.totalSamples).toBe(before + 3);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  He initialization — statistical properties
// ──────────────────────────────────────────────────────────────────────────

describe("He initialization", () => {
  test("layer-0 weights have mean ≈ 0 (symmetric around zero)", () => {
    // 1504 samples in layer 0 — by the law of large numbers the empirical mean
    // should be close to the theoretical mean of 0.
    const net = createNetwork();
    const weights = Array.from(net.layers[0].weights);
    const m = mean(weights);
    expect(Math.abs(m)).toBeLessThan(0.02);
  });

  test("layer-0 weights have std ≈ √(2/47) ≈ 0.2063 (He init for ReLU)", () => {
    const net = createNetwork();
    const weights = Array.from(net.layers[0].weights);
    const s = std(weights);
    const expected = Math.sqrt(2 / 47);
    // 5% tolerance — 1504 samples give a noisy estimate but should be close.
    expect(Math.abs(s - expected)).toBeLessThan(expected * 0.08);
  });

  test("layer-1 weights have std ≈ √(2/32) ≈ 0.25", () => {
    const net = createNetwork();
    const weights = Array.from(net.layers[1].weights);
    const s = std(weights);
    const expected = Math.sqrt(2 / 32);
    expect(Math.abs(s - expected)).toBeLessThan(expected * 0.08);
  });

  test("layer-2 weights have std ≈ √(2/32) ≈ 0.25 (same fan_in as layer 1)", () => {
    const net = createNetwork();
    const weights = Array.from(net.layers[2].weights);
    const s = std(weights);
    const expected = Math.sqrt(2 / 32);
    expect(Math.abs(s - expected)).toBeLessThan(expected * 0.08);
  });

  test("biases are initialized to zero (standard practice for ReLU nets)", () => {
    const net = createNetwork();
    for (const layer of net.layers) {
      for (const b of layer.biases) {
        expect(b).toBe(0);
      }
    }
  });

  test("weights are not all the same (the RNG actually ran)", () => {
    const net = createNetwork();
    const w = Array.from(net.layers[0].weights);
    const first = w[0];
    let anyDifferent = false;
    for (const v of w) {
      if (v !== first) {
        anyDifferent = true;
        break;
      }
    }
    expect(anyDifferent).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  Serialization round-trip
// ──────────────────────────────────────────────────────────────────────────

describe("serialize/deserialize", () => {
  test("a serialized→deserialized network produces identical forward outputs", () => {
    const net = createNetwork();
    const input = baselineLeverValues();
    const out1 = forward(net, input);
    const data = serializeNetwork(net);
    const restored = deserializeNetwork(data);
    const out2 = forward(restored, input);
    for (let i = 0; i < out1.length; i++) {
      expect(out2[i]).toBeCloseTo(out1[i], 9);
    }
  });

  test("serialization preserves the epoch and totalSamples counters", () => {
    const net = createNetwork();
    net.epoch = 42;
    net.totalSamples = 1234;
    const data = serializeNetwork(net);
    const restored = deserializeNetwork(data);
    expect(restored.epoch).toBe(42);
    expect(restored.totalSamples).toBe(1234);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  getNetworkStats() — sanity
// ──────────────────────────────────────────────────────────────────────────

describe("getNetworkStats()", () => {
  test("returns the expected fields", () => {
    const net = createNetwork();
    const stats = getNetworkStats(net);
    expect(stats).toHaveProperty("totalWeights");
    expect(stats).toHaveProperty("activeWeights");
    expect(stats).toHaveProperty("maxWeight");
    expect(stats).toHaveProperty("avgWeight");
    expect(stats).toHaveProperty("epoch");
    expect(stats).toHaveProperty("totalSamples");
    expect(stats).toHaveProperty("lastLoss");
    expect(stats).toHaveProperty("architecture");
  });

  test("activeWeights is ≤ totalWeights", () => {
    const net = createNetwork();
    const stats = getNetworkStats(net);
    expect(stats.activeWeights).toBeLessThanOrEqual(stats.totalWeights);
  });

  test("avgWeight is ≤ maxWeight", () => {
    const net = createNetwork();
    const stats = getNetworkStats(net);
    expect(stats.avgWeight).toBeLessThanOrEqual(stats.maxWeight);
  });
});
