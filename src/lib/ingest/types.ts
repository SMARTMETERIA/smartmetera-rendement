// Types partagés par les décodeurs de trame et les enveloppes de plateforme.
// Dupliqué dans supabase/functions/ingest/lib (voir README de ce dossier) :
// même convention que supabase/functions/process-import/lib.

/** Un point de comptage extrait d'une trame décodée (une trame peut en
 * contenir plusieurs : historique, batch). */
export interface PointReleve {
  horodatage: string; // ISO 8601 UTC
  /** Voie du capteur multi-entrées (ex : "A"/"B" Adeunis, "1"/"2"/"3" Watteco), null si mono-voie. */
  canal: string | null;
  /** 'index' = compteur cumulatif d'impulsions depuis mise en service ; 'delta' = impulsions depuis la trame précédente. */
  nature: "index" | "delta";
  impulsions: number;
}

export interface TrameDecodee {
  points: PointReleve[];
  /** Champs additionnels utiles au diagnostic (batterie, alarme...), affichés tels quels dans le testeur de trame. */
  brut?: Record<string, unknown>;
}

export type CodeDecodeur =
  | "adeunis_pulse_v4"
  | "watteco_pulse_senso"
  | "milesight_em300_di"
  | "dragino_sw3l"
  | "adeunis_pulse_mqtt"
  | "temperature_objet"
  | "niveau_objet";

/** Champ et unité de la mesure d'un capteur de niveau (platform_settings.capteur_niveau). */
export interface ReglageNiveau {
  champ: string;
  unite: "mm" | "cm" | "m";
}

export interface ContexteDecodage {
  /** Horodatage de réception de la trame par la plateforme réseau (fallback si la trame ne porte pas son propre horodatage). */
  recuLe: string;
  fPort?: number;
  /** Valeurs déjà décodées par le serveur réseau (codec ChirpStack), si fournies. */
  objet?: Record<string, unknown>;
  /** Capteur de niveau : où lire la mesure dans l'objet décodé. */
  niveau?: ReglageNiveau;
}

export type FonctionDecodeur = (
  payload: Uint8Array,
  contexte: ContexteDecodage,
) => TrameDecodee;

/** Enveloppe extraite d'un corps de webhook, indépendamment du décodeur applicatif. */
export interface EnveloppeUplink {
  devEui: string;
  fPort?: number;
  fCnt?: number;
  payload: Uint8Array;
  recuLe: string;
  /** Qualité radio de la meilleure réception (dBm, dB), si fournie. */
  rssi?: number;
  snr?: number;
  /** Valeurs déjà décodées par le serveur réseau (codec ChirpStack), si fournies. */
  objet?: Record<string, unknown>;
}

export type ErreurEnveloppe = { erreur: string };
