// formulas.test.ts — Tests for the economic formulas.
//
// The formulas convert levers (policy inputs) into indicators (macro outputs).
// These are not heuristics — they are accounting identities (GDP = C+I+G+NX)
// and standard econometric models (Okun, Phillips, HDI). The tests verify:
//   1. The formulas produce sane values at the baseline.
//   2. They respond in the right direction when a lever moves.
//   3. They are CLAMPED to physical ranges (the bugs we fixed:
//      life_expectancy ≤ 90, HDI ≤ 1).
//   4. computeAllIndicators() returns all 15 indicators with valid values.

import { test, expect, describe } from "bun:test";
import {
  computeGDP,
  computePublicSpending,
  computeTaxRevenue,
  computeBudgetDeficit,
  computeUnemployment,
  computeInflation,
  computeLifeExpectancy,
  computeHDI,
  computeGini,
  computeBalanceOfTrade,
  computePovertyRate,
  computeStability,
  computeRevolutionRisk,
  computeAllIndicators,
  type Levers,
  type ComputedIndicators,
} from "../formulas.ts";
import { LEVERS, MACRO_CONSTANTS } from "../model.ts";

// --- Helpers ---

function baselineLevers(): Levers {
  const out: Levers = {};
  for (const l of LEVERS) out[l.id] = l.baseline;
  return out;
}

function leversWith(overrides: Record<string, number>): Levers {
  return { ...baselineLevers(), ...overrides };
}

function extremeLevers(): Levers {
  // Push every lever to its declared max — still within physical bounds.
  const out: Levers = {};
  for (const l of LEVERS) out[l.id] = l.max;
  return out;
}

function crazyLevers(): Levers {
  // Way outside lever ranges — used to verify clamps hold under abuse.
  const out: Levers = {};
  for (const l of LEVERS) out[l.id] = l.max * 10;
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
//  GDP — identity C + I + G + (X − M)
// ──────────────────────────────────────────────────────────────────────────

describe("computeGDP", () => {
  test("returns a positive number at baseline (~1400 Mrd MAD)", () => {
    const gdp = computeGDP(baselineLevers());
    expect(Number.isFinite(gdp)).toBe(true);
    expect(gdp).toBeGreaterThan(0);
    // Sanity: Morocco's GDP is ~1400 Mrd MAD; we should be in the right order.
    expect(gdp).toBeGreaterThan(500);
    expect(gdp).toBeLessThan(5000);
  });

  test("responds positively to public_investment (raise → GDP rises)", () => {
    const base = computeGDP(baselineLevers());
    const raised = computeGDP(leversWith({ public_investment: 400 }));
    expect(raised).toBeGreaterThan(base);
  });

  test("responds negatively to a high interest rate (raise → investment drops → GDP drops)", () => {
    const base = computeGDP(baselineLevers());
    const raised = computeGDP(leversWith({ interest_rate: 12 }));
    expect(raised).toBeLessThan(base);
  });

  test("a weaker MAD (higher exchange_rate) lifts exports and GDP", () => {
    const base = computeGDP(baselineLevers());
    const weakMad = computeGDP(leversWith({ exchange_rate: 14 }));
    expect(weakMad).toBeGreaterThan(base);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  Public spending, tax revenue, deficit
// ──────────────────────────────────────────────────────────────────────────

describe("computePublicSpending", () => {
  test("returns a positive number at baseline (~570 Mrd MAD)", () => {
    const g = computePublicSpending(baselineLevers());
    expect(g).toBeGreaterThan(100);
    expect(g).toBeLessThan(1500);
  });

  test("rises with the health_budget_share lever", () => {
    const base = computePublicSpending(baselineLevers());
    const raised = computePublicSpending(leversWith({ health_budget_share: 15 }));
    expect(raised).toBeGreaterThan(base);
  });
});

describe("computeTaxRevenue", () => {
  test("is positive at baseline and below public spending (deficit)", () => {
    const rev = computeTaxRevenue(baselineLevers());
    const spend = computePublicSpending(baselineLevers());
    expect(rev).toBeGreaterThan(0);
    expect(rev).toBeLessThan(spend);
  });

  test("rises with tax_compliance_rate", () => {
    const base = computeTaxRevenue(baselineLevers());
    const high = computeTaxRevenue(leversWith({ tax_compliance_rate: 95 }));
    expect(high).toBeGreaterThan(base);
  });

  test("rises with vat_rate", () => {
    const base = computeTaxRevenue(baselineLevers());
    const high = computeTaxRevenue(leversWith({ vat_rate: 25 }));
    expect(high).toBeGreaterThan(base);
  });
});

describe("computeBudgetDeficit", () => {
  test("is spending minus revenue (matches formula)", () => {
    const levers = baselineLevers();
    const expected = computePublicSpending(levers) - computeTaxRevenue(levers);
    expect(computeBudgetDeficit(levers)).toBeCloseTo(expected, 6);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  Unemployment, inflation (Okun & Phillips)
// ──────────────────────────────────────────────────────────────────────────

describe("computeUnemployment", () => {
  test("is non-negative and within [2, 35] (formula clamp)", () => {
    const u = computeUnemployment(baselineLevers(), 0);
    expect(u).toBeGreaterThanOrEqual(2);
    expect(u).toBeLessThanOrEqual(35);
  });

  test("falls when GDP growth is high (Okun's law)", () => {
    const lowGrowth = computeUnemployment(baselineLevers(), 0);
    const highGrowth = computeUnemployment(baselineLevers(), 8);
    expect(highGrowth).toBeLessThan(lowGrowth);
  });

  test("rises with minimum_wage (labour-cost effect)", () => {
    const base = computeUnemployment(baselineLevers(), 4);
    const raised = computeUnemployment(leversWith({ minimum_wage: 6000 }), 4);
    expect(raised).toBeGreaterThan(base);
  });

  test("stays within [2, 35] under crazy inputs (clamp holds)", () => {
    const u = computeUnemployment(crazyLevers(), 1000);
    expect(u).toBeGreaterThanOrEqual(2);
    expect(u).toBeLessThanOrEqual(35);
  });
});

describe("computeInflation", () => {
  test("is within [-2, 25] at baseline", () => {
    const i = computeInflation(baselineLevers(), 4);
    expect(i).toBeGreaterThanOrEqual(-2);
    expect(i).toBeLessThanOrEqual(25);
  });

  test("falls when the central bank raises interest rates", () => {
    const base = computeInflation(baselineLevers(), 4);
    const tight = computeInflation(leversWith({ interest_rate: 10 }), 4);
    expect(tight).toBeLessThan(base);
  });

  test("stays within [-2, 25] under extreme inputs (clamp holds)", () => {
    const i = computeInflation(crazyLevers(), 50);
    expect(i).toBeGreaterThanOrEqual(-2);
    expect(i).toBeLessThanOrEqual(25);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  Life expectancy — clamped to [45, 90] (bug we fixed)
// ──────────────────────────────────────────────────────────────────────────

describe("computeLifeExpectancy", () => {
  test("is in [45, 90] at baseline", () => {
    const le = computeLifeExpectancy(baselineLevers());
    expect(le).toBeGreaterThanOrEqual(45);
    expect(le).toBeLessThanOrEqual(90);
  });

  test("NEVER exceeds 90 even with extreme inputs (bug fix regression test)", () => {
    const leExtreme = computeLifeExpectancy(extremeLevers());
    const leCrazy = computeLifeExpectancy(crazyLevers());
    expect(leExtreme).toBeLessThanOrEqual(90);
    expect(leCrazy).toBeLessThanOrEqual(90);
  });

  test("NEVER drops below 45 (formula floor)", () => {
    const empty: Levers = {};
    const floor = computeLifeExpectancy(empty);
    expect(floor).toBeGreaterThanOrEqual(45);
  });

  test("rises when hospital_beds_per_1k increases", () => {
    const base = computeLifeExpectancy(baselineLevers());
    const raised = computeLifeExpectancy(leversWith({ hospital_beds_per_1k: 6 }));
    expect(raised).toBeGreaterThan(base);
  });

  test("rises when doctors_per_1k increases", () => {
    const base = computeLifeExpectancy(baselineLevers());
    const raised = computeLifeExpectancy(leversWith({ doctors_per_1k: 4 }));
    expect(raised).toBeGreaterThan(base);
  });

  test("baseline ≈ 73 (Morocco real value)", () => {
    const le = computeLifeExpectancy(baselineLevers());
    expect(le).toBeGreaterThan(70);
    expect(le).toBeLessThan(76);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  HDI — clamped to [0, 1] (bug we fixed)
// ──────────────────────────────────────────────────────────────────────────

describe("computeHDI", () => {
  test("is in [0, 1] at baseline", () => {
    const hdi = computeHDI(baselineLevers());
    expect(hdi).toBeGreaterThanOrEqual(0);
    expect(hdi).toBeLessThanOrEqual(1);
  });

  test("NEVER exceeds 1 even with crazy out-of-range inputs (bug fix regression test)", () => {
    const hdiCrazy = computeHDI(crazyLevers());
    const hdiExtreme = computeHDI(extremeLevers());
    expect(hdiCrazy).toBeLessThanOrEqual(1);
    expect(hdiExtreme).toBeLessThanOrEqual(1);
  });

  test("NEVER drops below 0", () => {
    const empty: Levers = {};
    const hdi = computeHDI(empty);
    expect(hdi).toBeGreaterThanOrEqual(0);
  });

  test("baseline HDI ≈ 0.74 (Morocco real value)", () => {
    const hdi = computeHDI(baselineLevers());
    expect(hdi).toBeGreaterThan(0.6);
    expect(hdi).toBeLessThan(0.85);
  });

  test("rises when education enrollment rises", () => {
    const base = computeHDI(baselineLevers());
    const raised = computeHDI(
      leversWith({ primary_enrollment: 100, secondary_enrollment: 95, tertiary_enrollment: 80 }),
    );
    expect(raised).toBeGreaterThan(base);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  Gini — clamped to [0.2, 0.7]
// ──────────────────────────────────────────────────────────────────────────

describe("computeGini", () => {
  test("is in [0.2, 0.7] at baseline", () => {
    const g = computeGini(baselineLevers(), 9.5);
    expect(g).toBeGreaterThanOrEqual(0.2);
    expect(g).toBeLessThanOrEqual(0.7);
  });

  test("stays in [0.2, 0.7] under extreme inputs (clamp holds)", () => {
    const g = computeGini(crazyLevers(), 50);
    expect(g).toBeGreaterThanOrEqual(0.2);
    expect(g).toBeLessThanOrEqual(0.7);
  });

  test("falls when social_programs_budget rises (redistribution)", () => {
    const base = computeGini(baselineLevers(), 9.5);
    const raised = computeGini(leversWith({ social_programs_budget: 80 }), 9.5);
    expect(raised).toBeLessThan(base);
  });

  test("baseline ≈ 0.40 (Morocco real value)", () => {
    const g = computeGini(baselineLevers(), 9.5);
    expect(g).toBeGreaterThan(0.35);
    expect(g).toBeLessThan(0.45);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  Balance of trade, poverty, stability, revolution risk
// ──────────────────────────────────────────────────────────────────────────

describe("computeBalanceOfTrade", () => {
  test("returns a finite number at baseline (likely negative — Morocco is a net importer)", () => {
    const bot = computeBalanceOfTrade(baselineLevers());
    expect(Number.isFinite(bot)).toBe(true);
    // Morocco runs a trade deficit (~-160 Mrd MAD baseline)
    expect(bot).toBeGreaterThan(-500);
    expect(bot).toBeLessThan(500);
  });

  test("improves (less negative) when MAD weakens (exports cheaper)", () => {
    const base = computeBalanceOfTrade(baselineLevers());
    const weak = computeBalanceOfTrade(leversWith({ exchange_rate: 14 }));
    expect(weak).toBeGreaterThan(base);
  });
});

describe("computePovertyRate", () => {
  test("is in [0.5, 40] at baseline (formula clamp)", () => {
    const p = computePovertyRate(baselineLevers(), 0.4, 9.5);
    expect(p).toBeGreaterThanOrEqual(0.5);
    expect(p).toBeLessThanOrEqual(40);
  });

  test("falls when minimum_income_guarantee rises", () => {
    const base = computePovertyRate(baselineLevers(), 0.4, 9.5);
    const raised = computePovertyRate(leversWith({ minimum_income_guarantee: 2000 }), 0.4, 9.5);
    expect(raised).toBeLessThan(base);
  });
});

describe("computeStability", () => {
  test("is in [0, 100] at baseline", () => {
    const s = computeStability(9.5, 2, 60, 73, 0.74, 0.40, 4.8);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });

  test("is higher when unemployment is low", () => {
    const low = computeStability(5, 2, 60, 73, 0.74, 0.40, 4.8);
    const high = computeStability(25, 2, 60, 73, 0.74, 0.40, 4.8);
    expect(low).toBeGreaterThan(high);
  });

  test("stays in [0, 100] under extreme inputs", () => {
    const s = computeStability(50, 50, 300, 90, 1, 0.7, 40);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
});

describe("computeRevolutionRisk", () => {
  test("is in [0, 100] at baseline", () => {
    const r = computeRevolutionRisk(9.5, 2, 0.40, 4.8, 70);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(100);
  });

  test("rises with unemployment", () => {
    const low = computeRevolutionRisk(5, 2, 0.40, 4.8, 70);
    const high = computeRevolutionRisk(25, 2, 0.40, 4.8, 70);
    expect(high).toBeGreaterThan(low);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  computeAllIndicators — the full pipeline
// ──────────────────────────────────────────────────────────────────────────

describe("computeAllIndicators", () => {
  test("returns all 15 indicators at baseline", () => {
    const inds = computeAllIndicators(
      baselineLevers(),
      MACRO_CONSTANTS.gdp_baseline_mrd_mad,
      MACRO_CONSTANTS.debt_baseline_mrd_mad,
    );
    const keys = Object.keys(inds);
    expect(keys.length).toBe(16); // 15 indicators + public_spending (extra)
    // Canonical indicators present
    const required = [
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
    for (const id of required) {
      expect(keys).toContain(id);
      expect(Number.isFinite((inds as any)[id])).toBe(true);
    }
  });

  test("every indicator is finite (no NaN, no Infinity)", () => {
    const inds = computeAllIndicators(
      baselineLevers(),
      MACRO_CONSTANTS.gdp_baseline_mrd_mad,
      MACRO_CONSTANTS.debt_baseline_mrd_mad,
    );
    for (const [k, v] of Object.entries(inds)) {
      expect(Number.isFinite(v as number)).toBe(true);
    }
  });

  test("life_expectancy is clamped to ≤ 90 even with extreme inputs", () => {
    const inds = computeAllIndicators(crazyLevers(), 1, 1);
    expect(inds.life_expectancy).toBeLessThanOrEqual(90);
  });

  test("hdi is clamped to ≤ 1 even with extreme inputs", () => {
    const inds = computeAllIndicators(crazyLevers(), 1, 1);
    expect(inds.hdi).toBeLessThanOrEqual(1);
  });

  test("gini is clamped to [0.2, 0.7] even with extreme inputs", () => {
    const inds = computeAllIndicators(crazyLevers(), 1, 1);
    expect(inds.gini).toBeGreaterThanOrEqual(0.2);
    expect(inds.gini).toBeLessThanOrEqual(0.7);
  });

  test("unemployment is non-negative even with extreme inputs", () => {
    const inds = computeAllIndicators(crazyLevers(), 1000, 1);
    expect(inds.unemployment).toBeGreaterThanOrEqual(0);
  });

  test("raising hospital_beds_per_1k raises life_expectancy in the full pipeline", () => {
    const base = computeAllIndicators(
      baselineLevers(),
      MACRO_CONSTANTS.gdp_baseline_mrd_mad,
      MACRO_CONSTANTS.debt_baseline_mrd_mad,
    );
    const raised = computeAllIndicators(
      leversWith({ hospital_beds_per_1k: 6 }),
      MACRO_CONSTANTS.gdp_baseline_mrd_mad,
      MACRO_CONSTANTS.debt_baseline_mrd_mad,
    );
    expect(raised.life_expectancy).toBeGreaterThan(base.life_expectancy);
  });

  test("raising public_investment raises GDP in the full pipeline", () => {
    const base = computeAllIndicators(
      baselineLevers(),
      MACRO_CONSTANTS.gdp_baseline_mrd_mad,
      MACRO_CONSTANTS.debt_baseline_mrd_mad,
    );
    const raised = computeAllIndicators(
      leversWith({ public_investment: 400 }),
      MACRO_CONSTANTS.gdp_baseline_mrd_mad,
      MACRO_CONSTANTS.debt_baseline_mrd_mad,
    );
    expect(raised.gdp).toBeGreaterThan(base.gdp);
  });
});
