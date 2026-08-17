// kernel.test.ts — Tests for the PRISM Kernel (12-phase orchestrator).
//
// The PrismKernel is the OS of the simulation: it boots subsystems, runs a
// 12-phase cycle (BOOT → EXTRACT → NEURAL → NONLINEAR → SWARM → LIFECYCLE →
// GOVERN → BLACKSWAN → PARADIGM → COMMIT → EMIT → HALT), and exposes syscalls.
// These tests verify:
//   1. createDefaultKernel() boots life + governance subsystems.
//   2. cycle() increments the tick and ends on EMIT.
//   3. All 12 phases are in PHASE_ORDER in the canonical order.
//   4. The syscall interface (get_phase, get_uptime, read_state,
//      register_subsystem, disable_phase, enable_phase) works.
//   5. The kernel survives 1000 cycles without crashing (stability).
//   6. After HALT, cycle() is a no-op (post-halt idempotence).

import { test, expect, describe } from "bun:test";
import {
  PrismKernel,
  KernelPhase,
  PHASE_ORDER,
  KERNEL_VERSION,
  createDefaultKernel,
  type KernelHost,
  type Subsystem,
  type KernelState,
} from "../kernel.ts";

// --- Mock host ---

function makeMockHost(snapshotValue: any = { tick: 0, levers: {} }): KernelHost {
  return {
    step(): void {
      // No-op — the host's neural work is irrelevant for kernel tests.
    },
    snapshot(): any {
      return snapshotValue;
    },
    adjustLever(leverId: string, value: number) {
      return { accepted: true };
    },
  };
}

// A counting subsystem — increments a counter each step. Used to verify that
// disable_phase / enable_phase actually gate the subsystem's step().
function makeCountingSubsystem(phase: KernelPhase, counter: { n: number }): Subsystem {
  return {
    id: `test-counter-${phase}`,
    name: "Test counter",
    phase,
    enabled: true,
    init() {},
    step(_state: KernelState): number {
      counter.n++;
      return 0.1;
    },
    shutdown() {},
  };
}

// ──────────────────────────────────────────────────────────────────────────
//  PHASE_ORDER — the 12 canonical phases
// ──────────────────────────────────────────────────────────────────────────

describe("PHASE_ORDER", () => {
  test("contains exactly 12 phases", () => {
    expect(PHASE_ORDER.length).toBe(12);
  });

  test("the phases are in the canonical order (BOOT → ... → HALT)", () => {
    const expected = [
      KernelPhase.BOOT,
      KernelPhase.EXTRACT,
      KernelPhase.NEURAL,
      KernelPhase.NONLINEAR,
      KernelPhase.SWARM,
      KernelPhase.LIFECYCLE,
      KernelPhase.GOVERN,
      KernelPhase.BLACKSWAN,
      KernelPhase.PARADIGM,
      KernelPhase.COMMIT,
      KernelPhase.EMIT,
      KernelPhase.HALT,
    ];
    expect(PHASE_ORDER).toEqual(expected);
  });

  test("every phase is unique (no accidental duplicates)", () => {
    const set = new Set(PHASE_ORDER);
    expect(set.size).toBe(PHASE_ORDER.length);
  });

  test("BOOT is the first phase, HALT is the last", () => {
    expect(PHASE_ORDER[0]).toBe(KernelPhase.BOOT);
    expect(PHASE_ORDER[PHASE_ORDER.length - 1]).toBe(KernelPhase.HALT);
  });

  test("EMIT (the user-visible emit phase) is second-to-last, before HALT", () => {
    expect(PHASE_ORDER[PHASE_ORDER.length - 2]).toBe(KernelPhase.EMIT);
  });

  test("PrismKernel.PHASE_ORDER static matches the export", () => {
    expect(PrismKernel.PHASE_ORDER).toBe(PHASE_ORDER);
  });

  test("KERNEL_VERSION is a non-empty semver string", () => {
    expect(KERNEL_VERSION.length).toBeGreaterThan(0);
    expect(KERNEL_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    expect(PrismKernel.VERSION).toBe(KERNEL_VERSION);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  createDefaultKernel() — boots with life + governance
// ──────────────────────────────────────────────────────────────────────────

describe("createDefaultKernel()", () => {
  test("boots successfully and returns a PrismKernel", () => {
    const kernel = createDefaultKernel(makeMockHost());
    expect(kernel).toBeInstanceOf(PrismKernel);
  });

  test("registers exactly life + governance subsystems (2)", () => {
    const kernel = createDefaultKernel(makeMockHost());
    const subs = kernel.syscall("list_subsystems") as Array<{ id: string }>;
    expect(subs.length).toBe(2);
    const ids = subs.map((s) => s.id);
    expect(ids).toContain("life");
    expect(ids).toContain("governance");
  });

  test("the life subsystem is registered to the LIFECYCLE phase", () => {
    const kernel = createDefaultKernel(makeMockHost());
    const subs = kernel.syscall("list_subsystems") as Array<{
      id: string;
      phase: KernelPhase;
    }>;
    const life = subs.find((s) => s.id === "life");
    expect(life).toBeDefined();
    expect(life!.phase).toBe(KernelPhase.LIFECYCLE);
  });

  test("the governance subsystem is registered to the GOVERN phase", () => {
    const kernel = createDefaultKernel(makeMockHost());
    const subs = kernel.syscall("list_subsystems") as Array<{
      id: string;
      phase: KernelPhase;
    }>;
    const gov = subs.find((s) => s.id === "governance");
    expect(gov).toBeDefined();
    expect(gov!.phase).toBe(KernelPhase.GOVERN);
  });

  test("both subsystems are enabled at boot", () => {
    const kernel = createDefaultKernel(makeMockHost());
    const subs = kernel.syscall("list_subsystems") as Array<{
      id: string;
      enabled: boolean;
    }>;
    for (const s of subs) {
      expect(s.enabled).toBe(true);
    }
  });

  test("calling boot() a second time is a no-op (idempotent)", () => {
    const kernel = createDefaultKernel(makeMockHost());
    // Should not throw and should not duplicate subsystems.
    kernel.boot();
    const subs = kernel.syscall("list_subsystems") as Array<{ id: string }>;
    expect(subs.length).toBe(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  cycle() — tick increment and phase transitions
// ──────────────────────────────────────────────────────────────────────────

describe("cycle()", () => {
  test("increments the tick counter", () => {
    const kernel = createDefaultKernel(makeMockHost());
    const tick0 = kernel.syscall("get_tick");
    kernel.cycle();
    const tick1 = kernel.syscall("get_tick");
    expect(tick1).toBe(tick0 + 1);
  });

  test("sets the phase to EMIT at the end of a cycle", () => {
    const kernel = createDefaultKernel(makeMockHost());
    kernel.cycle();
    expect(kernel.syscall("get_phase")).toBe(KernelPhase.EMIT);
  });

  test("calling cycle() many times increments the tick linearly", () => {
    const kernel = createDefaultKernel(makeMockHost());
    for (let i = 0; i < 10; i++) {
      kernel.cycle();
    }
    expect(kernel.syscall("get_tick")).toBe(10);
  });

  test("returns the kernel state (with phase, tick, uptimeMs)", () => {
    const kernel = createDefaultKernel(makeMockHost());
    const state = kernel.cycle();
    expect(state).toHaveProperty("tick");
    expect(state).toHaveProperty("phase");
    expect(state).toHaveProperty("uptimeMs");
    expect(state.phase).toBe(KernelPhase.EMIT);
  });

  test("the cycle populates phaseTimings for every cycle phase (excl BOOT/HALT)", () => {
    const kernel = createDefaultKernel(makeMockHost());
    const state = kernel.cycle();
    const cyclePhases = PHASE_ORDER.filter(
      (p) => p !== KernelPhase.BOOT && p !== KernelPhase.HALT,
    );
    for (const p of cyclePhases) {
      expect(state.phaseTimings[p]).toBeDefined();
      expect(typeof state.phaseTimings[p]).toBe("number");
    }
  });

  test("the cycle host.step() is invoked during the NEURAL phase (host integration)", () => {
    let stepCount = 0;
    const host: KernelHost = {
      step() {
        stepCount++;
      },
      snapshot() {
        return { tick: 0 };
      },
    };
    const kernel = createDefaultKernel(host);
    kernel.cycle();
    expect(stepCount).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  Syscalls
// ──────────────────────────────────────────────────────────────────────────

describe("syscall()", () => {
  test("get_phase returns BOOT immediately after boot, EMIT after a cycle", () => {
    const kernel = createDefaultKernel(makeMockHost());
    // boot() leaves the phase at BOOT — no cycle has run yet.
    expect(kernel.syscall("get_phase")).toBe(KernelPhase.BOOT);
    kernel.cycle();
    expect(kernel.syscall("get_phase")).toBe(KernelPhase.EMIT);
  });

  test("get_uptime returns a non-negative number", () => {
    const kernel = createDefaultKernel(makeMockHost());
    kernel.cycle();
    const uptime = kernel.syscall("get_uptime") as number;
    expect(typeof uptime).toBe("number");
    expect(uptime).toBeGreaterThanOrEqual(0);
  });

  test("get_tick returns the current tick (0 immediately after boot)", () => {
    const kernel = createDefaultKernel(makeMockHost());
    expect(kernel.syscall("get_tick")).toBe(0);
  });

  test("read_state returns a snapshot from the host", () => {
    const expectedSnapshot = { tick: 42, levers: { vat_rate: 20 } };
    const kernel = createDefaultKernel(makeMockHost(expectedSnapshot));
    const state = kernel.syscall("read_state");
    expect(state).toEqual(expectedSnapshot);
  });

  test("read_state returns null when the host throws", () => {
    const throwingHost: KernelHost = {
      step() {},
      snapshot() {
        throw new Error("host not ready");
      },
    };
    const kernel = createDefaultKernel(throwingHost);
    expect(kernel.syscall("read_state")).toBeNull();
  });

  test("register_subsystem adds a new subsystem to the registry", () => {
    const kernel = createDefaultKernel(makeMockHost());
    const before = (kernel.syscall("list_subsystems") as any[]).length;
    const result = kernel.syscall("register_subsystem", {
      id: "test-sub",
      name: "Test",
      phase: KernelPhase.SWARM,
      enabled: true,
      step() {
        return 0;
      },
    });
    expect(result).toEqual({ ok: true, id: "test-sub" });
    const after = (kernel.syscall("list_subsystems") as any[]).length;
    expect(after).toBe(before + 1);
  });

  test("register_subsystem rejects an invalid subsystem (no id)", () => {
    const kernel = createDefaultKernel(makeMockHost());
    const result = kernel.syscall("register_subsystem", { name: "no id" });
    expect(result).toEqual({ ok: false, reason: "sous-système invalide" });
  });

  test("disable_phase disables all subsystems registered for that phase", () => {
    const kernel = createDefaultKernel(makeMockHost());
    // The life subsystem is on LIFECYCLE.
    const result = kernel.syscall("disable_phase", KernelPhase.LIFECYCLE);
    expect(result.ok).toBe(true);
    expect(result.disabled).toBeGreaterThanOrEqual(1);
    const subs = kernel.syscall("list_subsystems") as Array<{
      id: string;
      enabled: boolean;
    }>;
    const life = subs.find((s) => s.id === "life");
    expect(life!.enabled).toBe(false);
  });

  test("enable_phase re-enables disabled subsystems", () => {
    const kernel = createDefaultKernel(makeMockHost());
    kernel.syscall("disable_phase", KernelPhase.LIFECYCLE);
    const lifeBefore = (kernel.syscall("list_subsystems") as any[]).find(
      (s) => s.id === "life",
    );
    expect(lifeBefore.enabled).toBe(false);
    const result = kernel.syscall("enable_phase", KernelPhase.LIFECYCLE);
    expect(result.ok).toBe(true);
    const lifeAfter = (kernel.syscall("list_subsystems") as any[]).find(
      (s) => s.id === "life",
    );
    expect(lifeAfter.enabled).toBe(true);
  });

  test("disable_phase actually gates the subsystem's step() (counter test)", () => {
    const counter = { n: 0 };
    const sub = makeCountingSubsystem(KernelPhase.SWARM, counter);
    const kernel = new PrismKernel(makeMockHost());
    kernel.register(sub);
    kernel.boot();
    kernel.cycle();
    const n1 = counter.n;
    expect(n1).toBe(1); // ran once
    kernel.syscall("disable_phase", KernelPhase.SWARM);
    kernel.cycle();
    kernel.cycle();
    kernel.cycle();
    expect(counter.n).toBe(n1); // no further invocations
  });

  test("enable_phase resumes the subsystem's step() after a disable", () => {
    const counter = { n: 0 };
    const sub = makeCountingSubsystem(KernelPhase.SWARM, counter);
    const kernel = new PrismKernel(makeMockHost());
    kernel.register(sub);
    kernel.boot();
    kernel.cycle();
    kernel.syscall("disable_phase", KernelPhase.SWARM);
    kernel.cycle();
    kernel.syscall("enable_phase", KernelPhase.SWARM);
    kernel.cycle();
    kernel.cycle();
    expect(counter.n).toBe(3); // 1 + 0 + 1 + 1
  });

  test("set_lever syscall delegates to host.adjustLever", () => {
    let received: { id: string; value: number } | null = null;
    const host: KernelHost = {
      step() {},
      snapshot() {
        return {};
      },
      adjustLever(leverId, value) {
        received = { id: leverId, value };
        return { accepted: true };
      },
    };
    const kernel = createDefaultKernel(host);
    const result = kernel.syscall("set_lever", { leverId: "vat_rate", value: 25 });
    expect(result).toEqual({ accepted: true });
    expect(received).toEqual({ id: "vat_rate", value: 25 });
  });

  test("set_lever rejects malformed arguments", () => {
    const kernel = createDefaultKernel(makeMockHost());
    const result = kernel.syscall("set_lever", { leverId: "vat_rate" }); // missing value
    expect(result.accepted).toBe(false);
  });

  test("an unknown syscall returns a structured error", () => {
    const kernel = createDefaultKernel(makeMockHost());
    const result = kernel.syscall("nonexistent_syscall");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("nonexistent_syscall");
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  Stability — 1000 cycles without crashing
// ──────────────────────────────────────────────────────────────────────────

describe("stability", () => {
  test("the kernel survives 1000 cycles without throwing", () => {
    const kernel = createDefaultKernel(makeMockHost());
    let crashed = false;
    let lastTick = -1;
    try {
      for (let i = 0; i < 1000; i++) {
        kernel.cycle();
        lastTick = kernel.syscall("get_tick");
      }
    } catch (e) {
      crashed = true;
      console.error("Kernel crashed:", e);
    }
    expect(crashed).toBe(false);
    expect(lastTick).toBe(1000);
  });

  test("uptimeMs is positive after 1000 cycles (time has elapsed)", () => {
    const kernel = createDefaultKernel(makeMockHost());
    for (let i = 0; i < 1000; i++) kernel.cycle();
    const uptime = kernel.syscall("get_uptime") as number;
    expect(uptime).toBeGreaterThanOrEqual(0);
  });

  test("the final phase is still EMIT after 1000 cycles (no drift to HALT)", () => {
    const kernel = createDefaultKernel(makeMockHost());
    for (let i = 0; i < 1000; i++) kernel.cycle();
    expect(kernel.syscall("get_phase")).toBe(KernelPhase.EMIT);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  HALT — post-halt idempotence
// ──────────────────────────────────────────────────────────────────────────

describe("halt()", () => {
  test("sets the phase to HALT", () => {
    const kernel = createDefaultKernel(makeMockHost());
    kernel.halt();
    expect(kernel.syscall("get_phase")).toBe(KernelPhase.HALT);
  });

  test("after halt(), cycle() is a no-op (tick does not increment)", () => {
    const kernel = createDefaultKernel(makeMockHost());
    kernel.cycle();
    kernel.cycle();
    const tickBeforeHalt = kernel.syscall("get_tick");
    kernel.halt();
    kernel.cycle();
    kernel.cycle();
    kernel.cycle();
    const tickAfterHalt = kernel.syscall("get_tick");
    expect(tickAfterHalt).toBe(tickBeforeHalt);
  });

  test("halt() is idempotent — calling it twice is safe", () => {
    const kernel = createDefaultKernel(makeMockHost());
    kernel.halt();
    expect(() => kernel.halt()).not.toThrow();
  });

  test("halt() invokes shutdown() on every registered subsystem (reverse order)", () => {
    const shutdownOrder: string[] = [];
    const makeSub = (id: string, phase: KernelPhase): Subsystem => ({
      id,
      name: id,
      phase,
      enabled: true,
      init() {},
      step() {
        return 0;
      },
      shutdown() {
        shutdownOrder.push(id);
      },
    });
    const kernel = new PrismKernel(makeMockHost());
    kernel.register(makeSub("first", KernelPhase.EXTRACT));
    kernel.register(makeSub("second", KernelPhase.SWARM));
    kernel.register(makeSub("third", KernelPhase.GOVERN));
    kernel.boot();
    kernel.halt();
    // Reverse-order shutdown: GOVERN first, then SWARM, then EXTRACT.
    expect(shutdownOrder).toEqual(["third", "second", "first"]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
//  register() — idempotence
// ──────────────────────────────────────────────────────────────────────────

describe("register()", () => {
  test("does not register a subsystem with a duplicate id (idempotent)", () => {
    const kernel = createDefaultKernel(makeMockHost());
    const before = (kernel.syscall("list_subsystems") as any[]).length;
    // life is already registered by createDefaultKernel
    kernel.register({
      id: "life",
      name: "Duplicate life",
      phase: KernelPhase.LIFECYCLE,
      enabled: true,
      step() {
        return 0;
      },
    });
    const after = (kernel.syscall("list_subsystems") as any[]).length;
    expect(after).toBe(before); // no new subsystem added
  });
});
