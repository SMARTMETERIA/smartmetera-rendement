import type { CodeDecodeur, FonctionDecodeur } from "../types.ts";
import { decodeAdeunisPulseV4, ADEUNIS_MAX_IMPULSIONS } from "./adeunisPulseV4.ts";
import {
  decodeWattecoPulseSenso,
  WATTECO_MAX_IMPULSIONS,
} from "./wattecoPulseSenso.ts";
import {
  decodeMilesightEm300Di,
  MILESIGHT_MAX_IMPULSIONS,
} from "./milesightEm300Di.ts";
import { decodeDraginoSw3l, DRAGINO_MAX_IMPULSIONS } from "./draginoSw3l.ts";

export const DECODEURS: Record<CodeDecodeur, FonctionDecodeur> = {
  adeunis_pulse_v4: decodeAdeunisPulseV4,
  watteco_pulse_senso: decodeWattecoPulseSenso,
  milesight_em300_di: decodeMilesightEm300Di,
  dragino_sw3l: decodeDraginoSw3l,
};

export const MAX_IMPULSIONS: Record<CodeDecodeur, number> = {
  adeunis_pulse_v4: ADEUNIS_MAX_IMPULSIONS,
  watteco_pulse_senso: WATTECO_MAX_IMPULSIONS,
  milesight_em300_di: MILESIGHT_MAX_IMPULSIONS,
  dragino_sw3l: DRAGINO_MAX_IMPULSIONS,
};

export const LABEL_DECODEUR: Record<CodeDecodeur, string> = {
  adeunis_pulse_v4: "Adeunis PULSE (V4)",
  watteco_pulse_senso: "Watteco Pulse Sens'O",
  milesight_em300_di: "Milesight EM300-DI",
  dragino_sw3l: "Dragino SW3L",
};
