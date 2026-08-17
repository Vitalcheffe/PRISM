# PRISM — Glossary

> A ubiquitous language for the PRISM system. Every term below has exactly one
> meaning. When an agent, a contributor, or a policymaker uses one of these
> words inside a PRISM context, this is what they mean — not a synonym, not a
> paraphrase, not what the word means in a different model.
>
> This document exists because of the sycophancy problem. An LLM asked about a
> policy idea will agree with whatever framing it is given. A shared, pinned
> vocabulary is the defense: the terms are defined once, here, and they do not
> drift. If a word is not in this glossary, it does not have a technical
> meaning in PRISM and should be read as ordinary prose.
>
> Order: concepts are grouped by layer, roughly in the order data flows
> through the system. Cross-references are marked `(→ term)`.

---

## The domain

### Morocco
The simulated country. All 47 baseline lever values are real Moroccan data
from World Bank Open Data, the Loi de Finances 2023, Bank Al-Maghrib, the IMF
Article IV consultation, and UN PAGE. The simulator is not country-agnostic;
it is calibrated to one real economy.

### MUN
Model United Nations. The deployment context. PRISM is built to serve as a
reasoning instrument in MUN preparations and live sessions, where delegates
must defend policy positions under cross-examination. The quality bar is
"aerospace-grade software," not a game.

---

## Layer 01 — Extraction

### Lever
One of 47 quantitative policy inputs the user can adjust. Each lever has a
real baseline value, a unit, a category, and a source. A lever is never
computed; it is only set. Examples: `vat_rate`, `policy_rate`,
`hospital_beds_per_1000`. See `(→ Indicator)` for the contrast.

### Category
One of 8 groupings of the 47 levers: Economy, Health, Education,
Infrastructure, Governance, Environment, Social, Security. Each category
carries a color (Economy amber `#f59e0b`, Health crimson `#f43f5e`, etc.)
used consistently across every visualization.

### Indicator
One of 15 derived quantities the neural network computes from the 47 levers.
An indicator is never set by the user; it is always computed. Examples: `gdp`,
`unemployment`, `inflation`, `debt_to_gdp`, `life_expectancy`, `hdi`, `gini`.
The distinction between lever and indicator is absolute: GDP is an indicator,
not a lever, even though casual speech calls it a "variable."

### Causal Edge
A directed relationship between two variables (levers or indicators) with a
signed coefficient, a delay in months, a confidence score, and a provenance
URL. Edges are extracted by the `(→ NLP Causal Extractor)` from real reports
and persisted to SQLite as `ExtractedEdge` records. An edge is not a
formula — it is a learned, sourced, quantified relationship.

### NLP Causal Extractor
The pipeline (`mini-services/simulation-engine/causal-extractor.ts`) that
reads a report URL, sends the text to an LLM, and asks it to return
quantified causal edges. Each extracted edge carries its source URL. The
more documents fed, the denser the causal graph. Nothing here is hardcoded.

### ExtractedEdge
The Prisma model that persists a causal edge to SQLite. Fields: `source`,
`target`, `coefficient` (−1 to +1), `delayMonths`, `confidence` (0 to 1),
`rationale`, `sourceUrl`, `extractedAt`.

---

## Layer 02 — Neural Network

### Neural Network
The custom MLP (`mini-services/simulation-engine/neural-network.ts`) that
forward-passes the 47-lever vector into 15 indicator values. Topology:
47 → 32 → 32 → 15. 3,008 learnable weights (verified: 1,504 + 1,024 + 480).
No TensorFlow, no PyTorch — a from-scratch TypeScript implementation.

### Forward Pass
The computation `y = W₃·ReLU(W₂·ReLU(W₁·x + b₁)) + b₂) + b₃` that turns a
47-dimensional lever vector into a 15-dimensional indicator vector. Runs in
milliseconds on every tick.

### Weight
One of the 3,008 learnable parameters of the neural network. A weight is a
real number; its sign and magnitude encode how strongly one input influences
one hidden or output unit. Weights are initialized via He initialization and
updated by `(→ SGD with Momentum)`.

### Pre-training
The network is pre-trained on the economic formulas in `formulas.ts`. The
formulas are the teacher: they generate input/output pairs, and the network
learns to approximate them. This is not training on real time series (a
documented limitation in RESEARCH.md §12.3).

### Fine-tuning
Backpropagation adjusts the 3,008 weights when real indicator data arrives
and the predicted value differs from the actual. The loss is MSE. The model
literally learns from its mistakes.

### SGD with Momentum
The optimizer. Learning rate 0.001 decayed by 0.95 per epoch, momentum 0.9.
Standard stochastic gradient descent with a velocity term that smooths the
update direction.

### He Initialization
The weight initialization scheme: weights drawn from
`N(0, √(2/fan_in))`. Chosen because the hidden layers use ReLU, for which
He init preserves variance across layers and avoids vanishing gradients.

### ReLU
Rectified Linear Unit. The activation function on the two hidden layers:
`max(0, z)`. The output layer is linear (no activation) because the task is
regression, not classification.

### NeuralWeight
The Prisma model that persists a trained network snapshot to SQLite. Fields
include `weightsJson`, `epoch`, `totalSamples`, `lastLoss`,
`inputMean`/`inputStd`/`outputMean`/`outputStd` (the normalization stats),
`architecture`, `totalWeights`, `source`.

### Normalization
Inputs are z-score normalized (`(x − mean) / std`) before the forward pass;
outputs are denormalized back to real units after. The normalization
statistics are stored alongside the weights in the `NeuralWeight` record.

---

## Layer 03 — Non-Linear Dynamics

### Non-Linear Layer
One of seven transforms applied between the neural network's raw output and
the final indicators a policymaker reads. The seven are listed below. Each
has a mathematical form documented in RESEARCH.md §5. These are not optional
polish — without them, the network produces linear-ish outputs that miss
every real-world threshold effect.

### Critical Threshold
Non-linear layer 01. Debt above 80% of GDP triggers exponential risk
compounding, not a linear increase. Modeled as a piecewise function that
switches to an exponential ramp above the threshold.

### Bifurcation
Non-linear layer 02. Unemployment above 15% causes the system to jump to a
different regime — a discontinuous state-space transition, not a smooth
increase. The system has two attractors and the trajectory picks one based
on which side of 15% it sits.

### Hysteresis
Non-linear layer 03. Once a crisis happens, the system remembers it. Recovery
does not erase the scar. Formally: the state depends on the trajectory, not
just the current input. A "scar" variable `s_t = max(s_{t-1} · decay, shock_t)`
persists and decays over `τ = 18 months`. This is the emotional core of the
project — the reason prevention is cheaper than cure.

### Scar
The persistent gap between full recovery and actual recovery after a crisis.
Visible in the `hysteresis-scar` visualization as the amber-tinted region
between the dashed reference trajectory and the solid actual trajectory.

### Feedback Loop
Non-linear layer 04. Positive feedback with saturation. Modeled as
`dx/dt = f(x)` where `f` is sigmoidal — small perturbations amplify up to a
saturation point, then flatten.

### Cascade
Non-linear layer 05. When `revolution_risk` exceeds a threshold, secondary
collapses trigger. Formalized as a conditional probability chain
`(→ Black Swan)`.

### Exponential Runaway
Non-linear layer 06. Inflation above 8% enters a self-reinforcing spiral:
`dx/dt = k·x` above the threshold. The system does not return to equilibrium
on its own; policy must intervene.

### Thermodynamic Equilibrium
Non-linear layer 07. Over-optimizing one sector penalizes the whole. The
system conserves fitness the way a thermodynamic system conserves energy:
a penalty term ensures `Σ indicators ≤ K` asymptotically. You cannot maximize
GDP without paying for it in debt, inequality, or instability.

---

## Layer 04 — Agent Swarm

### Agent
One of 10,000 autonomous actors in the swarm
(`mini-services/simulation-engine/agent-swarm.ts`). Each agent carries:
`faction`, `trust ∈ [0,1]`, `stress ∈ [0,1]`, `capital`, `mobility`, and a
current `behavior`.

### Faction
One of 8 groups an agent belongs to: Labor, Employers, Military, Clergy,
Youth, Rural, Urban Elite, Informal. Each faction has a power weight; the
swarm is not homogeneous within a faction (a documented limitation), but
factions differ in size and political leverage.

### Trust
An agent's confidence in the current regime, `∈ [0,1]`. Updated every tick
as a function of how favorably the indicators move for that agent's faction.
Low trust is a precursor to protest.

### Stress
An agent's accumulated strain, `∈ [0,1]`. Rises when indicators deteriorate
(unemployment, inflation, debt). When stress crosses 0.7, the agent becomes
a candidate for disruptive behavior. The hot pockets in the `agent-swarm`
visualization are clusters of agents with stress > 0.7.

### Behavior
One of 9 states an agent can occupy: calm, anxious, protesting, striking,
rioting, rebelling, emigrating, organizing, compliant. Transitions are
threshold-gated on trust and stress.

### Political Threat
An aggregated risk computed from the swarm: `coup_risk`,
`civil_war_probability`, `revolution_likelihood`, `mass_exodus_probability`,
`general_strike_probability`. These are not separate models — they are
readings of the swarm's state.

---

## Layer 05 — Black Swan

### Black Swan
One of 10 crisis types that strike stochastically
(`mini-services/simulation-engine/black-swan.ts`): pandemic, earthquake,
market crash, coup, drought, cyberattack, refugee crisis, oil shock, harvest
failure, diplomatic crisis. Each carries a base probability and a severity.

### Fragility Index
A scalar `∈ [0,1]` computed from the current system state (debt level,
unemployment, trust deficit, stress aggregation). When fragility is high,
black swan trigger probabilities scale up, and up to three crises can strike
simultaneously.

### Cascade Chain
A directed sequence of crises where each triggers the next with a conditional
probability. Example: pandemic → market crash → coup → civil unrest → capital
flight. The `black-swan-cascade` visualization shows one such chain with its
conditional probabilities.

---

## Layer 06 — Paradigm

### Paradigm
One of 5 political regimes: Liberalism, Planned, Technocracy, Authoritarian,
Transition. Switching paradigm does not change parameter values — it rewrites
the causal weight matrix and flips edge polarities. Under Planned economy,
`interest_rate → public_investment` flips from negative to positive: the
state invests regardless of rates.

### Polarity Inversion
When a paradigm switch reverses the sign of a causal edge's coefficient.
The `paradigm-delta` visualization shows this as a `−0.6 → +0.1` transition
on the affected edge.

### Weight Matrix Rewrite
The structural transformation a paradigm switch performs. Not a parameter
tweak — a reconfiguration of which inputs influence which outputs, and in
which direction. Documented in RESEARCH.md §8.3 as a V2 feature with a
placeholder implementation in the current engine.

---

## Decrees

### Decree
A French-language policy instruction typed by the user. The decree engine
(`mini-services/simulation-engine/decrees.ts`) parses it into lever deltas
via 38 NLP patterns, calculates the fiscal cost, and optionally projects
2 years forward. Examples: "Construire 10 hôpitaux", "Plan de relance
économique", "Réforme fiscale globale".

### Decree Pattern
One of 38 recognized French NLP templates that map a phrase to a set of
lever modifications. Each pattern carries a cost estimate in MAD.

### Projection
A 2-year forward simulation run after a decree is parsed, before it is
applied. Returns a verdict so the user can see the consequences before
committing.

### Verdict
The classification returned by the projection engine, one of: `favorable`,
`mitigé`, `défavorable`, `catastrophique`. Computed from the trajectory of
the 15 indicators over the 24-month window.

---

## The simulation loop

### Tick
One 200ms cycle of the simulation engine. On each tick: the engine steps
all layers, the agent swarm updates, black swan rolls, and a state snapshot
is emitted to all connected clients via Socket.io.

### Snapshot
The full state object broadcast every tick: current lever values, computed
indicators, agent swarm aggregates, political threats, active crises,
fragility index, tick counter.

### Genesis
The connection handshake. When a client connects, the engine sends an `init`
payload containing the 47 levers, 15 indicators, 8 categories, the causal
edges, and the current state. Subsequent ticks send only the `state` delta.

---

## Provenance and honesty

### Provenance
The source attribution attached to every lever baseline and every causal
edge. A lever without a source is a bug. An edge without a `sourceUrl` is a
bug. PRISM's epistemic stance is: if it cannot be traced to a real document,
it does not exist in the model.

### Mock Data
Forbidden. The creator's explicit rule, preserved in NOTES.md: "T'as pas le
droit au mock data ou au data hard codé." If a value cannot be sourced, the
system says so rather than inventing one. The `(→ Data Provenance)`
visualization maps all 47 levers to their real sources.

### Sycophancy
The failure mode this glossary is designed to resist. An LLM asked about a
policy will agree with whatever framing it is given. PRISM's defense is
structural: the terms are pinned here, the weights are trained, the edges are
extracted, the verdicts are computed. The system does not agree with you —
it computes what follows.

---

## Cross-reference index

- Lever → see Layer 01
- Indicator → see Layer 01
- Causal Edge → see Layer 01
- Neural Network → see Layer 02
- Weight → see Layer 02
- Non-Linear Layer → see Layer 03
- Scar → see Hysteresis (Layer 03)
- Agent → see Layer 04
- Faction → see Layer 04
- Black Swan → see Layer 05
- Fragility Index → see Layer 05
- Paradigm → see Layer 06
- Decree → see Decrees
- Tick → see The simulation loop
- Provenance → see Provenance and honesty
- Mock Data → see Provenance and honesty (forbidden)
