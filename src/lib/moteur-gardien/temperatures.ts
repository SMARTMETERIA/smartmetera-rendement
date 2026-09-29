// Températures d'eau chaude sanitaire (suivi légionelles) : seuils
// paramétrables par point, défauts de plateforme par type de point.
// TODO(RAYAN) : seuils, fréquences et délai des analyses avant réouverture
// à vérifier dans les textes (platform_settings.temperatures).
import { decalerJour } from "./temps";
import type { PeriodeFermeture } from "./plages";

export type TypePoint = "sortie_production" | "retour_boucle" | "point_eloigne";

export interface ReglagesTemperature {
  seuilsC: Partial<Record<TypePoint, number | null>>;
  rappelAnalysesJours: number | null;
}

export function lireReglagesTemperature(brut: unknown): ReglagesTemperature {
  const b = (brut ?? {}) as Record<string, unknown>;
  const seuils = (b.seuils_c ?? {}) as Record<string, unknown>;
  const lire = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    seuilsC: {
      sortie_production: lire(seuils.sortie_production),
      retour_boucle: lire(seuils.retour_boucle),
      point_eloigne: lire(seuils.point_eloigne),
    },
    rappelAnalysesJours: lire(b.rappel_analyses_avant_reouverture_jours),
  };
}

/** Seuil d'un point : le sien, sinon celui de son type ; null si inconnu. */
export function seuilPoint(
  point: { type: TypePoint; thresholdC: number | null },
  reglages: ReglagesTemperature,
): number | null {
  return point.thresholdC ?? reglages.seuilsC[point.type] ?? null;
}

export function temperatureBasse(valeurC: number, seuilC: number | null): boolean {
  return seuilC !== null && valeurC < seuilC;
}

/**
 * Période de fermeture qui se termine dans le délai de rappel (analyses à
 * faire avant la réouverture) ; null si aucune ou si le délai n'est pas
 * paramétré.
 */
export function fermetureAvantAnalyses(
  periodes: PeriodeFermeture[],
  aujourdhui: string,
  delaiJours: number | null,
): PeriodeFermeture | null {
  if (delaiJours === null) return null;
  const limite = decalerJour(aujourdhui, delaiJours);
  return periodes.find((p) => p.fin >= aujourdhui && p.fin <= limite) ?? null;
}

export interface ReleveTemperature {
  tsMs: number;
  valeurC: number;
  /** Mois local « AAAA-MM ». */
  mois: string;
}

export interface LigneRegistre {
  mois: string;
  premierReleveMs: number;
  premiereValeurC: number;
  minC: number;
  maxC: number;
  nbReleves: number;
  nbSousSeuil: number;
}

/** Registre mensuel d'un point : relevé de référence (le premier du mois), min, max. */
export function registreMensuel(releves: ReleveTemperature[], seuilC: number | null): LigneRegistre[] {
  const parMois = new Map<string, ReleveTemperature[]>();
  for (const r of releves) {
    const liste = parMois.get(r.mois) ?? [];
    liste.push(r);
    parMois.set(r.mois, liste);
  }
  return [...parMois.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mois, liste]) => {
      const tri = [...liste].sort((a, b) => a.tsMs - b.tsMs);
      const valeurs = tri.map((r) => r.valeurC);
      return {
        mois,
        premierReleveMs: tri[0].tsMs,
        premiereValeurC: tri[0].valeurC,
        minC: Math.min(...valeurs),
        maxC: Math.max(...valeurs),
        nbReleves: tri.length,
        nbSousSeuil: seuilC === null ? 0 : valeurs.filter((v) => v < seuilC).length,
      };
    });
}
