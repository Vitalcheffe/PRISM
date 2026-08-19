# PRISM — Fresh Audit (A → Z)

> Independent, first-look audit by an engineer who had never seen this project
> before. No trust placed in pre-existing reports (`FINAL_AUDIT.md`,
> `BILAN_FINAL.md`, `BILAN.md`, `TEST_REPORT.md`). Every claim below was
> verified by running the command or reading the file.
>
> Date: 2026-08-18. Repo at commit `4db2ee5`.

---

## 0. Headline

**Overall score: 71 / 100**

**Verdict: Do not submit to MIT yet.** The project has genuine engineering
substance (7,521 lines of engine TypeScript, a custom MLP implemented from
scratch, real Moroccan data, 90 polished visualizations). But three things
would be caught instantly by a reviewer who clones the repo, and all three
violate MIT's explicit criteria:

1. **The test suite does not pass.** README claims `304 pass · 0 fail · ~5s`.
   Reality: 341 tests across 9 files, of which **2 are `.skip`-ed** and
   **1 (hyperparameter search) times out after 5000 ms and fails**, while
   the training loop prints `train Infinity · val Infinity` to stdout. The
   deep-learning pipeline is numerically broken in its current state.
2. **Three git commits have UUIDs as their entire message**
   (`2909c5fa-0b14-4a89-baf8-a54e09de2994`,
   `3750d8b6-87dc-4b28-964b-5ef1a0b1c1fd`,
   `75ea5c1b-e485-435b-8703-677846732226`). MIT explicitly values *"build
   process > end result"* — these commits look programmatic, not authored.
3. **Stale counts everywhere.** README says `263 tests`, the tests section
   says `304 pass`, `MIT_MAKER_PORTFOLIO.md` says `304 tests`, the prior
   `FINAL_AUDIT.md` says `339 tests`, the actual count is **341** (339
   non-skipped). No two documents agree.

Fix those three, and PRISM becomes a defensible MIT submission. Without the
fixes, a reviewer will conclude the candidate inflated claims and decline.

---

## 1. What this project actually is

From a fresh read of `README.md`, `RESEARCH.md`, `docs/math.md`,
`MIT_MAKER_PORTFOLIO.md`, the source tree, and the live app on port 81:

PRISM is a **non-linear macroeconomic policy simulator for Morocco**, built
as a single-page Next.js 16 application backed by a Bun-based simulation
engine. The pipeline is:

```
47 policy levers (real World Bank / IMF / Loi de Finances values)
   → 47→32→32→15 MLP (3,008 weights, custom, no TF/PyTorch)
   → 7 non-linear layers (threshold, bifurcation, hysteresis, feedback,
                          cascade, runaway, thermodynamic equilibrium)
   → 15 economic indicators (GDP, unemployment, inflation, debt, HDI,
                             Gini, poverty, stability, revolution risk, …)
   → 10,000 agents across 8 factions reacting each 200 ms tick
   → optional French-language decree parser → 2-year projection → verdict
   → optional NLP causal extractor hitting an LLM on World Bank URLs
```

It is wrapped in an "operating system" metaphor — a `Kernel` running a
12-phase lifecycle every tick (`BOOT, EXTRACT, NEURAL, NONLINEAR, SWARM,
LIFECYCLE, GOVERN, BLACKSWAN, PARADIGM, COMMIT, EMIT, HALT`), plus a `Life`
system (demographics, 8 life stages) and a `Governance` system (8
ministries, 500 Mrd MAD budget, leakage). The frontend exposes live views
of all of this (globe, neural pass, force graph, kernel phase timings,
governance matrix, life cycle).

The live app at `http://localhost:81/` returns a real, populated HTML
shell (1,364 bytes of markup visible on a plain `curl`). It runs.

This is **not** a toy or a slide-deck project. It is a research instrument
with a coherent thesis: *policy intuition is wrong about non-linear systems;
formalize the everyday reality of a country with disproportionate rigor.*

---

## 2. Code quality — real, not fake

Verified directly, not from claims:

| File | Lines | Verdict |
|---|---:|---|
| `engine.ts` | 1,257 | Real orchestration code |
| `decrees.ts` | 989 | Real French NLP parsing (38 patterns) |
| `neural-network.ts` | 826 | **Real custom MLP** — `Float64Array` weights, He init, ReLU, SGD+momentum, forward + backprop, serialization |
| `model.ts` | 776 | 47 levers + 15 indicators, real World Bank codes (`NY.GDP.MKTP.CD`) |
| `formulas.ts` | 521 | Real Okun / Phillips / HDI / Gini / Reinhart-Rogoff implementations |
| `life.ts` | 604 | Real population pyramid, fertility, household, death-replacement loop |
| `agent-swarm.ts` | 403 | Real faction-aware stress/trust/capital agents |
| `governance.ts` | 339 | Real ministry budgets, leakage, capacity drift |
| `nonlinear.ts` | 170 | Real 7-layer transform stack |
| `paradigm.ts` | 303 | Partial — see weakness #3 below |
| `kernel.ts` | 340 | Real 12-phase lifecycle |
| `black-swan.ts` | 354 | Real 10-crisis cascade model |
| `causal-extractor.ts` | 258 | Real LLM-prompted extraction pipeline |
| `model-loader.ts` | 17 | Trivial shim |
| `index.ts` | 364 | Bun + Socket.io server |
| **Total** | **7,521** | Matches `wc -l mini-services/simulation-engine/*.ts` |

The trained model checkpoint (`training/checkpoints/trained-model.json`) is a
real ~65 KB JSON file containing 3,008 floating-point weights — not a stub.
The `MOROCCO_HISTORICAL` array in `neural-network.ts` has 6 real anchor years
(2000, 2005, 2010, 2015, 2020, 2023) with plausible HDI / unemployment /
debt / life-expectancy values.

**Code style:** mixed French and English comments, generous with references
to source material (Reinhart-Rogoff, UNDP HDI formula). Reads like an
engineer's notebook, not a polished open-source library. Acceptable for an
individual research project; would fail a corporate lint pass.

**Verdict: code is real.** No mock data, no placeholders dressed up as
implementations, no `console.log("simulating...")` theatre. The substance
exists.

---

## 3. Tests — the part that fails

### What the docs claim

- `README.md` §Tests: *"304 pass · 0 fail · 98,648 expect() calls · ~5s"*
- `README.md` §How it works: *"a 263-test suite verifies every claim"*
- `MIT_MAKER_PORTFOLIO.md`: *"304 tests verify every claim"*
- Pre-existing `FINAL_AUDIT.md`: *"339 actual tests"*

### What is actually true

I ran each test file individually because the full `bun test` run hangs
past the 5-minute tool timeout.

| File | Tests | Skipped | Result | Time |
|---|---:|---:|---|---:|
| `backtest.test.ts` | 41 | 0 | ✅ pass | 3.19 s |
| `formulas.test.ts` | 49 | 0 | ✅ pass | 81 ms |
| `governance.test.ts` | 31 | 0 | ✅ pass | 86 ms |
| `kernel.test.ts` | 41 | 0 | ✅ pass | 6.69 s |
| `life.test.ts` | 37 | 0 | ✅ pass | 3.48 s |
| `model.test.ts` | 24 | 0 | ✅ pass | 38 ms |
| `neural-network.test.ts` | 35 | 0 | ✅ pass | 212 ms |
| `nonlinear.test.ts` | 46 | 0 | ✅ pass | 34 ms |
| `training.test.ts` | 37 | 2 | ❌ **1 fails (timeout)** | >60 s |
| **Total** | **341** | **2** | **1 failing** | **>73 s, not 5 s** |

### The specific failure

The test `hyperparameter-search > runHyperparameterSearch returns 81 results
sorted by val loss (best first)` (line 437 of `tests/training.test.ts`)
**times out after 5,000 ms**. The actual run took 51,929 ms before the
timeout fired. Meanwhile the test's stdout shows the training loop emitting:

```
epoch 0 · train Infinity · val Infinity · lr 0.003000
epoch 10 · train Infinity · val Infinity · lr 0.001500
epoch 0 · train 17.546756 · val Infinity · lr 0.010000
…
```

Validation loss is `Infinity` for almost every grid point. This is not a
slow-but-correct pipeline — **the deep learning training is numerically
broken** in the current commit. Two adjacent tests (`"Trainer reduces val
loss over epochs"` and `"Trainer reduces train loss over epochs"`, lines 248
and 265) are `test.skip`-ed — i.e. **the candidate knows the loss does not
reduce and skipped the assertions**.

This is consistent with what the pre-existing `TRAINING_REPORT.md` and
`VALIDATION.md` admit (R² = −0.39 on test, val loss explodes to
`1.3e+97` for one config). The honesty is commendable. The test-suite
claim in the README is not honest: it says `0 fail` and `~5s` while one
test fails and the suite takes over a minute.

### What the other 8 files look like

The 304 non-training assertions are real and meaningful. Examples from
`neural-network.test.ts`:

- *"the arithmetic (47×32) + (32×32) + (32×15) = 3008 weights"* — verified.
- *"layer-0 weights have std ≈ √(2/47) ≈ 0.2063 (He init for ReLU)"* —
  actually probes the math, not just the shape.
- *"forward() is deterministic — same input → same output across 100 runs"*.
- *"repeated train() on the same sample reduces the loss"* — passes for
  small samples, which is exactly the regime where the global hyperparameter
  search breaks.

These are not `expect(true).toBe(true)` filler. They are real
specifications.

### Verdict on tests

**303/341 tests pass and are meaningful. 2 are skipped because they would
fail. 1 fails outright. The README's "304 pass · 0 fail · ~5s" is false on
three of the four numbers.**

---

## 4. Documentation quality

| Document | Words/lines | Verdict |
|---|---:|---|
| `README.md` | 365 lines | Polished, well-structured, picture-tag adaptive. But contains stale test counts. |
| `RESEARCH.md` | 1,299 lines (≈13,500 words) | Formal academic structure (Abstract, Problem Statement, System Overview, …, Limitations, Comparison with DSGE). Real methodology, not boilerplate. |
| `docs/math.md` | 375 lines | Proper notation table, weight-count derivation `(47×32)+(32×32)+(32×15)=3008`, forward-pass equations, He init, hysteresis math. Real. |
| `docs/KERNEL.md` | — | 12-phase spec, syscalls. |
| `docs/GLOSSARY.md` | — | Ubiquitous-language definitions. |
| `docs/TELEMETRY.md` | — | Observable signals + event contracts. |
| `VALIDATION.md` | 589 lines | Auto-generated by `validation/run-validation.ts`, real numbers (R², Jacobian, hysteresis scar). |
| `BACKTEST.md`, `TRAINING_REPORT.md`, `TEST_REPORT.md` | — | Real, and brutally honest about the broken NN training. |
| `MIT_MAKER_PORTFOLIO.md` | 278 lines | Compliance matrix + 25-attachment plan + 120-second video script. |

The documentation is **significantly above high-school submission level**.
The `RESEARCH.md` reads like a master's thesis chapter. The honest
limitations section (7 items, including "the bankruptcy cascade triggers
unrealistically early" and "the paradigm weight-matrix rewrite is a V1
placeholder") is exactly the kind of intellectual honesty MIT explicitly
rewards.

The single flaw: stale numbers propagate. README says `263` in one paragraph
and `304` in another. MIT portfolio says `304`. Pre-existing FINAL_AUDIT
says `339`. The truth is `341`. A reviewer who runs `bun test` will see the
mismatch immediately.

---

## 5. Visual system quality

| Asset | Count / size | Verdict |
|---|---|---|
| PNG diagrams in `docs/` | **45** | All named, dark + light variants for every concept (reactor, neural-active, agent-swarm, causal-graph, decree-projection, black-swan-cascade, paradigm-shift, hysteresis-scar, thermodynamic-balance, data-provenance, kernel-architecture, life-cycle, governance-matrix, emergence, manifesto, architecture, banner×3, nonlinear-stack, token-economy, paradigm-delta, neural-active). |
| HTML diagram sources | **45** | One-to-one with PNGs — every diagram is regenerable from HTML, not opaque screenshots. |
| `docs/gallery.html` | — | Scrollable single-page gallery. |
| `docs/architecture-interactive.html` | — | Clickable codebase dependency graph. |
| `public/PRISM_launch_film.mp4` | **17 MB, 75 s, 1080p60** | Within MIT's 2-minute limit. Has synced generative audio. |
| `video/` | render-batch.ts + frames/ + audio/ | Real render pipeline, reproducible. |

**The visual system is the strongest single dimension of the project.**
45 hand-built dark/light-adaptive diagrams is more than most graduate
research portfolios ship. The launch film is real and within spec.

One caveat: I did not visually inspect the PNG content. They could be
beautiful or could be auto-generated filler. The fact that each has a
matching HTML source strongly suggests the former.

---

## 6. MIT Maker Portfolio readiness

Audited against the four MIT criteria (three official + the determining
non-official one).

### Criterion 1 — Substantial ✅ PASS (strong)

7,521 lines of engine TS, 92 frontend files, 341 tests, 90 visualization
assets, 13k-word research doc, real trained-model checkpoint. Substance is
not in doubt.

### Criterion 2 — Original ✅ PASS (strong)

The 12-phase Kernel as an operating-system metaphor for macroeconomic
simulation has no analogue in DSGE/CGE literature or any student project
I have seen. The combination of (a) custom MLP from scratch + (b) LLM
causal extraction + (c) 7 named non-linear layers + (d) 10k-agent swarm
with 8 factions + (e) life cycle + (f) governance leakage model is
genuinely novel at this scale.

### Criterion 3 — Technically creative ⚠️ PASS-with-caveat

The custom MLP, the Gap-3 diagnosis ("at baseline all normalized inputs
are 0, so layer-0 weights get zero gradient"), and the layer-0 LR
multiplier + bias-decay fix are real engineering creativity.

**But:** the deep-learning pipeline this creativity was supposed to enable
**produces `Infinity` loss**. The candidate documented this honestly in
TRAINING_REPORT.md, which is admirable — but a reviewer who reads
`tests/training.test.ts` and sees `test.skip("Trainer reduces val loss over
epochs")` will reasonably ask: *if the loss does not reduce, is the
"deep-learning pipeline" claim performative?*

### Criterion 4 — Build process > end result ❌ FAIL on three commits

29 commits total. 26 have proper `feat:` / `fix:` / `docs:` messages
describing real units of work. Three commits have **only a UUID as the
message**:

```
4db2ee5  2909c5fa-0b14-4a89-baf8-a54e09de2994
a92b141  3750d8b6-87dc-4b28-964b-5ef1a0b1c1fd
d221fd6  75ea5c1b-e485-435b-8703-677846732226
```

This is the single most damaging finding for MIT submission. MIT's most
repeated criterion is *"we are more interested in your build process than
your end results."* Three commits with no human-readable message read as
either (a) automated commits the candidate did not author, or (b)
carelessness about the single artifact MIT explicitly scrutinizes. Either
interpretation is disqualifying unless explained.

### Video ✅ EXISTS (within spec)

75 seconds, 1080p60, no face-cam, generative audio. Under the 2-minute cap.
Has a script in `MIT_MAKER_PORTFOLIO.md` §IV.

### Honest limitations ✅ STRONG

README §Limitations lists 7 items, including the painful ones (NN
generalizes poorly out-of-distribution; paradigm rewrite is V1 placeholder;
bankruptcy cascade triggers too early; black-swan probabilities are
heuristic). This is the right shape of honesty.

### Pre-existing `FINAL_AUDIT.md` says "78/100, ready after 4 fixes"

I disagree with the score and the readiness call. The pre-existing audit
is well-researched but lenient on two points I weight heavily:

1. It calls the deep-learning pipeline "the most fragile part" but does
   not flag that the test suite literally **fails** on a timeout, not just
   produces a bad R². A failing test is a different category of issue
   from a bad metric.
2. It does not mention the three UUID-only commits at all.

---

## 7. Score breakdown

| Criterion | Weight | Score | Weighted |
|---|---:|---:|---:|
| Code substance & originality | 25 | 88 | 22.0 |
| Test suite honesty & quality | 20 | 55 | 11.0 |
| Documentation quality | 15 | 90 | 13.5 |
| Visual system | 10 | 92 | 9.2 |
| Build process (git history) | 15 | 60 | 9.0 |
| MIT criteria alignment | 15 | 75 | 11.25 |
| **Total** | **100** | | **76.0** |

Subtract 5 points for the README/MIT-portfolio fabrication of test counts
(claiming `304 pass · 0 fail` when one test fails and the suite takes >73 s,
not 5 s).

**Final: 71 / 100.**

---

## 8. Top 3 strengths

1. **Genuine engineering substance at unusual scale for a student
   project.** 7,521 lines of engine TS, a hand-written MLP (no TF/PyTorch),
   real World Bank indicator codes, real Moroccan historical anchor years,
   a 12-phase Kernel that actually runs every 200 ms tick, a 10k-agent
   swarm with faction-aware stress. The candidate built a real instrument,
   not a slide deck.
2. **The visual + documentation system is exceptional.** 45 dark/light
   adaptive diagrams each with a regenerable HTML source, a 13k-word
   `RESEARCH.md` with formal academic structure, a 375-line `math.md` with
   proper notation, an auto-generated `VALIDATION.md` with real numbers,
   and a 75-second launch film within MIT's 2-minute cap.
3. **Intellectual honesty about limitations.** Seven documented
   limitations including the painful "NN generalizes poorly
   out-of-distribution" and "paradigm rewrite is V1 placeholder". The
   `TRAINING_REPORT.md` openly reports `R² = −0.39` and `val loss = 1.3e+97`.
   This is the exact disposition MIT rewards.

## 9. Top 3 weaknesses

1. **The deep-learning pipeline is numerically broken and the test suite
   misrepresents this.** `tests/training.test.ts` line 437
   (`runHyperparameterSearch returns 81 results`) **times out and fails**,
   the training loop prints `train Infinity · val Infinity` to stdout, and
   two adjacent tests (`"Trainer reduces val loss over epochs"` and
   `"Trainer reduces train loss over epochs"`) are `test.skip`-ed because
   they would fail. README claims `304 pass · 0 fail · ~5s`. The actual
   state is `338 pass · 2 skip · 1 fail · ~73 s`. This is the difference
   between "honest about a fragile pipeline" and "fabricating a green
   test suite". MIT will catch this in 30 seconds.
2. **Three git commits have UUIDs as their entire message**
   (`4db2ee5`, `a92b141`, `d221fd6`). MIT's most-cited criterion is
   *"build process > end result"*. Three commits with no human-readable
   message read as either automated commits the candidate did not author
   or carelessness about the one artifact MIT explicitly scrutinizes.
   Either is disqualifying unless explained in the SlideRoom questionnaire.
3. **Stale numbers propagated across the documentation set.** `263` /
   `304` / `339` / `341` appear in different documents for the same
   metric (test count). Commit count is variously claimed as `21`
   (`MIT_MAKER_PORTFOLIO.md`), `24` (`FINAL_AUDIT.md`), actual is `29`.
   README says "7,070 lines moteur", actual is `7,521`. None of these
   individually is fatal; the pattern is. A reviewer who finds three
   mismatched numbers in three documents will distrust every other
   quantitative claim, including the load-bearing ones (3,008 weights,
   10,000 agents, 47 levers, 8 factions — all of which happen to be
   correct).

---

## 10. Would I recommend a student submit this to MIT?

**No, not in the current state. Not yet.**

The project has the substance, originality, and intellectual honesty MIT
is looking for. It does not yet have the discipline. Specifically, a
reviewer who clones the repo and runs the four commands in the README
will, in under five minutes, discover that:

1. `bun test` does not finish in 5 seconds.
2. One test fails outright.
3. The README says `304 pass · 0 fail` while `bun test` reports `1 fail`.
4. Three of the most recent commits have UUIDs instead of messages.

The fix list, in priority order:

1. **Fix or remove the hyperparameter-search test.** Either fix the
   numerical instability in `trainer.ts` that produces `Infinity` loss
   (likely an unbounded activation or a missing gradient clamp), or
   reduce the grid size in the test (e.g. `nSynthetic: 50`, `searchEpochs:
   2`) so it completes within the 5-second per-test budget, or mark it
   `test.skip` with an honest comment referencing the broken state. Do
   **not** leave it failing while the README claims `0 fail`.
2. **Un-skip the two `test.skip`-ed loss-reduction tests** once the
   trainer is stable, or delete them with an honest explanation in the
   commit message. Hidden skips look like concealment.
3. **Rewrite the three UUID-only commit messages** with
   `git commit --amend` (for the tip) or interactive rebase, replacing
   each UUID with a real `feat:`/`fix:`/`docs:` subject. If the commits
   are genuinely automated (CI artifacts?), move them to a separate
   branch and keep `main` author-only.
4. **Reconcile every stale count.** Pick the actual numbers (`341 tests`,
   `29 commits`, `7,521 lines`, `3,008 weights`, `10,000 agents`,
   `47 levers`, `8 factions`, `90 visualization files`) and use them
   verbatim in README, RESEARCH.md, MIT_MAKER_PORTFOLIO.md,
   BILAN_FINAL.md, and every other doc. A single source of truth.
5. **Then re-run the audit.** If steps 1–4 are done, I would expect the
   score to move from 71 → 84 and my recommendation to flip from "no"
   to "yes, submit".

The candidate built something real and rare. The candidate then cut
corners on the part MIT weighs most heavily — the integrity of the
artifact. The fix is hours, not weeks. Until the fix lands, this is a
strong project with a self-inflicted wound.

---

<div align="center">

*Fresh audit · 2026-08-18 · commit `4db2ee5`*

*"Build process > end result." — MIT Admissions*

</div>
