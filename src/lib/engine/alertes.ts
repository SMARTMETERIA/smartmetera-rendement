/** Miroir TypeScript testable de detecter_compteurs_muets()/detecter_debits_inverses()/detecter_index_anormaux() (SQL). */

/** Compteur muet : aucun relevé depuis plus de 48h (ou jamais de relevé). */
export function estCompteurMuet(
  dernierReleve: Date | null,
  maintenant: Date,
  seuilHeures = 48,
): boolean {
  if (dernierReleve === null) return true;
  const heuresEcoulees =
    (maintenant.getTime() - dernierReleve.getTime()) / 3_600_000;
  return heuresEcoulees > seuilHeures;
}

/** Débit horaire de secteur négatif (sorties > entrées) au-delà d'une tolérance de bruit de mesure. */
export function estDebitInverse(debitM3h: number, seuil = -0.5): boolean {
  return debitM3h < seuil;
}

/**
 * Index anormal : écart statistique au volume journalier habituel du
 * compteur (moyenne/écart-type des 30 derniers jours, ≥14 jours
 * d'historique requis côté appelant). Heuristique documentée, pas une
 * règle métier officielle.
 */
export function estIndexAnormal(
  valeur: number,
  moyenne: number,
  ecartType: number,
): boolean {
  const seuil = Math.max(5 * ecartType, 0.5 * moyenne, 1);
  return Math.abs(valeur - moyenne) > seuil;
}
