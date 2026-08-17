# PRISM — Final MIT Maker Portfolio Audit

> Final compliance audit before MIT submission. Brutally honest.
> Auditor: MIT Maker Portfolio audit agent.
> Date: 2026-08-17 (post-commit d221fd6).

---

## 0. Headline

**Overall readiness score: 78 / 100**

**Verdict: Ready to submit after 4 specific fixes.** The technical substance, originality, and build process are at MIT level. The blocker is operational, not technical: the 2-minute video does not exist yet, the technical PDF has not been compiled, and the video script contains one fabricated number (`R² 0.99 on test set`) that MIT will catch instantly because TRAINING_REPORT.md says `R² = −0.39`. Fix those four things and PRISM is submittable.

---

## 1. Per-criterion MIT audit

The MIT Maker Portfolio evaluates three official criteria plus one non-official but determining criterion. Each is audited below.

### Criterion 1 — Substantial ✅ PASS (strong)

**Evidence (verified, not claimed):**
- Engine: 15 TypeScript files, **7,521 lines** (was claimed 7,070 — BILAN undersells by 451 lines). Source: `wc -l mini-services/simulation-engine/*.ts`.
- Frontend: **92 source files, 15,029 lines** of TS/TSX. Source: `find src -type f`.
- Tests: **339 actual tests** across 9 files (anchored regex `^\s*(it|test)\(`).
  - `model.test.ts:24`, `formulas.test.ts:49`, `nonlinear.test.ts:46`, `neural-network.test.ts:35`, `life.test.ts:37`, `governance.test.ts:31`, `kernel.test.ts:41`, `backtest.test.ts:41`, `training.test.ts:35`.
  - **Inconsistency:** README says "263 tests", BILAN_FINAL says "304 tests", MIT_MAKER_PORTFOLIO says "305 tests". The truth is 339. All three docs are stale.
- Commits: **24 actual** (was claimed 21 in 7 places across BILAN_FINAL.md ×4 and MIT_MAKER_PORTFOLIO.md ×3). Source: `git rev-list --count HEAD`.
- Visualisations: **45 PNGs + 45 HTML sources** in `docs/`.
- Documentation: **36,666 words** across 11 markdown files (RESEARCH.md alone is 13,491 words — claim verified).
- Validation harness: 5-file harness under `validation/` produces VALIDATION.md (7,281 words, real numbers, regenerable).
- Backtest: 6 real Morocco data points (2000, 2005, 2010, 2015, 2020, 2023) from World Bank / IMF.
- Deep learning pipeline: 3-file pipeline under `training/` (data-pipeline, trainer, run-training) produces TRAINING_REPORT.md.

**What a reviewer sees:** A serious research instrument, not a toy. The engine alone is 7.5k lines of TS, the test suite is 339 tests, and there are four empirical artifacts (VALIDATION.md, BACKTEST.md, TRAINING_REPORT.md, TEST_REPORT.md) — none of which are typical for a high-school submission.

**What's missing for full marks:**
- The README undersells the project. It still says "263 tests" when the truth is 339. A reviewer who clones the repo and runs `bun test` will see 339 and immediately distrust the README's other claims. **Fix: update all stale counts.**

---

### Criterion 2 — Original ✅ PASS (strong, with one honest caveat)

**Evidence:**
- **The 12-phase Kernel** (BOOT, EXTRACT, NEURAL, NONLINEAR, SWARM, LIFECYCLE, GOVERN, BLACKSWAN, PARADIGM, COMMIT, EMIT, HALT) is a genuinely original metaphor — formalising a macroeconomic simulation as an operating system with subsystems, syscalls, and a tick budget. No equivalent in DSGE/CGE literature or in any student project we know of. Specified in `docs/KERNEL.md` (2,332 words) and implemented in `kernel.ts` (340 lines, 41 tests).
- **The Life system** (population pyramid, 8 life stages from infant to deceased, fertility, household formation, generation turnover in 360 ticks) is original for an economic simulator at this scale. Source: `life.ts` (604 lines, 37 tests).
- **The Governance system** (8 ministries with real budget allocations totalling 500 Mrd MAD, bureaucratic leakage, capacity drift, paradigm-driven reallocation) is original. Source: `governance.ts` (339 lines, 31 tests).
- **NLP causal extraction** from live World Bank / IMF URLs (115 keyword entries, signed coefficient + delay + confidence + provenance URL per edge, persisted to SQLite) is original. Source: `causal-extractor.ts` (258 lines).
- **Seven named non-linear layers** (critical threshold, bifurcation, hysteresis, feedback, cascade, runaway, thermodynamic equilibrium) implemented as documented complexity-economics phenomena. Source: `nonlinear.ts` (170 lines, 46 tests).
- **The decree engine** parses 38 French NLP patterns and projects 2 years forward with a 4-class verdict. Source: `decrees.ts` (989 lines).

**What a reviewer sees:** A system with no obvious precedent. The closest analogues are DSGE models (which are not interactive, not politically aware, and do not extract causality from documents) and MUN-style simulation games (which are not data-grounded). PRISM is neither — it occupies a previously empty operating point.

**What's missing for full marks:**
- README Limitation #4 is brutally honest: *"The paradigm weight-matrix rewrite is a V1 placeholder. … The polarity inversion shown in the paradigm-delta visualization is architectural intent, not implemented behavior."* This is exactly the kind of honesty MIT wants — but a reviewer who reads `paradigm.ts` (303 lines) and then reads the limitation will see that the most ambitious claim in the README (*"Switching political regime doesn't just change parameters. It rewrites the causal weight matrix and flips edge polarities."*) is overstated relative to the implementation. **Not a blocker** (honesty > completeness), but the README's paradigm section should explicitly say "V1: parameter mask; V2 (planned): true matrix rewrite" so the reviewer doesn't feel misled.

---

### Criterion 3 — Technically creative ✅ PASS (strong, with one painful honesty gap)

**Evidence:**
- **Custom MLP from scratch** — `neural-network.ts` (826 lines). No TensorFlow, no PyTorch. He initialisation, ReLU, SGD with momentum, z-score normalisation, forward + train + trainEpoch. 35 tests verify weight count (3,008), determinism, He statistics, gradient shape.
- **The Gap-3 fix is genuinely creative.** The diagnosis: at baseline, every normalised input is exactly 0 (inputMean = lever.baseline), so layer-0 weight gradients are 0, so the network encodes the baseline signal in biases instead of weights. The fix combines a layer-0 LR multiplier (3×) with an inverted L2 ("bias decay") that forces the network to encode signal in weights. This is not textbook — it's a custom patch discovered empirically. Documented in `BACKTEST.md` §6 with verification numbers (layer-0 weight max abs: 0.89 → 1.42, +60%).
- **Hysteresis scar model** — unemployment returns to baseline after a shock, but stability shows a persistent 3-point scar that decays over 18 months. This is a real complexity-economics phenomenon (hysteresis in labour markets) implemented as a documented transform. Verified by `hysteresis-verification.ts`.
- **Thermodynamic equilibrium primitive** — over-optimisation penalty surface that conserves "fitness" the way a thermodynamic system conserves energy. Implemented as the diminishing-returns saturation in `nonlinear.ts`.

**What a reviewer sees:** A student who implemented a neural network from scratch, diagnosed a non-trivial gradient-flow bug, and invented a fix that combines two known techniques (layer-specific LR + bias decay) in a way that is not in any textbook they will recognise. That is the exact shape of technical creativity MIT is looking for.

**What's missing for full marks:**
- **The deep learning pipeline produces a bad model, and that is documented honestly.** TRAINING_REPORT.md says: test-set R² = −0.39 (i.e. worse than predicting the mean), grid search val loss explodes to `1.3e+97` for one config, training curve goes from `43.4 → 3.02e+92` (literal Infinity on epoch 20). This is the single most fragile part of the submission. **Honesty-wise it's perfect** — MIT explicitly says "build process > end result". **Risk-wise it's significant** — a reviewer who reads TRAINING_REPORT.md carefully may conclude that the "deep learning pipeline" claim is performative. The mitigation is to lead with the diagnosis (the Gap-3 fix is the real contribution) rather than the result (the trained model is not good). The TRAINING_REPORT.md already does this in §7-8 but the headline number (R² = −0.39) is the first thing a reviewer sees in §5.

---

### Criterion 4 — Build process > end result ✅ PASS (strong, but the worklog breaks at commit 21)

**Evidence:**
- **24 commits with organic history** — each commit message describes a real unit of work (`fix: wire Kernel into live engine, fix impossible indicator values`, `feat: close all 6 remaining gaps — backtesting, real-data NN, atmosphere, calibration`). No squash. The history reads like an engineer thinking out loud.
- **Bugs found and fixed, documented:** life expectancy 147.8 → 70.5; HDI 1.203 → 0.725; population explosion fixed by memory-leak regression test; bankruptcy cascade triggers at tick 945–1700 (real calibration finding, not hidden).
- **7 honest limitations** in the README, including the painful one ("The neural network generalizes poorly out-of-distribution. Median R² is ~0.8 for lever values near the baseline, but drops below 0 for extreme values").
- **VALIDATION.md** reports 6/7 stability checks pass and explicitly names the one that fails (bankruptcy cascade) as "a real model calibration issue worth noting, not a bug".
- **TEST_REPORT.md** rates the banner 6/10 visual / 3/10 memorable and lists 5 things that "need work to reach Apple/Nvidia tier" — VLM-as-MIT-reviewer feedback, in the repo, for the actual MIT reviewer to read.

**What a reviewer sees:** An engineer who shipped, measured, found the weak spots, documented them, and shipped the documentation alongside the code. This is the rarest pattern in high-school submissions and it is exactly what MIT's Maker Portfolio explicitly asks for.

**What's missing for full marks:**
- **The worklog breaks at commit 21.** `worklog.md` (535 lines, 14 task entries) ends at Task ID 4+5 (frontend atmosphere work) but the git history continues for 3 more commits: `4f904da feat: deep learning pipeline`, `940edbf docs: VLM analysis + E2E test report`, `86fbe20 docs: MIT Maker Portfolio cahier des charges`. The build-process trail — the single most MIT-relevant artifact — is incomplete for the last 12% of the project. **Fix: append 3 worklog entries.**
- **Working directory is dirty.** `git status` shows uncommitted modifications to `BACKTEST.md` (regenerated with different loss numbers), `tests/training.test.ts`, `training/data-pipeline.ts`, `training/trainer.ts`. These are minor (regenerated output + small code edits) but they have not been pushed to GitHub. A reviewer who clones the repo gets the stale pushed state, not the current local state. **Fix: commit and push.**

---

## 2. The 25 attachments audit

| # | Attachment | File | Exists? | MIT-quality? | Notes |
|---:|---|---|---|---|---|
| 1 | Banner | `docs/banner-v2-dark.png` | ✅ 375 KB | ⚠️ 6/10 | VLM: "professional but anonymous, default Three.js template feel, no signature moment". Needs a glitch / refraction / motion beat. |
| 2 | The Reactor | `docs/reactor-prisms-dark.png` | ✅ 232 KB | ✅ strong | 47 levers as rising prisms — original visual metaphor. |
| 3 | Neural Network | `docs/neural-active-dark.png` | ✅ 353 KB | ✅ strong | Active signal propagation visualised. |
| 4 | Agent Swarm | `docs/agent-swarm-dark.png` | ✅ 354 KB | ✅ strong | 10,000 agents / 8 factions / hot stress pockets. |
| 5 | Causal Graph | `docs/causal-graph-dark.png` | ✅ 268 KB | ✅ strong | LLM-extracted edges with provenance URLs. |
| 6 | Decree Projection | `docs/decree-projection-dark.png` | ✅ 201 KB | ✅ strong | 2-year forecast with verdict. |
| 7 | Black Swan | `docs/black-swan-cascade-dark.png` | ✅ 245 KB | ✅ strong | Cascade chain with conditional probabilities. |
| 8 | Paradigm Shift | `docs/paradigm-shift-dark.png` | ✅ 202 KB | ⚠️ partial | Visual shows matrix rewrite; README admits it's a V1 parameter mask. Caption must say so. |
| 9 | Hysteresis Scar | `docs/hysteresis-scar-dark.png` | ✅ 208 KB | ✅ strong | The "scar" is the project's most original concept. |
| 10 | Thermodynamic Equilibrium | `docs/thermodynamic-balance-dark.png` | ✅ 222 KB | ✅ strong | Over-optimisation penalty surface. |
| 11 | Data Provenance | `docs/data-provenance-dark.png` | ✅ 198 KB | ✅ strong | 47 levers × 5 real sources. |
| 12 | The Kernel | `docs/kernel-architecture-dark.png` | ✅ 300 KB | ✅ strong | 12-phase lifecycle diagram. |
| 13 | Life System | `docs/life-cycle-dark.png` | ✅ 198 KB | ✅ strong | Population pyramid + 8 life stages. |
| 14 | Governance | `docs/governance-matrix-dark.png` | ✅ 223 KB | ✅ strong | 8 ministries budget matrix. |
| 15 | Emergence | `docs/emergence-dark.png` | ✅ 680 KB | ⚠️ 8/10 beauty, 6/10 alive | VLM: "static rigidity kills the premise — emergence is about change over time". Needs visible self-organisation. |
| 16 | **Demo Video (≤ 2 min)** | — | ❌ **DOES NOT EXIST** | n/a | Script in MIT_MAKER_PORTFOLIO.md §IV only. **Critical blocker.** |
| 17 | **Technical PDF** | `PRISM_Technical_Documentation.pdf` | ❌ **DOES NOT EXIST** | n/a | Pandoc command provided but not run. All 5 source .md files exist. **Critical blocker.** |
| 18 | NOTES.md | `NOTES.md` | ✅ 3,281 words | ✅ | Creator's original words preserved verbatim. |
| 19 | Steady-state numbers | `data/results.json` | ✅ 1.5 KB | ✅ | Real engine output (GDP 1,443 Mrd MAD, stability 72.8, etc.). |
| 20 | Glossary | `docs/GLOSSARY.md` | ✅ 2,196 words | ✅ | Ubiquitous language pinned. |
| 21 | Telemetry contract | `docs/TELEMETRY.md` | ✅ 1,441 words | ✅ | Observable signals + tick budget. |
| 22 | Kernel spec | `docs/KERNEL.md` | ✅ 2,332 words | ✅ | 12-phase lifecycle, subsystems, syscalls. |
| 23 | Test report | `TEST_REPORT.md` | ✅ 657 words | ✅ | VLM + E2E 10/10. |
| 24 | Bilan A→Z | `BILAN_FINAL.md` | ✅ 1,333 words | ⚠️ | Strong but contains stale numbers (21 commits, 304 tests). Update before submission. |
| 25 | GitHub repo | `github.com/Vitalcheffe/PRISM` | ✅ remote configured | ⚠️ unverifiable public status | Local `origin` matches; local branch is in sync with `origin/main` (verified). Cannot verify from this sandbox whether the repo is set to PUBLIC on GitHub.com. **Verify manually in browser.** |

**Attachment scorecard: 22 / 25 exist. 2 critical blockers (video, PDF). 1 needs manual verification (repo visibility). 3 need quality improvements (banner, emergence, paradigm-shift caption).**

---

## 3. The 2-minute video script audit

The script is in `MIT_MAKER_PORTFOLIO.md` §IV. Seven segments, 120 seconds total.

### What works
- ✅ No face cam.
- ✅ No dramatic music ("audio génératif sobre" — kept low).
- ✅ No jump cuts specified.
- ✅ Mentions tests and validation harness (no "trust me it works").
- ✅ Closes with the GitHub URL.
- ✅ Total runtime matches the 120-second MIT cap exactly.

### What fails

1. **❌ CRITICAL — Fabricated number.** Segment 5 overlay says: *"R² 0.99 on test set"*. `TRAINING_REPORT.md` §5 says the actual test-set R² is **−0.39** (worse than predicting the mean). A reviewer who opens TRAINING_REPORT.md (which the script tells them to do) will catch this immediately. **This is the kind of inconsistency that gets a portfolio rejected.** Replace with the honest number or remove the overlay entirely.

2. **⚠️ Stale "305 tests" overlay (Segment 6).** Actual is 339. Minor, but again, MIT will run the tests.

3. **⚠️ Stale "21 commits" voiceover (Segment 7).** Actual is 24. Same issue.

4. **⚠️ Build process gets only 10 seconds out of 120.** MIT's #1 criterion is *"We are more interested in your build process than your end results."* The script gives the build process (Segment 7) the smallest slice — 10s of git log scrolling. That's a structural mistake. Rebalance: the build process should be at least 20–25 seconds, ideally including the bug-fix montage (life expectancy 147.8 → 70.5, HDI 1.203 → 0.725, the Gap-3 diagnosis).

5. **⚠️ No "wow" moment.** The script describes features but never shows the interactive moment that makes PRISM different — typing a French decree ("Construire 10 hôpitaux") and watching the 2-year projection render with a verdict. That's the demo that would make a reviewer lean forward.

6. **⚠️ Hysteresis mentioned, not shown.** Segment 4 says "the system remembers crises" but doesn't show the scar visualisation. The scar is PRISM's most original concept — it should be on screen for at least 5 seconds, not described in voiceover.

7. **⚠️ Generic ending.** Final frame is text + URL. The capstone visual (`emergence-dark.png`, rated 8/10 beauty by VLM) should be the final frame, with the URL as a small footer.

### Suggested rebalanced script (120s)

| # | Segment | Duration | Content |
|---:|---|---:|---|
| 1 | Problem | 15s | Black text on white → banner. Same as current. |
| 2 | Simulation | 25s | Live app, globe breathing, overlay `47 · 3,008 · 10,000`. |
| 3 | Neural network | 15s | Network view, forward pass, `47→32→32→15`. |
| 4 | **Decree demo (NEW wow moment)** | 20s | Type "Construire 10 hôpitaux" → fiscal cost → 2-year projection → verdict `favorable / mitigé / défavorable / catastrophique`. |
| 5 | Hysteresis scar | 15s | Show `hysteresis-scar-dark.png` static, voiceover: "recovery doesn't erase the scar — the system remembers for 18 months." |
| 6 | Build process + tests | 20s | Git log scrolling + test output + honest bug-fix numbers (`life expectancy 147.8 → 70.5`). |
| 7 | Honest limitations + emergence | 10s | Three limitation titles fade through → final frame: `emergence-dark.png` + URL footer. |

This rebalances to put **20s on build process** (up from 10s), adds the decree wow moment (was 0s), and ends on the capstone visual (was a URL card). It also drops the false `R² 0.99` overlay entirely.

---

## 4. Top 5 things that would most improve the submission

1. **Film the 2-minute video with the corrected script.** The current script has one fabricated number (R² 0.99). Use the rebalanced script above. This is the single highest-leverage action — it's the only medium MIT requires that PRISM does not yet have.

2. **Compile the technical PDF.** All five source files exist (RESEARCH.md 13,491 words, docs/math.md 1,664, VALIDATION.md 7,281, BACKTEST.md 2,429, TRAINING_REPORT.md 561). Run the pandoc command in MIT_MAKER_PORTFOLIO.md §V. Add a cover page with the title, author, and date. Add a table of contents. This is a 30-minute task and converts 25,000 words of existing material into the single required PDF.

3. **Update every stale number.** Specifically: 7 occurrences of "21 commits" → "24 commits" (BILAN_FINAL.md ×4, MIT_MAKER_PORTFOLIO.md ×3); README's "263 tests" → "339 tests"; BILAN_FINAL.md's "304 tests" → "339 tests"; MIT_MAKER_PORTFOLIO.md's "305 tests" → "339 tests"; BILAN_FINAL.md's "7,070 lignes moteur" → "7,521 lignes moteur"; video script's "305 tests" overlay → "339 tests". A reviewer who runs `bun test` and sees 339 will distrust every claim in the README if it still says 263.

4. **Append the missing worklog entries.** Three commits (deep learning pipeline, VLM/E2E report, MIT Maker Portfolio doc) are not in `worklog.md`. The worklog is the single most MIT-relevant artifact — it's the literal "build process" document. Append 3 entries following the existing format (Task ID, Agent, Task, Work Log, Stage Summary, Files). This is a 15-minute task.

5. **Soften the paradigm-shift README claim.** README says: *"Switching political regime doesn't just change parameters. It rewrites the causal weight matrix and flips edge polarities."* But README Limitation #4 admits: *"Switching political regime currently applies a parameter mask, not a true restructuring of the weight matrix. The polarity inversion shown in the paradigm-delta visualization is architectural intent, not implemented behavior."* A reviewer who reads both will feel misled. Change the README claim to: *"Switching political regime applies a paradigm-specific parameter mask today; the full weight-matrix rewrite and polarity inversion is V2 — see Limitation #4 and RESEARCH.md §8.3."* Honesty here converts a risk into a strength.

---

## 5. Top 3 risks (what could get PRISM rejected)

### Risk 1 — The R² 0.99 fabrication in the video script (HIGH severity, LOW effort to fix)
If the video ships with the "R² 0.99 on test set" overlay, a reviewer who opens TRAINING_REPORT.md (which the script's own Segment 5 implicitly invites them to do) will see `R² = −0.39` and conclude that the applicant either didn't read their own training report or chose to misrepresent it. Either interpretation is disqualifying. **Fix: remove the overlay, or replace with "trained on 10,000 samples + 6 real Morocco data points — honest results in TRAINING_REPORT.md".**

### Risk 2 — The "deep learning pipeline" claim is honest but weak (MEDIUM severity, MEDIUM effort to mitigate)
TRAINING_REPORT.md is unusually candid: grid-search val loss explodes to `1.3e+97` for one config, training curve goes `43.4 → 3.02e+92` (literal Infinity on epoch 20), test-set R² = −0.39. The pipeline exists, runs, and produces a report — but it does not produce a good model. This is exactly the build-process honesty MIT wants, but a sceptical reviewer could read it as "the applicant shipped a broken training pipeline to look technical". **Mitigation: reframe TRAINING_REPORT.md's executive summary so the headline is the diagnosis (the Gap-3 fix, the layer-0 weight verification) rather than the metric (R² = −0.39). Move the R² number to §5 (where it already is) and add a one-paragraph §0 "What this report actually contributes" that names the Gap-3 fix as the artifact of value.**

### Risk 3 — The banner and emergence visualisations are competent, not legendary (LOW severity, MEDIUM effort to fix)
VLM rated the banner 6/10 visual / 3/10 memorable ("professional but anonymous, default Three.js template feel, no signature moment") and emergence 8/10 beauty / 6/10 "alive" ("static rigidity kills the premise — emergence is about change over time"). These are the first and last images a reviewer sees. They are not currently at the level that makes a reviewer remember the portfolio. **Mitigation (banner):** add one signature moment — a refraction glitch on the PRISM wordmark, or a slow chromatic aberration sweep. **Mitigation (emergence):** add 3–5 seconds of visible self-organisation (cells that drift, cluster, dissolve) — can be a CSS keyframe loop, no engine work required. If time is short, prioritise the banner — it's the first impression.

---

## 6. Final verdict

**Ready to submit after 4 specific fixes.**

| Fix | Effort | Risk if skipped |
|---|---|---|
| 1. Film 2-min video with corrected script (no R² 0.99) | 4–6 hours | Disqualifying |
| 2. Compile technical PDF via pandoc | 30 minutes | Disqualifying (MIT requires 1 PDF) |
| 3. Update stale numbers (commits 21→24, tests 263/304/305→339) across 4 docs | 15 minutes | Erosion of reviewer trust |
| 4. Append 3 missing worklog entries | 15 minutes | Build-process trail incomplete |

Optional but recommended:
- Soften the paradigm-shift README claim (5 min).
- Reframe TRAINING_REPORT.md executive summary around the Gap-3 diagnosis (15 min).
- Add a signature moment to the banner (1–2 hours).
- Verify GitHub repo is set to PUBLIC in browser (2 min).
- Commit and push the dirty working directory (5 min).

**The project is at the level MIT is looking for. The remaining work is operational, not technical. Do the four fixes and submit.**

---

*PRISM · Final audit complete. 78/100 today, 92+/100 after the four fixes.*
