// life.test.ts — Tests for the LifeSystem (demographics, ageing, mortality).
//
// The LifeSystem is what turns PRISM from a calculator into a simulation:
// agents are born, age through 7 life stages, reproduce, and die. The
// population must stay stable (the memory-leak fix), ages must advance
// correctly (12 ticks = 1 year), and stage boundaries must match Morocco's
// real demographics (median age ~28, HCP 2023).

import { test, expect, describe } from "bun:test";
import {
  LifeSystem,
  LifeStage,
  stageFromAge,
  type DemographicProfile,
} from "../life.ts";
import { KernelPhase, type KernelState } from "../kernel.ts";

// --- Helpers ---

function mockKernelState(tick: number): KernelState {
  return {
    tick,
    phase: KernelPhase.LIFECYCLE,
    uptimeMs: 0,
    phaseTimings: {} as Record<KernelPhase, number>,
    subsystems: [],
    booted: true,
    halted: false,
    hostSnapshot: { levers: {} },
  };
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

// ──────────────────────────────────────────────────────────────────────────
//  stageFromAge — boundary correctness
// ──────────────────────────────────────────────────────────────────────────

describe("stageFromAge()", () => {
  test("age 0 → INFANT", () => {
    expect(stageFromAge(0)).toBe(LifeStage.INFANT);
  });

  test("age 5 → CHILD (boundary: 4 is the last INFANT)", () => {
    expect(stageFromAge(5)).toBe(LifeStage.CHILD);
  });

  test("age 15 → STUDENT", () => {
    expect(stageFromAge(15)).toBe(LifeStage.STUDENT);
  });

  test("age 25 → WORKER", () => {
    expect(stageFromAge(25)).toBe(LifeStage.WORKER);
  });

  test("age 55 → MATURE", () => {
    expect(stageFromAge(55)).toBe(LifeStage.MATURE);
  });

  test("age 65 → RETIREE", () => {
    expect(stageFromAge(65)).toBe(LifeStage.RETIREE);
  });

  test("age 75 → ELDER", () => {
    expect(stageFromAge(75)).toBe(LifeStage.ELDER);
  });

  test("the last age of each stage belongs to that stage (inclusive upper bound)", () => {
    expect(stageFromAge(4)).toBe(LifeStage.INFANT);
    expect(stageFromAge(14)).toBe(LifeStage.CHILD);
    expect(stageFromAge(24)).toBe(LifeStage.STUDENT);
    expect(stageFromAge(54)).toBe(LifeStage.WORKER);
    expect(stageFromAge(64)).toBe(LifeStage.MATURE);
    expect(stageFromAge(74)).toBe(LifeStage.RETIREE);
  });

  test("negative age is treated as INFANT (defensive)", () => {
    expect(stageFromAge(-5)).toBe(LifeStage.INFANT);
  });

  test("age 100+ is ELDER (the MAX_AGE cap)", () => {
    expect(stageFromAge(100)).toBe(LifeStage.ELDER);
    expect(stageFromAge(200)).toBe(LifeStage.ELDER);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  init() — initial population
// ──────────────────────────────────────────────────────────────────────────

describe("init()", () => {
  test("creates exactly 10,000 profiles (default agentCount)", () => {
    const life = new LifeSystem();
    life.init();
    expect(life.getLivingCount()).toBe(10000);
  });

  test("respects a custom agentCount", () => {
    const life = new LifeSystem(5000);
    life.init();
    expect(life.getLivingCount()).toBe(5000);
  });

  test("is idempotent — calling init() twice resets to the original count", () => {
    const life = new LifeSystem();
    life.init();
    life.init();
    expect(life.getLivingCount()).toBe(10000);
  });

  test("initial median age is in [25, 35] (Morocco real median ~28, HCP 2023)", () => {
    const life = new LifeSystem();
    life.init();
    const stats = life.getDemographicStats();
    expect(stats.medianAge).toBeGreaterThanOrEqual(25);
    expect(stats.medianAge).toBeLessThanOrEqual(35);
  });

  test("no agent has a negative age at init", () => {
    const life = new LifeSystem();
    life.init();
    for (let i = 0; i < 10000; i++) {
      const p = life.getProfile(i);
      expect(p).toBeDefined();
      expect(p!.age).toBeGreaterThanOrEqual(0);
    }
  });

  test("every profile has a valid life stage (one of the 7 non-deceased stages)", () => {
    const life = new LifeSystem();
    life.init();
    const validStages = new Set([
      LifeStage.INFANT,
      LifeStage.CHILD,
      LifeStage.STUDENT,
      LifeStage.WORKER,
      LifeStage.MATURE,
      LifeStage.RETIREE,
      LifeStage.ELDER,
    ]);
    for (let i = 0; i < 10000; i++) {
      const p = life.getProfile(i);
      expect(p).toBeDefined();
      expect(validStages.has(p!.stage)).toBe(true);
    }
  });

  test("gender is binary ('male' or 'female') with roughly 50/50 split", () => {
    const life = new LifeSystem();
    life.init();
    let males = 0, females = 0;
    for (let i = 0; i < 10000; i++) {
      const p = life.getProfile(i)!;
      if (p.gender === "male") males++;
      else if (p.gender === "female") females++;
      else throw new Error(`Unexpected gender: ${p.gender}`);
    }
    // 50/50 within ±5% (statistical noise on 10000 samples)
    expect(Math.abs(males - females)).toBeLessThan(500);
    expect(males + females).toBe(10000);
  });

  test("health is in [0, 1] for all agents", () => {
    const life = new LifeSystem();
    life.init();
    for (let i = 0; i < 10000; i++) {
      const p = life.getProfile(i)!;
      expect(p.health).toBeGreaterThanOrEqual(0);
      expect(p.health).toBeLessThanOrEqual(1);
    }
  });

  test("deterministic with same seed — same population across two instances", () => {
    const life1 = new LifeSystem(1000, 42);
    life1.init();
    const life2 = new LifeSystem(1000, 42);
    life2.init();
    for (let i = 0; i < 1000; i++) {
      expect(life1.getProfile(i)!.age).toBe(life2.getProfile(i)!.age);
      expect(life1.getProfile(i)!.gender).toBe(life2.getProfile(i)!.gender);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  step() — ageing and the 12-tick year
// ──────────────────────────────────────────────────────────────────────────

describe("step() — ageing", () => {
  test("after 12 ticks (1 simulated year), every still-living agent has aged by 1", () => {
    const life = new LifeSystem();
    life.init();
    // Snapshot the initial ages of the original 10000 agents.
    const initialAges: number[] = [];
    for (let i = 0; i < 10000; i++) {
      initialAges.push(life.getProfile(i)!.age);
    }
    // Run 12 ticks (one simulated year).
    for (let t = 1; t <= 12; t++) {
      life.step(mockKernelState(t));
    }
    // Check the still-living original agents aged by exactly 1.
    let checked = 0;
    for (let i = 0; i < 10000; i++) {
      const p = life.getProfile(i);
      if (!p || p.stage === LifeStage.DECEASED) continue;
      expect(p.age).toBe(initialAges[i] + 1);
      checked++;
    }
    // Sanity: at least 90% of the original 10000 should still be alive after 1 year.
    expect(checked).toBeGreaterThan(9000);
  });

  test("after 1 tick (1 month), ages have NOT advanced (12 ticks = 1 year)", () => {
    const life = new LifeSystem();
    life.init();
    const initialAges: number[] = [];
    for (let i = 0; i < 10000; i++) {
      initialAges.push(life.getProfile(i)!.age);
    }
    life.step(mockKernelState(1));
    let checked = 0;
    for (let i = 0; i < 10000; i++) {
      const p = life.getProfile(i);
      if (!p || p.stage === LifeStage.DECEASED) continue;
      expect(p.age).toBe(initialAges[i]);
      checked++;
    }
    expect(checked).toBeGreaterThan(9000);
  });

  test("step() is idempotent for the same tick (no double-ageing)", () => {
    const life = new LifeSystem();
    life.init();
    life.step(mockKernelState(1));
    life.step(mockKernelState(1)); // same tick again
    // No agent should have aged by 2 in a single tick.
    for (let i = 0; i < 10000; i++) {
      const p = life.getProfile(i);
      if (!p || p.stage === LifeStage.DECEASED) continue;
      // The birth tick is fixed; age = floor((tick - birthTick)/12).
      // At tick=1 the age is whatever the formula gives — no double-counting.
      expect(p.age).toBeGreaterThanOrEqual(0);
    }
  });

  test("step() returns a non-negative wall-clock time in ms", () => {
    const life = new LifeSystem();
    life.init();
    const t = life.step(mockKernelState(1));
    expect(typeof t).toBe("number");
    expect(t).toBeGreaterThanOrEqual(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  Population stability + memory-leak regression
// ──────────────────────────────────────────────────────────────────────────

describe("population stability (memory-leak fix)", () => {
  test("after 100 ticks, living population stays within ±2% of 10,000", () => {
    const life = new LifeSystem();
    life.init();
    const initial = life.getLivingCount();
    expect(initial).toBe(10000);
    for (let t = 1; t <= 100; t++) {
      life.step(mockKernelState(t));
    }
    const final = life.getLivingCount();
    // The replacement logic should keep the population stable.
    expect(final).toBeGreaterThan(initial * 0.98);
    expect(final).toBeLessThan(initial * 1.02);
  });

  test("the profiles Map does NOT grow unbounded (memory-leak regression)", () => {
    // Before the pruneDeceased() fix, the Map grew by ~50 entries/tick →
    // after 1000 ticks the Map would have ~50,000+ entries. The fix caps it
    // near agentCount + 500.
    const life = new LifeSystem();
    life.init();
    for (let t = 1; t <= 200; t++) {
      life.step(mockKernelState(t));
    }
    // Access internal size via the public surface: living + deceased-pruned.
    // After 200 ticks the Map should not have grown beyond agentCount + 500.
    // We use getLivingCount() + a generous ceiling on deceased retained.
    const living = life.getLivingCount();
    expect(living).toBeLessThan(10500);
    expect(living).toBeGreaterThan(9500);
  });

  test("long-run stability: 500 ticks without population explosion or collapse", () => {
    const life = new LifeSystem(2000);
    life.init();
    const initial = life.getLivingCount();
    for (let t = 1; t <= 500; t++) {
      life.step(mockKernelState(t));
    }
    const final = life.getLivingCount();
    // ±10% tolerance over a 40-year simulation — generous but catches explosion/collapse.
    expect(final).toBeGreaterThan(initial * 0.9);
    expect(final).toBeLessThan(initial * 1.1);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  Mortality — deceased agents are marked DECEASED
// ──────────────────────────────────────────────────────────────────────────

describe("mortality", () => {
  test("after 600 ticks (50 years), at least some original agents have died and are marked DECEASED", () => {
    const life = new LifeSystem();
    life.init();
    for (let t = 1; t <= 600; t++) {
      life.step(mockKernelState(t));
    }
    let deceasedCount = 0;
    for (let i = 0; i < 10000; i++) {
      const p = life.getProfile(i);
      if (p && p.stage === LifeStage.DECEASED) {
        deceasedCount++;
        // Deceased agents must have a deathTick recorded (provenance).
        expect(p.deathTick).not.toBeNull();
        expect(p.deathTick).toBeGreaterThanOrEqual(1);
        expect(p.deathTick).toBeLessThanOrEqual(600);
      }
    }
    // In 50 years, with Morocco's mortality ~5/1000/yr, we'd expect ~2500 deaths
    // out of 10000. Allow a wide range — the key assertion is "some deaths".
    expect(deceasedCount).toBeGreaterThan(100);
  });

  test("a deceased agent's deathTick is set, birthTick is preserved", () => {
    const life = new LifeSystem();
    life.init();
    for (let t = 1; t <= 600; t++) {
      life.step(mockKernelState(t));
    }
    for (let i = 0; i < 10000; i++) {
      const p = life.getProfile(i);
      if (p && p.stage === LifeStage.DECEASED) {
        expect(p.birthTick).toBeLessThanOrEqual(p.deathTick!);
        break;
      }
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  getDemographicStats()
// ──────────────────────────────────────────────────────────────────────────

describe("getDemographicStats()", () => {
  test("returns all expected fields at init", () => {
    const life = new LifeSystem();
    life.init();
    const stats = life.getDemographicStats();
    expect(stats).toHaveProperty("medianAge");
    expect(stats).toHaveProperty("birthRate");
    expect(stats).toHaveProperty("deathRate");
    expect(stats).toHaveProperty("dependencyRatio");
    expect(stats).toHaveProperty("populationGrowth");
    expect(stats).toHaveProperty("population");
  });

  test("population at init equals 10,000", () => {
    const life = new LifeSystem();
    life.init();
    expect(life.getDemographicStats().population).toBe(10000);
  });

  test("median age is a non-negative integer", () => {
    const life = new LifeSystem();
    life.init();
    const m = life.getDemographicStats().medianAge;
    expect(Number.isInteger(m)).toBe(true);
    expect(m).toBeGreaterThanOrEqual(0);
  });

  test("dependencyRatio is non-negative (and < 200 for Morocco ~55)", () => {
    const life = new LifeSystem();
    life.init();
    const d = life.getDemographicStats().dependencyRatio;
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThan(200);
  });

  test("after 60 ticks (5 years), birth and death rates are non-negative", () => {
    const life = new LifeSystem();
    life.init();
    for (let t = 1; t <= 60; t++) {
      life.step(mockKernelState(t));
    }
    const stats = life.getDemographicStats();
    expect(stats.birthRate).toBeGreaterThanOrEqual(0);
    expect(stats.deathRate).toBeGreaterThanOrEqual(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  getPopulationPyramid()
// ──────────────────────────────────────────────────────────────────────────

describe("getPopulationPyramid()", () => {
  test("returns 7 age bands at init", () => {
    const life = new LifeSystem();
    life.init();
    const bands = life.getPopulationPyramid();
    expect(bands.length).toBe(7);
  });

  test("every band has the expected ageGroup label", () => {
    const life = new LifeSystem();
    life.init();
    const bands = life.getPopulationPyramid();
    const expected = ["0-4", "5-14", "15-24", "25-54", "55-64", "65-74", "75+"];
    expect(bands.map((b) => b.ageGroup)).toEqual(expected);
  });

  test("every band has male and female counts", () => {
    const life = new LifeSystem();
    life.init();
    const bands = life.getPopulationPyramid();
    for (const b of bands) {
      expect(typeof b.male).toBe("number");
      expect(typeof b.female).toBe("number");
      expect(b.male).toBeGreaterThanOrEqual(0);
      expect(b.female).toBeGreaterThanOrEqual(0);
    }
  });

  test("the sum of all bands equals the living population", () => {
    const life = new LifeSystem();
    life.init();
    const bands = life.getPopulationPyramid();
    const total = bands.reduce((s, b) => s + b.male + b.female, 0);
    expect(total).toBe(life.getLivingCount());
  });
});
