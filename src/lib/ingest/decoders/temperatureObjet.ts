// Sonde de température LoRaWAN : la valeur est lue dans l'objet déjà
// décodé par le serveur réseau (codec du fabricant chargé dans le profil
// d'appareil ChirpStack ou The Things Stack). Aucun format de trame n'est
// supposé ici.
//
// TODO(RAYAN) : modèle de sonde à choisir ; confirmer le nom du champ de
// température produit par son codec (par défaut « temperature », en °C).
import type { ContexteDecodage, TrameDecodee } from "../types";

export const CHAMP_TEMPERATURE_DEFAUT = "temperature";

/** Lit un champ numérique, éventuellement imbriqué (« capteur.temperature »). */
export function lireChampNumerique(
  objet: Record<string, unknown> | undefined,
  chemin: string,
): number | null {
  let courant: unknown = objet;
  for (const cle of chemin.split(".")) {
    if (typeof courant !== "object" || courant === null) return null;
    courant = (courant as Record<string, unknown>)[cle];
  }
  if (typeof courant === "number" && Number.isFinite(courant)) return courant;
  if (typeof courant === "string" && courant.trim() !== "") {
    const n = Number(courant.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function decodeTemperatureObjet(
  _payload: Uint8Array,
  contexte: ContexteDecodage,
  champ = CHAMP_TEMPERATURE_DEFAUT,
): TrameDecodee {
  const valeur = lireChampNumerique(contexte.objet, champ);
  if (valeur === null) {
    throw new Error(
      `Température absente : le serveur réseau doit décoder la trame (champ « ${champ} » attendu dans l'objet décodé)`,
    );
  }
  if (valeur < -20 || valeur > 120) {
    throw new Error(`Température hors plage plausible : ${valeur} °C`);
  }
  return { points: [], brut: { temperatureC: valeur } };
}
