// model-loader.ts — expose le modèle défini en code (leviers + indicateurs).
// En V3, le modèle est la définition même du système (leviers + formules),
// pas une donnée générée. Les valeurs de base sont réelles (Maroc).

import { LEVERS, INDICATORS, CATEGORIES } from "./model.js";

export { LEVERS, INDICATORS, CATEGORIES };

export interface ModelSchema {
  levers: typeof LEVERS;
  indicators: typeof INDICATORS;
  categories: typeof CATEGORIES;
}

export function loadModel(): ModelSchema {
  return { levers: LEVERS, indicators: INDICATORS, categories: CATEGORIES };
}
