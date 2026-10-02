import type { CodeDecodeur, FonctionDecodeur } from "../types";
import { decodeAdeunisPulseV4, ADEUNIS_MAX_IMPULSIONS } from "./adeunisPulseV4";
import {
  decodeWattecoPulseSenso,
  WATTECO_MAX_IMPULSIONS,
} from "./wattecoPulseSenso";
import {
  decodeMilesightEm300Di,
  MILESIGHT_MAX_IMPULSIONS,
} from "./milesightEm300Di";
import { decodeDraginoSw3l, DRAGINO_MAX_IMPULSIONS } from "./draginoSw3l";
import {
  decodeAdeunisPulseMqtt,
  ADEUNIS_MQTT_MAX_IMPULSIONS,
} from "./adeunisPulseMqtt";
import { decodeTemperatureObjet } from "./temperatureObjet";
import { decodeNiveauObjet } from "./niveauObjet";

export const DECODEURS: Record<CodeDecodeur, FonctionDecodeur> = {
  adeunis_pulse_v4: decodeAdeunisPulseV4,
  watteco_pulse_senso: decodeWattecoPulseSenso,
  milesight_em300_di: decodeMilesightEm300Di,
  dragino_sw3l: decodeDraginoSw3l,
  adeunis_pulse_mqtt: decodeAdeunisPulseMqtt,
  temperature_objet: (payload, contexte) =>
    decodeTemperatureObjet(payload, contexte),
  niveau_objet: decodeNiveauObjet,
};

export const MAX_IMPULSIONS: Record<CodeDecodeur, number> = {
  adeunis_pulse_v4: ADEUNIS_MAX_IMPULSIONS,
  watteco_pulse_senso: WATTECO_MAX_IMPULSIONS,
  milesight_em300_di: MILESIGHT_MAX_IMPULSIONS,
  dragino_sw3l: DRAGINO_MAX_IMPULSIONS,
  adeunis_pulse_mqtt: ADEUNIS_MQTT_MAX_IMPULSIONS,
  // Pas d'impulsions : la sonde produit une température, le capteur de
  // niveau une mesure en mètres.
  temperature_objet: 0,
  niveau_objet: 0,
};

/** Décodeurs proposés pour un capteur LoRaWAN à impulsions (écrans Réseau). */
export const DECODEURS_LORAWAN_IMPULSIONS: CodeDecodeur[] = [
  "adeunis_pulse_v4",
  "watteco_pulse_senso",
  "milesight_em300_di",
  "dragino_sw3l",
];

export const LABEL_DECODEUR: Record<CodeDecodeur, string> = {
  adeunis_pulse_v4: "Adeunis PULSE (V4)",
  watteco_pulse_senso: "Watteco Pulse Sens'O",
  milesight_em300_di: "Milesight EM300-DI",
  dragino_sw3l: "Dragino SW3L",
  adeunis_pulse_mqtt: "Adeunis PULSE NB-IoT/LTE-M (MQTTS)",
  temperature_objet: "Sonde de température (valeur décodée par le serveur réseau)",
  niveau_objet: "Capteur de niveau (valeur décodée par le serveur réseau)",
};
