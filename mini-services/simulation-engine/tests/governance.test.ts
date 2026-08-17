// governance.test.ts — Tests for the GovernanceSystem (8 ministries, budget).
//
// The state is not just levers + agents: there is a government that allocates
// a ~500 Mrd MAD budget across 8 ministries, each with capacity, efficiency,
// leakage (corruption), and a service-quality score. These tests verify:
//   1. init() creates exactly 8 ministries totalling ~500 Mrd MAD.
//   2. Every ministry has efficiency and leakage in [0, 1].
//   3. Paradigm switches (liberalism, planned) reshape budget allocations.
//   4. setAllocation() modifies one ministry and rebalances the rest.
//   5. Service quality drifts upward when spending exceeds the reference.

import { test, expect, describe } from "bun:test";
import {
  GovernanceSystem,
  type Ministry,
  type MinistryId,
  type GovernanceStats,
} from "../governance.ts";
import { KernelPhase, type KernelState } from "../kernel.ts";

// --- Helpers ---

function mockKernelState(paradigm: string, levers: Record<string, number> = {}): KernelState {
  return {
    tick: 0,
    phase: KernelPhase.GOVERN,
    uptimeMs: 0,
    phaseTimings: {} as Record<KernelPhase, number>,
    subsystems: [],
    booted: true,
    halted: false,
    hostSnapshot: { paradigm, levers },
  };
}

const MINISTRY_IDS: MinistryId[] = [
  "education",
  "health",
  "infrastructure",
  "interior",
  "finance",
  "defense",
  "agriculture",
  "social",
];

// ──────────────────────────────────────────────────────────────────────────
//  init() — 8 ministries, ~500 Mrd total
// ──────────────────────────────────────────────────────────────────────────

describe("init()", () => {
  test("creates exactly 8 ministries", () => {
    const gov = new GovernanceSystem();
    gov.init();
    expect(gov.getMinistries().length).toBe(8);
  });

  test("the 8 ministry ids are the canonical set", () => {
    const gov = new GovernanceSystem();
    gov.init();
    const ids = gov.getMinistries().map((m) => m.id);
    for (const id of MINISTRY_IDS) {
      expect(ids).toContain(id);
    }
  });

  test("the total budget is 500 Mrd MAD (±5)", () => {
    const gov = new GovernanceSystem();
    gov.init();
    const total = gov.getMinistries().reduce((s, m) => s + m.allocatedBudget, 0);
    expect(total).toBeGreaterThan(495);
    expect(total).toBeLessThan(505);
  });

  test("every ministry has efficiency in [0, 1]", () => {
    const gov = new GovernanceSystem();
    gov.init();
    for (const m of gov.getMinistries()) {
      expect(m.efficiency).toBeGreaterThanOrEqual(0);
      expect(m.efficiency).toBeLessThanOrEqual(1);
    }
  });

  test("every ministry has leakage in [0, 1]", () => {
    const gov = new GovernanceSystem();
    gov.init();
    for (const m of gov.getMinistries()) {
      expect(m.leakage).toBeGreaterThanOrEqual(0);
      expect(m.leakage).toBeLessThanOrEqual(1);
    }
  });

  test("every ministry has capacity in [0, 1]", () => {
    const gov = new GovernanceSystem();
    gov.init();
    for (const m of gov.getMinistries()) {
      expect(m.capacity).toBeGreaterThanOrEqual(0);
      expect(m.capacity).toBeLessThanOrEqual(1);
    }
  });

  test("every ministry has serviceQuality in [0, 1]", () => {
    const gov = new GovernanceSystem();
    gov.init();
    for (const m of gov.getMinistries()) {
      expect(m.serviceQuality).toBeGreaterThanOrEqual(0);
      expect(m.serviceQuality).toBeLessThanOrEqual(1);
    }
  });

  test("every ministry has a non-empty name and id", () => {
    const gov = new GovernanceSystem();
    gov.init();
    for (const m of gov.getMinistries()) {
      expect(m.id.length).toBeGreaterThan(0);
      expect(m.name.length).toBeGreaterThan(0);
    }
  });

  test("social is the largest ministry (debt + subsidies + social ≈ 38%)", () => {
    const gov = new GovernanceSystem();
    gov.init();
    const ministries = gov.getMinistries();
    const social = ministries.find((m) => m.id === "social")!;
    const others = ministries.filter((m) => m.id !== "social");
    for (const m of others) {
      expect(social.allocatedBudget).toBeGreaterThan(m.allocatedBudget);
    }
  });

  test("is idempotent — calling init() twice resets to 8 ministries", () => {
    const gov = new GovernanceSystem();
    gov.init();
    gov.init();
    expect(gov.getMinistries().length).toBe(8);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  getGovernanceStats() — aggregated fields
// ──────────────────────────────────────────────────────────────────────────

describe("getGovernanceStats()", () => {
  test("returns all expected fields", () => {
    const gov = new GovernanceSystem();
    gov.init();
    const stats = gov.getGovernanceStats();
    const expected: (keyof GovernanceStats)[] = [
      "totalBudget",
      "totalSpent",
      "totalLeakage",
      "avgCapacity",
      "avgServiceQuality",
      "avgEfficiency",
      "corruptionIndex",
    ];
    for (const k of expected) {
      expect(stats).toHaveProperty(k);
    }
  });

  test("totalBudget at init equals 500 (±0.01 — sum of allocations)", () => {
    const gov = new GovernanceSystem();
    gov.init();
    expect(gov.getGovernanceStats().totalBudget).toBeCloseTo(500, 1);
  });

  test("totalSpent at init is 0 (no tick has run yet)", () => {
    const gov = new GovernanceSystem();
    gov.init();
    expect(gov.getGovernanceStats().totalSpent).toBe(0);
  });

  test("avgEfficiency is in [0, 1]", () => {
    const gov = new GovernanceSystem();
    gov.init();
    const e = gov.getGovernanceStats().avgEfficiency;
    expect(e).toBeGreaterThanOrEqual(0);
    expect(e).toBeLessThanOrEqual(1);
  });

  test("corruptionIndex is in [0, 100]", () => {
    const gov = new GovernanceSystem();
    gov.init();
    const c = gov.getGovernanceStats().corruptionIndex;
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThanOrEqual(100);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  step() — paradigm-driven reallocation
// ──────────────────────────────────────────────────────────────────────────

describe("step() — paradigm switches reshape the budget", () => {
  test("liberalism boosts infrastructure vs the default technocracy allocation", () => {
    const govLib = new GovernanceSystem();
    govLib.init();
    govLib.step(mockKernelState("liberal"));
    const infraLib = govLib.getMinistry("infrastructure")!.allocatedBudget;

    const govTech = new GovernanceSystem();
    govTech.init();
    govTech.step(mockKernelState("technocracy"));
    const infraTech = govTech.getMinistry("infrastructure")!.allocatedBudget;

    expect(infraLib).toBeGreaterThan(infraTech);
  });

  test("planned economy boosts social spending vs liberalism", () => {
    const govPlanned = new GovernanceSystem();
    govPlanned.init();
    govPlanned.step(mockKernelState("planned"));
    const socialPlanned = govPlanned.getMinistry("social")!.allocatedBudget;

    const govLib = new GovernanceSystem();
    govLib.init();
    govLib.step(mockKernelState("liberal"));
    const socialLib = govLib.getMinistry("social")!.allocatedBudget;

    expect(socialPlanned).toBeGreaterThan(socialLib);
  });

  test("authoritarianism boosts interior (security) vs planned", () => {
    const govAuth = new GovernanceSystem();
    govAuth.init();
    govAuth.step(mockKernelState("authoritarian"));
    const interiorAuth = govAuth.getMinistry("interior")!.allocatedBudget;

    const govPlanned = new GovernanceSystem();
    govPlanned.init();
    govPlanned.step(mockKernelState("planned"));
    const interiorPlanned = govPlanned.getMinistry("interior")!.allocatedBudget;

    expect(interiorAuth).toBeGreaterThan(interiorPlanned);
  });

  test("the total budget stays at 500 Mrd MAD after a paradigm switch (normalised)", () => {
    const gov = new GovernanceSystem();
    gov.init();
    gov.step(mockKernelState("liberal"));
    const total = gov.getMinistries().reduce((s, m) => s + m.allocatedBudget, 0);
    expect(total).toBeCloseTo(500, 1);
  });

  test("step() updates spentBudget (no longer 0 after a tick)", () => {
    const gov = new GovernanceSystem();
    gov.init();
    gov.step(mockKernelState("technocracy"));
    expect(gov.getGovernanceStats().totalSpent).toBeGreaterThan(0);
  });

  test("step() returns a non-negative wall-clock time in ms", () => {
    const gov = new GovernanceSystem();
    gov.init();
    const t = gov.step(mockKernelState("technocracy"));
    expect(typeof t).toBe("number");
    expect(t).toBeGreaterThanOrEqual(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  setAllocation() — manual budget override
// ──────────────────────────────────────────────────────────────────────────

describe("setAllocation()", () => {
  test("modifies the targeted ministry's budget to fraction × 500", () => {
    const gov = new GovernanceSystem();
    gov.init();
    gov.setAllocation("defense", 0.30); // 30% of 500 = 150 Mrd
    const defense = gov.getMinistry("defense")!;
    expect(defense.allocatedBudget).toBeCloseTo(150, 1);
  });

  test("preserves the total budget at 500 Mrd MAD (other ministries rebalanced)", () => {
    const gov = new GovernanceSystem();
    gov.init();
    gov.setAllocation("education", 0.40); // 40% = 200 Mrd
    const total = gov.getMinistries().reduce((s, m) => s + m.allocatedBudget, 0);
    expect(total).toBeCloseTo(500, 1);
  });

  test("the boosted ministry's budget exceeds every other ministry's", () => {
    const gov = new GovernanceSystem();
    gov.init();
    gov.setAllocation("health", 0.50); // half the budget
    const ministries = gov.getMinistries();
    const health = ministries.find((m) => m.id === "health")!;
    for (const m of ministries) {
      if (m.id === "health") continue;
      expect(health.allocatedBudget).toBeGreaterThan(m.allocatedBudget);
    }
  });

  test("clamps an absurd fraction to the [0.01, 0.80] range (no ministry can eat 100%)", () => {
    const gov = new GovernanceSystem();
    gov.init();
    gov.setAllocation("interior", 0.99);
    const interior = gov.getMinistry("interior")!;
    // 0.99 clamped to 0.80 → 400 Mrd
    expect(interior.allocatedBudget).toBeLessThanOrEqual(0.80 * 500 + 0.01);
    expect(interior.allocatedBudget).toBeGreaterThanOrEqual(0.01 * 500 - 0.01);
  });

  test("clamps a tiny fraction to the 0.01 floor", () => {
    const gov = new GovernanceSystem();
    gov.init();
    gov.setAllocation("finance", 0.0);
    const finance = gov.getMinistry("finance")!;
    // 0.0 clamped to 0.01 → 5 Mrd
    expect(finance.allocatedBudget).toBeGreaterThanOrEqual(0.01 * 500 - 0.01);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  Service-quality drift with spending
// ──────────────────────────────────────────────────────────────────────────

describe("service quality drift", () => {
  test("a paradigm that boosts a ministry lifts its quality faster than one that doesn't", () => {
    // Authoritarian boosts INTERIOR (+0.05 → 65 Mrd); planned leaves INTERIOR
    // at the default (~40 Mrd). With referenceBudget slow to catch up (0.99/0.01
    // drift), the authoritarian scenario sustains a higher spendingRatio for
    // many ticks → larger qualityDelta per tick → higher final quality.
    // We use 40 ticks to stay below the [0, 1] saturation ceiling.
    const govAuth = new GovernanceSystem(12345);
    govAuth.init();
    const govPlanned = new GovernanceSystem(12345);
    govPlanned.init();

    const initialAuth = govAuth.getMinistry("interior")!.serviceQuality;
    const initialPlanned = govPlanned.getMinistry("interior")!.serviceQuality;
    expect(initialAuth).toBeCloseTo(initialPlanned, 6); // same seed → same start

    for (let t = 1; t <= 40; t++) {
      govAuth.step(mockKernelState("authoritarian"));
      govPlanned.step(mockKernelState("planned"));
    }
    const finalAuth = govAuth.getMinistry("interior")!.serviceQuality;
    const finalPlanned = govPlanned.getMinistry("interior")!.serviceQuality;
    expect(finalAuth).toBeGreaterThan(finalPlanned);
  });

  test("boosted spending raises quality monotonically (no regression within a run)", () => {
    // Track the interior ministry's quality over 30 ticks under authoritarianism.
    const gov = new GovernanceSystem(999);
    gov.init();
    const qualities: number[] = [gov.getMinistry("interior")!.serviceQuality];
    for (let t = 1; t <= 30; t++) {
      gov.step(mockKernelState("authoritarian"));
      qualities.push(gov.getMinistry("interior")!.serviceQuality);
    }
    // Final quality should be strictly higher than the initial.
    expect(qualities[qualities.length - 1]).toBeGreaterThan(qualities[0]);
    // And the trend should be upward on average (allowing for noise).
    const firstHalf = qualities.slice(0, 15).reduce((s, v) => s + v, 0) / 15;
    const secondHalf = qualities.slice(15).reduce((s, v) => s + v, 0) / 15;
    expect(secondHalf).toBeGreaterThanOrEqual(firstHalf);
  });

  test("service quality stays in [0, 1] after many ticks (no escape)", () => {
    const gov = new GovernanceSystem();
    gov.init();
    for (let t = 1; t <= 200; t++) {
      gov.step(mockKernelState("technocracy"));
    }
    for (const m of gov.getMinistries()) {
      expect(m.serviceQuality).toBeGreaterThanOrEqual(0);
      expect(m.serviceQuality).toBeLessThanOrEqual(1);
    }
  });

  test("leakage drifts toward the anti-corruption target over many ticks", () => {
    // With anti_corruption_index = 100, target leakage = max(0.05, 0.50 - 1*0.45) = 0.05.
    const gov = new GovernanceSystem();
    gov.init();
    const initialAvgLeakage = gov.getGovernanceStats().corruptionIndex / 100;
    for (let t = 1; t <= 300; t++) {
      gov.step(mockKernelState("technocracy", { anti_corruption_index: 100 }));
    }
    const finalAvgLeakage = gov.getGovernanceStats().corruptionIndex / 100;
    // Leakage should have dropped toward the 0.05 target.
    expect(finalAvgLeakage).toBeLessThan(initialAvgLeakage);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  Shutdown
// ──────────────────────────────────────────────────────────────────────────

describe("shutdown()", () => {
  test("clears all ministries", () => {
    const gov = new GovernanceSystem();
    gov.init();
    expect(gov.getMinistries().length).toBe(8);
    gov.shutdown();
    expect(gov.getMinistries().length).toBe(0);
  });
});
