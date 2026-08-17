// model.test.ts — Tests for the data layer (LEVERS, INDICATORS, CATEGORIES, MACRO_CONSTANTS).
//
// The model is the foundation of the simulator. Every other module imports from
// here. If the lever count is wrong, the neural network architecture (47→32→32→15)
// is wrong. If baselines are out of [min,max], the slider UI breaks. If sources
// are empty, the "no mock data" claim collapses. These tests are the load-bearing
// wall.

import { test, expect, describe } from "bun:test";
import {
  LEVERS,
  INDICATORS,
  CATEGORIES,
  LEVER_BY_ID,
  INDICATOR_BY_ID,
  MACRO_CONSTANTS,
  type LeverDef,
  type LeverCategory,
} from "../model.ts";

// --- Helpers ---

function baselineLevers(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of LEVERS) out[l.id] = l.baseline;
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
//  LEVERS — count, uniqueness, validity
// ──────────────────────────────────────────────────────────────────────────

describe("LEVERS", () => {
  test("there are exactly 47 levers (drives the MLP input size)", () => {
    expect(LEVERS.length).toBe(47);
  });

  test("every lever has a unique id", () => {
    const ids = LEVERS.map((l) => l.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(LEVERS.length);
  });

  test("every lever id is a non-empty snake_case string", () => {
    for (const l of LEVERS) {
      expect(l.id.length).toBeGreaterThan(0);
      expect(l.id).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  test("every lever has baseline within [min, max]", () => {
    for (const l of LEVERS) {
      expect(l.baseline).toBeGreaterThanOrEqual(l.min);
      expect(l.baseline).toBeLessThanOrEqual(l.max);
    }
  });

  test("every lever has safeLow ≤ safeHigh within [min, max]", () => {
    for (const l of LEVERS) {
      expect(l.safeLow).toBeGreaterThanOrEqual(l.min);
      expect(l.safeHigh).toBeLessThanOrEqual(l.max);
      expect(l.safeLow).toBeLessThanOrEqual(l.safeHigh);
    }
  });

  test("every lever has a non-empty source (provenance — no mock data)", () => {
    for (const l of LEVERS) {
      expect(typeof l.source).toBe("string");
      expect(l.source.length).toBeGreaterThan(3);
      // Mock-data tells: "mock", "todo", "fake", "lorem"
      const lower = l.source.toLowerCase();
      expect(lower).not.toContain("mock");
      expect(lower).not.toContain("todo");
      expect(lower).not.toContain("fake");
      expect(lower).not.toContain("lorem");
    }
  });

  test("every lever has a non-empty name and description", () => {
    for (const l of LEVERS) {
      expect(l.name.length).toBeGreaterThan(0);
      expect(l.description.length).toBeGreaterThan(0);
    }
  });

  test("every lever has a recognised category", () => {
    const validCategories: LeverCategory[] = [
      "economy",
      "health",
      "education",
      "infrastructure",
      "demographics",
      "governance",
      "environment",
      "social",
    ];
    for (const l of LEVERS) {
      expect(validCategories).toContain(l.category);
    }
  });

  test("LEVER_BY_ID lookup returns every lever", () => {
    expect(LEVER_BY_ID.size).toBe(LEVERS.length);
    for (const l of LEVERS) {
      expect(LEVER_BY_ID.get(l.id)).toBe(l);
    }
  });

  test("baseline levers dict can be built without collisions", () => {
    const dict = baselineLevers();
    expect(Object.keys(dict).length).toBe(47);
    // Two well-known baselines to anchor the dataset to Morocco 2023.
    expect(dict["vat_rate"]).toBe(20);
    expect(dict["minimum_wage"]).toBe(3330);
  });

  test("levers span all 8 categories (no empty category)", () => {
    const cats = new Set(LEVERS.map((l) => l.category));
    expect(cats.size).toBe(8);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  INDICATORS
// ──────────────────────────────────────────────────────────────────────────

describe("INDICATORS", () => {
  test("there are exactly 15 indicators (drives the MLP output size)", () => {
    expect(INDICATORS.length).toBe(15);
  });

  test("every indicator has a unique id", () => {
    const ids = INDICATORS.map((i) => i.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(INDICATORS.length);
  });

  test("every indicator has a non-empty formula description", () => {
    for (const i of INDICATORS) {
      expect(i.formula.length).toBeGreaterThan(0);
      expect(i.description.length).toBeGreaterThan(0);
    }
  });

  test("INDICATOR_BY_ID lookup returns every indicator", () => {
    expect(INDICATOR_BY_ID.size).toBe(INDICATORS.length);
    for (const i of INDICATORS) {
      expect(INDICATOR_BY_ID.get(i.id)).toBe(i);
    }
  });

  test("the canonical 15 indicator ids are present", () => {
    const expected = [
      "gdp",
      "gdp_growth",
      "gdp_per_capita",
      "unemployment",
      "inflation",
      "debt_to_gdp",
      "budget_deficit",
      "tax_revenue",
      "life_expectancy",
      "hdi",
      "gini",
      "balance_of_trade",
      "poverty_rate",
      "stability",
      "revolution_risk",
    ];
    const ids = INDICATORS.map((i) => i.id);
    for (const id of expected) {
      expect(ids).toContain(id);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  CATEGORIES
// ──────────────────────────────────────────────────────────────────────────

describe("CATEGORIES", () => {
  test("there are exactly 8 categories", () => {
    expect(CATEGORIES.length).toBe(8);
  });

  test("every category has a unique code", () => {
    const codes = CATEGORIES.map((c) => c.code);
    const unique = new Set(codes);
    expect(unique.size).toBe(CATEGORIES.length);
  });

  test("every category code corresponds to at least one lever", () => {
    const leverCats = new Set(LEVERS.map((l) => l.category));
    for (const c of CATEGORIES) {
      expect(leverCats.has(c.code)).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  MACRO_CONSTANTS
// ──────────────────────────────────────────────────────────────────────────

describe("MACRO_CONSTANTS", () => {
  test("has the expected fields", () => {
    const keys = Object.keys(MACRO_CONSTANTS);
    const expected = [
      "population_millions",
      "working_age_share",
      "labor_force_participation",
      "gdp_baseline_mrd_mad",
      "debt_baseline_mrd_mad",
      "exports_baseline_mrd_mad",
      "imports_baseline_mrd_mad",
      "household_consumption_share",
      "mpc",
      "base_life_expectancy",
      "base_gini",
      "base_poverty",
      "tax_compliance_base",
    ];
    for (const k of expected) {
      expect(keys).toContain(k);
    }
  });

  test("Morocco's population is the real ~37.8M", () => {
    expect(MACRO_CONSTANTS.population_millions).toBeGreaterThan(30);
    expect(MACRO_CONSTANTS.population_millions).toBeLessThan(45);
  });

  test("GDP baseline is the real ~1400 Mrd MAD (Morocco 2023)", () => {
    expect(MACRO_CONSTANTS.gdp_baseline_mrd_mad).toBeGreaterThan(1000);
    expect(MACRO_CONSTANTS.gdp_baseline_mrd_mad).toBeLessThan(2000);
  });

  test("base_life_expectancy is the real Morocco ~73 years", () => {
    expect(MACRO_CONSTANTS.base_life_expectancy).toBeGreaterThanOrEqual(70);
    expect(MACRO_CONSTANTS.base_life_expectancy).toBeLessThanOrEqual(78);
  });

  test("mpc (marginal propensity to consume) is in (0, 1)", () => {
    expect(MACRO_CONSTANTS.mpc).toBeGreaterThan(0);
    expect(MACRO_CONSTANTS.mpc).toBeLessThan(1);
  });
});
