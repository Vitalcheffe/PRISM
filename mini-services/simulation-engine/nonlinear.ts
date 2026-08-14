// nonlinear.ts — Fonctions de transfert non-linéaires pour le système de simulation.
//
// Un système linéaire : si on double l'input, on double l'output.
// Un système non-linéaire : l'effet dépend de l'état courant. Près d'un seuil,
// une petite variation provoque un effet disproportionné. Au-delà d'un seuil,
// l'effet sature. L'hystérésis fait que le retour en arrière est asymétrique.
//
// Ces fonctions modélisent les phénomènes économiques réels :
//   - Rendements décroissants (saturation)
//   - Effets de seuil (crise de confiance au-delà de 80% de dette/PIB)
//   - Bifurcations (points de bascule)
//   - Hystérésis (une crise laisse des traces même après guérison)
//   - Rétroaction exponentielle (emballement)

// --- Sigmoïde standard : effet doux qui sature à 0 et 1 ---
// Utilisée pour modéliser les effets qui plafonnent (saturation).
export function sigmoid(x: number): number {
  if (x > 10) return 1;
  if (x < -10) return 0;
  return 1 / (1 + Math.exp(-x));
}

// --- Tanh : effet borné [-1, 1], non-linéaire ---
// Utilisée pour les effets qui peuvent être positifs ou négatifs.
export function tanh(x: number): number {
  if (x > 10) return 1;
  if (x < -10) return -1;
  return Math.tanh(x);
}

// --- Fonction de seuil (step function adoucie) ---
// En dessous du seuil, effet minimal. Au-dessus, effet maximal.
// La pente contrôle la brutalité du passage.
export function thresholdEffect(value: number, threshold: number, slope: number): number {
  // Retourne 0 en dessous du seuil, 1 au-dessus, avec une transition douce
  return sigmoid((value - threshold) * slope);
}

// --- Rendements décroissants (concave) ---
// Plus la valeur est élevée, plus l'effet marginal est faible.
// Modélise : "construire 10 hôpitaux quand on n'en a aucun = gros effet.
//            construire 10 hôpitaux quand on en a déjà 100 = effet minime."
export function diminishingReturns(value: number, halfSaturation: number): number {
  // Courbe type Michaelis-Menten : f(x) = x / (x + K)
  // halfSaturation = valeur à laquelle l'effet est à 50% du maximum
  return value / (value + halfSaturation);
}

// --- Effet exponentiel (emballement) ---
// Près d'un seuil critique, l'effet s'emballe de façon exponentielle.
// Modélise : "crise de confiance", "attaque spéculative", "révolution".
export function exponentialRunaway(value: number, threshold: number, steepness: number): number {
  // 0 en dessous du seuil, exponentiel au-dessus
  const diff = value - threshold;
  if (diff <= 0) return 0;
  return Math.min(1, Math.exp(diff * steepness) - 1);
}

// --- Bifurcation (point de bascule) ---
// Le système a deux régimes stables. Près du point de bascule,
// une petite perturbation fait passer d'un régime à l'autre.
// Modélise : "transition démocratique", "effondrement", "miracle économique".
export function bifurcation(value: number, tippingPoint: number, sharpness: number): number {
  // Fonction potentiel double-puits
  const x = (value - tippingPoint) * sharpness;
  return sigmoid(x);
}

// --- Hystérésis ---
// Le système "se souvient" de son passé. L'effet dépend de l'historique,
// pas seulement de la valeur courante. Une fois qu'on a franchi un seuil,
// le retour en arrière est plus difficile.
export class Hysteresis {
  private maxValue: number = 0;
  private minValue: number = Infinity;

  // Met à jour avec une nouvelle valeur, retourne l'état "mémoire"
  update(value: number): { maxValue: number; minValue: number; range: number } {
    if (value > this.maxValue) this.maxValue = value;
    if (value < this.minValue) this.minValue = value;
    return {
      maxValue: this.maxValue,
      minValue: this.minValue,
      range: this.maxValue - this.minValue,
    };
  }

  // L'effet d'hystérésis : si la valeur a déjà été élevée, l'effet persiste
  // même quand la valeur redescend. Le "souvenir" s'estompe lentement.
  hysteresisEffect(currentValue: number, threshold: number, decayRate: number): number {
    // Si la valeur courante est au-dessus du seuil, effet complet
    if (currentValue >= threshold) return 1;
    // Si la valeur a déjà dépassé le seuil (maxValue), effet résiduel qui décroît
    if (this.maxValue >= threshold) {
      const gap = threshold - currentValue;
      const decay = Math.exp(-gap * decayRate);
      return decay;
    }
    return 0;
  }

  reset(): void {
    this.maxValue = 0;
    this.minValue = Infinity;
  }
}

// --- Boucle de rétroaction non-linéaire ---
// Une boucle de rétroaction amplifie ou amortit un effet.
// amplificationFactor > 1 : rétroaction positive (emballement)
// amplificationFactor < 1 : rétroaction négative (stabilisation)
// La non-linéarité : l'amplification dépend de l'amplitude (plus c'est grand, plus ça s'amplifie, jusqu'à saturation).
export function feedbackLoop(input: number, amplificationFactor: number, saturationPoint: number): number {
  // Rétroaction avec saturation : output = input × (1 + amp × tanh(input/sat))
  const saturation = tanh(input / saturationPoint);
  return input * (1 + amplificationFactor * saturation);
}

// --- Effet de cascade (réaction en chaîne non-linéaire) ---
// Quand un effet se propage, il peut déclencher des effets secondaires
// qui n'apparaissent qu'au-delà d'un certain seuil d'intensité.
export function cascadeEffect(intensity: number, cascadeThreshold: number, cascadeAmplification: number): number {
  if (intensity < cascadeThreshold) return intensity;
  // Au-delà du seuil, l'effet cascade de façon non-linéaire
  const excess = intensity - cascadeThreshold;
  return intensity + excess * cascadeAmplification * (1 + excess * 0.1);
}

// --- Effet de seuil critique (point de non-retour) ---
// Au-delà d'un seuil, le système entre dans un régime qualitativement différent.
// Les effets deviennent exponentiels plutôt que linéaires.
export function criticalThreshold(value: number, threshold: number, baseEffect: number, criticalMultiplier: number): number {
  if (value < threshold) {
    return baseEffect * (value / threshold);
  }
  // Au-delà du seuil : effet exponentiel
  const excess = value - threshold;
  return baseEffect * (1 + criticalMultiplier * Math.expm1(excess * 0.1));
}

// --- Résumé des non-linéarités du système ---
//
// 1. SATURATION (diminishingReturns) :
//    "Construire 10 hôpitaux quand on en a 0 = effet massif.
//     Construire 10 hôpitaux quand on en a 200 = effet négligeable."
//
// 2. SEUIL CRITIQUE (criticalThreshold) :
//    "Dette/PIB < 80% = effet linéaire sur la croissance.
//     Dette/PIB > 80% = effet exponentiel (crise de confiance)."
//
// 3. BIFURCATION (bifurcation) :
//    "Chômage < 15% = régime stable.
//     Chômage > 15% = bascule vers un régime d'instabilité."
//
// 4. HYSTÉRÉSIS (Hysteresis) :
//    "Une fois que la dette a dépassé 100% du PIB, même en la réduisant
//     en-dessous, la confiance des investisseurs reste affectée pendant
//     plusieurs années."
//
// 5. RÉTROACTION (feedbackLoop) :
//    "Chômage → mécontentement → instabilité → moins d'investissement
//     → plus de chômage. Boucle amplificatrice qui sature."
//
// 6. CASCADE (cascadeEffect) :
//    "Une petite hausse de TVA → mécontentement modéré.
//     Une grosse hausse de TVA → grèves → paralysie économique → effet cascade."
//
// 7. EMBALLEMENT (exponentialRunaway) :
//    "Inflation < 10% = gérable.
//     Inflation > 10% = emballement (hyperinflation possible)."
