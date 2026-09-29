// Règles de détection (plan, section 4, phase G4) : fuite de nuit, débit
// continu, rupture, consommation pendant une fermeture, fin de fuite,
// capteur muet. Fonctions pures : l'appelant fournit les débits et nuits.
import type { ReglagesDetection } from "./reglages.ts";

export interface NuitEvaluee {
  date: string;
  dmnLph: number | null;
  baselineLph: number | null;
  seuilLph: number | null;
}

export interface Detection {
  /** Excès retenu (méthode prudente : le plus faible observé), L/h. */
  excesLph: number;
}

/**
 * Fuite de nuit : les n dernières nuits (ordre chronologique) dépassent
 * chacune leur seuil. Excès = plus petit dépassement de la ligne de base.
 */
export function detecterFuiteNuit(nuits: NuitEvaluee[], nuitsExigees: number): Detection | null {
  if (nuits.length < nuitsExigees) return null;
  const dernieres = nuits.slice(-nuitsExigees);
  if (
    dernieres.some(
      (n) =>
        n.dmnLph === null || n.seuilLph === null || n.baselineLph === null || n.dmnLph <= n.seuilLph,
    )
  ) {
    return null;
  }
  return {
    excesLph: Math.min(...dernieres.map((n) => (n.dmnLph as number) - (n.baselineLph as number))),
  };
}

/**
 * Débit continu : jamais sous le seuil (5 L/h) pendant 24 h, heures des
 * plages calmes exclues ; au moins 20 heures mesurées sur 24.
 */
export function detecterDebitContinu(
  debitsLph: (number | null)[],
  reglages: ReglagesDetection,
): Detection | null {
  const mesures = debitsLph.filter((d): d is number => d !== null);
  if (mesures.length < Math.min(20, reglages.debitContinu.heures)) return null;
  const min = Math.min(...mesures);
  return min >= reglages.debitContinu.minLph ? { excesLph: min } : null;
}

/**
 * Rupture : débit horaire supérieur à 3 fois le maximum observé sur 30 jours
 * et à 500 L/h. Sans aucun historique, pas de conclusion.
 */
export function detecterRupture(
  debitLph: number | null,
  max30jLph: number | null,
  reglages: ReglagesDetection,
): Detection | null {
  if (debitLph === null || max30jLph === null) return null;
  const seuil = Math.max(max30jLph * reglages.rupture.facteurMax30j, reglages.rupture.minLph);
  return debitLph > seuil ? { excesLph: debitLph - max30jLph } : null;
}

/** Fermeture : consommation au-dessus de 2 L/h pendant 2 heures consécutives. */
export function detecterFermeture(
  dernieresHeuresLph: (number | null)[],
  reglages: ReglagesDetection,
): Detection | null {
  const n = reglages.fermeture.heures;
  if (dernieresHeuresLph.length < n) return null;
  const heures = dernieresHeuresLph.slice(-n);
  if (heures.some((h) => h === null || h < reglages.fermeture.minLph)) return null;
  return { excesLph: Math.min(...(heures as number[])) };
}

/** Fin de fuite : le débit de nuit est revenu sous le seuil n nuits de suite. */
export function fuiteReparee(nuitsApresDetection: NuitEvaluee[], nuits: number): boolean {
  if (nuitsApresDetection.length < nuits) return false;
  return nuitsApresDetection
    .slice(-nuits)
    .every((n) => n.dmnLph !== null && n.seuilLph !== null && n.dmnLph <= n.seuilLph);
}

/** Capteur muet : pas de message depuis 36 h (cellulaire) ou 6 h (LoRaWAN). */
export function capteurMuet(
  dernierMessageMs: number | null,
  transmission: string | null,
  maintenantMs: number,
  reglages: ReglagesDetection,
): boolean {
  if (transmission === "import") return false;
  const limiteH =
    transmission === "cellulaire" ? reglages.capteurMuet.cellulaireH : reglages.capteurMuet.lorawanH;
  return dernierMessageMs === null || maintenantMs - dernierMessageMs > limiteH * 3_600_000;
}
