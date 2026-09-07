// Dragino SW3L (capteur de débit à impulsions, FPORT 2, trame standard 11
// octets, big-endian) :
//   octet 0 : bit1 (0x02) = alarme ; bits2-7 = calculate_flag (facteur K du
//             compteur mécanique raccordé, indicatif seulement — le facteur
//             réel utilisé par SmartMeteria est configuré par équipement,
//             voir devices.litres_par_impulsion)
//   octets 1-4 : compteur d'impulsions, uint32 big-endian
//   octet 5 : MOD -> 1 = "Last_pulse" (delta depuis la dernière trame),
//             0 (ou autre) = "Total_pulse" (index cumulatif depuis mise en
//             service/reset)
//   octet 6 : réservé
//   octets 7-10 : horodatage Unix (secondes), uint32 big-endian, horloge de
//             l'appareil
//
// Décodeur officiel (fait foi) :
// https://raw.githubusercontent.com/dragino/dragino-end-node-decoder/main/SW3L/SW3L%20Decoder%20TTN.txt
export const DRAGINO_MAX_IMPULSIONS = 2 ** 32 - 1;
import type { TrameDecodee, ContexteDecodage } from "../types";
import { readUInt32BE } from "../bytes";

export function decodeDraginoSw3l(
  payload: Uint8Array,
  contexte: ContexteDecodage,
): TrameDecodee {
  if (payload.length < 11) {
    throw new Error(
      `Trame Dragino SW3L trop courte (${payload.length} octets, 11 attendus)`,
    );
  }

  const alarme = (payload[0] & 0x02) !== 0;
  const calculateFlag = payload[0] >> 2;
  const pulses = readUInt32BE(payload, 1);
  const mod = payload[5];
  const timestampUnix = readUInt32BE(payload, 7);

  const horodatage =
    timestampUnix > 0
      ? new Date(timestampUnix * 1000).toISOString()
      : contexte.recuLe;

  return {
    points: [
      {
        horodatage,
        canal: null,
        nature: mod === 1 ? "delta" : "index",
        impulsions: pulses,
      },
    ],
    brut: { alarme, calculateFlag, mod },
  };
}
