// Message MQTT du kit A (Adeunis PULSE NB-IoT/LTE-M), transféré en HTTP
// par le broker vers /ingest/mqtt/<jeton>.
//
// Le message de l'appareil est le JSON documenté par Adeunis (voir
// decoders/adeunisPulseMqtt.ts). Son enveloppe dépend du broker :
// - Orange Live Objects (exemple officiel du guide Adeunis, page 15) :
//   { "streamId": "urn:lo:nsid:imei:…", "value": { …message… },
//     "metadata": { "network": { "mqtt": { "clientId": "urn:imei:…" } } } }
// - broker avec règle de transfert HTTP (EMQX, HiveMQ…) : le message dans
//   « payload » (texte JSON, ou base64) et l'identifiant du client MQTT
//   dans « clientid ». TODO(RAYAN) : confirmer les noms de champs avec le
//   broker choisi (docs/reception-mqtt.md) ;
// - le message seul, si le broker transfère le corps brut.
// L'appareil se connecte avec l'identifiant « urn:imei:<IMEI> » (guide
// Adeunis, section 5.1) : c'est lui qui désigne l'appareil. À défaut, le
// numéro de série « sn » est essayé s'il a la forme d'un IMEI.
import type { EnveloppeUplink, ErreurEnveloppe } from "../types.ts";
import { base64ToBytes } from "../bytes.ts";
import { imeiDepuisIdentifiant } from "../reference.ts";

function estMessageAdeunis(v: unknown): boolean {
  return typeof v === "object" && v !== null && ("CHA" in v || "CHB" in v);
}

function lireMessage(b: Record<string, unknown>): Record<string, unknown> | null {
  if (estMessageAdeunis(b)) return b;
  if (estMessageAdeunis(b.value)) return b.value as Record<string, unknown>;
  const payload = b.payload;
  if (estMessageAdeunis(payload)) return payload as Record<string, unknown>;
  if (typeof payload === "string") {
    const texte = payload.trim();
    const candidats = texte.startsWith("{") ? [texte] : [];
    if (!texte.startsWith("{")) {
      try {
        candidats.push(new TextDecoder().decode(base64ToBytes(texte)));
      } catch {
        // ni JSON ni base64
      }
    }
    for (const c of candidats) {
      try {
        const objet = JSON.parse(c);
        if (estMessageAdeunis(objet)) return objet;
      } catch {
        // candidat suivant
      }
    }
  }
  return null;
}

function lireIdentifiant(
  b: Record<string, unknown>,
  message: Record<string, unknown>,
): string | null {
  const metadata = b.metadata as Record<string, unknown> | undefined;
  const network = metadata?.network as Record<string, unknown> | undefined;
  const mqtt = network?.mqtt as Record<string, unknown> | undefined;
  const candidats = [
    b.clientid,
    b.clientId,
    b.client_id,
    mqtt?.clientId,
    b.streamId,
    metadata?.source,
    b.topic,
  ];
  for (const c of candidats) {
    const imei = imeiDepuisIdentifiant(c);
    if (imei) return imei;
  }
  if (typeof b.topic === "string") {
    const m = b.topic.match(/(?:^|\/)(\d{15})(?:\/|$)/);
    if (m) return m[1];
  }
  if (typeof message.sn === "string" && /^\d{15}$/.test(message.sn)) {
    return message.sn;
  }
  return null;
}

/** Horodatage le plus récent du message (EPOCH UTC en secondes). */
function dernierHorodatage(message: Record<string, unknown>): string | null {
  let max = 0;
  for (const cle of ["CHA", "CHB"]) {
    const valeur = message[cle];
    const liste = Array.isArray(valeur) ? valeur : valeur ? [valeur] : [];
    for (const m of liste) {
      const t = (m as Record<string, unknown> | null)?.t;
      if (typeof t === "number" && t > max) max = t;
    }
  }
  return max > 0 ? new Date(max * 1000).toISOString() : null;
}

export function parseEnveloppeMqtt(
  body: unknown,
): EnveloppeUplink | ErreurEnveloppe {
  if (typeof body !== "object" || body === null) {
    return { erreur: "Corps de requête MQTT invalide (JSON attendu)" };
  }
  const b = body as Record<string, unknown>;
  const message = lireMessage(b);
  if (!message) {
    return {
      erreur:
        "Message Adeunis PULSE introuvable (champs CHA/CHB attendus dans le corps, « value » ou « payload »)",
    };
  }
  const imei = lireIdentifiant(b, message);
  if (!imei) {
    return {
      erreur:
        "IMEI de l'appareil introuvable (identifiant client « urn:imei:… » attendu dans clientid ou metadata)",
    };
  }
  const recuLe =
    dernierHorodatage(message) ??
    (typeof b.timestamp === "string" ? b.timestamp : new Date().toISOString());
  const txInfo = message.txInfo as Record<string, unknown> | undefined;
  return {
    devEui: imei,
    payload: new TextEncoder().encode(JSON.stringify(message)),
    recuLe,
    rssi: typeof txInfo?.rsrp === "number" ? txInfo.rsrp : undefined,
    snr: typeof txInfo?.snr === "number" ? txInfo.snr : undefined,
  };
}
