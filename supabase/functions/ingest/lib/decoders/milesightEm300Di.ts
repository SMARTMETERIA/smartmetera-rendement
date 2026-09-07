// Milesight EM300-DI — format TLV standard Milesight : [ID(1)] [TYPE(1)]
// [DATA(N)] répété, entiers multi-octets en little-endian. Comptage
// d'impulsions : ID=0x05, TYPE=0xC8 -> 4 octets (uint32 LE), compteur
// cumulatif brut (remis à zéro seulement par une commande downlink dédiée,
// jamais par l'appareil lui-même) : c'est un index, pas un delta.
//
// Décodeur officiel (fait foi) :
// https://raw.githubusercontent.com/Milesight-IoT/SensorDecoders/main/em-series/em300-di/em300-di-decoder.js
export const MILESIGHT_MAX_IMPULSIONS = 2 ** 32 - 1;
import type { TrameDecodee, ContexteDecodage } from "../types.ts";
import { readUInt32LE } from "../bytes.ts";

export function decodeMilesightEm300Di(
  payload: Uint8Array,
  contexte: ContexteDecodage,
): TrameDecodee {
  const brut: Record<string, unknown> = {};
  let impulsions: number | null = null;
  let i = 0;

  while (i + 1 < payload.length) {
    const channelId = payload[i];
    const channelType = payload[i + 1];
    i += 2;

    if (channelId === 0x01 && channelType === 0x75) {
      brut.batterie = payload[i];
      i += 1;
    } else if (channelId === 0x05 && channelType === 0xc8) {
      impulsions = readUInt32LE(payload, i);
      i += 4;
    } else if (channelId === 0x05 && channelType === 0xe1) {
      // Conversion volumétrique déjà calculée par l'appareil (firmware
      // v1.3+) : présente à titre indicatif, on garde le compteur brut
      // (0xC8) comme source de vérité pour rester cohérent entre trames.
      i += 8;
    } else {
      // TLV non reconnu (température, humidité...) : on ne peut pas savoir
      // sa longueur sans table complète, on s'arrête là plutôt que de
      // mal interpréter la suite.
      break;
    }
  }

  if (impulsions === null) {
    throw new Error(
      "Aucun canal de comptage d'impulsions (ID 0x05, type 0xC8) trouvé dans la trame Milesight EM300-DI",
    );
  }

  return {
    points: [
      { horodatage: contexte.recuLe, canal: null, nature: "index", impulsions },
    ],
    brut,
  };
}
