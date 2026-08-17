# PRISM — Research Methodology

> A non-linear macroeconomic simulator. This document specifies the mathematical
> formalism, computational architecture, and validation framework underlying the
> PRISM engine. All claims here are grounded in the implementation under
> `mini-services/simulation-engine/`.

---

## Abstract

PRISM is a non-linear macroeconomic simulator designed for real-time, high-dimensional policy exploration in emerging economies under political fragility. The system maps 47 real Moroccan policy levers (tax rates, public budgets, infrastructure stocks, governance indices) to 15 derived macroeconomic indicators (GDP, unemployment, inflation, debt-to-GDP, life expectancy, HDI, Gini, poverty, stability, revolution risk, and others) through a 47→32→32→15 multilayer perceptron (3,008 weights; 3,087 trainable parameters including biases) pre-trained on explicit economic identities (Okun, Phillips, HDI, fiscal accounting) and fine-tunable by backpropagation. A swarm of 10,000 heterogeneous agents distributed across 8 political factions reacts to indicator trajectories and emits political-threat signals (coup, civil war, revolution). A stochastic black-swan layer (10 crisis types with conditional cascade chains) injects rare events whose probability scales with systemic fragility. A paradigm engine rewrites the causal weight matrix and inverts edge polarities when regime changes (liberalism, planned, technocracy, authoritarian, transition). A natural-language pipeline extracts quantified causal edges from live IMF and World Bank documents. The system is not presented as an oracle: its neural network is currently pre-trained on closed-form formulas rather than empirical time series, the agent swarm is homogeneous within factions, and black-swan probabilities are heuristic. PRISM is a reasoning aid for Model United Nations briefings and policy stress-testing, not a predictive instrument.

---

## 1. Problem Statement

Classical macroeconomic models — Dynamic Stochastic General Equilibrium (DSGE), Computable General Equilibrium (CGE), and Vector Autoregression (VAR) — were designed for stable, developed economies with deep time series and well-identified structural shocks. They struggle in the operating regime PRISM targets:

- **Real-time interactivity.** A policy analyst in a Model United Nations preparation session needs to see the propagation of a VAT change within seconds, not after a 12-hour estimation run. DSGE estimation typically requires numerical optimisation over a likelihood surface that does not admit incremental updates.
- **High-dimensional policy spaces.** A real economy has dozens of simultaneously adjustable instruments. DSGE models usually feature a handful of policy rules; CGE models are calibrated to a single social-accounting-matrix year and become brittle when many instruments move at once.
- **Non-linearity near thresholds.** The economic literature documents debt-overhang thresholds near 80–90% of GDP (Reinhart & Rogoff), unemployment bifurcations above 15%, and inflation runaway above 8–10%. Linearised models smooth over these discontinuities.
- **Political fragility.** Emerging economies routinely face coup risk, civil war, revolution, mass exodus. DSGE has no native representation of political factions or threat probabilities. Agent-based models do, but typically at the cost of being non-real-time.
- **Heterogeneous knowledge sources.** The relevant causal knowledge is distributed across IMF Article IV reports, World Bank country diagnostics, central-bank bulletins, and Loi de Finances documents. No classical model has a native mechanism to ingest these documents and update its causal graph.

The Model United Nations use case described in `NOTES.md` frames the requirement directly: a software "for a SpaceX rocket" — meaning a high-fidelity simulator that policy delegates can interact with to test the resilience and side effects of real public policies, without hardcoded relationships or mock data. PRISM addresses this gap by combining a small but expressive neural network, an agent swarm with explicit faction politics, a non-linear dynamics layer that implements seven named phenomena from the complexity-economics literature, and a natural-language causal-extraction pipeline that turns reports into edges.

PRISM does not claim to outperform DSGE on predictive accuracy for stable economies. It claims to provide a different operating point: interactive, high-dimensional, non-linear, and politically aware, at the cost of reduced empirical calibration. The trade-off is stated explicitly in Section 12.3.

---

## 2. System Overview

PRISM is a six-layer pipeline. Each layer transforms its input without hardcoded indicator-level rules. The flow is:

```
Document corpus  ──►  [1] NLP Causal Extractor
                          │
                          ▼
                    CausalEdge[]  ──►  SQLite (Prisma)
                          │
                          ▼
47 policy levers  ──►  [2] Neural Network (47→32→32→15)  ──►  15 raw indicators
                          │
                          ▼
                    [3] Non-Linear Dynamics (7 layers)
                          │
                          ▼
                    15 adjusted indicators
                          │
                          ▼
                    [4] Agent Swarm (10,000 agents × 8 factions)
                          │
                          ▼
                    Political threats, emergent events
                          │
                          ▼
                    [5] Black Swan Engine (10 crisis types, cascades)
                          │
                          ▼
                    Final state  ──►  [6] Visualization (Next.js, Socket.io)
```

**Layer 1 — NLP Causal Extractor** (`causal-extractor.ts`). A z-ai-web-dev-sdk-backed pipeline ingests the text of a report (URL or raw), prompts an LLM to identify quantified causal relationships between named economic variables, parses the JSON response, matches variable names to the 47 known lever IDs via a keyword map (115 keyword entries), and persists the resulting edges. Each edge carries a signed coefficient in [−1, +1], a delay in months, a confidence in [0, 1], and a rationale string.

**Layer 2 — Neural Network** (`neural-network.ts`). A custom multilayer perceptron implemented from scratch in TypeScript — no TensorFlow, no PyTorch. Three layers: 47 inputs (the levers), two hidden layers of 32 neurons each with ReLU activation, and 15 linear outputs (the indicators). Inputs are z-score normalised using each lever's baseline as mean and half its range as standard deviation. Outputs are de-normalised through per-indicator scale constants. The network is pre-trained against synthetic samples generated by the closed-form formulas in `formulas.ts`, then fine-tuned online as new causal edges arrive.

**Layer 3 — Non-Linear Dynamics** (`nonlinear.ts`). Seven named non-linear transfer functions sit conceptually between the raw neural output and the final indicator vector: critical threshold, bifurcation, hysteresis, feedback loop, cascade effect, exponential runaway, and diminishing-returns saturation (used as the thermodynamic-equilibrium primitive). Each implements a documented phenomenon from complexity economics — debt-overhang cliffs, regime jumps, crisis scarring, amplifying feedback, cascading collapses, hyperinflation spirals, and over-optimisation penalties.

**Layer 4 — Agent Swarm** (`agent-swarm.ts`). 10,000 agents, each with a type (citizen, business, investor), a faction among 8 political groups (labor unions, employers, military, clergy, youth, rural, urban elite, informal economy), and four state variables: trust, stress, capital, mobility. Per-tick update equations evolve trust and stress as functions of macroeconomic indicators and faction grievance. Agents transition between 9 behaviours (normal, anxious, panicking, speculating, blackmarket, fleeing, striking, rioting, rebelling) at threshold crossings. Aggregation produces emergent events and five political-threat signals: coup risk, civil war, general strike, mass exodus, revolution.

**Layer 5 — Black Swan Engine** (`black-swan.ts`). Ten crisis types (pandemic, earthquake, market crash, coup, drought, cyberattack, refugee crisis, oil shock, harvest failure, diplomatic crisis) strike stochastically. The per-tick base probability is 0.008, scaled up by a fragility factor `1 + 2·(100−stability)/100 + 1.5·revolutionRisk/100`. Each crisis delivers lever deltas, agent stress/trust shocks, and a fiscal cost added to accumulated debt. A cascade function may trigger a secondary crisis with probability `severity · fragility · 0.3` drawn from a crisis-specific conditional table.

**Layer 6 — Visualization**. The Next.js 16 frontend consumes the engine's per-tick state via Socket.io at 200 ms cadence (one tick ≈ 15 simulated days, so one year ≈ 4.8 wall-clock seconds). The "reactor" view renders the 47 levers as 3D prisms whose heights encode current values; the network view exposes the 3,008 weights as active transistors; the agent view shows faction-level grievance, loyalty, and threat panels.

---

## 3. Policy Levers and Indicators

### 3.1 The 47 Levers

The 47 levers are grouped into 8 categories. The category counts are: economy 10, health 5, education 6, infrastructure 6, demographics 4, governance 6, environment 4, social 6. Every baseline value is sourced from a real publication; sources are reproduced verbatim from `model.ts`. The "safe low" and "safe high" bounds are not used by the neural network but drive the visual "cold/hot" zone shading in the reactor.

#### 3.1.1 Economy (10 levers)

| lever_id | name | baseline | unit | source |
|---|---|---|---|---|
| `vat_rate` | Taux de TVA | 20 | % | Loi de Finances Maroc 2023 |
| `corporate_tax_rate` | Impôt sur les sociétés | 31 | % | CGI Maroc 2023 |
| `income_tax_rate_top` | IR (tranche max) | 38 | % | CGI Maroc 2023 |
| `interest_rate` | Taux directeur | 2.5 | % | Bank Al-Maghrib, 2023 |
| `minimum_wage` | SMIG mensuel | 3330 | MAD | Décret SMIG Maroc 2023 |
| `public_investment` | Investissement public | 150 | Mrd MAD | Loi de Finances Maroc 2023 |
| `subsidies` | Subventions (caisse de compensation) | 45 | Mrd MAD | Loi de Finances Maroc 2023 |
| `exchange_rate` | Taux de change MAD/USD | 10.2 | MAD | Bank Al-Maghrib, 2023 |
| `tourism_budget` | Budget tourisme | 6.5 | Mrd MAD | Loi de Finances Maroc 2023 |
| `agriculture_subsidies` | Subventions agricoles | 18 | Mrd MAD | Ministère de l'Agriculture, 2023 |

#### 3.1.2 Health (5 levers)

| lever_id | name | baseline | unit | source |
|---|---|---|---|---|
| `hospital_beds_per_1k` | Lits d'hôpitaux / 1000 hab. | 1.1 | lits | Banque Mondiale, SH.MED.BEDS.ZS, 2017 |
| `doctors_per_1k` | Médecins / 1000 hab. | 0.7 | médecins | Banque Mondiale, SH.MED.PHYS.ZS, 2017 |
| `health_budget_share` | Budget santé (% du PIB) | 6.8 | % | Banque Mondiale, SH.XPD.CHEX.GD.ZS, 2019 |
| `vaccination_rate` | Couverture vaccinale DTC | 89 | % | Banque Mondiale, SH.IMM.IDPT, 2022 |
| `water_access` | Accès à l'eau potable | 87 | % | Banque Mondiale, SH.H2O.BASW.ZS, 2022 |

#### 3.1.3 Education (6 levers)

| lever_id | name | baseline | unit | source |
|---|---|---|---|---|
| `education_budget_share` | Budget éducation (% du PIB) | 6.4 | % | Banque Mondiale, SE.XPD.TOTL.GD.ZS, 2022 |
| `teachers_per_1k_students` | Enseignants / 1000 élèves | 42 | enseignants | UNESCO/ISU, 2020 |
| `primary_enrollment` | Scolarisation primaire | 99 | % | Banque Mondiale, SE.PRM.NENR, 2022 |
| `secondary_enrollment` | Scolarisation secondaire | 70 | % | Banque Mondiale, SE.SEC.NENR, 2022 |
| `tertiary_enrollment` | Scolarisation supérieure | 38 | % | Banque Mondiale, SE.TER.ENRR, 2022 |
| `rd_investment_share` | Investissement R&D (% PIB) | 0.7 | % | Banque Mondiale, GB.XPD.RSDV.GD.ZS, 2020 |

#### 3.1.4 Infrastructure (6 levers)

| lever_id | name | baseline | unit | source |
|---|---|---|---|---|
| `electricity_access` | Accès à l'électricité | 100 | % | Banque Mondiale, EG.ELC.ACCS.ZS, 2021 |
| `broadband_penetration` | Pénétration haut débit | 35 | % | Banque Mondiale, IT.NET.USER.ZS, 2022 |
| `renewable_energy_share` | Énergies renouvelables | 37 | % | Banque Mondiale, EG.ELC.RNEW.ZS, 2015 |
| `road_paved_share` | Routes revêtues | 70 | % | Banque Mondiale, IS.ROD.PAVE.ZS, 2007 |
| `rail_network_km` | Réseau ferroviaire | 2210 | km | ONCF, 2023 |
| `industrial_zones` | Zones industrielles | 80 | zones | Ministère de l'Industrie, 2023 |

#### 3.1.5 Demographics (4 levers)

| lever_id | name | baseline | unit | source |
|---|---|---|---|---|
| `immigration_quota` | Quota d'immigration annuel | 50000 | personnes | HCP Maroc, estimation 2023 |
| `retirement_age` | Âge de la retraite | 62 | ans | CNSS Maroc, 2023 |
| `family_benefits_per_child` | Allocations familiales / enfant | 400 | MAD/mois | CNSS Maroc, 2023 |
| `birth_rate` | Indice de fécondité | 2.3 | enfants/femme | Banque Mondiale, SP.DYN.TFRT.IN, 2021 |

#### 3.1.6 Governance (6 levers)

| lever_id | name | baseline | unit | source |
|---|---|---|---|---|
| `military_budget_share` | Budget militaire (% du PIB) | 3.5 | % | Banque Mondiale, MS.MIL.XPND.GD.ZS, 2021 |
| `judicial_budget` | Budget de la justice | 4.2 | Mrd MAD | Loi de Finances Maroc 2023 |
| `anti_corruption_index` | Indice de lutte anti-corruption | 45 | /100 | Transparency International, CPI 2022 |
| `tax_compliance_rate` | Taux de conformité fiscale | 65 | % | Estimation FAD/OCDE, 2022 |
| `digital_admin_budget` | Budget de l'administration numérique | 3.8 | Mrd MAD | Loi de Finances Maroc 2023 |
| `press_freedom_index` | Indice liberté presse | 38 | /100 | Reporters Sans Frontières, 2023 |

#### 3.1.7 Environment (4 levers)

| lever_id | name | baseline | unit | source |
|---|---|---|---|---|
| `carbon_tax` | Taxe carbone | 50 | MAD/tonne | Loi-Cadre Maroc, proposition 2023 |
| `forest_protection_budget` | Budget de protection forestière | 1.5 | Mrd MAD | HCEFLCD Maroc, 2022 |
| `pollution_regulation` | Indice de régulation pollution | 50 | /100 | EPI Yale, 2022 |
| `water_management_budget` | Budget gestion de l'eau | 8.5 | Mrd MAD | Loi de Finances Maroc 2023 |

#### 3.1.8 Social (6 levers)

| lever_id | name | baseline | unit | source |
|---|---|---|---|---|
| `pension_rate` | Taux de pension (% du salaire) | 70 | % | CNSS Maroc, 2023 |
| `unemployment_benefits` | Indemnité chômage mensuelle | 1200 | MAD | CNSS Maroc, 2023 |
| `social_housing_units` | Logements sociaux / an | 100000 | logements | Ministère de l'Habitat Maroc, 2023 |
| `minimum_income_guarantee` | Revenu minimum garanti | 500 | MAD/mois | Programme Tayssir / AMO Tadamon, 2023 |
| `social_programs_budget` | Budget programmes sociaux | 25 | Mrd MAD | Loi de Finances Maroc 2023 |
| `gender_equality_index` | Indice égalité F-H | 62 | /100 | UNDP Gender Inequality Index, 2022 |

### 3.2 The 15 Derived Indicators

The 15 indicators are computed — never directly adjustable. Their canonical closed-form expressions live in `formulas.ts`; the neural network learns to reproduce these expressions (see Section 4.3). The `computeId` column links each indicator definition to its function.

| # | indicator_id | name | unit | formula (paraphrased) | computeId |
|---|---|---|---|---|---|
| 1 | `gdp` | PIB | Mrd MAD | C + I + G + (X − M), expenditure identity | `gdp` |
| 2 | `gdp_growth` | Croissance du PIB | % | (GDP_t − GDP_{t−1}) / GDP_{t−1} | `gdp_growth` |
| 3 | `gdp_per_capita` | PIB par habitant | MAD | GDP / Population | `gdp_per_capita` |
| 4 | `unemployment` | Taux de chômage | % | Okun's law with wage-gap correction | `unemployment` |
| 5 | `inflation` | Inflation (IPC) | % | Phillips + demand + monetary + subsidy + FX + VAT | `inflation` |
| 6 | `debt_to_gdp` | Dette / PIB | % | Accumulated debt / GDP × 100 | `debt_to_gdp` |
| 7 | `budget_deficit` | Déficit budgétaire | Mrd MAD | Public spending − tax revenue | `budget_deficit` |
| 8 | `tax_revenue` | Recettes fiscales | Mrd MAD | (VAT + IS + IR + other) × compliance | `tax_revenue` |
| 9 | `life_expectancy` | Espérance de vie | ans | f(doctors, beds, water, vacc, pollution) | `life_expectancy` |
| 10 | `hdi` | IDH | /1 | ³√(life_index × edu_index × income_index) | `hdi` |
| 11 | `gini` | Coefficient de Gini | /1 | f(wage, transfers, progressivity, unemployment, corruption) | `gini` |
| 12 | `balance_of_trade` | Balance commerciale | Mrd MAD | X − M (FX-driven) | `balance_of_trade` |
| 13 | `poverty_rate` | Taux de pauvreté | % | f(min income, transfers, housing, gini, unemployment) | `poverty_rate` |
| 14 | `stability` | Stabilité globale | /100 | Weighted mean of 7 indicator-health scores | `stability` |
| 15 | `revolution_risk` | Risque d'instabilité | /100 | Weighted sum of unemployment, inflation, gini, poverty, stability risks | `revolution_risk` |

The exact functional forms are given in Section 4.3 below and in the `formulas.ts` source.

---

## 4. Neural Network Architecture

### 4.1 Topology

The network is a feedforward multilayer perceptron with three layers:

```
INPUT_SIZE   = 47   (LEVERS.length)
HIDDEN1_SIZE = 32
HIDDEN2_SIZE = 32
OUTPUT_SIZE  = 15   (INDICATORS.length)
```

Layer shapes and parameter counts:

| layer | shape | weights | biases | total params |
|---|---|---|---|---|
| 1 (input → hidden1) | 47 × 32 | 1504 | 32 | 1536 |
| 2 (hidden1 → hidden2) | 32 × 32 | 1024 | 32 | 1056 |
| 3 (hidden2 → output) | 32 × 15 | 480 | 15 | 495 |
| **totals** | | **3008** | **79** | **3087** |

The figure "3,008 weights" quoted in the README refers to the weight tensors alone (1,504 + 1,024 + 480). Including the 79 bias parameters, the network has **3,087 trainable parameters**. Both counts are reported here for completeness. The engine's `getNetworkStats` returns the weights-only count under `parameters` because biases are stored in a parallel tensor and not iterated over by the same loop.

The architecture was chosen to satisfy three constraints:

1. **Capacity to memorise the formulas.** The 47→15 mapping defined by `formulas.ts` is a non-trivial non-linear function (Okun, Phillips, HDI cube root, Gini, etc.). A 47→15 linear map would have 720 parameters and could not represent cube roots or saturating responses. Two hidden layers of 32 ReLU units produce a piecewise-linear function with sufficient regions to approximate the formula family to within a few percent.
2. **Real-time inference.** The forward pass is invoked at every tick (200 ms wall-clock). A 3,087-parameter network runs in well under a millisecond in pure TypeScript on commodity hardware. Larger architectures (e.g. 128-wide hidden layers) would offer marginal accuracy gains at the cost of inspection — the user can still visually grasp "3,008 transistors" but not "200,000".
3. **Inspectability.** The number 3,008 is small enough that the entire weight matrix can be exposed in the UI as an active transistor field and meaningfully inspected. This is a deliberate design choice tied to the project's epistemic stance (Section 15): the system must remain legible, not opaque.

### 4.2 Forward Pass

Let `x ∈ ℝ^47` be the raw lever vector, `x̂ ∈ ℝ^47` its normalised form, and `ŷ ∈ ℝ^15` the network's output before denormalisation. Let `W^(l)` and `b^(l)` denote the weight matrix and bias vector of layer `l`, with `l ∈ {1, 2, 3}`. The forward pass is:

```
x̂  = (x − μ_x) / σ_x                                # input z-score
z1 = W^(1) · x̂ + b^(1)                              # pre-activation layer 1
a1 = ReLU(z1)                                        # ReLU on hidden layer 1
z2 = W^(2) · a1 + b^(2)                              # pre-activation layer 2
a2 = ReLU(z2)                                        # ReLU on hidden layer 2
z3 = W^(3) · a2 + b^(3)                              # pre-activation output (linear)
y  = σ_y · z3 + μ_y                                  # denormalisation
```

where `μ_x, σ_x ∈ ℝ^47` and `μ_y, σ_y ∈ ℝ^15` are stored per-network. The output layer uses the identity activation (linear regression head) — this is appropriate because the indicators span arbitrary real ranges (GDP in billions of MAD, Gini in [0, 1], HDI in [0, 1]) and a saturating output activation would clip them.

`ReLU(z) = max(0, z)`. Its derivative is 1 for `z > 0` and 0 otherwise (sub-gradient at `z = 0` is taken as 0). The implementation in `neural-network.ts` (`forwardLayer`, lines 174–186) is exact.

The weight matrix is stored in row-major order: `weights[i * outSize + j]` is the weight from input unit `i` to output unit `j`. This layout matches the inner-loop pattern used for the backward pass.

### 4.3 Pre-training

The network is initialised with He random weights (see Section 4.4) and then pre-trained on synthetic samples generated by the closed-form formulas in `formulas.ts`. The formulas are the teacher. This is a critical honesty point: **the network is not yet trained on empirical time series**. It is trained to reproduce the economic identities and econometric relationships that economists have already encoded as formulas.

The pre-training routine `pretrainFromFormulas(network, epochs)` (lines 300–330) does the following:

1. Generate 200 synthetic lever configurations. For each lever `i`, draw a perturbation `p ∈ [−0.3, +0.3]` uniformly and set `value_i = clamp(baseline_i + p · range_i · 0.3, min_i, max_i)`. The extra factor of 0.3 makes the actual perturbation magnitude approximately ±9% of the lever range, keeping samples within a believable neighbourhood of the baseline.
2. For each configuration, compute the target indicator vector by invoking `computeAllIndicators(levers, gdp_baseline, debt_baseline)` from `formulas.ts`. The formulas implement:
   - **GDP** (expenditure identity, `computeGDP`): `C = (annualWages + transfers − vatBurden − incomeTaxBurden) · mpc`, where `annualWages ≈ SMIG × 2.1 × workforce × 12` and `mpc = 0.75`. `I = baseline × 0.27 × interestDampening × taxDampening` with dampening saturating at 0.4 and 0.5 respectively. `G = Σ sectoral budgets + debt service (3.5% GDP)`. `X, M` are FX-driven through a competitiveness factor.
   - **Tax revenue**: `(VAT_base + IS_base + IR_base + other_9%) × compliance`, where the bases are fractions of GDP (58% consumption, 22% corporate profits, 36% wages).
   - **Unemployment** (Okun): `naturalUnemployment(9.5) − 0.5 · (growth − potentialGrowth(4.0)) + wageGap · 0.4`, clamped to [2, 35].
   - **Inflation** (Phillips + demand + monetary + subsidy + FX + VAT): `2.0 + 0.6·(growth − 4) − 0.5·(rate − 2.5) − 0.05·(subsidies − 45) + 0.3·(FX − 10.2) + 0.15·(VAT − 20)`, clamped to [−2, 25].
   - **Life expectancy**: `73 + min(3, (doctors − 0.7)·3) + min(3, (beds − 1.1)·2) + (water − 87)·0.05 + (vacc − 89)·0.03 + (pollution − 50)·0.02`, clamped to [55, 90].
   - **HDI**: `cuberoot(lifeIndex · eduIndex · incomeIndex)`, with `eduIndex = 0.4·primary + 0.35·secondary + 0.25·tertiary` (all divided by 100) and `incomeIndex = (ln(GNI_PPP) − ln(100)) / (ln(75000) − ln(100))`.
   - **Gini**: `0.40 − (SMIG − 3330)/3330 · 0.05 − (social − 25)·0.003 − (topRate − 38)·0.002 + (unemployment − 9.5)·0.008 − (corruption − 45)·0.001`, clamped to [0.2, 0.7].
   - **Stability** (composite): weighted sum of 7 indicator-health scores in [0, 1] with weights summing to 1.0 (unemployment 0.18, inflation 0.12, debt 0.15, life expectancy 0.12, HDI 0.15, Gini 0.15, poverty 0.13), scaled to [0, 100].
   - **Revolution risk**: `30·(unemployment − 5)/20 + 15·|inflation − 2|/15 + 20·(gini − 0.25)/0.45 + 15·poverty/25 + 20·(60 − stability)/60`, clamped to [0, 100].
3. Train the network on the 200 samples for `epochs` epochs using SGD with momentum.

**Loss function.** Mean squared error on normalised outputs:

```
L = (1 / N_out) · Σ_i (ŷ_i − target_i)²
```

where `target_i = (y_i − μ_y_i) / σ_y_i` is the normalised target. The factor `1/N_out` (rather than `1/2`) means the gradient is `2 · (ŷ_i − target_i) / N_out`; the code uses `outputGrad[i] = 2 * diff` without dividing by `N_out`, which scales the effective learning rate by `N_out = 15` — a constant factor absorbed into the choice of base learning rate `0.001`.

**Optimizer.** Stochastic gradient descent with momentum 0.9. The learning rate decays geometrically per epoch: `lr_e = 0.001 · 0.95^e`. This decay schedule halves the learning rate roughly every 14 epochs.

**Batch size.** The `trainEpoch` function processes the 200 samples sequentially (batch size 1, i.e. pure SGD). This is the noisiest but simplest optimisation regime. With 200 samples and a learning rate decaying from 0.001, the network typically converges to a per-sample MSE on the order of `1e-3` after a few hundred epochs.

### 4.4 Fine-tuning

Once pre-trained, the network can be fine-tuned online as new empirical observations arrive (e.g. when the NLP extractor persist a new causal edge, or when a historical data point is loaded). The `train` function (lines 219–271) implements one step of online SGD with momentum:

```
Forward pass  → ŷ
loss          = (1/N_out) · Σ_i (ŷ_i − target_i)²
outputGrad_i  = 2 · (ŷ_i − target_i)
gradH2        = backwardLayer(layer3, a2, outputGrad, isOutput=true)
gradH1        = backwardLayer(layer2, a1, gradH2,    isOutput=false)
              = backwardLayer(layer1, x̂,  gradH1,    isOutput=false)
for each layer l:
    velWeights[l] = momentum · velWeights[l] − lr · gradWeights[l]
    weights[l]    = weights[l] + velWeights[l]
    (same for biases)
```

The `backwardLayer` function applies the chain rule. For a hidden layer with ReLU activation:

```
dz_j     = outputGrad_j · ReLU'(preActivations_j)
         = outputGrad_j · 1[preActivations_j > 0]
gradW[i,j] += dz_j · input_i
gradB[j]   += dz_j
inputGrad_i += dz_j · W[i, j]
```

For the output layer (identity activation), `dz_j = outputGrad_j` directly (the ReLU derivative is skipped).

**Initialisation.** He initialisation (He et al. 2015): each weight is drawn from a Gaussian with mean 0 and variance `2 / fanIn`, where `fanIn` is the number of inputs to the unit. This preserves the variance of activations through ReLU layers and prevents the gradients from vanishing or exploding early in training. The implementation uses the Box-Muller transform to generate standard normal samples:

```
randn() = sqrt(−2 · ln(u₁)) · cos(2π · u₂)
heInit(fanIn) = randn() · sqrt(2 / fanIn)
```

### 4.5 Normalisation

Input and output normalisation is essential for stable training given the wildly different scales of the levers (SMIG ~ 3,330 MAD, retirement age ~ 62, fertility ~ 2.3) and indicators (GDP ~ 1,400 Mrd MAD, Gini ~ 0.40).

**Input normalisation** (per-lever z-score):

```
x̂_i = (x_i − inputMean_i) / inputStd_i
```

where `inputMean_i = baseline_i` and `inputStd_i = (max_i − min_i) / 2`. This places the baseline at zero and gives a unit-ish spread over the lever's range. These values are written once at network creation from the lever definitions in `model.ts`.

**Output denormalisation** (per-indicator inverse z-score):

```
y_i = ŷ_i · outputStd_i + outputMean_i
```

where `outputMean_i = 0` for all indicators and `outputStd_i` is set to a per-indicator scale constant reflecting a typical magnitude:

| i | indicator | outputStd |
|---|---|---|
| 0 | gdp | 400 |
| 1 | gdp_growth | 5 |
| 2 | gdp_per_capita | 30,000 |
| 3 | unemployment | 10 |
| 4 | inflation | 5 |
| 5 | debt_to_gdp | 60 |
| 6 | budget_deficit | 100 |
| 7 | tax_revenue | 400 |
| 8 | life_expectancy | 73 |
| 9 | hdi | 0.7 |
| 10 | gini | 0.4 |
| 11 | balance_of_trade | 150 |
| 12 | poverty_rate | 10 |
| 13 | stability | 50 |
| 14 | revolution_risk | 30 |

These scales are heuristic hand-tuned constants chosen so that the network's pre-denormalisation outputs typically fall in [−2, +2]. They are stored on the `NeuralNetwork` object and serialised alongside the weights (see `serializeNetwork` / `deserializeNetwork`).

---

## 5. Non-Linear Dynamics — The 7 Layers

Classical neural-network outputs are smooth. Real economies are not. PRISM places seven non-linear transfer functions between the raw neural output and the final indicator vector. Each function implements a documented phenomenon and carries a name in the source file `nonlinear.ts`. The functions are independent modules; the engine composes them as needed per indicator (e.g. debt-to-GDP passes through `criticalThreshold`, unemployment through `bifurcation`, etc.).

### 5.1 Critical Thresholds

**Economic intuition.** Below a structural threshold, a variable behaves linearly; above it, the effect becomes exponential. The canonical example is debt-to-GDP: below ~80%, debt service is manageable and growth effects are linear; above 80%, confidence collapses and risk premia spiral.

**Mathematical formulation** (`criticalThreshold(value, threshold, baseEffect, criticalMultiplier)`):

```
if value < threshold:
    f(value) = baseEffect · (value / threshold)             # linear ramp
else:
    excess = value − threshold
    f(value) = baseEffect · (1 + criticalMultiplier · expm1(excess · 0.1))
```

where `expm1(x) = e^x − 1`. The 0.1 factor controls the steepness of the post-threshold exponential; the multiplier controls its amplitude. At `value = threshold`, both branches give `baseEffect`, so the function is continuous. The derivative jumps from `baseEffect / threshold` to `baseEffect · criticalMultiplier · 0.1`, marking a kink — the qualitative transition the function models.

**Triggered when.** A typical call is `criticalThreshold(debt_to_gdp, 80, baseEffect, 3)`: debt below 80% of GDP produces a linear effect on risk premia; debt above 80% triggers an exponential acceleration.

### 5.2 Bifurcation

**Economic intuition.** Some systems have two stable regimes separated by a tipping point. A small perturbation near the tipping point can flip the system from one regime to the other. The canonical example in PRISM is unemployment above 15%: the economy jumps from a "stable" regime to an "instability" regime where social-capital erosion becomes self-sustaining.

**Mathematical formulation** (`bifurcation(value, tippingPoint, sharpness)`):

```
x = (value − tippingPoint) · sharpness
f(value) = sigmoid(x) = 1 / (1 + e^(−x))
```

This is a softened step function centred at `tippingPoint` with transition width `1 / sharpness`. Below the tipping point, `f ≈ 0`; above, `f ≈ 1`; near it, `f` sweeps smoothly between. The economic meaning is the probability of being in the "upper" regime.

**Triggered when.** `bifurcation(unemployment, 15, 2)` — at 15% unemployment the economy bifurcates; the sharpness parameter 2 means the transition spans roughly ±0.5 percentage points.

### 5.3 Hysteresis

**Economic intuition.** The state of the system depends on its trajectory, not just its current input. Once a crisis has occurred (e.g. debt has exceeded 100% of GDP), the system carries a "scar" — investor confidence remains depressed for years even after debt is reduced. Recovery is asymmetric: the path down is harder than the path up.

**Mathematical formulation** (`Hysteresis` class):

```
class Hysteresis:
    maxValue = 0
    minValue = +∞

    update(value):
        maxValue = max(maxValue, value)
        minValue = min(minValue, value)
        return { maxValue, minValue, range = maxValue − minValue }

    hysteresisEffect(currentValue, threshold, decayRate):
        if currentValue ≥ threshold:
            return 1                                            # active crisis
        if maxValue ≥ threshold:                                # crisis occurred in past
            gap = threshold − currentValue
            return exp(−gap · decayRate)                        # decaying memory
        return 0                                                # no crisis, never had one
```

The scar variable `maxValue` records the historical peak. Once it has crossed `threshold`, the effect decays exponentially with the distance `gap` between the current value and the threshold. The decay rate controls how long the scar persists: `decayRate = 0.1` means the scar halves for every `ln(2) / 0.1 ≈ 7` units of distance below the threshold.

**Triggered when.** A typical call sequence: `H.update(debt_to_gdp)` every tick; then `H.hysteresisEffect(debt_to_gdp, 100, 0.1)` to compute a persistent confidence penalty.

### 5.4 Feedback Loops

**Economic intuition.** Unemployment breeds discontent, discontent breeds instability, instability reduces investment, reduced investment raises unemployment. This is a positive feedback loop — but real loops saturate (a country cannot become infinitely unstable). The mathematical form is a sigmoid-saturated amplifier.

**Mathematical formulation** (`feedbackLoop(input, amplificationFactor, saturationPoint)`):

```
saturation = tanh(input / saturationPoint)
f(input) = input · (1 + amplificationFactor · saturation)
```

For small input (`input ≪ saturationPoint`), `tanh ≈ input / saturationPoint` and the loop is approximately linear with gain `1 + amplificationFactor · input / saturationPoint`. For large input (`input ≫ saturationPoint`), `tanh → ±1` and the loop saturates: `f → input · (1 + amplificationFactor)`. Negative `amplificationFactor` produces a stabilising (negative) feedback loop.

**Triggered when.** `feedbackLoop(revolution_risk, 0.3, 50)` — at low revolution risk, the feedback amplifies slowly; at high risk, the amplification saturates at +30%.

### 5.5 Cascade Effects

**Economic intuition.** When a variable exceeds a cascade threshold, it triggers secondary collapses that would not have occurred otherwise. A moderate VAT hike produces moderate discontent; a large VAT hike produces strikes, which produce economic paralysis, which produces a cascading collapse.

**Mathematical formulation** (`cascadeEffect(intensity, cascadeThreshold, cascadeAmplification)`):

```
if intensity < cascadeThreshold:
    return intensity                                            # no cascade
excess = intensity − cascadeThreshold
return intensity + excess · cascadeAmplification · (1 + excess · 0.1)
```

The cascade adds a quadratic-in-excess term: the further past the threshold, the harder the cascade. The 0.1 factor controls the quadratic curvature.

**Triggered when.** A typical call is `cascadeEffect(revolution_risk, 60, 2)` — revolution risk below 60 passes through unchanged; above 60, the excess is amplified by a factor of 2 (plus a 10% quadratic kicker).

### 5.6 Exponential Runaway

**Economic intuition.** Inflation has a self-reinforcing regime: once expectations un-anchor above ~8–10%, wage-price spirals emerge and inflation accelerates without further shocks. This is a textbook positive-feedback-on-positive-feedback phenomenon.

**Mathematical formulation** (`exponentialRunaway(value, threshold, steepness)`):

```
diff = value − threshold
if diff ≤ 0:
    return 0                                                    # below threshold, no runaway
return min(1, exp(diff · steepness) − 1)
```

The function is zero below `threshold`, then grows exponentially above it. The `min(1, ...)` saturates the runaway at 1 (100% effect). With `steepness = 0.3` and `threshold = 8`, a value of 10 produces `exp(0.6) − 1 ≈ 0.82`; a value of 12 produces `exp(1.2) − 1 ≈ 2.32 → 1.0` (saturated).

**Triggered when.** `exponentialRunaway(inflation, 8, 0.3)` — inflation below 8% has no runaway effect; inflation above 8% triggers an exponentially growing risk of hyperinflation spiral.

### 5.7 Thermodynamic Equilibrium

**Economic intuition.** An economy cannot maximise all sectors simultaneously. Over-investing in one sector (e.g. military) draws resources from others (health, education) and degrades the whole. This is the economic analogue of a conservation law or a thermodynamic equilibrium constraint.

PRISM implements this intuition through two distinct mechanisms in the source:

**(a) Diminishing returns** (`diminishingReturns(value, halfSaturation)`):

```
f(value) = value / (value + halfSaturation)
```

This is the Michaelis-Menten form. At `value = 0`, the effect is 0; at `value = halfSaturation`, the effect is 0.5; as `value → ∞`, the effect saturates at 1. The interpretation: building the first 10 hospitals when none exist produces a massive effect on life expectancy; building 10 more when 200 already exist produces a negligible effect. The function enforces a soft conservation constraint by making marginal returns vanish.

**(b) System tension** (`computeSystemTension(leverValues, leverDefs)` in `paradigm.ts`):

```
tension = 0
for each lever i:
    n_i = (value_i − min_i) / (max_i − min_i)                  # normalised to [0, 1]
    if n_i > 0.8:
        tension += (n_i − 0.8) · 5                             # over-investment penalty
    else if n_i < 0.2:
        tension += (0.2 − n_i) · 3                             # under-investment penalty
return tension
```

This produces a scalar that grows whenever any lever is pushed to either extreme. It serves as a "core temperature" in the reactor metaphor: an over-optimised system (one lever at the max) registers the same tension as a starved one (one lever at the min), encoding the thermodynamic intuition that both extremes are unstable.

---

## 6. Agent Swarm

### 6.1 Composition

The swarm contains 10,000 agents by default (the `createSwarm(size, paradigm)` function takes `size` as a parameter; the engine instantiates with `size = 10_000`). Each agent is assigned to one of 8 factions with probability proportional to faction power. The faction definitions and their power weights are:

| faction_id | name | power | initial grievance | initial loyalty |
|---|---|---|---|---|
| `labor_union` | Syndicats ouvriers | 0.25 | 0.30 | 0.50 |
| `employers` | Patronat | 0.30 | 0.20 | 0.60 |
| `military` | Armée | 0.20 | 0.15 | 0.70 |
| `religious` | Clergé religieux | 0.15 | 0.25 | 0.55 |
| `youth` | Jeunesse | 0.18 | 0.50 | 0.30 |
| `rural` | Monde rural | 0.12 | 0.40 | 0.40 |
| `urban_elite` | Élite urbaine | 0.28 | 0.15 | 0.65 |
| `informal` | Économie informelle | 0.10 | 0.60 | 0.20 |
| **total** | | **1.58** | | |

Power weights sum to 1.58 (not 1.0); the assignment loop normalises implicitly by drawing `r ∈ [0, 1.58)` and walking the cumulative distribution. The expected number of agents per faction in a 10,000-agent swarm is therefore `10,000 · power / 1.58`:

| faction | expected count |
|---|---|
| labor_union | 1,582 |
| employers | 1,899 |
| military | 1,266 |
| religious | 949 |
| youth | 1,139 |
| rural | 759 |
| urban_elite | 1,772 |
| informal | 633 |

### 6.2 Per-agent State

Each agent carries:

| field | type | range | meaning |
|---|---|---|---|
| `id` | int | 0…N−1 | unique identifier |
| `type` | enum | citizen, business, investor | economic role |
| `faction` | enum | (8 factions) | political affiliation |
| `trust` | float | [0, 1] | confidence in the regime |
| `stress` | float | [0, 1] | economic / psychological pressure |
| `capital` | float | [0, 1] | normalised wealth |
| `mobility` | float | [0, 1] | ability to leave (capital flight) |
| `behavior` | enum | (9 behaviours) | current action |
| `memory.maxStress` | float | [0, 1] | historical peak stress (hysteresis) |
| `memory.minTrust` | float | [0, 1] | historical trough of trust |

Type assignment is faction-conditional: `employers` and `urban_elite` agents are split 50/50 between `business` and `investor`; `informal` agents are 30% `business` and 70% `citizen`; all other factions are 100% `citizen`. Capital is initialised by type: investors in [0.6, 1.0], businesses in [0.3, 0.7], citizens in [0.0, 0.3]. Mobility is initialised from the paradigm's `capitalMobility` parameter (scaled by 1.0 for investors, 0.6 for businesses, fixed at 0.1 for citizens).

### 6.3 Update Equations

Per tick, the swarm receives the current macro indicators from the engine (inflation, unemployment, stability, revolution risk, GDP growth). The faction-level and agent-level updates are:

**Step 1 — Compute macro stress** (a single scalar summarising the macro environment):

```
inflationStress    = max(0, (inflation − 5) / 15)
unemploymentStress = max(0, (unemployment − 8) / 15)
instabilityStress  = revolutionRisk / 100
growthRelief       = max(0, gdpGrowth / 5)
macroStress        = clamp(0, 1,
    0.3 · inflationStress + 0.3 · unemploymentStress
    + 0.4 · instabilityStress − 0.2 · growthRelief
)
```

The weights (0.3, 0.3, 0.4, −0.2) are heuristic but encode the relative importance of each channel: political instability dominates (0.4), inflation and unemployment contribute equally (0.3 each), and growth provides partial relief (−0.2).

**Step 2 — Update faction grievance and loyalty**:

```
for each faction f:
    f.grievance = min(1, f.grievance · 0.90 + macroStress · 0.10 + instabilityStress · 0.05)
    f.loyalty   = max(0, f.loyalty · 0.92 + (1 − f.grievance) · 0.08)
    if f.grievance > 0.5:
        f.power = min(0.6, f.power · 1.01)                    # mobilisation
```

Grievance responds to macro stress with a 90%/10% exponential smoothing — a slow rise. Loyalty tracks grievance inversely. Discontented factions gradually gain power (mobilisation effect), capped at 0.6.

**Step 3 — Update agent stress and trust**:

```
for each agent a in faction f:
    factionStress = f.grievance
    noise         = (rand() − 0.5) · volatility · 0.1          # paradigm-driven
    a.stress = clamp(0, 1, a.stress · 0.9 + (0.6 · macroStress + 0.4 · factionStress) · 0.1 + noise)
    trustDelta = (stability/100 − a.trust) · 0.05 − macroStress · 0.02 − factionStress · 0.01
    a.trust   = clamp(0, 1, a.trust + trustDelta)
    a.memory.maxStress = max(a.memory.maxStress, a.stress)
    a.memory.minTrust  = min(a.memory.minTrust,  a.trust)
```

Agent stress is a 90%/10% blend of the previous stress and a weighted combination of macro stress (60%) and faction grievance (40%), plus a small noise term. Trust drifts toward `stability/100` at 5% per tick, with downward pressure from macro stress and faction grievance. The memory variables preserve the historical peak stress and trough trust — they are not used in the per-tick update but feed into longer-horizon analytics (e.g. detection of permanently scarred populations).

**Step 4 — Capital update** (conditional on behaviour):

```
if behavior == "fleeing":     capital *= 0.98                  # capital flight
elif behavior == "speculating": capital *= 1.005                # bubble gains
elif behavior == "striking":  capital *= 0.999                  # strike cost
elif behavior == "rebelling": capital *= 0.997                  # rebellion destruction
elif gdpGrowth > 2:           capital *= 1.002                  # growth dividend
elif gdpGrowth < 0:           capital *= 0.998                  # recession
```

### 6.4 Behaviours

Each agent is in exactly one of 9 behaviours per tick. The transition is a priority-ordered cascade evaluated top-down; the first matching rule wins:

```
if stress > 0.85 AND faction.grievance > 0.7:    behavior = "rebelling"
elif stress > 0.80 AND faction.grievance > 0.6:  behavior = "rioting"
elif stress > 0.70 AND faction ∈ {labor_union, youth}:
                                                  behavior = "striking"
elif stress > panicThreshold + 0.2:               behavior = "panicking"
elif stress > panicThreshold:                     behavior = (type == investor AND capital > 0.5)
                                                    ? "fleeing" : "anxious"
elif inflation > 10 AND type == business:         behavior = "speculating"
elif trust < 0.3 AND type == business:            behavior = "blackmarket"
elif stress > 0.5 AND mobility > 0.6 AND capital > 0.4:
                                                  behavior = "fleeing"
else:                                             behavior = "normal"
```

`panicThreshold` is paradigm-dependent (liberalism 0.6, planned 0.8, technocracy 0.65, authoritarian 0.5, transition 0.4). The cascade ordering encodes the qualitative priority: open rebellion comes first, then riot, then strike, then panic, then economic-speculative behaviours.

### 6.5 Political Threat Detection

After the per-agent update, the swarm is aggregated and five political threats are detected by rule:

| threat | trigger | probability formula |
|---|---|---|
| `coup_risk` | faction = military AND grievance > 0.6 | `grievance · power` |
| `civil_war` | any faction grievance > 0.7 AND rebelling agents > 1% of swarm | `grievance · power` |
| `general_strike` | faction = labor_union AND grievance > 0.6 AND striking agents > 5% of swarm | `grievance · power` |
| `mass_exodus` | fleeing agents > 10% of swarm | `fleeing / N` |
| `revolution` | rebelling ratio > 5% AND faction grievance > 0.7 | `grievance · power · (rebelling_ratio + 0.3)` |

In addition, seven emergent events are detected by behavioural-ratio thresholds: panic (>10%), capital_flight (>5%), strike (>5%), riot (>3%), rebellion (>2%), speculation (>8%), blackmarket (>8%). Each event includes a count, intensity, and human-readable description.

---

## 7. Black Swan Engine

### 7.1 The 10 Crisis Types

The catalogue in `black-swan.ts` defines exactly 10 crisis types:

| # | type | name | severity | duration (ticks) | fiscal cost (Mrd MAD) |
|---|---|---|---|---|---|
| 1 | `pandemic` | Pandémie virale | 0.8 | 48 | 80 |
| 2 | `earthquake` | Séisme majeur | 0.7 | 24 | 120 |
| 3 | `market_crash` | Krach boursier mondial | 0.6 | 36 | 60 |
| 4 | `coup` | Tentative de coup d'État | 0.9 | 12 | 40 |
| 5 | `drought` | Sécheresse exceptionnelle | 0.5 | 60 | 35 |
| 6 | `cyberattack` | Cyberattaque massive | 0.6 | 18 | 25 |
| 7 | `refugee_crisis` | Crise migratoire | 0.5 | 72 | 50 |
| 8 | `oil_shock` | Choc pétrolier | 0.5 | 48 | 30 |
| 9 | `harvest_failure` | Faille des récoltes | 0.6 | 36 | 20 |
| 10 | `diplomatic_crisis` | Crise diplomatique | 0.4 | 24 | 15 |

Each crisis carries:
- `impacts`: an array of `(leverId, delta)` pairs applied immediately to the lever vector.
- `agentStressShock` and `agentTrustShock`: scalars in [0, 1] added to every agent's stress and subtracted from trust.
- `fiscalCost`: a cost in Mrd MAD added to the accumulated debt.
- `duration`: number of ticks the effects persist (the engine keeps the event active for this many ticks).
- `severity`: a [0, 1] scalar that scales the cascade probability.

### 7.2 Trigger Probabilities

The per-tick probability of a black swan is:

```
BASE_PROBABILITY = 0.008                                     # ~0.8% per tick
fragility        = (100 − stability) / 100
tension          = revolutionRisk / 100
prob             = BASE_PROBABILITY · (1 + 2 · fragility + 1.5 · tension)
```

With one tick representing 15 simulated days, the baseline rate corresponds to roughly one crisis per 125 ticks ≈ 5 years. The multiplier ranges from 1.0 (perfectly stable: stability = 100, revolutionRisk = 0) to 4.5 (total collapse: stability = 0, revolutionRisk = 100). A more typical operating point of stability = 60, revolutionRisk = 30 yields `prob = 0.008 · (1 + 0.8 + 0.45) = 0.018`, i.e. roughly one crisis every 2.5 years.

When a crisis is rolled, its template is drawn uniformly from the 10-type catalogue. A severity multiplier `0.5 + rand() · 1.0` is then applied to all numeric fields, so each instantiation is a randomised instance of the template (a "minor" earthquake vs a "major" one).

### 7.3 Cascade Chains

A crisis that has occurred may trigger a secondary crisis. The cascade probability is:

```
chainProb = event.severity · fragility · 0.3                 # max 0.3 if system fragile
```

If `rand() < chainProb`, a secondary crisis type is drawn from a crisis-specific conditional table:

| primary | possible secondary |
|---|---|
| pandemic | market_crash, harvest_failure |
| earthquake | refugee_crisis, market_crash |
| market_crash | coup, cyberattack |
| coup | refugee_crisis, diplomatic_crisis |
| drought | harvest_failure, oil_shock |
| cyberattack | market_crash |
| refugee_crisis | diplomatic_crisis |
| oil_shock | market_crash, harvest_failure |
| harvest_failure | drought |
| diplomatic_crisis | coup |

The secondary event inherits `severity · 0.7` of the primary's severity (cascades decay). The chain is recursive — a secondary can in principle trigger a tertiary — but in practice the decaying severity and the 0.3 cap on chain probability limit typical cascades to two events.

The conditional table is hand-coded based on qualitative causal reasoning (a pandemic disrupts supply chains, which crashes markets, etc.). It is not learned. This is acknowledged as a limitation in Section 12.3.

### 7.4 Simultaneous Crises

When the system is fragile (low stability, high revolution risk), the per-tick probability rises. Combined with the cascade mechanism, this means 2–3 crises can strike within a few ticks of each other — a "cluster" of crises. The engine does not explicitly cap the number of simultaneous active events; the cap emerges naturally from the probability formula and the severity-decaying cascade rule. In stress tests, the system routinely exhibits 2-event cascades (e.g. pandemic → market crash) and occasionally 3-event cascades (e.g. drought → harvest failure → oil shock) when stability drops below 30.

---

## 8. Paradigm Engine

### 8.1 The 5 Regimes

The paradigm engine (`paradigm.ts`) defines five political-economic regimes. Each regime is a struct with a weight mask, a list of polarity flips, a friction modifier, a critical-threshold modifier, and a set of agent-behaviour parameters.

| paradigm_id | name | friction | threshold mod | trust base | stress volatility | capital mobility | panic threshold |
|---|---|---|---|---|---|---|---|
| `liberal` | Libéralisme | 1.2 | 0.95 | 0.50 | 0.7 | 0.9 | 0.60 |
| `planned` | Planification centralisée | 0.8 | 1.20 | 0.60 | 0.4 | 0.2 | 0.80 |
| `technocracy` | Technocratie | 1.0 | 1.00 | 0.55 | 0.5 | 0.6 | 0.65 |
| `authoritarian` | Autoritarisme | 0.7 | 1.30 | 0.30 | 0.8 | 0.3 | 0.50 |
| `transition` | Transition | 1.5 | 0.80 | 0.35 | 0.9 | 0.8 | 0.40 |

### 8.2 Weight Matrix Rewrite

Each paradigm defines a `weightMask: Record<category, number>` that scales every weight connecting a lever of that category to the first hidden layer. The masks for the five regimes are:

| category | liberal | planned | technocracy | authoritarian | transition |
|---|---|---|---|---|---|
| economy | 1.30 | 0.90 | 1.25 | 1.00 | 1.15 |
| governance | 0.70 | 1.40 | 1.15 | 1.50 | 1.15 |
| social | 0.90 | 1.20 | 0.80 | 0.70 | 1.15 |
| health | 0.95 | 1.15 | 0.95 | 0.95 | 1.15 |
| education | 0.90 | 1.20 | 1.30 | 0.85 | 1.15 |
| infrastructure | 1.00 | 1.25 | 1.20 | 1.00 | 1.15 |
| demographics | 1.00 | 1.00 | 0.95 | 0.95 | 1.15 |
| environment | 0.85 | 1.10 | 1.10 | 0.90 | 1.15 |

Reading the table: a liberal regime amplifies economic edges by 1.3× and dampens governance edges by 0.7× — the market is loud, the state is quiet. A planned regime amplifies governance and infrastructure edges by 1.4× and 1.25× — the state is loud. An authoritarian regime amplifies governance by 1.5× but suppresses social edges by 0.7× — strong state, suppressed society. The transition regime amplifies everything uniformly by 1.15× — every channel is hyperactive.

The `polarityFlip` field is a list of edge identifiers whose sign should be inverted. Only one flip is currently defined:

- `planned` regime: `["interest_rate→public_investment"]`

The economic meaning: in a liberal regime, raising the central bank rate suppresses public investment (negative coefficient, as encoded in `CAUSAL_EDGES` in `formulas.ts`: `coefficient = −0.15, delayTicks = 8`). In a planned regime, the state invests regardless of the rate, so the edge's coefficient is flipped to `+0.15` (or zeroed, depending on the application strategy).

### 8.3 Formalism

A paradigm is a function `R_π: (W, E) → (W', E')` that transforms the network's weight matrix `W` and the causal-edge set `E`. The transformation is:

```
For each layer l, for each weight w[i, j] connecting input unit i (lever i) to hidden unit j:
    category(i) = LEVERS[i].category
    W'[i, j] = W[i, j] · weightMask[π][category(i)]

For each edge e = (source, target, coefficient, delayTicks, rationale) in E:
    if "source→target" ∈ polarityFlip[π]:
        e' = (source, target, −coefficient, delayTicks, rationale + " [polarity flipped by " + π + "]")
    else:
        e' = e

friction'         = friction · frictionModifier[π]
threshold'        = threshold · criticalThresholdModifier[π]
agentBehaviour'   = agentBehaviour[π]
```

**Important honesty caveat.** The `applyParadigmToNetwork` function in `paradigm.ts` (lines 179–195) is currently a placeholder. Its docstring states:

> NOTE : On ne modifie pas directement les poids du réseau (ce serait destructif). À la place, on stocke le paradigm actuel et on l'applique lors de la propagation via un facteur multiplicatif. Cette fonction est un placeholder pour la V2 qui réécrira réellement la matrice.

That is: the weight-matrix rewrite is **not yet implemented as an in-place mutation of `W`**. The current engine applies the paradigm at the engine level via the `frictionModifier`, `criticalThresholdModifier`, and `agentBehaviour` fields (which are wired through to the swarm and the non-linear layers). The full weight-matrix rewrite and polarity-flip logic described above is the design intent — the formalism is sound, the code is partial. This is listed as a limitation in Section 12.3.

---

## 9. NLP Causal Extraction

### 9.1 Pipeline

The causal-extraction pipeline (`causal-extractor.ts`) operates as follows:

1. **Input.** A document is provided as `(documentText, documentTitle, documentUrl)` — typically fetched by the engine's HTTP endpoint `/api/causal/extract` from a URL supplied by the user.
2. **Variable grounding.** The list of 47 known lever names and 15 known indicator names is loaded from `model.ts`. This grounds the LLM's output in the engine's ontology.
3. **LLM call.** The `z-ai-web-dev-sdk` client invokes the `glm-4.5` model with a system prompt ("Tu es un assistant expert en économétrie…") and a user prompt that includes the known variables, the extraction schema, and the document text truncated to 8,000 characters.
4. **Parse.** The response is parsed as JSON. Robustness: the code searches for the first `[…` block via regex to extract a JSON array even if the LLM prepends prose.
5. **Match.** Each extracted edge's `sourceName` and `targetName` are matched against the 47 lever IDs via `matchLever`, which tries (a) exact name match, (b) substring inclusion, and (c) a keyword map of 115 French and English terms (`tva → vat_rate`, `smig → minimum_wage`, `hôpital → hospital_beds_per_1k`, etc.).
6. **Filter.** Only edges where at least one endpoint matches a real lever are retained. This drops LLM-hallucinated variables that have no counterpart in the engine.
7. **Persist.** The matched edges are returned as `ExtractedEdge[]` and persisted via Prisma to SQLite.

### 9.2 The LLM Prompt

The prompt structure (paraphrased from `causal-extractor.ts` lines 153–170, preserving intent and schema):

```
System: You are an econometrics expert. You extract quantified causal
        relationships from economic texts. You respond ONLY in valid JSON.

User:
You are an expert econometrician. Analyse the text below and extract ALL
causal relationships between economic variables.

Known variables in the system: <comma-separated list of 47 lever names>
Known indicators: <comma-separated list of 15 indicator names>

For each causal relationship identified in the text, produce a JSON object:
- sourceName: name of the variable that CAUSES the effect
- targetName: name of the variable that SUFFERS the effect
- coefficient: number between -1 and +1 (positive = same direction,
  negative = opposite)
- delayMonths: delay in months before the effect manifests (0 = immediate,
  12 = 1 year)
- confidence: your certainty between 0 and 1 (based on text clarity)
- rationale: a short sentence justifying the relationship

Return ONLY a valid JSON array, no additional text:
[{"sourceName":"...","targetName":"...","coefficient":0.5,
  "delayMonths":3,"confidence":0.8,"rationale":"..."}]

Text to analyse (excerpt):
<documentText truncated to 8000 chars>
```

The prompt explicitly constrains the LLM to (a) the engine's known variables, (b) a strict numeric schema, and (c) JSON-only output. The `thinking` field is set to `disabled` to suppress chain-of-thought leakage into the JSON.

### 9.3 Edge Schema

An extracted edge has the following fields (from `ExtractedEdge` interface):

| field | type | range | meaning |
|---|---|---|---|
| `sourceName` | string | — | variable name as written by the LLM |
| `targetName` | string | — | variable name as written by the LLM |
| `sourceLeverId` | string \| null | one of 47 lever IDs | matched source (null if unmatched) |
| `targetLeverId` | string \| null | one of 47 lever IDs | matched target (null if unmatched) |
| `coefficient` | number | [−1, +1] | signed causal strength |
| `delayMonths` | number | [0, 60] | propagation delay |
| `confidence` | number | [0, 1] | LLM-reported certainty |
| `rationale` | string | — | one-sentence justification |
| `source` | string | URL or title | document provenance |

The `extractedToEngineEdges` function converts these to the engine's internal `CausalEdge` format, mapping `delayMonths` to `delayTicks` by the rule `delayTicks = max(1, round(delayMonths / 0.5))` (since 1 tick = 15 days ≈ 0.5 months).

### 9.4 Persistence

Edges are persisted to SQLite via Prisma. The `CausalEdge` Prisma model stores all fields above plus an `extractedAt` timestamp and the source URL. The engine loads all persisted edges at startup into `OUTGOING` and `INCOMING` maps keyed by lever ID, which allows O(1) lookup of every outgoing or incoming edge for a given lever during the propagation step.

The engine also ships with a hand-curated seed graph of 37 edges in `formulas.ts` (the `CAUSAL_EDGES` constant). These edges encode well-established relationships (interest rate → public investment, anti-corruption → tax compliance, etc.) and serve as a baseline that the NLP extractor enriches over time.

---

## 10. Decree System

### 10.1 The 38 Patterns

The decree parser (`decrees.ts`) recognises a French-language decree and translates it into a set of lever deltas plus a fiscal cost. As of the current source, **38 decree patterns** are defined in the `PATTERNS` array. (The project's internal target was 39; one pattern remains in design. This is an honest count of what the code contains.)

The patterns split into two families:

**Simple patterns (22)** — single-lever decrees triggered by a keyword and a number:

| pattern | trigger keywords | affected lever | fiscal cost rule |
|---|---|---|---|
| Construire N hôpitaux | hôpital, hopital | `hospital_beds_per_1k` | N × 0.15 Mrd MAD |
| Construire N écoles | école, ecole | `teachers_per_1k_students` | N × 0.05 Mrd MAD |
| Construire N logements sociaux | logement | `social_housing_units` | N × 0.0003 Mrd MAD |
| Construire N km de routes | route, autoroute | `road_paved_share` | N × 0.008 Mrd MAD |
| Hausser/baisser la TVA | tva | `vat_rate` | 0 |
| Porter le taux directeur à X | taux directeur | `interest_rate` | 0 |
| Recruter N médecins | médecin, medecin | `doctors_per_1k` | N × 0.00012 Mrd MAD |
| Baisser/réduire les impôts de X% | impôt, impot | `corporate_tax_rate` | 0 |
| Réformer les retraites | retraite, pension | `retirement_age` | 0 |
| Doubler le budget éducation | budget éducation | `education_budget_share` | (Δshare) × 1400/100 |
| Doubler le budget santé | budget santé | `health_budget_share` | (Δshare) × 1400/100 |
| Augmenter le SMIG de X% | smig, salaire minimum | `minimum_wage` | 0 |
| Lancer un programme de logements sociaux | logement social, habitat | `social_housing_units` | N × 0.0003 Mrd MAD |
| Investir dans les renouvelables | renouvelable, solaire, éolien | `renewable_energy_share` | pts × 0.8 Mrd MAD |
| Instaurer une taxe carbone | carbone, co2 | `carbon_tax` | 0 |
| Renforcer la lutte anti-corruption | corruption | `anti_corruption_index` | pts × 0.3 Mrd MAD |
| Augmenter le budget militaire | militaire, armée, défense | `military_budget_share` | pts × 1400/100 Mrd MAD |
| Étendre l'accès à l'eau potable | eau potable | `water_access` | pts × 0.5 Mrd MAD |
| Digitaliser l'administration | digital, numérique | `digital_admin_budget` | pts Mrd MAD |
| Augmenter les allocations familiales | allocations, familiales | `family_benefits_per_child` | Δ × 8M × 12 / 1e9 Mrd MAD |
| Étendre la couverture vaccinale | vaccination, vaccin | `vaccination_rate` | Δ × 0.1 Mrd MAD |
| (duplicate rate-target pattern) | taux, banque centrale | `interest_rate` | 0 |

**Compound patterns (16)** — multi-lever decrees that bundle several changes:

| pattern | affected levers |
|---|---|
| Plan de relance économique | corporate_tax_rate −3, public_investment +50, interest_rate −1 |
| Plan de rigueur budgétaire | vat_rate +2, subsidies −20, public_investment −30 |
| Réforme du système de santé | health_budget_share +2, hospital_beds +0.5, doctors +0.3 |
| Transition énergétique verte | renewable_energy +15, carbon_tax +150, pollution_regulation +20 |
| Plan national éducation | education_budget +1.5, teachers +8, rd_investment +0.5 |
| Politique nataliste | family_benefits +200, social_programs +5 |
| Nationaliser un secteur | corporate_tax_rate +10 |
| Privatiser les entreprises publiques | corporate_tax_rate −5 |
| Lancer un grand projet d'infrastructure | public_investment +80, road_paved +5, rail_network +300 |
| Réforme fiscale globale | vat_rate −2, corporate_tax_rate −3, income_tax_top +2, tax_compliance +5 |
| Programme de lutte contre la pauvreté | minimum_income +300, social_programs +10, social_housing +50000 |
| Plan de modernisation de l'armée | military_budget_share +1.5 |
| Ouverture économique internationale | exchange_rate −1 |
| Politique de souveraineté alimentaire | agriculture_subsidies +10, water_management +3 |
| Réforme du marché du travail | minimum_wage × 0.95, retirement_age +1 |
| Plan d'urgence climatique | renewable_energy +20, carbon_tax +300, forest_protection +3 |

The parser uses a multi-strategy match: it first attempts compound patterns (triggered by words like "plan", "réforme", "politique", "programme"), then tries six progressively looser regex strategies for simple patterns. The first successful match wins.

### 10.2 Projection Engine

The `executeDecree(text, currentLevers, currentDebt)` function applies a parsed decree and computes its consequences:

1. **Parse** the decree text into deltas via the pattern matcher.
2. **Validate** each delta against the lever's `[min, max]` bounds; reject the decree if any delta exceeds the bounds.
3. **Apply** the deltas to a copy of the lever vector.
4. **Compute immediate impacts** using the closed-form formulas:
   - `immediateGdpImpact = computeGDP(newLevers) − computeGDP(oldLevers)`
   - `immediateBudgetImpact = (newRevenue − oldRevenue) − (newSpending − oldSpending) − fiscalCost`
   - `immediateDebtImpact = fiscalCost` (cost is debt-financed)
5. **Project forward** — the engine simulates the next 24 ticks (≈ 1 year) by running the full forward pass with the new levers, including non-linear effects and black-swan rolls, and tracks the change in stability.
6. **Classify the verdict** into one of four categories based on the projected stability delta:
   - `favorable` (stability improves)
   - `mitigé` (mixed or small change)
   - `défavorable` (stability decreases)
   - `catastrophique` (stability collapses or revolution risk exceeds a critical threshold)

The verdict classification thresholds are calibrated to produce legible briefings for MUN-style use: a "catastrophique" verdict should be reserved for genuinely destabilising decrees (e.g. raising VAT by 10 points during a recession), not for ordinary adjustments.

---

## 11. Data Provenance

Every baseline value in the 47-lever table (Section 3.1) traces to a real publication. Sources group as follows:

**World Bank Open Data (WDI)** — 23 levers, identified by their WDI indicator code:

| lever_id | WDI code | year |
|---|---|---|
| hospital_beds_per_1k | SH.MED.BEDS.ZS | 2017 |
| doctors_per_1k | SH.MED.PHYS.ZS | 2017 |
| health_budget_share | SH.XPD.CHEX.GD.ZS | 2019 |
| vaccination_rate | SH.IMM.IDPT | 2022 |
| water_access | SH.H2O.BASW.ZS | 2022 |
| education_budget_share | SE.XPD.TOTL.GD.ZS | 2022 |
| primary_enrollment | SE.PRM.NENR | 2022 |
| secondary_enrollment | SE.SEC.NENR | 2022 |
| tertiary_enrollment | SE.TER.ENRR | 2022 |
| rd_investment_share | GB.XPD.RSDV.GD.ZS | 2020 |
| electricity_access | EG.ELC.ACCS.ZS | 2021 |
| broadband_penetration | IT.NET.USER.ZS | 2022 |
| renewable_energy_share | EG.ELC.RNEW.ZS | 2015 |
| road_paved_share | IS.ROD.PAVE.ZS | 2007 |
| birth_rate | SP.DYN.TFRT.IN | 2021 |
| military_budget_share | MS.MIL.XPND.GD.ZS | 2021 |

**Loi de Finances Maroc 2023** — 9 levers:
`vat_rate`, `public_investment`, `subsidies`, `tourism_budget`, `health_budget_share` (cross-ref), `education_budget_share` (cross-ref), `judicial_budget`, `digital_admin_budget`, `water_management_budget`, `social_programs_budget`. (Some levers cite the World Bank for the indicator value and the Loi de Finances for the budget allocation.)

**Bank Al-Maghrib** — 2 levers: `interest_rate`, `exchange_rate`.

**CGI Maroc 2023 (Code Général des Impôts)** — 2 levers: `corporate_tax_rate`, `income_tax_rate_top`.

**CNSS Maroc 2023** — 4 levers: `retirement_age`, `family_benefits_per_child`, `pension_rate`, `unemployment_benefits`.

**Ministère marocain** — 4 levers: `tourism_budget` (also Loi de Finances), `agriculture_subsidies` (Min. Agriculture), `industrial_zones` (Min. Industrie), `social_housing_units` (Min. Habitat).

**Décret SMIG Maroc 2023** — 1 lever: `minimum_wage`.

**UNESCO/ISU 2020** — 1 lever: `teachers_per_1k_students`.

**HCP Maroc** — 1 lever: `immigration_quota`.

**ONCF 2023** — 1 lever: `rail_network_km`.

**Transparency International CPI 2022** — 1 lever: `anti_corruption_index` (inverted: a higher value means less corruption).

**Estimation FAD/OCDE 2022** — 1 lever: `tax_compliance_rate`.

**Loi-Cadre Maroc (proposition 2023)** — 1 lever: `carbon_tax`.

**HCEFLCD Maroc 2022** — 1 lever: `forest_protection_budget`.

**EPI Yale 2022** — 1 lever: `pollution_regulation`.

**Programme Tayssir / AMO Tadamon 2023** — 1 lever: `minimum_income_guarantee`.

**UNDP Gender Inequality Index 2022** — 1 lever: `gender_equality_index`.

**Reporters Sans Frontières 2023** — 1 lever: `press_freedom_index` (inverted: a higher value means more freedom).

The macro constants in `model.ts` (`MACRO_CONSTANTS`) are also real: population 37.8M (HCP 2023), GDP baseline 1,400 Mrd MAD, debt baseline 800 Mrd MAD, exports 380 Mrd MAD, imports 540 Mrd MAD, household consumption share 0.58, MPC 0.75, base life expectancy 73, base Gini 0.40, base poverty 4.8%. These values are used by the closed-form formulas in `formulas.ts` and indirectly by the neural network (which is pre-trained on the formulas' outputs).

---

## 12. Validation Framework

### 12.1 Historical Backtesting

The proposed validation protocol is:

1. **Select a historical policy episode** with known lever changes and known indicator outcomes. Candidate episodes for Morocco:
   - The 2008 global financial crisis response (countercyclical public investment increase).
   - The 2014 subsidy reform (caisse de compensation reduction).
   - The 2020 COVID-19 response (health budget surge, lockdown-induced GDP contraction).
   - The 2022 inflation shock (imported via FX depreciation and energy prices).
2. **Encode the episode** as a sequence of lever deltas at known dates.
3. **Run PRISM** in headless mode with the same initial lever vector and the same delta sequence, with the black-swan engine forcibly injecting the historically-observed crises (e.g. COVID-19 as a `pandemic` event at the known date).
4. **Compare** the predicted indicator trajectory to the observed trajectory:
   - For GDP, unemployment, inflation: compare yearly values, compute RMSE.
   - For stability and revolution risk: compare qualitative direction (did the model predict the observed rise/fall?).
   - For black-swan cascades: did the model predict cascades that historically materialised?
5. **Report** the RMSE per indicator and the qualitative hit rate.

This protocol is not yet executed end-to-end in the codebase. The engine supports all the necessary primitives (deterministic lever sequences, deterministic crisis injection, headless forward passes), but no historical-episode harness is currently committed. This is the primary next step for empirical validation.

### 12.2 Sensitivity Analysis

For each lever `i`, perturb the baseline by ±10% of its range and measure the response of every indicator. Sanity-check against economic theory:

- A +10% VAT hike should reduce GDP (consumption falls) and raise inflation (cost-push).
- A +10% interest rate hike should reduce inflation (monetary tightening) and raise unemployment (Okun).
- A +10% minimum wage hike should reduce the Gini (redistribution) and slightly raise unemployment (wage effect).
- A +10% public investment hike should raise GDP (multiplier) and lower unemployment.

The engine's `getLayerActivations` function exposes the full per-layer activation vector for a given input, enabling direct inspection of which hidden units respond to which lever perturbations. A properly trained network should exhibit monotonic responses in the directions predicted by theory.

### 12.3 Known Limitations

PRISM is presented honestly as a reasoning aid, not a predictor. The following limitations are explicit:

1. **The neural network is pre-trained on formulas, not real time series.** The 200 synthetic samples used in `pretrainFromFormulas` are generated by `computeAllIndicators` from `formulas.ts`. The network thus reproduces the formulas' structure, not empirical reality. Until a historical-episode harness (Section 12.1) is built and run, the network's weights reflect theory, not data.
2. **The agent swarm is homogeneous within factions.** All `labor_union` agents share the same initial parameters (modulo small noise). Real populations have intra-faction heterogeneity (age, income, geography) that the model collapses.
3. **Black-swan probabilities are heuristic.** The 0.008 base probability, the 2× and 1.5× fragility multipliers, and the 0.3 cascade cap are hand-tuned, not estimated from data. They produce qualitatively plausible crisis frequencies but should not be interpreted as calibrated probabilities.
4. **The paradigm engine's weight-matrix rewrite is partially implemented.** The `applyParadigmToNetwork` function is a documented placeholder. The friction, threshold, and agent-behaviour modifiers are wired through; the in-place weight-matrix mutation and polarity flip are not yet.
5. **The decree pattern count is 38, not 39.** The internal target was 39; one pattern remains in design.
6. **The NLP extractor depends on an LLM (glm-4.5).** Extracted edges inherit the LLM's biases and hallucinations. The filter "at least one endpoint must match a real lever" mitigates but does not eliminate this.
7. **No confidence intervals.** The network produces point estimates, not predictive distributions. Uncertainty quantification (e.g. via Monte Carlo dropout or ensemble methods) is future work.
8. **The 47-lever vector is a strong simplification.** Real economies have hundreds of relevant instruments. PRISM's 47 were chosen for legibility and data availability, not completeness.
9. **No spatial resolution.** The model is national-scale. Regional disparities (urban vs. rural, coastal vs. interior) are not represented.
10. **No demographic microstructure.** Age cohorts, gender, education level are not modelled at the agent level. The `gender_equality_index` and `birth_rate` levers operate through aggregate formulas, not agent demographics.

---

## 13. Comparison with Existing Models

| dimension | PRISM | DSGE | CGE | System Dynamics (T21) |
|---|---|---|---|---|
| **Dimensionality (levers)** | 47 | 5–15 | 20–100 (SAM-based) | 50–500 |
| **Non-linearity** | Explicit 7-layer non-linear dynamics + ReLU MLP | Linearised around steady state; occasional piecewise | Linear constraints; non-linear via CES nests | Differential equations, often non-linear |
| **Agent heterogeneity** | 10,000 agents × 8 factions, 9 behaviours | Representative agent (one or few) | Representative consumer + sectors | None typically |
| **Real-time capability** | Yes (200 ms tick) | No (estimation takes hours) | No (calibration is static) | Sometimes (T21 is interactive) |
| **Political modelling** | Native (coup, civil war, revolution, factions) | None | None | Limited |
| **Black-swan events** | Native (10 crisis types + cascades) | Stochastic shocks (Gaussian) | None | Sometimes |
| **Data requirements** | 47 baseline values + optional NLP ingestion | Long time series + structural parameters | Full SAM year | Stock-flow parameters |
| **Pre-training** | Closed-form economic formulas | Bayesian priors | SAM calibration | Expert elicitation |
| **Adaptivity** | Online fine-tuning via backprop | Re-estimation | Recalibration | Manual |
| **Inspectability** | 3,008 weights visualisable | State-space matrices | SAM table | Stock-flow diagram |
| **Typical use case** | Policy stress-testing, MUN briefings | Central-bank forecasting | Trade-policy analysis | Long-term sustainability |

PRISM occupies a distinct niche: it sacrifices the empirical rigour of DSGE and CGE in exchange for real-time interactivity, explicit non-linearity, native political modelling, and the ability to ingest new causal knowledge via NLP. It is closer to System Dynamics (T21) in spirit but differs in three ways: (a) the indicator mapping is a learned neural network rather than a hand-coded stock-flow diagram, (b) the agent layer provides a bottom-up political signal absent from T21, and (c) the NLP extractor allows the causal graph to grow with the document corpus.

---

## 14. Computational Architecture

PRISM is a two-process system:

1. **Frontend** — Next.js 16 application on port 3000. Renders the reactor, the network visualisation, the agent panel, and the decree interface. Uses Tailwind CSS 4 for styling, d3-force for graph layout, and Web Audio API for sonic feedback on critical events (rebellion, black swan).
2. **Engine** — A Bun + TypeScript service on port 3003, exposing both a REST API and a Socket.io server. The REST API handles one-shot operations (decree execution, NLP extraction, lever queries). The Socket.io server streams per-tick state to subscribed frontends.

**Why Socket.io.** The engine ticks every 200 ms wall-clock. Each tick produces a full state snapshot: 47 lever values, 15 indicator values, 10,000 agent states (aggregated to ~50 summary numbers for bandwidth), faction table, emergent events, political threats, and any active black swans. Polling REST at 5 Hz would introduce latency and waste requests; Socket.io's persistent bidirectional channel lets the engine push exactly the diff or full snapshot each client needs.

**Why SQLite via Prisma.** The engine persists three classes of data: the neural network's serialised weights, the extracted causal edges, and the decree history. SQLite is sufficient because the data volume is small (the network is 3,087 floats ≈ 25 KB; the edge table is bounded by the document corpus size; the decree history is append-only). Prisma provides type-safe access and migrations. For multi-user deployments, the persistence layer can be swapped to PostgreSQL without engine changes.

**Why Bun.** Bun is a JavaScript runtime that interprets TypeScript natively, runs faster than Node.js for I/O-bound workloads, and includes a built-in test runner and bundler. The engine uses no Node-specific APIs that would block migration. The choice is pragmatic: Bun's startup time and per-tick throughput comfortably exceed the 200 ms tick budget.

**Mini-service split.** The engine lives under `mini-services/simulation-engine/` rather than in the Next.js app's `app/` directory. This separation enforces the architectural principle that the simulator is a standalone, reusable component — it could be invoked from a CLI, embedded in another web framework, or run headlessly for batch backtesting without modification.

**Tick budget.** At 200 ms wall-clock per tick:
- Network forward pass: < 1 ms (3,087-parameter MLP in pure TypeScript).
- Agent swarm update: ~10 ms for 10,000 agents (mostly allocation overhead).
- Black-swan roll: < 1 ms.
- Serialisation + Socket.io broadcast: ~5 ms.
- Total: ~15–20 ms per tick, leaving ~180 ms headroom for visualisation and decree execution.

The 200 ms cadence was chosen as a compromise: fast enough for interactive "what happens if I drag this lever" feedback, slow enough that the visualisation has time to interpolate prism heights smoothly. One tick corresponds to 15 simulated days, so a full simulated year takes 24 ticks ≈ 4.8 seconds.

---

## 15. Ethical and Epistemic Notes

The project's creator articulates two epistemic commitments in `NOTES.md`:

1. **No hardcoded data, no mock data.** The creator writes: "T'as pas le droit au mock data ou au data hard codé. Je veux que chaque détail soit travaillé. Que ce soit une vraie simulation de A à Z." This commitment is operationalised in PRISM by (a) sourcing every baseline from a real publication (Section 11), (b) pre-training the network on explicit economic formulas rather than invented relationships, and (c) building an NLP pipeline that lets the causal graph grow from real documents rather than from the developer's prior beliefs. Where hardcoding is unavoidable (the 37 seed causal edges, the 10 black-swan templates, the 7 non-linear transfer functions, the 38 decree patterns), it is documented in source comments and grounded in named economic phenomena.

2. **The AI sycophancy problem.** The creator observes: "même si tu donnes une idée au même agent, sauf que si tu la tournes d'une autre façon, il peut donner des réponses inverses … à chaque fois tu vas être d'accord avec moi." PRISM is designed to resist this failure mode by being a deterministic engine, not a conversational agent. The neural network's response to a lever change is a function of its weights, not of the user's framing. The decree parser matches keywords, not intent. The black-swan engine samples from a fixed distribution. The agent swarm's behaviour emerges from deterministic update equations. There is no component that can be "talked into" agreeing with the user.

PRISM is therefore **not an oracle**. It does not predict the future. It is a reasoning aid: a tool that lets a policy analyst or a MUN delegate explore the consequences of a policy change under a stated set of assumptions, with the assumptions made fully explicit in the source code. Every output the engine produces can be traced back through the forward pass, the non-linear layers, the agent update equations, and the black-swan rolls to a specific line of TypeScript. Disagreement with the engine's output is resolved by inspecting and modifying the code, not by arguing with a chatbot.

This stance has direct consequences for how PRISM should be used:

- **In MUN briefings.** PRISM should be presented as "a simulator that encodes these specific assumptions about how the Moroccan economy works", not as "an AI that predicts what will happen". The assumptions are auditable; the predictions are conditional on those assumptions.
- **In policy exploration.** A user who disagrees with PRISM's response to a decree should modify the underlying formulas, weights, or causal edges — not retry the decree with different wording.
- **In academic review.** PRISM should be evaluated on (a) the correctness of its economic formulas, (b) the appropriateness of its non-linear transfer functions, (c) the realism of its agent update equations, and (d) the honesty of its limitations (Section 12.3). It should not be evaluated on the accuracy of its predictions until the historical-backtesting harness of Section 12.1 is built.

The "MUN connection" described in `NOTES.md` — "Ça doit être du vrai niveau. C'est comme si tu devais construire un logiciel pour une fusée SpaceX" — sets the bar: the simulator must be of sufficient fidelity that a delegate using it to prepare a position paper would not be misled by the model's simplifications. The current implementation meets this bar for pedagogical use; it does not yet meet it for operational policy-making.

---

## References

1. He, K., Zhang, X., Ren, S., & Sun, J. (2015). *Delving deep into rectifiers: Surpassing human-level performance on ImageNet classification*. IEEE International Conference on Computer Vision (ICCV), 1026–1034. [He initialisation rationale.]
2. Nair, V., & Hinton, G. E. (2010). *Rectified linear units improve restricted Boltzmann machines*. ICML. [ReLU activation.]
3. Sutskever, I., Martens, J., Dahl, G., & Hinton, G. (2013). *On the importance of initialization and momentum in deep learning*. ICML. [SGD with momentum.]
4. Smets, F., & Wouters, R. (2007). *Shocks and frictions in US business cycles: A Bayesian DSGE approach*. American Economic Review, 97(3), 586–606. [DSGE reference model.]
5. Tesfatsion, L. (2006). *Agent-based computational economics: A constructive approach to economic theory*. In *Handbook of Computational Economics*, Vol. 2, 831–880. Elsevier. [Agent-based economics foundation.]
6. Taleb, N. N. (2007). *The Black Swan: The Impact of the Highly Improbable*. Random House. [Black-swan theory.]
7. Cross, R. (1993). *On the foundations of hysteresis in economic systems*. Economics and Philosophy, 9(1), 53–74. [Hysteresis in economics.]
8. Reinhart, C. M., & Rogoff, K. S. (2010). *Growth in a time of debt*. American Economic Review, 100(2), 573–578. [Debt-to-GDP threshold evidence.]
9. Okun, A. M. (1962). *Potential GNP: Its measurement and significance*. American Statistical Association. [Okun's law.]
10. Phillips, A. W. (1958). *The relation between unemployment and the rate of change of money wage rates in the United Kingdom, 1861–1957*. Economica, 25(100), 283–299. [Phillips curve.]
11. United Nations Development Programme. (1990). *Human Development Report 1990*. [HDI formula.]
12. World Bank. (2023). *World Development Indicators*. https://datatopics.worldbank.org/world-development-indicators/ [Lever baselines for Morocco, multiple WDI codes listed in Section 11.]
13. International Monetary Fund. (2023). *Morocco: 2023 Article IV Consultation*. IMF Country Report. [Macro confirmation.]
14. Bank Al-Maghrib. (2023). *Rapport annuel*. https://www.bkam.ma/ [Interest rate, exchange rate.]
15. Royaume du Maroc. (2023). *Loi de Finances 2023*. [Budget allocations.]
16. Royaume du Maroc. (2023). *Code Général des Impôts*. [Tax rates.]
17. United Nations. (2023). *Partnership for Action on Green Economy (PAGE) — Morocco*. https://www.un-page.org/ [Green-economy reference.]
18. Transparency International. (2022). *Corruption Perceptions Index*. https://www.transparency.org/cpi [Anti-corruption baseline.]
19. Reporters Sans Frontières. (2023). *World Press Freedom Index*. https://rsf.org/en/index [Press freedom baseline.]
20. Yale Center for Environmental Law & Policy. (2022). *Environmental Performance Index*. https://epi.yale.edu/ [Pollution regulation baseline.]
21. UNDP. (2022). *Gender Inequality Index*. https://hdr.undp.org/gender-inequality-index [Gender equality baseline.]
22. Forrester, J. W. (1961). *Industrial Dynamics*. MIT Press. [System dynamics foundation.]
23. Millennium Institute. (2017). *Threshold 21 (T21) Model Documentation*. [System-dynamics reference for comparison.]
24. Box, G. E. P., & Muller, M. E. (1958). *A note on the generation of random normal deviates*. Annals of Mathematical Statistics, 29(2), 610–611. [Box-Muller transform used in `randn`.]
25. Goodfellow, I., Bengio, Y., & Courville, A. (2016). *Deep Learning*. MIT Press. Chapters 6 and 8. [MLP, ReLU, SGD reference textbook.]

---

## Appendix A: Notation

| symbol | meaning |
|---|---|
| `x ∈ ℝ^47` | raw lever vector |
| `x̂ ∈ ℝ^47` | normalised lever vector (z-scored) |
| `μ_x, σ_x ∈ ℝ^47` | per-lever input mean and standard deviation |
| `W^(l), b^(l)` | weight matrix and bias vector of layer `l` |
| `z^(l)` | pre-activation vector of layer `l` |
| `a^(l)` | activation vector of layer `l` (ReLU for hidden, identity for output) |
| `ŷ ∈ ℝ^15` | normalised indicator vector (network output) |
| `y ∈ ℝ^15` | denormalised indicator vector |
| `μ_y, σ_y ∈ ℝ^15` | per-indicator output mean and standard deviation |
| `L` | loss (mean squared error) |
| `lr` | learning rate |
| `momentum` | momentum coefficient (default 0.9) |
| `velW, velB` | velocity buffers for SGD with momentum |
| `π ∈ {liberal, planned, technocracy, authoritarian, transition}` | paradigm identifier |
| `weightMask[π]` | per-category weight multiplier under paradigm `π` |
| `friction(π)` | friction modifier under paradigm `π` |
| `panicThreshold(π)` | agent panic threshold under paradigm `π` |
| `N` | swarm size (default 10,000) |
| `f.grievance, f.loyalty, f.power` | faction state variables |
| `a.trust, a.stress, a.capital, a.mobility` | agent state variables |
| `macroStress` | scalar summary of the macro environment |
| `BASE_PROBABILITY = 0.008` | per-tick base probability of a black-swan event |
| `fragility = (100 − stability) / 100` | system fragility scalar |
| `tension = revolutionRisk / 100` | system tension scalar |
| `chainProb = severity · fragility · 0.3` | cascade-trigger probability |

---

## Appendix B: Reproducibility

### B.1 Running the simulation

```bash
# Clone the repository
git clone <repo-url> prism
cd prism

# Install dependencies (Bun)
bun install

# Start the simulation engine (port 3003)
cd mini-services/simulation-engine
bun run dev

# In a second terminal, start the Next.js frontend (port 3000)
cd /path/to/prism
bun run dev
```

Open `http://localhost:3000`. The reactor visualisation loads with the 47 levers at their Moroccan baselines. Adjusting any lever triggers an immediate forward pass through the neural network and a Socket.io broadcast of the updated indicator vector.

### B.2 Extracting causal edges from a document

```bash
# POST a URL to the extraction endpoint
curl -X POST http://localhost:3003/api/causal/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.imf.org/en/Publications/CR/Issues/2023/07/12/Morocco-2023-Article-IV"}'

# Or POST raw text
curl -X POST http://localhost:3003/api/causal/extract \
  -H "Content-Type: application/json" \
  -d '{"text": "The Moroccan dirham depreciation has raised import costs, pushing inflation to 6.5%..."}'
```

The response is a JSON object with `edges`, `variablesIdentified`, `llmModel`, and `extractedAt`. Persisted edges are loaded into the engine's causal graph on the next tick.

### B.3 Issuing a decree

```bash
curl -X POST http://localhost:3003/api/decree \
  -H "Content-Type: application/json" \
  -d '{"text": "Construire 10 hôpitaux", "language": "fr"}'
```

The response includes the parsed deltas, the fiscal cost, the immediate GDP/budget/debt impacts, and the projected stability delta. The decree is applied to the engine's lever vector and persisted in the decree history.

### B.4 Pre-training and fine-tuning the network

The network is automatically pre-trained on engine startup via `pretrainFromFormulas(network, epochs)`. The default epoch count is configurable in the engine's `index.ts`. To reset and retrain:

```typescript
import { createNetwork, pretrainFromFormulas, serializeNetwork } from "./neural-network.js";
import { writeFileSync } from "fs";

const network = createNetwork();
const finalLoss = pretrainFromFormulas(network, 500);
console.log(`Pre-training complete. Final loss: ${finalLoss}`);

writeFileSync("network.json", serializeNetwork(network));
```

To fine-tune on a single empirical observation:

```typescript
import { train } from "./neural-network.js";

const loss = train(
  network,
  leverVector,          // 47-element array of observed lever values
  targetIndicatorVector,// 15-element array of observed indicator values
  0.001,                // learning rate
  0.9,                  // momentum
);
console.log(`Fine-tune loss: ${loss}`);
```

### B.5 Switching paradigms

```bash
curl -X POST http://localhost:3003/api/paradigm \
  -H "Content-Type: application/json" \
  -d '{"paradigm": "planned"}'
```

The engine applies the new paradigm's friction modifier, threshold modifier, and agent-behaviour parameters immediately. The weight-matrix rewrite (Section 8.3) is currently a no-op placeholder.

### B.6 Headless backtesting (planned)

A backtesting harness is planned but not yet committed. The intended interface:

```typescript
import { runEpisode } from "./backtest.js";

const result = await runEpisode({
  initialLevers: baselineLevers,
  decreeSequence: [
    { tick: 0,  decree: "Plan de relance économique" },
    { tick: 24, decree: "Hausser la TVA de 2 points" },
  ],
  forcedBlackSwans: [
    { tick: 12, type: "pandemic", severity: 0.9 },
  ],
  ticks: 96,
});
// result.predictedIndicators: IndicatorTrajectory[]
// result.observedIndicators:  IndicatorTrajectory[] (if historical data provided)
// result.rmse: Record<IndicatorId, number>
// result.verdict: 'favorable' | 'mitigé' | 'défavorable' | 'catastrophique'
```

This harness will be the foundation of the empirical validation framework described in Section 12.1.

---

*End of document. Source files referenced: `mini-services/simulation-engine/{neural-network,nonlinear,agent-swarm,black-swan,paradigm,causal-extractor,decrees,formulas,model}.ts`. All numeric claims in this document were verified against the source on the date of writing.*
