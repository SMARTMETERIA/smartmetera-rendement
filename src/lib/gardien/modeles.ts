// Catalogue des capteurs du Gardien de l'eau (plan, section 1) : ce que
// l'import de stock, l'assistant de pose et la réception doivent savoir de
// chaque modèle. Aucun format de trame ici : voir src/lib/ingest/decoders.

import type { CodeDecodeur } from "@/lib/ingest/types";

export type CleModele =
  "adeunis_pulse_nbiot" | "milesight_em300_di" | "sonde_temperature";

export interface ModeleCapteur {
  libelle: string;
  kit: "A" | "C" | "sonde";
  transmission: "cellulaire" | "lorawan";
  decodeur: CodeDecodeur;
  nature: "eau" | "temperature";
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
    // TODO(RAYAN) : confirmer l'intervalle d'émission réglé sur les
    // EM300-DI livrés (le Gardien demande au moins un relevé par heure).
    intervalleEmissionS: null,
    consigne:
      "Vérifiez que l'intervalle d'émission est réglé à 60 minutes au plus (application Milesight ToolBox).",
  },
  sonde_temperature: {
    // TODO(RAYAN) : modèle de sonde à choisir.
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
  if (/em300|milesight/.test(n)) return "milesight_em300_di";
  if (/temperature|sonde/.test(n)) return "sonde_temperature";
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
