// Réserves d'eau (citernes, bâches, châteaux d'eau) : de la mesure du
// capteur de niveau au volume utile (phase G11). Pur, sans dépendance ;
// recopié dans les fonctions Deno (scripts/synchroniser-ingest.mjs).
//
// Le volume utile est l'eau réellement disponible : entre la prise d'eau
// (crépine, départ de la pompe), sous laquelle l'eau n'est pas utilisable,
// et le niveau plein (trop-plein).

/** « verticale » : section constante (cuve debout, bâche rectangulaire). */
export type FormeReserve = "verticale" | "cylindre_horizontal";
/**
 * « distance » : capteur au-dessus de l'eau (ultrason, radar), qui mesure la
 * distance jusqu'à la surface ; « hauteur » : capteur immergé (pression),
 * qui mesure directement la hauteur d'eau.
 */
export type MontageCapteur = "distance" | "hauteur";

export interface ReserveEau {
  id: string;
  nom: string;
  /** Volume quand la réserve est pleine (m³). */
  capaciteM3: number;
  /** Hauteur d'eau quand la réserve est pleine (m) ; diamètre intérieur pour une cuve couchée. */
  hauteurPleineM: number;
  /** Hauteur de la prise d'eau au-dessus du fond (m). */
  hauteurPriseM: number;
  forme: FormeReserve;
  montage: MontageCapteur;
  /** Hauteur du capteur au-dessus du fond (m), pour un capteur « distance ». */
  hauteurCapteurM: number | null;
  /** Niveau bas propre à la réserve (% du volume utile) ; null : réglage général. */
  seuilBasPct: number | null;
}

/** Colonnes de water_reserves lues par reserveDepuisLigne. */
export const COLONNES_RESERVE =
  "id, label, capacity_m3, shape, full_height_m, outlet_height_m, sensor_mounting, sensor_height_m, low_threshold_pct";

/** Réserve à partir d'une ligne de la table water_reserves. */
export function reserveDepuisLigne(l: Record<string, unknown>): ReserveEau {
  const nombreOuNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: l.id as string,
    nom: l.label as string,
    capaciteM3: Number(l.capacity_m3),
    hauteurPleineM: Number(l.full_height_m),
    hauteurPriseM: Number(l.outlet_height_m ?? 0),
    forme: l.shape === "cylindre_horizontal" ? "cylindre_horizontal" : "verticale",
    montage: l.sensor_mounting === "hauteur" ? "hauteur" : "distance",
    hauteurCapteurM: nombreOuNull(l.sensor_height_m),
    seuilBasPct: nombreOuNull(l.low_threshold_pct),
  };
}

const borne = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

/** Hauteur d'eau (m) déduite de la mesure, bornée entre le fond et le niveau plein. */
export function hauteurEau(mesureM: number, r: ReserveEau): number | null {
  if (!Number.isFinite(mesureM)) return null;
  const h = r.montage === "distance" ? (r.hauteurCapteurM === null ? null : r.hauteurCapteurM - mesureM) : mesureM;
  if (h === null || !Number.isFinite(h)) return null;
  return borne(h, 0, r.hauteurPleineM);
}

/**
 * Part du volume plein contenue à la hauteur h (0 à 1). Cuve couchée :
 * aire du segment de disque, (θ − sin θ) / 2π avec θ = 2 arccos(1 − 2h/D).
 */
export function fractionVolume(hauteurM: number, r: ReserveEau): number {
  if (r.hauteurPleineM <= 0) return 0;
  const x = borne(hauteurM / r.hauteurPleineM, 0, 1);
  if (r.forme === "verticale") return x;
  const theta = 2 * Math.acos(1 - 2 * x);
  return (theta - Math.sin(theta)) / (2 * Math.PI);
}

/** Volume total contenu (m³) à une hauteur d'eau. */
export function volumeStockeM3(hauteurM: number, r: ReserveEau): number {
  return r.capaciteM3 * fractionVolume(hauteurM, r);
}

/** Volume utile quand la réserve est pleine (m³). */
export function volumeUtileMaxM3(r: ReserveEau): number {
  return Math.max(0, r.capaciteM3 - volumeStockeM3(r.hauteurPriseM, r));
}

/** Volume utile (m³) : au-dessus de la prise d'eau. */
export function volumeUtileM3(hauteurM: number, r: ReserveEau): number {
  return Math.max(0, volumeStockeM3(hauteurM, r) - volumeStockeM3(r.hauteurPriseM, r));
}

/** Volume utile (m³) correspondant à une mesure du capteur, null si illisible. */
export function volumeUtileMesure(mesureM: number, r: ReserveEau): number | null {
  const h = hauteurEau(mesureM, r);
  return h === null ? null : volumeUtileM3(h, r);
}

/**
 * Mesure que donnerait le capteur pour un volume utile donné (inverse,
 * utile aux essais et à la démonstration). Recherche par dichotomie.
 */
export function mesurePourVolumeUtile(volumeM3: number, r: ReserveEau): number {
  let bas = r.hauteurPriseM;
  let haut = r.hauteurPleineM;
  for (let i = 0; i < 60; i++) {
    const milieu = (bas + haut) / 2;
    if (volumeUtileM3(milieu, r) < volumeM3) bas = milieu;
    else haut = milieu;
  }
  const h = (bas + haut) / 2;
  return r.montage === "distance" ? (r.hauteurCapteurM ?? 0) - h : h;
}
