# PRISM — Design Notes

> Original notes from the project creator. These are their exact words,
> organized by theme. Nothing has been rewritten or "cleaned up."

---

## The original idea

Un petit jeu de simulation de pays pour éviter les fausses bonnes idées.

Une plateforme de simulation de haute fidélité capable de modéliser des systèmes complexes de niveau national pour tester la résilience et les effets de bord de politiques publiques réelles.

---

## The "reactor" visual

Tu vois les réacteurs nucléaires, il y a des petits carrés, des petits carrés qui sont genre un cube qui descend, genre un rectangle du coup, genre de haut c'est un cube mais il descend genre c'est un rectangle. Tu vois ?

Bah il descend et imagine que chacune de ça c'est des variables. C'est des petites variables et le monde s'en est plein.

Imagine que chacune d'elle c'est un rectangle et que imagine elle voit un médecin dans la version du jeu.

Dans la version un du jeu on va en mettre une centaine. Imagine que tu vas ça va être dans un carré énorme, on va mettre 100 ça veut dire un carré va y en avoir 100 dedans. Et imagine tu, tu vas modifier en haut à gauche, tu vois peut-être que si tu modifies juste un peu en haut à gauche bah y en a deux autres je sais pas moi une en bas à droite une en haut à droite qui vont monter d'un coup, une au milieu qui va descendre, une qui va se redresser plus redescend.

Tu vois en fait c'est des variables tellement folle, tellement minime qu'on y pense pas. Genre ça va être des liens de liens de liens de liens de liens. Genre ça va être une réaction en chaîne comme si tu jetais deux atomes. Bah peut-être qu'il y en avait un troisième, peut-être que là-bas y en avait un, peut-être que lui il a vu, peut-être qu'il y a trop d'énergie qui a dépassé, peut-être que ça a touché le bord.

En fait faut vraiment tout contrôler.

---

## Three levels of development

La première va y avoir 100, la deuxième 10 000 balles et la troisième 1 million de bas.

Mais on aura pas le droit de se tromper sur les bars. Et chacune doit avoir son petit ratio, sa tolérance, son niveau. Parce que je sais pas moi si tu fais ça ça vaut pas ça, si tu touches à ça va y avoir forcément un truc sur ça. Et le problème c'est que tout doit être simulé à chaque fois. On ne peut pas tout... c'est pas genre si ça ça monte ça ça descend. En fait à chaque fois ça doit tout calculer.

Imagine ton pays tu passes d'une monarchie à démocratie bah les valeurs sont pas du tout les mêmes, genre ça vaut pas du tout la même chose. Imagine tu rajoutes 10 000 hôpitaux, mais ton budget il est dans l'eau mais c'est pas forcément bien. Tu vois genre y a petit détail que tu n'imagines pas, ça c'est que la partie surélevée de l'iceberg.

---

## You can't touch everything

Imagine que je sais pas tu t'en touche une qui est au fond de la pièce. Genre tu l'as fait juste un peu monter, bah il y en a une qui est à l'opposé qui va descendre. Ou il y en a une je sais pas t'en touche deux là-bas, il y en a 15 qui vont monter d'un coup. Tu vois genre c'est genre il y a des lignes qui se sont fou.

---

## The cubes are not all equal

Faut que tu mettes tout au même niveau. Tu peux pas mettre le PIB au même niveau que le nombre d'agriculteurs dans le pays. Tu vois tout doit être au même niveau.

Le PIB n'est pas forcément une variable. Le PIB ça peut être une variable de variable de variable. Peut-être que le PIB c'est une addition de 15 variables.

---

## Using AI to define variables

J'avais pensé à la science économique. Peut-être qu'il y a des rapports qu'on pourrait encaisser. Une intelligence artificielle qui va les décréter. Genre plus on parle d'un truc plus ce sujet vaut des cubes.

Je sais pas moi les soins italiens, peut-être que sur 200 documents on l'entend des fois. Bah 200 documents ça fait aller, on va prendre sa proportionnellement, ça va faire son document, ça va faire cinq cubes vu que 210 donc 105.

---

## AI should predict, not just simulate

L'intelligence artificielle, c'est des réseaux neuronaux qui peuvent prédire et mettre des scores de prédiction. Genre en regardant le passé, ils mettent une note sur la prédiction qu'ils ont fait.

Parce que le Maroc est un pays qui évolue vite, ils peuvent regarder d'autres pays qui évoluent vite, qui ont eu les mêmes trucs, qui ont testé ça, est-ce que ça a bien marché ou pas ? Donc on exclut ce truc si ça a pas bien marché.

Toi tu peux directement calculer ça en quelques millisecondes.

---

## If you can simulate, you can predict the best

Si tu peux faire ça, si tu peux simuler avec toutes les variables que tu as mises, techniquement tu peux aussi prédire, tu peux aussi calculer le meilleur pays possible si tu calcules toi avec une machine toute bête.

---

## The student loan idea

Je propose une un prêt étudiant, un prêt étudiant à frais zéro déjà, un prêt qui est subventionné, genre dans toutes les universités presque, un prêt qui est subventionné et tu dois le rembourser.

Genre tu payes pas tes années d'études ou sinon, je sais pas, tu mets une subvention, genre au pire si tu payes, tu payes à l'aise 100 000 dirhams chaque an, mais si tu veux jouer le prêt, tu dois payer 120 000 dirhams chaque an, mais à la fin, tu dois juste payer plus l'année. Ça fait une forme d'intérêt, mais qui n'est pas caché. Pas un intérêt qui grossit petit à petit. Genre c'est un intérêt, tu lui dis directement.

---

## Pay in service, not in money

C'est comme si tu faisais payer le prix en service, pas en money. Le pays récupère l'argent d'une autre façon. Plutôt que tu le payes en cash, tu le payes en restant sur le territoire.

---

## The globe divided into poles

Essaie de faire un globe que tu divises en pôles.

---

## The personal motivation

Moi mon cerveau il voit le monde comme ça un peu mais là je veux vraiment le refaire dans un jeu. Et j'ai essayé d'avoir cette vision pour me faciliter la tâche. Essayer d'imaginer parce que j'ai jamais vraiment réussi à imaginer ou sinon quand j'imaginais, j'oublie, j'imagine deux ridicules de le lendemain, j'oublie tout, je m'en rappelle plus de mon travail. Donc ça va être un peu une façon pour moi de le faire.

---

## The MUN connection

On travaille avec les Nations Unies pour le cadre des MUN. Dans les MUN, soit dans les vrais MUN, soit dans les préparations. Ça doit être du vrai niveau. C'est comme si tu devais construire un logiciel pour une fusée SpaceX.

---

## The AI sycophancy problem

J'ai remarqué que même si tu donnes une idée au même agent, sauf que si tu la tournes d'une autre façon, il peut donner des réponses inverses. Genre je te dis cette idée, t'en penses quoi ? Et ensuite je te dis j'aime cette idée et je te dis j'aime pas cette idée, bah à chaque fois tu vas être d'accord avec moi.

---

## Don't hardcode — let the system learn

T'as pas le droit au mock data ou au data hard codé. Commence maintenant. Je veux que chaque détail soit travaillé. Que ce soit une vraie simulation de A à Z.

Crée un vrai système. Une vraie logique. Une vraie méthodologie. Si je dois payer 100€ ou avoir des mock data, je paye.
