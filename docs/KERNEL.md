# PRISM — Kernel Specification

> The Kernel is the heartbeat. It formalizes the simulation as an operating
> system: a scheduler that runs subsystems through a 12-phase lifecycle every
> 200ms, manages memory (the state), and exposes a syscall surface. The engine
> that existed before the Kernel did the work; the Kernel gives that work a
> structure that can be reasoned about, extended, and observed.
>
> This document specifies the Kernel as built in
> `mini-services/simulation-engine/kernel.ts`. The Life and Governance
> subsystems (`life.ts`, `governance.ts`) are the first registered tenants.
> The architecture is designed to accept more.

---

## Why a Kernel

The original engine (`engine.ts`) is a monolith: one `step()` method does
everything — neural forward pass, non-linear transforms, agent swarm update,
black swan roll, paradigm application — in sequence, every 200ms. This works,
but it cannot be reasoned about at the level of phases. There is no concept
of "the extraction phase" or "the governance phase" because there are no
phases, only one undifferentiated step.

The Kernel introduces phases. A phase is a named stage of the tick cycle
with a defined order, a set of registered subsystems, and a measured timing.
This makes the engine observable in a new way: you can ask "how long did the
lifecycle phase take last tick?" and get an answer. You can disable a phase
to isolate a bug. You can register a new subsystem without touching the
engine.

The Kernel does not replace the engine. It wraps it. The engine's `step()`
runs during the NEURAL phase (the engine handles neural + nonlinear + swarm
+ blackswan internally). The new phases — LIFECYCLE and GOVERN — run the
new subsystems. The other phases are no-ops unless subsystems register for
them.

---

## The 12 phases

Executed in this order, every tick:

| # | Phase | Purpose | Default tenant |
|---|---|---|---|
| 01 | `BOOT` | Initialization, subsystem registration | (once, at startup) |
| 02 | `EXTRACT` | NLP causal extraction (if a new document is queued) | causal-extractor.ts (on demand) |
| 03 | `NEURAL` | Forward pass of the neural network | engine.step() (the host) |
| 04 | `NONLINEAR` | The 7 non-linear transforms | (inside host.step()) |
| 05 | `SWARM` | Agent swarm update | (inside host.step()) |
| 06 | `LIFECYCLE` | Demographics: birth, aging, reproduction, death | life.ts |
| 07 | `GOVERN` | State management: budget, services, corruption | governance.ts |
| 08 | `BLACKSWAN` | Black swan crisis rolls | (inside host.step()) |
| 09 | `PARADIGM` | Political regime application | paradigm.ts (on change) |
| 10 | `COMMIT` | State persistence (optional, throttled) | — |
| 11 | `EMIT` | Snapshot broadcast to clients | Socket.io emit |
| 12 | `HALT` | Clean shutdown | (on termination) |

### Phase ordering rationale

The order follows the data flow: extraction feeds the graph, the graph feeds
the neural network, the network feeds the non-linear layers, those feed the
swarm, the swarm exists within a living population (lifecycle), the
population is governed (govern), crises strike (blackswan), the political
regime modulates everything (paradigm), then the state is committed and
emitted.

LIFECYCLE and GOVERN sit between SWARM and BLACKSWAN because demographic and
governance changes are slower than agent-stress changes but faster than
crisis triggers. A demographic shock (a youth bulge reaching working age)
should be visible to the black-swan engine in the same tick it occurs.

### Phase timings

Each phase records its execution time in milliseconds. The `KernelState`
carries a `phaseTimings: Record<KernelPhase, number>` that is refreshed every
tick. On the reference hardware (documented in TELEMETRY.md):

| Phase | Typical time |
|---|---|
| EXTRACT | 0ms (no-op unless queued) |
| NEURAL (full host.step) | 5–13ms |
| LIFECYCLE | 1–3ms |
| GOVERN | 0.5–1.5ms |
| BLACKSWAN | 0.1–0.5ms (inside host) |
| EMIT | 0.5–2ms |
| **Total** | **7–20ms** |

Headroom against the 200ms budget: ~90–96%. The Kernel never blocks; if a
phase overruns, the next tick is delayed, not skipped.

---

## The Subsystem interface

```typescript
interface Subsystem {
  id: string;
  name: string;
  phase: KernelPhase;
  enabled: boolean;
  init?(): void;                    // called once at BOOT
  step(state: KernelState): number; // called every tick during this phase
  shutdown?(): void;                // called once at HALT
}
```

A subsystem is the unit of extensibility. To add a new layer to the
simulation — say, a climate model, or a cultural-mood tracker — you
implement `Subsystem`, register it with the Kernel, and it runs every tick
in its declared phase. No other code changes.

The `step()` method returns a number: the milliseconds it took. This is
recorded in `phaseTimings`. A subsystem that returns a suspiciously large
number is flagged by the telemetry layer.

### Registered subsystems (v1.0.0)

1. **`life`** — `LifeSystem` (phase: LIFECYCLE). Demographics.
2. **`governance`** — `GovernanceSystem` (phase: GOVERN). State management.

The engine itself is not a registered subsystem — it is the host. The host's
`step()` is called directly during the NEURAL phase. This is a pragmatic
choice: the engine is too tightly coupled to refactor into discrete
subsystems in v1. A future version may register the neural network,
non-linear layer, and swarm as separate subsystems.

---

## The KernelState

```typescript
interface KernelState {
  tick: number;
  phase: KernelPhase;
  uptimeMs: number;
  phaseTimings: Record<KernelPhase, number>;
  subsystems: Subsystem[];
  booted: boolean;
  halted: boolean;
}
```

The `KernelState` is kernel bookkeeping — it is not the simulation state.
The simulation state (levers, indicators, swarm, threats) lives in the host
and is accessed via the `read_state` syscall. This separation keeps the
Kernel reusable: it can wrap any host that exposes `step()` and `snapshot()`.

---

## The syscall surface

The Kernel exposes 8 syscalls. A syscall is the only sanctioned way for an
external observer (a client, a test harness, another subsystem) to interact
with the Kernel.

```typescript
syscall("read_state") → Snapshot
```
Returns the host's current simulation snapshot. Read-only.

```typescript
syscall("set_lever", { leverId: string, value: number }) → void
```
Delegates to the host. Adjusts one of the 47 levers. The change is visible
on the next tick.

```typescript
syscall("get_phase") → KernelPhase
```
Returns the phase the Kernel is currently executing (or last executed).

```typescript
syscall("get_uptime") → number
```
Returns the Kernel's uptime in milliseconds since BOOT.

```typescript
syscall("register_subsystem", subsystem: Subsystem) → void
```
Dynamically registers a new subsystem. It will run on the next tick in its
declared phase.

```typescript
syscall("disable_phase", phase: KernelPhase) → void
```
Disables all subsystems registered for the given phase. The phase becomes a
no-op. Useful for debugging (isolate which phase causes a bug) and for
pausing expensive computation during interactive exploration.

```typescript
syscall("enable_phase", phase: KernelPhase) → void
```
Re-enables a disabled phase.

```typescript
syscall("get_timings") → Record<KernelPhase, number>
```
Returns the last tick's phase timings. The telemetry layer polls this.

### Syscall contract

Syscalls are synchronous. They do not block the tick loop — they either
return immediately (read operations) or mutate state that takes effect on
the next tick (write operations). There is no async syscall in v1.

A syscall that does not exist returns `undefined` and logs a warning. There
is no crash on unknown syscalls — the Kernel is resilient to probing.

---

## The lifecycle

### BOOT

Called once at startup. The Kernel:

1. Sorts registered subsystems by phase order.
2. Calls `init()` on each subsystem.
3. Sets `booted = true`, `tick = 0`, `uptimeMs = 0`.

After BOOT, the Kernel is ready to cycle. The first `cycle()` call will run
tick 1.

### cycle()

The heartbeat. One call = one tick. The Kernel:

1. Sets `phase = BOOT`-skip (BOOT only runs once).
2. For each phase in `PHASE_ORDER` (skipping BOOT and HALT):
   a. Sets `phase` to the current phase.
   b. Records the start time.
   c. If the phase is NEURAL, calls `host.step()` (the engine does all its
      internal work here).
   d. For each enabled subsystem registered for this phase, calls
      `subsystem.step(kernelState)`.
   e. Records the elapsed time in `phaseTimings[phase]`.
3. Increments `tick`.
4. Adds the elapsed time to `uptimeMs`.
5. Returns the `KernelState`.

### HALT

Called once at shutdown. The Kernel:

1. Calls `shutdown()` on each registered subsystem (in reverse phase order).
2. Sets `halted = true`.

After HALT, `cycle()` is a no-op. A halted Kernel cannot be restarted; a
new Kernel must be constructed.

---

## The factory

```typescript
function createDefaultKernel(host: { step(): void; snapshot(): any }): PrismKernel
```

Constructs a Kernel, registers the `LifeSystem` and `GovernanceSystem`
subsystems, calls `boot()`, and returns the ready Kernel. This is the
entry point used by the simulation engine server.

To extend the Kernel with a new subsystem:

```typescript
const kernel = createDefaultKernel(host);
kernel.register({
  id: "climate",
  name: "Climate Model",
  phase: KernelPhase.GOVERN,  // or a new phase
  enabled: true,
  step: (state) => { /* ... */ return elapsedMs; }
});
```

The new subsystem runs on the next tick. No other changes required.

---

## The Life subsystem

Specified in `life.ts`. Runs during LIFECYCLE.

### What it does

Each of the 10,000 agents gains a `DemographicProfile`:

- `age` (in years, increments every 12 ticks = 1 year)
- `stage` (INFANT, CHILD, STUDENT, WORKER, MATURE, RETIREE, ELDER, DECEASED)
- `householdId` (formed at STUDENT→WORKER transition)
- `childrenCount`, `parentId`
- `birthTick`, `deathTick`
- `educationLevel` (0–1, accumulated during STUDENT)
- `health` (0–1, declines with age, improved by healthcare)
- `fertility` (0–1, peaks during WORKER/MATURE)

### The cycle

Every tick (1 simulated month):

1. **Aging**: every 12 ticks, each living agent's age increments by 1.
2. **Stage transitions**: when age crosses a threshold, the stage updates.
3. **Mortality**: each agent has a death probability scaled by age and
   inverse health. Baseline: Morocco's crude death rate (~5/1000/year),
   age-scaled. A death sets `stage = DECEASED`, `deathTick = now`, and a
   replacement infant is born (population is stable).
4. **Reproduction**: WORKER/MATURE agents with fertility above threshold
   and a household have a small probability of producing a child. The
   child gets a new profile, `parentId` set, `childrenCount` incremented.
5. **Household formation**: STUDENT→WORKER transition agents form
   households.
6. **Education**: STUDENT agents accumulate `educationLevel`, affected by
   the education budget lever.
7. **Health**: declines with age, improved by the healthcare levers.

### Initial distribution

The 10,000 initial agents are generated with ages drawn from
`floor(r^1.5 × 80)` where `r` is a seeded random. This produces a
young-skewed pyramid matching Morocco's actual demographics: median age ~28,
more infants than elders. The distribution is reproducible (seeded RNG).

### Observability

- `getPopulationPyramid()` → array of `{ ageGroup, male, female }` for
  visualization.
- `getDemographicStats()` → `{ medianAge, birthRate, deathRate,
  dependencyRatio, populationGrowth }`.

---

## The Governance subsystem

Specified in `governance.ts`. Runs during GOVERN.

### What it does

The state is modeled as 8 ministries, each with:

- `allocatedBudget` (in Mrd MAD, total ~500 Mrd matching Morocco's budget)
- `spentBudget` (allocated × efficiency)
- `capacity` (0–1, bureaucratic capacity)
- `serviceQuality` (0–1, quality of service delivered)
- `efficiency` (0–1, ratio of budget that reaches the ground)
- `leakage` (0–1, fraction lost to corruption/inefficiency)

### The 8 ministries

| Ministry | Allocation | Color |
|---|---|---|
| Éducation | 75 Mrd (15%) | emerald |
| Santé | 35 Mrd (7%) | crimson |
| Infrastructure | 60 Mrd (12%) | orange |
| Intérieur | 40 Mrd (8%) | violet |
| Finances | 30 Mrd (6%) | amber |
| Défense | 30 Mrd (6%) | cyan |
| Agriculture | 40 Mrd (8%) | lime |
| Social | 190 Mrd (38%) | yellow |

### The cycle

Every tick:

1. **Allocation**: budget is distributed across ministries. The base
   allocation follows the table above. Paradigm shifts reallocate ±2–5%:
   liberalism favors infrastructure + defense; planned favors social +
   education; authoritarian favors interior + defense.
2. **Spending**: each ministry spends `allocatedBudget × efficiency`. The
   remainder is leakage.
3. **Service quality**: updates slowly. Spending above a reference threshold
   improves quality; below degrades it.
4. **Capacity drift**: high corruption reduces capacity over time; low
   corruption increases it. The `government_effectiveness` lever accelerates
   or decelerates this drift.
5. **Corruption**: leakage drifts toward the anti-corruption lever's target.
   A well-governed country sees leakage fall over simulated years; a poorly
   governed one sees it rise.

### Observability

- `getMinistries()` → the 8 ministry objects.
- `getGovernanceStats()` → `{ totalBudget, totalSpent, totalLeakage,
  avgCapacity, avgServiceQuality, avgEfficiency, corruptionIndex }`.
- `setAllocation(ministryId, fraction)` → reallocate (user-facing).

---

## Emergence

When the Kernel runs the Life subsystem through the Governance subsystem,
emergent patterns arise that are not coded:

- **Business cycles**: the interaction of ministry spending, agent income
  (via capital), and the neural network's GDP output produces oscillations
  that look like real business cycles — boom and bust on a 7–10 year
  simulated周期.
- **Political waves**: as demographic cohorts age (a youth bulge reaching
  STUDENT/WORKER), stress in the youth faction rises, trust in the regime
  falls, and political threat probabilities shift. This is not a coded
  rule — it emerges from the life stage transitions feeding the swarm.
- **Cultural shifts**: education level accumulated over a generation
  affects agent behavior transitions, which affects faction grievance,
  which affects political stability. The causality is long and indirect,
  and the result is emergent.

The `emergence` visualization renders this: a wave-field of 800+ dots
whose positions are sums of sine waves, with three labels — "business
cycle", "political wave", "cultural shift" — placed at organic positions.
The pattern is not coded; it arises from the superposition of simple rules.

> La vie n'est pas simulée. Elle émerge.

---

## Versioning

`KERNEL_VERSION = "1.0.0"`. The Kernel follows semantic versioning:

- **MAJOR**: a change to the syscall surface or the KernelState shape.
- **MINOR**: a new phase or a new registered subsystem.
- **PATCH**: timing or implementation improvements.

The phase enum is append-only: new phases are added at the end of
`PHASE_ORDER` and do not reorder existing phases. A subsystem registered
for a removed phase is logged and skipped, not crashed.

---

## Reference

- Implementation: `mini-services/simulation-engine/kernel.ts`
- Life subsystem: `mini-services/simulation-engine/life.ts`
- Governance subsystem: `mini-services/simulation-engine/governance.ts`
- Engine (the host): `mini-services/simulation-engine/engine.ts`
- Telemetry contract: [docs/TELEMETRY.md](./TELEMETRY.md)
- Ubiquitous language: [docs/GLOSSARY.md](./GLOSSARY.md)
- Research methodology: [RESEARCH.md](./RESEARCH.md)
