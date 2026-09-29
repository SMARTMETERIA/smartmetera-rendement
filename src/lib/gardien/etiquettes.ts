// Planche d'étiquettes QR sur A4 (pur, testable) : gabarit courant de 24
// étiquettes 70 × 37 mm (3 colonnes × 8 lignes, sans marge perdue en
// largeur). Unité : point PDF (1 mm = 72 / 25,4 pt).

export const MM = 72 / 25.4;

export interface GabaritEtiquettes {
  largeurPage: number;
  hauteurPage: number;
  colonnes: number;
  lignes: number;
  largeur: number;
  hauteur: number;
  margeGauche: number;
  margeHaut: number;
}

export const GABARIT_A4_24: GabaritEtiquettes = {
  largeurPage: 210 * MM,
  hauteurPage: 297 * MM,
  colonnes: 3,
  lignes: 8,
  largeur: 70 * MM,
  hauteur: 37 * MM,
  margeGauche: 0,
  margeHaut: 0.5 * MM,
};

export interface PositionEtiquette {
  page: number;
  /** Coin bas gauche, repère PDF (origine en bas à gauche). */
  x: number;
  y: number;
}

export function positionsEtiquettes(
  nombre: number,
  gabarit: GabaritEtiquettes = GABARIT_A4_24,
): PositionEtiquette[] {
  const parPage = gabarit.colonnes * gabarit.lignes;
  return Array.from({ length: nombre }, (_, i) => {
    const page = Math.floor(i / parPage);
    const rang = i % parPage;
    const ligne = Math.floor(rang / gabarit.colonnes);
    const colonne = rang % gabarit.colonnes;
    return {
      page,
      x: gabarit.margeGauche + colonne * gabarit.largeur,
      y:
        gabarit.hauteurPage - gabarit.margeHaut - (ligne + 1) * gabarit.hauteur,
    };
  });
}

/** Réduit une référence à ses derniers caractères, lisibles sur l'étiquette. */
export function referenceCourte(ref: string, n = 8): string {
  return ref.length <= n ? ref : `…${ref.slice(-n)}`;
}
