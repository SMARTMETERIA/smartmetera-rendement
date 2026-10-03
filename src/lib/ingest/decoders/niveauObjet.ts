// Capteur de niveau LoRaWAN (réserves d'eau, phase G11) : la mesure est lue
// dans l'objet déjà décodé par le serveur réseau (décodeur du fabricant
// chargé dans le profil d'appareil ChirpStack ou The Things Stack). Aucun
// format de trame n'est supposé ici.
//
// Modèle retenu par Rayan : Milesight EM500-UDL, champ « distance » en
// millimètres (platform_settings.capteur_niveau, modifiable par le
// superadmin). Trames réelles à ajouter aux tests (A_FAIRE_RAYAN.md, M1).
import type { ContexteDecodage, ReglageNiveau, TrameDecodee } from "../types";
import { lireChampNumerique } from "./temperatureObjet";

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
