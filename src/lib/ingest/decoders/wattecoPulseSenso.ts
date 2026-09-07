// Watteco Pulse Sens'O — trame LoRaWAN "standard" (non batch), format
// ZigBee/ZCL encapsulé : [Fctrl(1)] [cmdID(1)] [ClusterID(2 BE)]
// [AttributID(2 BE)] [AttributType(1)] [Data(N)]. Comptage d'impulsions :
// ClusterID 0x000F (Binary Input), AttributID 0x0402 ("Count"),
// AttributType 0x23 (uint32 ZCL) -> compteur cumulatif 4 octets big-endian.
//
// Voie (canal) = ((Fctrl & 0xE0) >> 5) | ((Fctrl & 0x06) << 2), valeurs
// 0/1/2 -> Input1/2/3 (le capteur a jusqu'à 3 entrées impulsionnelles).
// Rollover : type ZCL uint32 -> 2^32 - 1 (déduit du type de donnée déclaré,
// non écrit explicitement dans la doc constructeur — voir README/decoders).
//
// Le mode "batch" (Fctrl bit0 = 0, compression propriétaire des historiques)
// n'est pas supporté : hors périmètre (les trames temps réel suffisent au
// calcul du débit de nuit et du bilan).
//
// Sources : https://support.watteco.com/pulsesenso-2/ ,
// https://raw.githubusercontent.com/TheThingsNetwork/lorawan-devices/master/vendor/nke-watteco/pulse-senso-sensor.js
import type { TrameDecodee, ContexteDecodage } from "../types";
import { readUInt32BE } from "../bytes";

const CANAUX = ["1", "2", "3"] as const;
export const WATTECO_MAX_IMPULSIONS = 2 ** 32 - 1;

export function decodeWattecoPulseSenso(
  payload: Uint8Array,
  contexte: ContexteDecodage,
): TrameDecodee {
  if (payload.length < 11) {
    throw new Error(
      `Trame Watteco Pulse Sens'O trop courte (${payload.length} octets, 11 attendus en mode standard)`,
    );
  }

  const fctrl = payload[0];
  if ((fctrl & 0x01) === 0) {
    throw new Error(
      "Trame Watteco en mode batch (compressé) : non supporté, seules les trames standard temps réel le sont",
    );
  }

  const canalIndex = ((fctrl & 0xe0) >> 5) | ((fctrl & 0x06) << 2);
  const cmdId = payload[1];
  const clusterId = (payload[2] << 8) | payload[3];
  const attributId = (payload[4] << 8) | payload[5];
  const attributType = payload[6];

  if (![0x0a, 0x8a, 0x01].includes(cmdId)) {
    throw new Error(`cmdID Watteco non supporté : 0x${cmdId.toString(16)}`);
  }
  if (clusterId !== 0x000f || attributId !== 0x0402 || attributType !== 0x23) {
    throw new Error(
      `Attribut Watteco non reconnu comme compteur d'impulsions (cluster=0x${clusterId.toString(16)}, attribut=0x${attributId.toString(16)}, type=0x${attributType.toString(16)})`,
    );
  }

  const impulsions = readUInt32BE(payload, 7);

  return {
    points: [
      {
        horodatage: contexte.recuLe,
        canal: CANAUX[canalIndex] ?? String(canalIndex + 1),
        nature: "index",
        impulsions,
      },
    ],
    brut: { fctrl, cmdId, alarme: cmdId === 0x8a },
  };
}
