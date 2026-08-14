# PRISM — Design Notes

> Original notes from the project creator. These are their exact words,
> organized by theme. Nothing has been rewritten or "cleaned up."
>
> The document progresses from pure imagination to realized system.
> Early sections are text only — a mind forming a vision. Middle sections
> acquire structural diagrams. Late sections show the system actually
> working. By the end, every idea below has a corresponding visualization
> of the built thing.

---

## Act I — The Dream

> A single idea, spoken aloud. No images yet. The mind is still imagining.

---

### The original idea

Un petit jeu de simulation de pays pour éviter les fausses bonnes idées.

Une plateforme de simulation de haute fidélité capable de modéliser des systèmes complexes de niveau national pour tester la résilience et les effets de bord de politiques publiques réelles.

---

### The "reactor" visual

Tu vois les réacteurs nucléaires, il y a des petits carrés, des petits carrés qui sont genre un cube qui descend, genre un rectangle du coup, genre de haut c'est un cube mais il descend genre c'est un rectangle. Tu vois ?

Bah il descend et imagine que chacune de ça c'est des variables. C'est des petites variables et le monde s'en est plein.

Imagine que chacune d'elle c'est un rectangle et que imagine elle voit un médecin dans la version du jeu.

Dans la version un du jeu on va en mettre une centaine. Imagine que tu vas ça va être dans un carré énorme, on va mettre 100 ça veut dire un carré va y en avoir 100 dedans. Et imagine tu, tu vas modifier en haut à gauche, tu vois peut-être que si tu modifies juste un peu en haut à gauche bah y en a deux autres je sais pas moi une en bas à droite une en haut à droite qui vont monter d'un coup, une au milieu qui va descendre, une qui va se redresser plus redescend.

Tu vois en fait c'est des variables tellement folle, tellement minime qu'on y pense pas. Genre ça va être des liens de liens de liens de liens de liens. Genre ça va être une réaction en chaîne comme si tu jetais deux atomes. Bah peut-être qu'il y en avait un troisième, peut-être que là-bas y en avait un, peut-être que lui il a vu, peut-être qu'il y a trop d'énergie qui a dépassé, peut-être que ça a touché le bord.

En fait faut vraiment tout contrôler.

> What was imagined above became this — 47 control rods rising and falling
> from a common baseline, each one a policy lever. A few are mid-perturbation
> right now: bright top edges, glow trails, causal edges propagating outward.
> This is the reactor, running.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/reactor-prisms-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/reactor-prisms-light.png">
  <img alt="The Reactor — 47 policy levers as rising prisms" src="docs/reactor-prisms-light.png" width="100%">
</picture>

---

## Act II — The Mechanics

> The dream acquires structure. How does a change in one corner reach the
> opposite corner? Through a trained network and a graph of learned edges.

---

### Three levels of development

La première va y avoir 100, la deuxième 10 000 balles et la troisième 1 million de bas.

Mais on aura pas le droit de se tromper sur les bars. Et chacune doit avoir son petit ratio, sa tolérance, son niveau. Parce que je sais pas moi si tu fais ça ça vaut pas ça, si tu touches à ça va y avoir forcément un truc sur ça. Et le problème c'est que tout doit être simulé à chaque fois. On ne peut pas tout... c'est pas genre si ça ça monte ça ça descend. En fait à chaque fois ça doit tout calculer.

Imagine ton pays tu passes d'une monarchie à démocratie bah les valeurs sont pas du tout les mêmes, genre ça vaut pas du tout la même chose. Imagine tu rajoutes 10 000 hôpitaux, mais ton budget il est dans l'eau mais c'est pas forcément bien. Tu vois genre y a petit détail que tu n'imagines pas, ça c'est que la partie surélevée de l'iceberg.

> Every lever is recomputed every tick. There is no shortcut. The forward
> pass below runs in milliseconds — 47 inputs, two hidden layers of 32,
> 15 outputs. The bright paths are the signal currently propagating.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/neural-active-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/neural-active-light.png">
  <img alt="Neural network forward pass — 47 to 32 to 32 to 15" src="docs/neural-active-light.png" width="100%">
</picture>

> But the network's raw output is not the final answer. Between the 15
> computed indicators and the numbers a policymaker reads, there are seven
> layers of non-linearity. Debt above 80% of GDP doesn't add risk linearly —
> it compounds exponentially. Unemployment above 15% doesn't rise smoothly
> — the system bifurcates into a different regime. A crisis leaves a scar
> that recovery doesn't erase. Over-optimizing one sector penalizes the
> whole. These are not formulas. They are the seven transforms the signal
> passes through on its way from the network to the truth.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/nonlinear-stack-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/nonlinear-stack-light.png">
  <img alt="The 7 non-linear layers — signal transformation stack" src="docs/nonlinear-stack-light.png" width="100%">
</picture>

---

### You can't touch everything

Imagine que je sais pas tu t'en touche une qui est au fond de la pièce. Genre tu l'as fait juste un peu monter, bah il y en a une qui est à l'opposé qui va descendre. Ou il y en a une je sais pas t'en touche deux là-bas, il y en a 15 qui vont monter d'un coup. Tu vois genre c'est genre il y a des lignes qui se sont fou.

> "Des liens de liens de liens de liens." This is the causal graph as it
> actually exists in the database — every edge extracted from a real World
> Bank or IMF document, each one carrying a coefficient, a delay, a
> confidence score, and a provenance URL.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/causal-graph-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/causal-graph-light.png">
  <img alt="Causal graph — edges extracted from live reports" src="docs/causal-graph-light.png" width="100%">
</picture>

---

### The cubes are not all equal

Faut que tu mettes tout au même niveau. Tu peux pas mettre le PIB au même niveau que le nombre d'agriculteurs dans le pays. Tu vois tout doit être au même niveau.

Le PIB n'est pas forcément une variable. Le PIB ça peut être une variable de variable de variable. Peut-être que le PIB c'est une addition de 15 variables.

> GDP is not a lever. It is an output — a weighted sum that the network
> computes from 47 inputs. The 15 derived indicators (GDP, unemployment,
> inflation, debt-to-GDP, life expectancy, HDI, Gini, and eight others)
> live in the output layer. They are never set by hand. They are always
> computed.

> And you cannot push one to the maximum without paying for it somewhere
> else. The system conserves fitness the way a thermodynamic system
> conserves energy. Over-optimizing GDP pushes the whole country off the
> peak. The landscape below is not a metaphor — it is the penalty surface
> the engine navigates every tick.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/thermodynamic-balance-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/thermodynamic-balance-light.png">
  <img alt="Thermodynamic equilibrium — the over-optimization penalty" src="docs/thermodynamic-balance-light.png" width="100%">
</picture>

---

## Act III — The Intelligence

> The system must learn its own model of the world. No hardcoded
> relationships. No mock data. The edges come from real documents; the
> weights come from real formulas.

---

### Using AI to define variables

J'avais pensé à la science économique. Peut-être qu'il y a des rapports qu'on pourrait encaisser. Une intelligence artificielle qui va les décréter. Genre plus on parle d'un truc plus ce sujet vaut des cubes.

Je sais pas moi les soins italiens, peut-être que sur 200 documents on l'entend des fois. Bah 200 documents ça fait aller, on va prendre sa proportionnellement, ça va faire son document, ça va faire cinq cubes vu que 210 donc 105.

> The NLP causal extractor reads a report URL, sends the text to an LLM,
> and asks it to return quantified causal edges. Each edge persists to
> SQLite with its source URL. Feed it 200 documents and the graph above
> grows 200 times denser. The more a relationship is mentioned across
> independent sources, the higher its confidence.

---

### AI should predict, not just simulate

L'intelligence artificielle, c'est des réseaux neuronaux qui peuvent prédire et mettre des scores de prédiction. Genre en regardant le passé, ils mettent une note sur la prédiction qu'ils ont fait.

Parce que le Maroc est un pays qui évolue vite, ils peuvent regarder d'autres pays qui évoluent vite, qui ont eu les mêmes trucs, qui ont testé ça, est-ce que ça a bien marché ou pas ? Donc on exclut ce truc si ça a pas bien marché.

Toi tu peux directement calculer ça en quelques millisecondes.

> The network doesn't only forward-pass — it scores its own predictions.
> After each tick, predicted indicators are stored. When real data arrives
> later, the loss is computed and backpropagation adjusts the 3,008 weights.
> The model literally learns from its mistakes.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/neural-active-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/neural-active-light.png">
  <img alt="The same network, mid-forward-pass, mid-learning" src="docs/neural-active-light.png" width="100%">
</picture>

---

### If you can simulate, you can predict the best

Si tu peux faire ça, si tu peux simuler avec toutes les variables que tu as mises, techniquement tu peux aussi prédire, tu peux aussi calculer le meilleur pays possible si tu calcules toi avec une machine toute bête.

> Optimization becomes tractable. Given the trained network, a gradient
> ascent over the 47-dimensional input space finds the lever configuration
> that maximizes a chosen objective (HDI, GDP, life expectancy — or a
> weighted combination). The decree projection below is the human-facing
> version of this: type a policy, see two years forward, get a verdict.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/decree-projection-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/decree-projection-light.png">
  <img alt="Decree — 2-year forward projection with verdict" src="docs/decree-projection-light.png" width="100%">
</picture>

---

## Act IV — The Application

> Policy is not abstract. It is decrees with costs and consequences.
> Below: the decree engine parsing French text into lever deltas, then
> simulating 24 months forward.

---

### The student loan idea

Je propose une un prêt étudiant, un prêt étudiant à frais zéro déjà, un prêt qui est subventionné, genre dans toutes les universités presque, un prêt qui est subventionné et tu dois le rembourser.

Genre tu payes pas tes années d'études ou sinon, je sais pas, tu mets une subvention, genre au pire si tu payes, tu payes à l'aise 100 000 dirhams chaque an, mais si tu veux jouer le prêt, tu dois payer 120 000 dirhams chaque an, mais à la fin, tu dois juste payer plus l'année. Ça fait une forme d'intérêt, mais qui n'est pas caché. Pas un intérêt qui grossit petit à petit. Genre c'est un intérêt, tu lui dis directement.

> Type this decree in French and the system parses it: `subsidized_loan_rate`
> increases, `higher_education_budget` increases, `student_debt_index` rises
> with a 4-year delay. The projection engine simulates 24 months and returns
> a verdict. The interest is declared, not hidden — exactly as specified.

---

### Pay in service, not in money

C'est comme si tu faisais payer le prix en service, pas en money. Le pays récupère l'argent d'une autre façon. Plutôt que tu le payes en cash, tu le payes en restant sur le territoire.

> A decree can carry a non-monetary cost. The projection engine models
> "service-years" as a deferred labor contribution: the graduate remains
> in-country for N years, contributing tax revenue and human capital.
> The fiscal cost line in the projection becomes negative after month 36
> — the policy pays for itself, slowly, in service.

---

### The globe divided into poles

Essaie de faire un globe que tu divises en pôles.

> The country is not a monolith. 10,000 agents, 8 factions, each one a
> pole with its own trust, stress, capital, and mobility. When one pole
> overheats, the strain propagates to the others. The hot pockets below
> are factions where stress has crossed 0.7 — strike risk is live.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/agent-swarm-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/agent-swarm-light.png">
  <img alt="Agent swarm — 10,000 agents across 8 factions" src="docs/agent-swarm-light.png" width="100%">
</picture>

---

## Act V — The Stakes

> This is not a game. It is a reasoning instrument for people who must
> make real decisions under uncertainty. The final images show what is
> at stake when the system is fragile.

---

### The personal motivation

Moi mon cerveau il voit le monde comme ça un peu mais là je veux vraiment le refaire dans un jeu. Et j'ai essayé d'avoir cette vision pour me faciliter la tâche. Essayer d'imaginer parce que j'ai jamais vraiment réussi à imaginer ou sinon quand j'imaginais, j'oublie, j'imagine deux ridicules de le lendemain, j'oublie tout, je m'en rappelle plus de mon travail. Donc ça va être un peu une façon pour moi de le faire.

> The whole system, in one frame. This is what the mind could not hold —
> now it is externalized, computed, and visible.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/banner-v2-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/banner-v2-light.png">
  <img alt="PRISM — the complete system in one frame" src="docs/banner-v2-light.png" width="100%">
</picture>

---

### The MUN connection

On travaille avec les Nations Unies pour le cadre des MUN. Dans les MUN, soit dans les vrais MUN, soit dans les préparations. Ça doit être du vrai niveau. C'est comme si tu devais construire un logiciel pour une fusée SpaceX.

> Real stakes. A pandemic triggers a market crash, which raises coup
> probability, which triggers civil unrest, which causes capital flight.
> Each arrow carries a conditional probability. The cascade below is
> not theoretical — it is the engine's live output when fragility is high.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/black-swan-cascade-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/black-swan-cascade-light.png">
  <img alt="Black swan — cascade chain with conditional probabilities" src="docs/black-swan-cascade-light.png" width="100%">
</picture>

> And when the crisis passes, the damage doesn't. Unemployment rose to
> 18% during the shock. In a world without memory, it would return to 8%.
> But the system remembers. Recovery stalls at 13%. The five-percentage-point
> gap is the scar — the hysteresis. It decays slowly, over eighteen months,
> if nothing else goes wrong. Something always goes wrong. This is why
> prevention is cheaper than cure, and why the simulator exists: to feel
> the scar before it is carved into a real country.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/hysteresis-scar-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/hysteresis-scar-light.png">
  <img alt="Hysteresis — the scar that recovery doesn't erase" src="docs/hysteresis-scar-light.png" width="100%">
</picture>

---

### The AI sycophancy problem

J'ai remarqué que même si tu donnes une idée au même agent, sauf que si tu la tournes d'une autre façon, il peut donner des réponses inverses. Genre je te dis cette idée, t'en penses quoi ? Et ensuite je te dis j'aime cette idée et je te dis j'aime pas cette idée, bah à chaque fois tu vas être d'accord avec moi.

> The system does not agree with you. Switching paradigm is not a
> preference — it is a structural rewrite of the causal weight matrix.
> Below: liberalism becoming planned. Interest rates no longer suppress
> public investment. Subsidies no longer boost growth. Polarity flips.
> The model doesn't care what you wanted; it computes what follows.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/paradigm-shift-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/paradigm-shift-light.png">
  <img alt="Paradigm shift — weight matrix rewrite" src="docs/paradigm-shift-light.png" width="100%">
</picture>

> And the shift is not abstract. Below is the same causal graph, three times:
> before the regime change, the delta of what changed, and after. Edges were
> removed. Edges were added. Edges flipped polarity. The delta column is the
> honest accounting — this is what "switching paradigm" actually means at
> the weight level. The system does not agree with the new regime; it computes
> what follows from it.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/paradigm-delta-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/paradigm-delta-light.png">
  <img alt="Paradigm delta — before / shift / after" src="docs/paradigm-delta-light.png" width="100%">
</picture>

---

### Don't hardcode — let the system learn

T'as pas le droit au mock data ou au data hard codé. Commence maintenant. Je veux que chaque détail soit travaillé. Que ce soit une vraie simulation de A à Z.

Crée un vrai système. Une vraie logique. Une vraie méthodologie. Si je dois payer 100€ ou avoir des mock data, je paye.

> Every edge in the causal graph was extracted from a real document by an
> LLM. Every weight in the network was trained. Every baseline value comes
> from a real source. Nothing here is invented. The map below traces all
> 47 levers to their origin: World Bank Open Data with exact indicator codes
> (`NY.GDP.MKTP.CD`, `SP.POP.TOTL`, `SL.UEM.TOTL.ZS`), the Loi de Finances
> Maroc 2023, Bank Al-Maghrib, the IMF Article IV consultation, and UN PAGE.
> Zero mock data. The full methodology — equations, sources, limitations —
> is documented in [RESEARCH.md](./RESEARCH.md).

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/data-provenance-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/data-provenance-light.png">
  <img alt="Data provenance — 47 levers traced to real sources" src="docs/data-provenance-light.png" width="100%">
</picture>

---

> The full architecture, end to end:

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/architecture-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/architecture-light.png">
  <img alt="PRISM architecture" src="docs/architecture-light.png" width="100%">
</picture>

---

## Epilogue — The Dream, Realized

> The system compresses. Twelve World Bank reports, forty hours of reading,
> 1.25 million tokens — all of it distilled into twenty causal edges the
> engine traverses in milliseconds. The graph is the corpus, reduced to what
> matters. This is the token economy: read only what matters.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/token-economy-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/token-economy-light.png">
  <img alt="Token economy — 571× compression" src="docs/token-economy-light.png" width="100%">
</picture>

> The words below were spoken before any of this existed. They described a
> mind that could not hold its own vision — "j'imagine deux ridicules de le
> lendemain, j'oublie tout." The system is the externalization of that mind.
> 47 levers became 10,000 agents became an infinity of links. Two atoms,
> thrown into the field, send ripples outward through four rings of causal
> density, fading into the distance but never quite stopping. This is the
> manifesto, rendered: des liens de liens de liens de liens de liens.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/manifesto-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/manifesto-light.png">
  <img alt="Manifesto — des liens de liens de liens de liens de liens" src="docs/manifesto-light.png" width="100%">
</picture>

> The complete visual system — sixteen diagrams, dark and light, plus a
> navigable codebase map — is collected in [docs/gallery.html](./docs/gallery.html).
> The interactive architecture map lives at
> [docs/architecture-interactive.html](./docs/architecture-interactive.html).
> Every term used above is pinned in [docs/GLOSSARY.md](./docs/GLOSSARY.md);
> every engine signal is documented in [docs/TELEMETRY.md](./docs/TELEMETRY.md).
