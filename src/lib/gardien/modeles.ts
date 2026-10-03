// Catalogue des capteurs du Gardien de l'eau (plan, section 1) : ce que
// l'import de stock, l'assistant de pose et la réception doivent savoir de
// chaque modèle. Aucun format de trame ici : voir src/lib/ingest/decoders.

import type { CodeDecodeur } from "@/lib/ingest/types";

export type CleModele =
  | "adeunis_pulse_nbiot"
  | "milesight_em300_di"
  | "sonde_temperature"
  | "capteur_niveau";

export interface ModeleCapteur {
  libelle: string;
  kit: "A" | "C" | "sonde" | "niveau";
  transmission: "cellulaire" | "lorawan";
  decodeur: CodeDecodeur;
  /** « niveau » : capteur de réserve d'eau, réglé dans « Réserves d'eau » (pas l'assistant de pose). */
  nature: "eau" | "temperature" | "niveau";
  /** Entrées d'impulsions (null : une seule entrée, sans nom). */
  voies: (string | null)[];
  /**
   * Intervalle d'émission à régler sur l'appareil (secondes) : sert à
   * annoncer l'heure de la première donnée. null : inconnu.
   */
  intervalleEmissionS: number | null;
  /** Consigne de réglage affichée au technicien. */
  consigne: string;
}

export const MODELES_CAPTEURS: Record<CleModele, ModeleCapteur> = {
  adeunis_pulse_nbiot: {
    libelle: "Adeunis PULSE NB-IoT/LTE-M",
    kit: "A",
    transmission: "cellulaire",
    decodeur: "adeunis_pulse_mqtt",
    nature: "eau",
    voies: ["A", "B"],
    // Guide Adeunis PULSE MQTTS : réglage d'usine 86 400 s (une émission
    // par jour) ; le Gardien demande des relevés au moins horaires.
    intervalleEmissionS: 3600,
    consigne:
      "Avec l'application Adeunis, réglez l'échantillonnage à 900 secondes et l'émission à 3 600 secondes (réglage d'usine : une fois par jour).",
  },
  milesight_em300_di: {
    libelle: "Milesight EM300-DI",
    kit: "C",
    transmission: "lorawan",
    decodeur: "milesight_em300_di",
    nature: "eau",
    voies: [null],
    // Intervalle réglé sur les EM300-DI livrés : 60 minutes (Rayan, M2).
    intervalleEmissionS: 3600,
    consigne:
      "Vérifiez que l'intervalle d'émission est réglé à 60 minutes (application Milesight ToolBox).",
  },
  sonde_temperature: {
    // TODO(RAYAN) : modèle de sonde à choisir (plus tard, M3).
    libelle: "Sonde de température LoRaWAN",
    kit: "sonde",
    transmission: "lorawan",
    decodeur: "temperature_objet",
    nature: "temperature",
    voies: [null],
    intervalleEmissionS: null,
    consigne:
      "Fixez la sonde au contact du tuyau d'eau chaude et isolez-la de l'air ambiant.",
  },
  capteur_niveau: {
    // Modèle retenu par Rayan (M4) : mesure la distance jusqu'à la surface
    // de l'eau, champ « distance » en millimètres dans son décodeur.
    libelle: "Milesight EM500-UDL",
    kit: "niveau",
    transmission: "lorawan",
    decodeur: "niveau_objet",
    nature: "niveau",
    voies: [null],
    intervalleEmissionS: null,
    consigne:
      "Posez le capteur selon la notice du fabricant, puis mesurez la hauteur entre le fond de la réserve et le capteur.",
  },
};

export const CLES_MODELES = Object.keys(MODELES_CAPTEURS) as CleModele[];

/** Retrouve un modèle par sa clé ou son libellé (import CSV tolérant). */
export function trouverModele(saisie: string): CleModele | null {
  const n = saisie
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!n) return null;
  for (const cle of CLES_MODELES) {
    const libelle = MODELES_CAPTEURS[cle].libelle
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (n === cle.replace(/_/g, " ") || n === libelle) return cle;
  }
  if (/adeunis|pulse|arf8420/.test(n)) return "adeunis_pulse_nbiot";
  // Avant « milesight » : l'EM500-UDL est aussi un Milesight.
  if (/em500|udl/.test(n)) return "capteur_niveau";
  if (/em300|milesight/.test(n)) return "milesight_em300_di";
  if (/temperature|sonde/.test(n)) return "sonde_temperature";
  if (/niveau|level|ultrason|citerne/.test(n)) return "capteur_niveau";
  return null;
}

/** Modèle d'un appareil d'après son décodeur (appareils déjà en base). */
export function modeleDepuisDecodeur(
  decodeur: string | null,
): CleModele | null {
  return (
    CLES_MODELES.find((c) => MODELES_CAPTEURS[c].decodeur === decodeur) ?? null
  );
}
