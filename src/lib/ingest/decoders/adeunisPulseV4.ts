// Adeunis PULSE (firmware "V4" du format de trame, APP >= 2.1.0) — trame
// "Periodic data without historization", frame code 0x46, big-endian :
//   octet 0 : frame code (0x46)
//   octet 1 : status byte (bits 7-5 = frame counter, bit4 = AppFlag2,
//             bit3 = AppFlag1, bit2 = horodatage présent, bit1 = batterie
//             faible, bit0 = config terminée)
//   octets 2-5 : compteur voie A, uint32 big-endian, index cumulatif
//   octets 6-9 : compteur voie B, uint32 big-endian, index cumulatif
//   octets 10-13 (si bit2 du status = 1) : horodatage, secondes écoulées
//             depuis le 2013-01-01T00:00:00Z, uint32 big-endian
//
// Rollover : 2^32 - 1 par voie. Seule cette trame périodique est décodée
// (hors périmètre : alarme 0x47, historisée 0x5A/0x5B, config 0x10).
//
// Source : Adeunis "PULSE V4 Technical Reference Manual" (LoRaWAN / Sigfox
// / NB-IoT), doc officielle adeunis.com — exemple de trame `46 20 00015C4F
// 0000F74A` -> voie A = 89 167 impulsions, voie B = 63 306 impulsions.
export const ADEUNIS_MAX_IMPULSIONS = 2 ** 32 - 1;
const ADEUNIS_EPOCH_2013_UNIX = Date.UTC(2013, 0, 1) / 1000;
const FRAME_CODE_PERIODIQUE = 0x46;

import type { TrameDecodee, ContexteDecodage } from "../types";
import { readUInt32BE } from "../bytes";

export function decodeAdeunisPulseV4(
  payload: Uint8Array,
  contexte: ContexteDecodage,
): TrameDecodee {
  if (payload.length < 10) {
    throw new Error(
      `Trame Adeunis PULSE trop courte (${payload.length} octets, 10 minimum)`,
    );
  }
  const frameCode = payload[0];
  if (frameCode !== FRAME_CODE_PERIODIQUE) {
    throw new Error(
      `Code trame Adeunis non supporté : 0x${frameCode.toString(16)} (seule la trame périodique 0x46 est décodée)`,
    );
  }

  const status = payload[1];
  const horodatagePresent = (status & 0x04) !== 0;
  const batterieFaible = (status & 0x02) !== 0;
  const compteurA = readUInt32BE(payload, 2);
  const compteurB = readUInt32BE(payload, 6);

  let horodatage = contexte.recuLe;
  if (horodatagePresent) {
    if (payload.length < 14) {
      throw new Error(
        "Status Adeunis indique un horodatage embarqué mais la trame est trop courte",
      );
    }
    const secondesDepuis2013 = readUInt32BE(payload, 10);
    horodatage = new Date(
      (ADEUNIS_EPOCH_2013_UNIX + secondesDepuis2013) * 1000,
    ).toISOString();
  }

  return {
    points: [
      { horodatage, canal: "A", nature: "index", impulsions: compteurA },
      { horodatage, canal: "B", nature: "index", impulsions: compteurB },
    ],
    brut: {
      frameCounter: (status >> 5) & 0x07,
      batterieFaible,
      horodatagePresent,
    },
  };
}
