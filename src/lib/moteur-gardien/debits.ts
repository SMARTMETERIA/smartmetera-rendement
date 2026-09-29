// Débits horaires d'un point de comptage à partir de ses relevés. Chaque
// relevé porte le volume écoulé depuis le relevé précédent (convention de
// la table readings) : ce volume est réparti uniformément sur son
// intervalle, puis cumulé heure UTC par heure UTC. Fonctionne pour des
// relevés au quart d'heure, à l'heure ou plus espacés.
import { HEURE_MS, debutHeure } from "./temps";

export interface Releve {
  /** Fin de l'intervalle, en millisecondes UTC. */
  tsMs: number;
  volumeM3: number;
}

export interface DebitHoraire {
  /** Début de l'heure UTC. */
  heureMs: number;
  litres: number;
  /** Part de l'heure couverte par des relevés (0 à 1). */
  couverture: number;
  /** Débit moyen en litres par heure, null si l'heure est trop peu couverte. */
  lph: number | null;
  /**
   * Au moins un relevé couvrant l'heure s'étend sur plus de ECART_DETAIL_MS :
   * le débit est une moyenne lissée, inutilisable pour un minimum de nuit.
   */
  lissee: boolean;
}

/** Au-delà, un intervalle sans relevé n'est pas réparti (données absentes). */
export const ECART_MAX_MS = 26 * HEURE_MS;
/** Au-delà, l'heure est seulement « lissée » (volume juste, débit moyen). */
export const ECART_DETAIL_MS = 2 * HEURE_MS;
const COUVERTURE_MIN = 0.5;

function medianeEcart(tri: Releve[]): number {
  const ecarts: number[] = [];
  for (let i = 1; i < tri.length; i++) ecarts.push(tri[i].tsMs - tri[i - 1].tsMs);
  if (ecarts.length === 0) return HEURE_MS;
  ecarts.sort((a, b) => a - b);
  return Math.min(ecarts[Math.floor(ecarts.length / 2)], HEURE_MS);
}

/**
 * @param debutConnuMs fin du relevé précédant le premier relevé fourni, si
 * connue (sinon l'intervalle du premier relevé vaut l'écart médian).
 */
export function debitsHoraires(releves: Releve[], debutConnuMs?: number): DebitHoraire[] {
  const tri = [...releves].sort((a, b) => a.tsMs - b.tsMs);
  const ecartType = medianeEcart(tri);
  const heures = new Map<number, { litres: number; couvertMs: number; lissee: boolean }>();

  tri.forEach((r, i) => {
    const debut = i > 0 ? tri[i - 1].tsMs : (debutConnuMs ?? r.tsMs - ecartType);
    const duree = r.tsMs - debut;
    if (duree <= 0 || duree > ECART_MAX_MS) return;
    const litres = r.volumeM3 * 1000;
    for (let h = debutHeure(debut); h < r.tsMs; h += HEURE_MS) {
      const recouvrement = Math.min(h + HEURE_MS, r.tsMs) - Math.max(h, debut);
      if (recouvrement <= 0) continue;
      const cumul = heures.get(h) ?? { litres: 0, couvertMs: 0, lissee: false };
      cumul.litres += (litres * recouvrement) / duree;
      cumul.couvertMs += recouvrement;
      cumul.lissee ||= duree > ECART_DETAIL_MS;
      heures.set(h, cumul);
    }
  });

  return [...heures.entries()]
    .sort(([a], [b]) => a - b)
    .map(([heureMs, { litres, couvertMs, lissee }]) => {
      const couverture = Math.min(1, couvertMs / HEURE_MS);
      return {
        heureMs,
        litres,
        couverture,
        lph: couverture >= COUVERTURE_MIN ? litres / couverture : null,
        lissee,
      };
    });
}
