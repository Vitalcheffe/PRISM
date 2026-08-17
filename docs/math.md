# PRISM — Mathematical Derivation

> This document specifies the mathematics underlying the PRISM engine. Every
> equation here is implemented in `mini-services/simulation-engine/`. The
> notation follows standard econometrics and machine learning conventions.
> Where a formula is simplified from its canonical form, the simplification
> is stated and the source cited.

---

## 1. Notation

| Symbol | Meaning |
|--------|---------|
| `x ∈ ℝ⁴⁷` | Lever vector (policy inputs) |
| `y ∈ ℝ¹⁵` | Indicator vector (computed outputs) |
| `W^(l), b^(l)` | Weight matrix and bias vector of layer `l` |
| `a^(l)` | Activation vector of layer `l` |
| `f(·)` | Non-linear transform function |
| `S_t` | System state at tick `t` |
| `τ` | Time constant (in ticks; 12 ticks = 1 simulated year) |
| `ρ` | Decay rate |
| `⊙` | Element-wise (Hadamard) product |

---

## 2. The Neural Network

### 2.1 Topology

PRISM uses a feedforward multilayer perceptron (MLP) with architecture:

```
input (47) → hidden-1 (32) → hidden-2 (32) → output (15)
```

### 2.2 Weight count

The total number of learnable weights (excluding biases):

```
N_weights = (47 × 32) + (32 × 32) + (32 × 15)
          = 1504 + 1024 + 480
          = 3008
```

Including biases (32 + 32 + 15 = 79), total trainable parameters = 3087.

### 2.3 Forward pass

Given input `x`, the forward pass computes:

```
z^(1) = W^(1) x + b^(1)       ∈ ℝ³²
a^(1) = ReLU(z^(1))            ∈ ℝ³²

z^(2) = W^(2) a^(1) + b^(2)   ∈ ℝ³²
a^(2) = ReLU(z^(2))            ∈ ℝ³²

z^(3) = W^(3) a^(2) + b^(3)   ∈ ℝ¹⁵
y     = z^(3)                  ∈ ℝ¹⁵  (linear output for regression)
```

Where `ReLU(z) = max(0, z)` is the rectified linear unit. The output layer is
linear (no activation) because the task is regression, not classification.

### 2.4 He initialization

Weights are initialized from a normal distribution:

```
W^(l)_{ij} ~ N(0, σ²),   σ² = 2 / fan_in
```

Where `fan_in` is the number of inputs to the layer (47, 32, 32 for layers
1, 2, 3). This preserves variance across layers when using ReLU, avoiding
vanishing/exploding gradients [He et al., 2015].

### 2.5 Pre-training

The network is pre-trained on the economic formulas in `formulas.ts`. The
formulas serve as the teacher: for a set of lever configurations
`{x_1, ..., x_N}`, the ground-truth outputs `{y_1, ..., y_N}` are computed
via `computeAllIndicators(x_i)`. The network learns to approximate this
mapping by minimizing:

```
L = (1/N) Σ_{i=1}^{N} ||y_pred(x_i) - y_true(x_i)||²
```

Minimized via stochastic gradient descent with momentum.

### 2.6 Fine-tuning (online learning)

When real indicator data arrives, the loss is computed against the observed
value and backpropagation adjusts the weights:

```
∂L/∂W^(l) = ∂L/∂a^(l) · ∂a^(l)/∂z^(l) · ∂z^(l)/∂W^(l)
```

With momentum `v_t = γ v_{t-1} + η ∇L`, and update `W ← W - v_t`, where
`η = 0.001` (decaying by 0.95 per epoch) and `γ = 0.9`.

### 2.7 Normalization

Inputs are z-score normalized before the forward pass:

```
x_norm = (x - μ_in) / σ_in
```

Outputs are denormalized after:

```
y = y_norm · σ_out + μ_out
```

The statistics `(μ_in, σ_in, μ_out, σ_out)` are computed during pre-training
and persisted in the `NeuralWeight` record.

---

## 3. The Economic Formulas

The formulas below are the ground truth the network approximates. They are
simplified from canonical econometric models; each simplification is noted.

### 3.1 GDP (expenditure approach)

The identity `Y = C + I + G + (X - M)` is the national income accounting
identity. PRISM computes each component as a function of levers:

```
C = α_c · (GDP_prev · (1 - savings_rate)) · (1 + wage_effect)
I = α_i · public_investment + α_p · private_investment
G = government_spending
X = exports · f(exchange_rate)
M = imports · f(exchange_rate, gdp)
```

Where `α_c, α_i, α_p` are calibrated marginal propensities.

### 3.2 Okun's law (unemployment)

```
Δu = -β · (g - g_n)
```

Where `u` is unemployment, `g` is GDP growth, `g_n ≈ 3%` is the natural
growth rate, and `β ≈ 0.5` is Okun's coefficient. Simplified from the
difference-form [Okun, 1962].

### 3.3 Phillips curve (inflation)

```
π = π^e - γ · (u - u_n) + π_shock
```

Where `π^e` is expected inflation (adaptive: `π^e_t = π_{t-1}`), `u_n` is
the natural rate of unemployment, and `π_shock` is a supply shock term.

### 3.4 Life expectancy (health production function)

```
LE = LE_base + α_d · (doctors - 0.7) + α_b · (beds - 1.1)
           + α_w · (water - 87) + α_v · (vacc - 89) + α_p · (pollution - 50)
```

Clamped to `[45, 90]` — a physical bound. Source: WHO health production
function [Cremieux et al., 1999].

### 3.5 HDI (UNDP formula)

```
HDI = ³√(I_life · I_edu · I_income)

I_life   = (LE - 20) / (85 - 20)
I_edu    = 0.4 · primary + 0.35 · secondary + 0.25 · tertiary
I_income = (ln(GNI_ppp) - ln(100)) / (ln(75000) - ln(100))
```

Clamped to `[0, 1]`. Source: UNDP Human Development Report methodology.

### 3.6 Gini coefficient

```
G = G_base + α_w · wage_dispersion + α_t · (1 - progressivity) + α_u · unemployment
```

Source: simplified from [Deininger & Squire, 1996].

---

## 4. The Seven Non-Linear Layers

The neural network's raw output `y_raw` is transformed through seven layers
before becoming the final indicators `y_final`. Each layer models a
non-linear economic phenomenon.

### 4.1 Critical threshold (debt)

```
if debt_to_gdp > 80:
    risk += exponentialRunaway(debt, 80, 0.08)

exponentialRunaway(v, θ, k) = exp(k · (v - θ)) - 1
```

Above 80% debt-to-GDP, risk compounds exponentially (not linearly). The
threshold `θ = 80` is from [Reinhart & Rogoff, 2010].

### 4.2 Bifurcation (unemployment)

```
if u > 15:
    revolution_risk += bifurcation(u, 15, 0.5) · 25

bifurcation(v, θ, s) = 1 / (1 + exp(-s · (v - θ)))
```

Above 15% unemployment, the system jumps to a different regime — a
discontinuous state-space transition. The sigmoid approximates the
bifurcation; the true dynamics would be a catastrophe-theoretic fold.

### 4.3 Hysteresis (the scar)

The system maintains a memory state `s_t` that decays slowly:

```
s_t = max(s_{t-1} · ρ, shock_t)

scar = s_t · hysteresisEffect(v, θ_memory, k)
hysteresisEffect(v, θ, k) = k · max(0, v - θ) if v > θ else k · s_t
```

With `ρ = 0.95` (decay over ~20 ticks ≈ 18 months) and `k = 0.05`. This is
the emotional core of PRISM: recovery does not erase the scar. The memory
persists and decays only if nothing else goes wrong.

### 4.4 Feedback loop (instability)

```
risk_new = feedbackLoop(risk, A, S)

feedbackLoop(x, A, S) = (x · A) / (1 + (x · A / S))
```

Positive feedback with saturation: small perturbations amplify by factor
`A` up to a saturation point `S`. Modeled as a saturating amplifier
[Wiener, 1948].

### 4.5 Cascade (secondary collapse)

```
if risk > 0.6:
    risk = cascadeEffect(risk, 0.6, 1.5)

cascadeEffect(I, θ, A) = I + A · max(0, I - θ)
```

When the primary risk exceeds 0.6, secondary collapses trigger, amplifying
the effect. Models crisis contagion [Acemoglu et al., 2015].

### 4.6 Exponential runaway (inflation spiral)

```
if π > 8:
    π += exponentialRunaway(π, 8, 0.15) · 5
```

Above 8% inflation, a self-reinforcing spiral: price expectations drive
wage demands, which drive prices. The system does not self-correct;
policy must intervene.

### 4.7 Thermodynamic equilibrium (over-optimization penalty)

```
Σ_indicators ≤ K

penalty = λ · max(0, Σ - K)
y_final = y_final · (1 - penalty)
```

The system conserves "fitness" the way a thermodynamic system conserves
energy: over-optimizing one sector pushes the whole off equilibrium. The
constraint `K` is calibrated to the baseline sum.

---

## 5. The Agent Swarm

### 5.1 Agent state

Each agent `a_i` carries:

```
a_i = (faction, trust ∈ [0,1], stress ∈ [0,1], capital, mobility, behavior)
```

### 5.2 Trust update

```
trust_i(t+1) = trust_i(t) + α · (satisfaction_i(t) - 0.5)
```

Where `satisfaction_i` is a function of how the indicators affect agent
`i`'s faction. Trust rises when the indicators move favorably.

### 5.3 Stress update

```
stress_i(t+1) = stress_i(t) + β · (unemployment + inflation + debt_stress)
```

Stress accumulates when indicators deteriorate. When `stress > 0.7`, the
agent transitions to a disruptive behavior.

### 5.4 Political threat aggregation

```
coup_risk = Σ_i (stress_i · power_faction(i)) / N_agents · κ_coup
```

Threats are weighted sums of agent stress, modulated by faction power.

---

## 6. The Kernel — Tick Composition

Each tick `t` composes the layers:

```
S_{t+1} = f_7(f_6(f_5(f_4(NN(x_t), swarm_t))))
```

Where:
- `NN(x_t)` is the neural forward pass (layer 2)
- `f_3` through `f_7` are the non-linear transforms (layers 3-7)
- `swarm_t` is the agent swarm update (layer 4)
- `f_5` is the black swan roll (layer 5)

The composition is sequential and stateful: each layer reads the output
of the previous and writes to the shared state `S_t`.

---

## 7. The Hysteresis Verification

The validation harness confirms the scar effect:

```
U_base → U_peak (shock) → U_final (recovery)

scar = U_final - U_base > 0
```

Empirically (from VALIDATION.md): after a shock pushing unemployment to
~19-25%, reversal returns `U` to baseline but `stability` shows a persistent
deficit of 3-9 points. The `hysteresisEffect` penalty in the engine is the
mechanism; the validation is the proof.

---

## References

- He, K., Zhang, X., Ren, S., & Sun, J. (2015). Delving deep into rectifiers. *ICCV*.
- Okun, A. (1962). Potential GNP: Its measurement and significance. *ASA Proceedings*.
- Reinhart, C., & Rogoff, K. (2010). Growth in a time of debt. *AEA Papers & Proceedings*.
- Cremieux, P., et al. (1999). Health care spending and determinants of health. *Health Economics*.
- Deininger, K., & Squire, L. (1996). A new data set measuring income inequality. *World Bank Economic Review*.
- Acemoglu, D., et al. (2015). Systemic risk and stability in financial networks. *American Economic Journal*.
- Wiener, N. (1948). *Cybernetics*. MIT Press.
- UNDP. *Human Development Report Technical Notes*.
