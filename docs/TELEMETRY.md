# PRISM — Telemetry

> The observable signals of the PRISM simulation engine. This document
> specifies what the engine emits, at what cadence, on what channel, and
> what each signal means. It is the contract between the engine and any
> client (the Next.js frontend, a future CLI, a headless backtester).
>
> Inspired by vendor-neutral telemetry contracts: the engine emits structured
> events; consumers decide what to persist, what to alert on, and what to
> display. The engine has no opinion about its observers.

---

## Channels

The engine communicates over a single Socket.io connection at path `/`
routed through the Caddy gateway via `?XTransformPort=3003`.

| Channel | Direction | Cadence | Purpose |
|---|---|---|---|
| `init` | server → client | once per connection | Full bootstrap payload |
| `state` | server → client | every 200ms (tick) | Incremental state snapshot |
| `decree-result` | server → client | on demand | Parsed decree output |
| `projection-result` | server → client | on demand | 2-year forward projection |
| `learn-result` | server → client | on demand | Backpropagation outcome |
| `set-lever` | client → server | on user action | Adjust a lever |
| `execute-decree` | client → server | on user action | Parse + apply a decree |
| `project-decree` | client → server | on user action | Parse + project (no apply) |
| `learn` | client → server | on user action | Force a training step |
| `reset` | client → server | on user action | Reset to baseline |
| `set-paradigm` | client → server | on user action | Switch regime |

---

## The tick

The engine runs a fixed 200ms loop (`TICK_MS = 200` in `index.ts`). Each
iteration:

1. `engine.step()` advances all layers in order: neural forward pass →
   non-linear transforms → agent swarm update → black swan roll →
   paradigm application.
2. `engine.snapshot()` serializes the full state.
3. `io.emit("state", snapshot)` broadcasts to all connected clients.

The tick is the heartbeat. Every signal below is either emitted on the tick
or in response to a client-initiated event. There is no other source of
engine output.

### Tick budget

The 200ms budget is soft. A tick that overruns does not skip; it delays the
next tick. In practice, a 10,000-agent swarm update plus a neural forward
pass completes in 5–15ms on the reference hardware, leaving comfortable
headroom. Sustained overrun indicates a pathological state (e.g., a cascade
that triggered millions of agent-behavior transitions) and should be
investigated, not silenced.

---

## The `init` payload

Emitted once on connection (and again after a `reset`). Contains everything
a client needs to render before the first tick:

```typescript
{
  levers: Lever[],          // 47 levers with current values
  indicators: Indicator[],  // 15 computed indicators
  categories: Category[],   // 8 category groupings
  edges: CausalEdge[],      // the causal graph
  state: SimState           // see below
}
```

A client that receives `init` can render the full UI. A client that receives
only `state` (because it connected mid-stream) must request a re-init or
reconstruct from the state alone.

---

## The `state` snapshot

Emitted every 200ms. The canonical observable of the system. Shape:

```typescript
interface SimState {
  tick: number;              // monotonic counter, starts at 0
  stability: number;         // 0–100, inverse of fragility
  instabilityRisk: number;   // 0–100, the fragility index
  indicators: {              // the 15 computed values
    gdp: number;             // in Mrd MAD
    gdpGrowth: number;       // percent
    gdpPerCapita: number;
    unemployment: number;    // percent
    inflation: number;       // percent
    debtToGdp: number;       // percent
    lifeExpectancy: number;  // years
    hdi: number;             // 0–1
    gini: number;            // 0–1
    // ... 6 more
  };
  swarm: {                   // aggregated from 10,000 agents
    avgTrust: number;        // 0–1
    avgStress: number;       // 0–1
    factionStress: Record<FactionId, number>;
    activeBehaviors: Record<Behavior, number>;
  };
  threats: {                 // political threat levels
    coupRisk: number;        // 0–1
    civilWarProbability: number;
    revolutionLikelihood: number;
    massExodusProbability: number;
    generalStrikeProbability: number;
  };
  activeCrises: Crisis[];    // currently-live black swans
  paradigm: ParadigmId;      // current regime
  lastEvent?: string;        // human-readable last action
}
```

Every field is derived, not invented. `stability` is computed from the
inverse of the fragility index. `avgTrust` is the mean of 10,000 agents'
trust values. `coupRisk` is aggregated from the swarm. If a field cannot be
computed, it is `null`, not `0` — `0` means "measured zero," `null` means
"not computed."

---

## Derived signals

These are not emitted by the engine; they are computed by the client from
the `state` stream. Documented here so all clients compute them the same way.

### Stability score
`stability = 100 − instabilityRisk`. A number `∈ [0,100]`. Displayed in the
left panel as "STABILITÉ 90 /100." When it drops below 50, the UI should
flag amber; below 25, crimson.

### Stress heatmap
For each faction, `factionStress[faction]`. The `agent-swarm` visualization
renders this as dot opacity: stress 0.3 → 32% opacity, 0.6 → 62%, 0.9+ →
100% with glow. The hot pockets are faction clusters where stress > 0.7.

### Threat ladder
The five threat probabilities, sorted descending. The highest one determines
the headline political risk shown in the UI. If `generalStrikeProbability`
is the max, the ticker reads "RISQUE DE GRÈVE GÉNÉRALE."

---

## Client-initiated events

### `set-lever`
```typescript
{ leverId: string, value: number }
```
Adjusts one of the 47 levers. The engine validates the value is within the
lever's defined range, recomputes on the next tick, and the `state` emit
reflects the change. No acknowledgement is sent beyond the next `state`.

### `execute-decree`
```typescript
{ text: string }
```
French-language decree text. The engine parses it via 38 NLP patterns,
computes lever deltas and fiscal cost, applies the changes, and emits a
`decree-result` event with the breakdown. The next `state` tick reflects
the applied levers.

### `project-decree`
```typescript
{ text: string }
```
Same as `execute-decree` but does NOT apply. Instead, runs a 2-year forward
simulation and emits `projection-result` with the indicator trajectories and
a verdict (`favorable`, `mitigé`, `défavorable`, `catastrophique`). Use this
to preview before committing.

### `learn`
```typescript
{ actual: Partial<Indicators> }
```
Forces a backpropagation step using real observed indicator data. The engine
computes the loss against its prediction, adjusts the 3,008 weights, and
emits `learn-result` with the loss before/after and whether the update was
accepted (rejected if loss increased beyond a threshold — a guard against
noise-driven drift).

### `set-paradigm`
```typescript
{ paradigm: ParadigmId }
```
Switches the political regime. Triggers a weight matrix rewrite (or, in the
current V1 implementation, a parameter mask — see RESEARCH.md §8.3). The
next `state` tick reflects the new paradigm and its effects ripple through
subsequent ticks.

### `reset`
No payload. Returns the engine to baseline lever values, clears active
crises, resets the swarm to initial trust/stress, and emits a fresh `init`.

---

## Persistence signals

The engine persists two kinds of state to SQLite via Prisma:

### `NeuralWeight`
A trained network snapshot. Written when a `learn` event produces an
accepted update. Fields include the weights JSON, normalization stats, epoch,
loss, and sample count. The latest snapshot is loaded on engine startup via
`model-loader.ts`; if none exists, the engine uses the formula-pre-trained
weights.

### `ExtractedEdge`
A causal edge extracted by the NLP pipeline. Written when
`/api/causal/extract` is called with a report URL. Each edge carries its
`sourceUrl`. The causal graph is the union of all `ExtractedEdge` records.

Neither table is written on the tick loop — only on explicit user actions.
The tick is ephemeral; persistence is intentional.

---

## Observability stance

PRISM is not an oracle. The telemetry above is the totality of what the
engine claims to know. A number in the `state` is a computation, not a
prediction of the future. The `verdict` on a projection is a classification
of a simulated trajectory, not a guarantee.

The honesty rules from GLOSSARY.md apply: if a signal cannot be computed
from the model, it is `null`. If a lever value cannot be sourced, it is a
bug. If an edge has no `sourceUrl`, it is a bug. The system does not
fabricate confidence it does not have.

---

## Reference hardware

The 200ms tick budget is calibrated for a single-process Bun runtime on a
modern machine. Observed on the reference sandbox:

| Phase | Typical time |
|---|---|
| Neural forward pass (47→32→32→15) | 0.3–0.8ms |
| Non-linear transforms (7 layers) | 0.1–0.3ms |
| Agent swarm update (10,000 agents) | 3–8ms |
| Black swan roll | 0.1–0.5ms |
| Snapshot serialization | 0.5–1.5ms |
| Socket.io broadcast | 0.5–2ms |
| **Total per tick** | **5–13ms** |

Headroom against the 200ms budget: ~93–97%. A tick that exceeds 50ms is a
signal that the swarm or a cascade has entered a pathological state.
