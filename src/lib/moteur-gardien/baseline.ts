// Ligne de base auto-calibrée d'un point : médiane des débits de nuit
// normaux récents, par jour de la semaine quand l'historique le permet. La
// fenêtre glissante (8 semaines au plus, fournie par l'appelant) suit les
// saisons. Période d'apprentissage : pas de détection de fuite de nuit
// avant 7 nuits, seuils doublés et 3 nuits exigées jusqu'à 14 nuits.
import type { ReglagesDetection } from "./reglages";

export type ModeLigneDeBase = "apprentissage" | "prudent" | "normal";

export interface NuitHistorique {
  date: string;
  jourIso: number;
  dmnLph: number;
}

export interface LigneDeBase {
  valeurLph: number | null;
  mode: ModeLigneDeBase;
  nbNuits: number;
  parJourDeSemaine: boolean;
}

export function mediane(valeurs: number[]): number | null {
  if (valeurs.length === 0) return null;
  const tri = [...valeurs].sort((a, b) => a - b);
  const m = Math.floor(tri.length / 2);
  return tri.length % 2 === 1 ? tri[m] : (tri[m - 1] + tri[m]) / 2;
}

/**
 * @param historique nuits normales antérieures (hors fuite, hors fermeture),
 * de la plus ancienne à la plus récente.
 */
export function ligneDeBase(
  historique: NuitHistorique[],
  jourIsoCible: number,
  reglages: ReglagesDetection,
): LigneDeBase {
  const n = historique.length;
  if (n < reglages.apprentissage.joursMin) {
    return { valeurLph: null, mode: "apprentissage", nbNuits: n, parJourDeSemaine: false };
  }
  if (n < reglages.apprentissage.joursMax) {
    return {
      valeurLph: mediane(historique.map((h) => h.dmnLph)),
      mode: "prudent",
      nbNuits: n,
      parJourDeSemaine: false,
    };
  }
  const memeJour = historique.filter((h) => h.jourIso === jourIsoCible);
  if (memeJour.length >= 3) {
    return {
      valeurLph: mediane(memeJour.map((h) => h.dmnLph)),
      mode: "normal",
      nbNuits: n,
      parJourDeSemaine: true,
    };
  }
  const recentes = historique.slice(-reglages.apprentissage.joursMax);
  return {
    valeurLph: mediane(recentes.map((h) => h.dmnLph)),
    mode: "normal",
    nbNuits: n,
    parJourDeSemaine: false,
  };
}

/** Seuil de fuite de nuit : ligne de base + max(20 %, 5 L/h), doublé en mode prudent. */
export function seuilFuiteNuit(base: LigneDeBase, reglages: ReglagesDetection): number | null {
  if (base.valeurLph === null) return null;
  const facteur = base.mode === "prudent" ? 2 : 1;
  const marge = Math.max(
    (base.valeurLph * reglages.fuiteNuit.margePct * facteur) / 100,
    reglages.fuiteNuit.margeMinLph * facteur,
  );
  return base.valeurLph + marge;
}

/** Nombre de nuits consécutives exigées selon le mode. */
export function nuitsExigees(mode: ModeLigneDeBase, reglages: ReglagesDetection): number {
  return mode === "prudent" ? reglages.fuiteNuit.nuits + 1 : reglages.fuiteNuit.nuits;
}
