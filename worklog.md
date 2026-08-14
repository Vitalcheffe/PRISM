# PRISM — Worklog

This file tracks all agent work on the PRISM project. Each agent appends a section below.

---
Task ID: 0
Agent: orchestrator (main)
Task: Bootstrap worklog and plan comprehensive A-to-Z research + visual work.

Work Log:
- Read existing state: 5 git commits, Next.js on port 3000, simulation-engine on port 3003.
- Verified render pipeline: `agent-browser set viewport <w> <h>` → `open file://...` → `screenshot out.png` produces pixel-exact PNGs.
- Planned 8 new visualization sets (dark + light = 16 PNGs) + RESEARCH.md + progressively-visual NOTES.md.

Stage Summary:
- Render tooling confirmed working (test2.png byte-identical to existing banner-dark.png).
- Dispatching Task 1-a (visual HTML) and Task 1-b (RESEARCH.md) in parallel.

---
Task ID: 1-b
Agent: research-methodology
Task: Write comprehensive RESEARCH.md methodology document.

Work Log:
- Read `/home/z/my-project/worklog.md`, `/home/z/my-project/README.md`, `/home/z/my-project/NOTES.md` for prior context and creator vision.
- Read all 9 engine source files in `mini-services/simulation-engine/`: `neural-network.ts`, `nonlinear.ts`, `agent-swarm.ts`, `black-swan.ts`, `paradigm.ts`, `causal-extractor.ts`, `decrees.ts` (990 lines), `formulas.ts`, `model.ts` (777 lines).
- Verified the neural-network weight-count arithmetic from source:
  - Layer 1 (47→32): 1504 weights + 32 biases = 1536 params.
  - Layer 2 (32→32): 1024 weights + 32 biases = 1056 params.
  - Layer 3 (32→15): 480 weights + 15 biases = 495 params.
  - Weights only: 3008 (matches README). Total trainable params incl. biases: 3087.
  - Reported both numbers explicitly in the document.
- Verified lever count by category from `model.ts`: economy 10, health 5, education 6, infrastructure 6, demographics 4, governance 6, environment 4, social 6 → 47 levers.
- Verified the 15 indicators list from `INDICATORS` array in `model.ts`.
- Verified agent-swarm: 8 factions with power weights summing to 1.58 (not 1.0); documented the expected per-faction counts in a 10,000-agent swarm.
- Verified black-swan catalogue: exactly 10 crisis types; BASE_PROBABILITY = 0.008; cascade formula `severity * fragility * 0.3`.
- Verified paradigm engine: 5 regimes with full weight masks, friction modifiers, and agent-behaviour parameters. Noted that `applyParadigmToNetwork` is a documented placeholder (V2 not yet implemented) — flagged as a limitation.
- Counted decree patterns: 38 patterns in source (not 39 as the prompt suggested). Honesty required: reported the actual count (38) and noted the internal target was 39.
- Extracted all 47 baseline values, units, and source citations verbatim from `model.ts`.
- Reproduced the LLM prompt structure from `causal-extractor.ts` (paraphrased to preserve intent and schema).
- Documented all 7 non-linear transfer functions with their actual mathematical formulations pulled from `nonlinear.ts` (sigmoid, tanh, threshold_effect, diminishingReturns, exponentialRunaway, bifurcation, Hysteresis class, feedbackLoop, cascadeEffect, criticalThreshold).
- Wrote the full document: Abstract + 15 numbered sections + References + 2 appendices.
- Cross-checked every formula against the source: Okun coefficients (0.5), Phillips coefficients, HDI cube-root form, Gini weights, stability weights (0.18/0.12/0.15/0.12/0.15/0.15/0.13), revolution_risk weights, agent update equations (90/10 stress blend, 0.05 trust drift), behavior cascade thresholds, political-threat trigger conditions.
- Listed 10 honest limitations (pre-training on formulas not data, intra-faction homogeneity, heuristic black-swan probabilities, partial paradigm implementation, 38 vs 39 patterns, LLM dependency, no uncertainty quantification, 47-lever simplification, no spatial resolution, no demographic microstructure).
- Wrote validation framework with proposed historical backtesting protocol (2008 crisis, 2014 subsidy reform, 2020 COVID, 2022 inflation) and sensitivity analysis expectations.

Stage Summary:
- File: `/home/z/my-project/RESEARCH.md`
- Word count: 13,491
- Line count: 1,298
- Sections covered: Abstract, 1 Problem Statement, 2 System Overview, 3 Levers & Indicators (47 + 15 with tables), 4 Neural Network Architecture (4.1 Topology, 4.2 Forward Pass, 4.3 Pre-training, 4.4 Fine-tuning, 4.5 Normalization), 5 Non-Linear Dynamics (5.1–5.7 all 7 layers with math), 6 Agent Swarm (6.1–6.5), 7 Black Swan Engine (7.1–7.4), 8 Paradigm Engine (8.1–8.3), 9 NLP Causal Extraction (9.1–9.4), 10 Decree System (10.1–10.2), 11 Data Provenance, 12 Validation Framework (12.1–12.3), 13 Comparison with Existing Models, 14 Computational Architecture, 15 Ethical and Epistemic Notes, References (25 entries), Appendix A Notation, Appendix B Reproducibility.
- Key grounded facts verified against source:
  - 47 levers with exact baselines, units, and sources (all 8 categories).
  - 15 indicators with formulas.
  - 3,008 weights / 3,087 total params (arithmetic verified by bash).
  - 10,000 agents × 8 factions with power weights 0.10–0.30 summing to 1.58.
  - 10 black-swan types with severity, duration, fiscal cost.
  - 5 paradigms with full weight masks.
  - 38 decree patterns (not 39 — discrepancy honestly flagged).
  - 7 non-linear functions with exact math.
  - All hyperparameters: lr=0.001·0.95^e, momentum=0.9, 200 samples, ReLU hidden / linear output, He init via Box-Muller.
  - Paradigm weight-matrix rewrite is a documented placeholder (limitation flagged).
- Honesty notes embedded: NN pre-trained on formulas not real time series; agent swarm homogeneous within factions; black-swan probabilities heuristic; partial paradigm implementation; 38 vs 39 patterns; LLM dependency; no uncertainty quantification.

---
Task ID: 1-a
Agent: visual-system-builder
Task: Build 16 top-tier centered visualization HTML files showing PRISM system working.

Work Log:
- Read worklog.md, banner-dark.html, banner-light.html, reactor-dark.html, architecture-dark.html, NOTES.md, README.md to understand the established visual language and the creator's "reactor" vision.
- Built banner-v2 (dark/light) — the hero banner. 47 prism squares distributed across all 8 category colors in an elliptical orbit framing the centered "PRISM" title (104px, weight 700, letter-spacing -0.06em). 7 active prisms with drop-shadow glow. 6 faint causal Bézier curves crossing the field at 2.5–4% opacity. Central amber radial glow at 6%. Subtitle (14px, max-width 640px) and bottom monospace stats row.
- Built reactor-prisms (dark/light) — realizes the childhood "control rods in a nuclear reactor" dream. 47 thin (14px) vertical prisms rising from a common baseline at y=650, grouped into 8 category clusters across width 1640. Heights vary realistically 60–230px. 7 active prisms with bright 2px top edges, vertical linear-gradient glow trails, and the "touched" Economy prism has a leader-line annotation `VAT_RATE → 0.25`. 10 causal Bézier curves connecting prism tops across categories.
- Built neural-active (dark/light) — the MLP 47→32→32→15 with signal actively propagating. Generated via inline JS (2528 dense connection lines at 1.2% opacity + 45 medium-opacity "winning paths" + 5 bright amber signal lines with feGaussianBlur glow). 47 input nodes colored by category, 32+32 hidden nodes amber-tinted, 15 output nodes with simulated activation brightness. 3 perturbed input nodes (Infrastructure #21-23) glow with concentric rings. 2 output nodes (#4 life_expectancy, #11 gdp_growth) have 4-layer pulsing concentric glows.
- Built agent-swarm (dark/light) — 10,000 agents across 8 factions. Used Canvas with seeded RNG for ~9,600 3px square dots in a 4×2 grid of 360×280 blocks. Stress encoded as opacity + glow: low=32%, medium=62%, high=100% with shadowBlur. Hot pockets in YOUTH and RURAL factions (cols 22-36, rows 4-14) with dashed amber rectangles + leader lines + canvas-rendered labels `STRESS > 0.7 · STRIKE RISK 34%`. HTML overlay faction labels.
- Built black-swan-cascade (dark/light) — 5-node crisis chain PANDEMIC → MARKET CRASH → COUP ATTEMPT → CIVIL UNREST → CAPITAL FLIGHT with mathematically consistent probabilities (73%, 61%, 44%, 38%, 29%) and conditional P(B|A) labels above amber arrows. PANDEMIC has bright red #ef4444 radialGradient glow. CAPITAL FLIGHT is dimmed (70% opacity). 5 orphan DORMANT nodes below at 22% opacity.
- Built causal-graph (dark/light) — 14 variable nodes (public_investment, gdp_growth, inflation, etc.) positioned in an organic but balanced layout. 20 directed edges with cubic Bézier curves, coefficients labeled (+0.7, −0.4 etc.) in green/red. 4 highlighted edges with feGaussianBlur glow + provenance tags (`src: worldbank.org/morocco/overview · conf 75%`). Used width-based arrow endpoint offset so arrows end before text labels regardless of label length.
- Built decree-projection (dark/light) — split layout: left half is the decree text block (DÉCRET label, 24px French quote, monospace breakdown table with `hospital_beds +0.13`, `fiscal_cost 1.5 Mrd MAD` in amber). Right half is a 24-month projection chart with 5 Catmull-Rom-smoothed Bézier curves (life_expectancy emerald, public_debt crimson, gdp_growth amber dip-recovery, unemployment violet, hdi cyan). SHOCK region (month 0-6) shaded amber, dashed amber DÉCRET vertical line, final value labels at right edge. VERDICT: MITIGÉ stamp below chart.
- Built paradigm-shift (dark/light) — 3-column typographic header: LIBERALISM (10 letters stacked vertically, 36px weight 200, tertiary) with → arrow below in amber, PLANNED (7 letters stacked, amber, drop-shadow glow) in center, 3 dimmed regime names (TECHNOCRACY, AUTHORITARIAN, TRANSITION) at 20px/25% opacity on right. Below: 24×8 weight matrix grid (8px cells, 2px gap) generated via JS with cool blue-grey tints on left half, amber-flipped + mid-flip blend cells on right half, 8 pulse-glow cells on the transition front, and a dashed amber TRANSITION FRONT vertical line. Below: 3 polarity-flip rows with old tertiary value → amber ⟶ → new primary value.
- Verified all 16 files render at correct dimensions via agent-browser screenshots. Confirmed dark variants have brightness ~19-23 (matching #0d1117) and light variants ~248-253 (matching #ffffff). Confirmed amber accent and category colors present in all files.
- Fixed layout bug in paradigm-shift: original header height (380px) was too short for LIBERALISM stack at 36px font (378px stack + 44px arrow). Increased header height to 430px, moved matrix to top:515 and polarity-flips to top:690 to prevent overlap. Changed lib-stack/planned-stack line-height from 1.05 to 1.0.
- Fixed causal-graph edge endpoint offset to use per-node text width (src.w/2+10, tgt.w/2+10) instead of fixed 45/55px, so arrows end correctly before both short labels (`hdi`) and long ones (`foreign_direct_investment`).

Stage Summary:
- 16 files created in /home/z/my-project/docs/:
  - banner-v2-dark.html, banner-v2-light.html (1920×640)
  - reactor-prisms-dark.html, reactor-prisms-light.html (1920×800)
  - neural-active-dark.html, neural-active-light.html (1920×800)
  - agent-swarm-dark.html, agent-swarm-light.html (1920×800)
  - black-swan-cascade-dark.html, black-swan-cascade-light.html (1920×760)
  - causal-graph-dark.html, causal-graph-light.html (1920×800)
  - decree-projection-dark.html, decree-projection-light.html (1920×760)
  - paradigm-shift-dark.html, paradigm-shift-light.html (1920×760)
- Key design decisions:
  - Used inline `<script>` to procedurally generate dense SVG content (neural mesh, agent dots, weight matrix, causal edges) — keeps HTML files small while producing thousands of visual elements. Screenshot tool waits for load so JS-rendered content captures correctly.
  - Established a consistent visual grammar across all 16 files: monospace tertiary meta stamps, centered titles with subtitle, dot-grid background, film grain overlay, amber accent used sparingly for active/highlighted elements.
  - Each visualization shows the system ACTIVELY working: glowing prisms mid-perturbation, bright signal lines mid-forward-pass, hot stress pockets mid-reaction, dashed rectangles around active clusters, transition-front pulse cells mid-rewrite. No static dead diagrams.
  - Dark/light variants use mirrored color palettes: dark=#0d1117/#f0f6fc/#8b949e/#3d444d, light=#ffffff/#1A1A1A/#737373/#D4D4D4. Amber #f59e0b consistent across both, with light variant slightly more opaque to compensate for white background.
  - All 8 category colors (amber/crimson/emerald/orange/violet/lime/yellow/cyan) used consistently across visualizations for the same categories.

---
Task ID: 3-6
Agent: orchestrator (main)
Task: Render all 16 HTML files to PNG, rewrite NOTES.md progressively visual, update README, verify, commit.

Work Log:
- Wrote render-pngs.sh — sets per-file viewport via `agent-browser set viewport W H`, opens file:// URL, screenshots to PNG. Verified pixel dimensions (1920x640, 1920x800, 1920x760) match spec.
- Confirmed JS-rendered visuals (agent-swarm canvas, neural-active SVG, paradigm-shift grid) render fully before screenshot by sampling canvas getImageData pixels (confirmed non-transparent faction-colored dots at [1200,600] and [300,600]).
- Rewrote NOTES.md: preserved user's exact French words verbatim; structured into 5 acts (Dream → Mechanics → Intelligence → Application → Stakes); visual richness grows from text-only in Act I to full-system visualizations in Act V. Each image introduced by an editorial note narrating the progression. 8 distinct `<picture>` dark/light adaptive image blocks embedded.
- Rewrote README.md: new banner-v2 as hero; 7 visualization sections (reactor, neural, swarm, causal, decree, black-swan, paradigm) each with dark/light adaptive image and explanatory paragraph; added Research Methodology section linking to RESEARCH.md.
- Lint: `bun run lint` clean, zero errors.
- Dev server: Next.js on port 3000, simulation-engine on port 3003, both alive.
- Self-verification via agent-browser through Caddy gateway (port 81): app loads with "47 levers · 15 indicators", tick counter T19022, live PIB 1.84T MAD, chômage 11.2%, stabilité 90/100. All 6 view tabs (Graph/Network/Neural/Metrics/Timeline/Methodology) switch correctly. Regime selector present. (Note: direct localhost:3000 access shows the genesis modal waiting for engine because the XTransformPort gateway routing only works through port 81 — this is by design, not a bug.)
- Confirmed banner-v2-dark.png content via DOM eval: title "PRISM", 5-metric stats row, 47 rect prisms, 6 causal path edges — exactly per spec.

Stage Summary:
- 16 PNGs rendered to docs/ (dark + light for 8 visualizations).
- NOTES.md: progressive visual storytelling, 5 acts, 8 embedded images.
- README.md: 8 adaptive image sections + research link.
- RESEARCH.md: 13,491 words (from Task 1-b).
- render-pngs.sh: reproducible render utility, kept in repo root.
- App verified live and interactive through gateway.
- Ready for commit 6.
