// Capteur de niveau LoRaWAN (réserves d'eau, phase G11) : la mesure est lue
// dans l'objet déjà décodé par le serveur réseau (décodeur du fabricant
// chargé dans le profil d'appareil ChirpStack ou The Things Stack). Aucun
// format de trame n'est supposé ici.
//
// TODO(RAYAN) : modèle de capteur à choisir ; confirmer le nom du champ et
// son unité avec sa documentation (platform_settings.capteur_niveau, par
// défaut « distance » en millimètres).
import type { ContexteDecodage, ReglageNiveau, TrameDecodee } from "../types.ts";
import { lireChampNumerique } from "./temperatureObjet.ts";

export const REGLAGE_NIVEAU_DEFAUT: ReglageNiveau = { champ: "distance", unite: "mm" };

const DIVISEURS: Record<ReglageNiveau["unite"], number> = { mm: 1000, cm: 100, m: 1 };

/** Lit platform_settings.capteur_niveau (valeurs inconnues : défaut). */
export function lireReglageNiveau(brut: unknown): ReglageNiveau {
  const b = (brut ?? {}) as Record<string, unknown>;
  const champ = typeof b.champ === "string" && /^[A-Za-z0-9_.]{1,80}$/.test(b.champ) ? b.champ : REGLAGE_NIVEAU_DEFAUT.champ;
  const unite = b.unite === "mm" || b.unite === "cm" || b.unite === "m" ? b.unite : REGLAGE_NIVEAU_DEFAUT.unite;
  return { champ, unite };
}

export function decodeNiveauObjet(_payload: Uint8Array, contexte: ContexteDecodage): TrameDecodee {
  const reglage = contexte.niveau ?? REGLAGE_NIVEAU_DEFAUT;
  const valeur = lireChampNumerique(contexte.objet, reglage.champ);
  if (valeur === null) {
    throw new Error(
      `Niveau absent : le serveur réseau doit décoder la trame (champ « ${reglage.champ} » attendu dans l'objet décodé)`,
    );
  }
  const metres = valeur / DIVISEURS[reglage.unite];
  if (metres < 0 || metres > 100) {
    throw new Error(`Mesure de niveau hors plage plausible : ${valeur} ${reglage.unite}`);
  }
  return { points: [], brut: { niveauM: Math.round(metres * 10000) / 10000 } };
}
