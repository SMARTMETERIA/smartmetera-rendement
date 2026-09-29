// Contrôle de fréquence (plan, section 3) : relevés au moins horaires, même
// s'ils arrivent en lot. En dessous, le point est en « surveillance
// limitée » (la détection de nuit ne peut pas fonctionner correctement).

export type NiveauSurveillance = "complete" | "limitee";

/** Tolérance sur l'heure (dérive d'horloge, arrondis d'échantillonnage). */
const TOLERANCE = 1.1;

/**
 * Niveau de surveillance d'après les horodatages successifs des relevés
 * d'un point (médiane des écarts). null s'il y a moins de deux relevés.
 */
export function niveauSurveillance(
  horodatages: string[],
  frequenceMinHeures = 1,
): NiveauSurveillance | null {
  const temps = [...new Set(horodatages)]
    .map((h) => Date.parse(h))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  if (temps.length < 2) return null;
  const ecarts: number[] = [];
  for (let i = 1; i < temps.length; i++) ecarts.push(temps[i] - temps[i - 1]);
  ecarts.sort((a, b) => a - b);
  const milieu = Math.floor(ecarts.length / 2);
  const mediane =
    ecarts.length % 2 === 1
      ? ecarts[milieu]
      : (ecarts[milieu - 1] + ecarts[milieu]) / 2;
  return mediane <= frequenceMinHeures * 3_600_000 * TOLERANCE
    ? "complete"
    : "limitee";
}
