// Indicateur par activité : litres consommés par nuitée, emplacement
// occupé ou couvert sur le mois. À défaut de données saisies, estimation
// avec la capacité × le taux d'occupation par défaut, signalée comme telle.

export interface IndicateurActivite {
  litresParUnite: number;
  estimation: boolean;
  quantite: number;
}

export function indicateurActivite(params: {
  volumeM3: number;
  quantiteSaisie: number | null;
  capacite: number | null;
  tauxOccupation: number | null;
  joursDansMois: number;
  unite: string;
}): IndicateurActivite | null {
  if (params.unite === "aucune") return null;
  const litres = params.volumeM3 * 1000;
  if (params.quantiteSaisie !== null && params.quantiteSaisie > 0) {
    return {
      litresParUnite: Math.round(litres / params.quantiteSaisie),
      estimation: false,
      quantite: params.quantiteSaisie,
    };
  }
  if (params.capacite && params.tauxOccupation) {
    // La surface (m²) ne dépend pas de l'occupation ni des jours.
    const quantite =
      params.unite === "m2"
        ? params.capacite
        : params.capacite * params.tauxOccupation * params.joursDansMois;
    if (quantite > 0) {
      return { litresParUnite: Math.round(litres / quantite), estimation: true, quantite };
    }
  }
  return null;
}
