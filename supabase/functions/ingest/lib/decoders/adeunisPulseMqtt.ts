// Adeunis PULSE NB-IoT/LTE-M (ARF8420AA, APP 1.4.x) en MQTTS — message
// JSON publié par l'appareil sur le broker (kit A).
//
// Source : Adeunis « User Guide PULSE MQTTS NB-IoT/LTE-M » v1.1,
// annexe 2 (modèle de données), annexe 3 (émission avec historique),
// annexe 4 (détection du sens d'écoulement), annexe 5 (index) :
//   { "sn": "8420AAA02324000160", "lowbat": false,
//     "CHA": [ { "v": 3476, "t": 1717139824 } ],
//     "CHB": [ { "v": 0, "t": 1717139824 } ],
//     "txInfo": { "snr": 10, "rsrp": -98, "rsrq": -14, "txPower": 22, ... } }
// - v : index cumulatif d'impulsions de la voie (0 à 4 294 967 295 puis 0) ;
// - t : horodatage EPOCH UTC en secondes ;
// - tableaux : jusqu'à 48 valeurs par voie, la première est la plus
//   ancienne ;
// - sens d'écoulement (voie A + direction) : v = aller − retour, f = aller,
//   b = retour, r = sens courant (index maximal 2 147 483 646) ;
// - txInfo : présent seulement si l'option est activée sur l'appareil.
// Le payload reçu est le JSON en UTF-8 (voir envelopes/mqtt.ts).
import type { PointReleve, TrameDecodee } from "../types.ts";

export const ADEUNIS_MQTT_MAX_IMPULSIONS = 2 ** 32 - 1;

const VOIES: Record<string, string> = { CHA: "A", CHB: "B" };

interface Mesure {
  v: number;
  t: number;
  f?: number;
  b?: number;
}

function lireMesures(valeur: unknown, voie: string): Mesure[] {
  const liste = Array.isArray(valeur) ? valeur : [valeur];
  return liste.map((m, i) => {
    const mesure = m as Record<string, unknown> | null;
    const v = mesure?.v;
    const t = mesure?.t;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
      throw new Error(`Voie ${voie}, mesure ${i + 1} : index « v » invalide`);
    }
    if (typeof t !== "number" || !Number.isFinite(t) || t <= 0) {
      throw new Error(`Voie ${voie}, mesure ${i + 1} : horodatage « t » invalide`);
    }
    return {
      v,
      t,
      f: typeof mesure?.f === "number" ? mesure.f : undefined,
      b: typeof mesure?.b === "number" ? mesure.b : undefined,
    };
  });
}

// Les horodatages sont dans le message : le contexte de réception est inutile.
export function decodeAdeunisPulseMqtt(payload: Uint8Array): TrameDecodee {
  let message: Record<string, unknown>;
  try {
    message = JSON.parse(new TextDecoder().decode(payload));
  } catch {
    throw new Error("Message Adeunis PULSE MQTTS illisible (JSON attendu)");
  }
  if (typeof message !== "object" || message === null) {
    throw new Error("Message Adeunis PULSE MQTTS illisible (objet JSON attendu)");
  }

  const points: PointReleve[] = [];
  let retour: number | undefined;
  for (const [cle, canal] of Object.entries(VOIES)) {
    if (message[cle] === undefined || message[cle] === null) continue;
    for (const m of lireMesures(message[cle], canal)) {
      points.push({
        horodatage: new Date(m.t * 1000).toISOString(),
        canal,
        nature: "index",
        impulsions: m.v,
      });
      if (m.b !== undefined) retour = m.b;
    }
  }
  if (points.length === 0) {
    throw new Error("Aucune mesure (CHA ou CHB) dans le message Adeunis PULSE MQTTS");
  }
  points.sort((a, b) => a.horodatage.localeCompare(b.horodatage));

  const txInfo = message.txInfo as Record<string, unknown> | undefined;
  return {
    points,
    brut: {
      numeroSerie: typeof message.sn === "string" ? message.sn : undefined,
      batterieFaible: message.lowbat === true,
      ...(retour !== undefined ? { impulsionsRetour: retour } : {}),
      ...(txInfo
        ? {
            rsrp: typeof txInfo.rsrp === "number" ? txInfo.rsrp : undefined,
            snr: typeof txInfo.snr === "number" ? txInfo.snr : undefined,
            rsrq: typeof txInfo.rsrq === "number" ? txInfo.rsrq : undefined,
          }
        : {}),
    },
  };
}
