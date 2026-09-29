// The Things Stack v3 (TTN) — webhook HTTP d'uplink. Champs confirmés par
// la doc officielle : https://www.thethingsindustries.com/docs/integrations/webhooks/webhook-templates/format/
import type { EnveloppeUplink, ErreurEnveloppe } from "../types";
import { base64ToBytes } from "../bytes";

export function parseEnveloppeTtn(
  body: unknown,
): EnveloppeUplink | ErreurEnveloppe {
  if (typeof body !== "object" || body === null) {
    return { erreur: "Corps de requête TTN invalide (JSON attendu)" };
  }
  const b = body as Record<string, unknown>;
  const endDeviceIds = b.end_device_ids as Record<string, unknown> | undefined;
  const devEui = endDeviceIds?.dev_eui;
  if (typeof devEui !== "string") {
    return { erreur: "end_device_ids.dev_eui manquant dans la trame TTN" };
  }

  const uplink = b.uplink_message as Record<string, unknown> | undefined;
  if (!uplink || typeof uplink.frm_payload !== "string") {
    return { erreur: "uplink_message.frm_payload manquant dans la trame TTN" };
  }

  const recuLe =
    (typeof uplink.received_at === "string" && uplink.received_at) ||
    (typeof b.received_at === "string" && b.received_at) ||
    new Date().toISOString();

  // Meilleure réception parmi les passerelles (uplink_message.rx_metadata).
  let rssi: number | undefined;
  let snr: number | undefined;
  if (Array.isArray(uplink.rx_metadata)) {
    for (const rx of uplink.rx_metadata as Record<string, unknown>[]) {
      if (typeof rx?.rssi === "number" && (rssi === undefined || rx.rssi > rssi)) {
        rssi = rx.rssi;
        snr = typeof rx.snr === "number" ? rx.snr : snr;
      }
    }
  }

  return {
    devEui: devEui.toUpperCase(),
    fPort: typeof uplink.f_port === "number" ? uplink.f_port : undefined,
    fCnt: typeof uplink.f_cnt === "number" ? uplink.f_cnt : undefined,
    payload: base64ToBytes(uplink.frm_payload),
    recuLe,
    rssi,
    snr,
    // Valeurs décodées par le formateur de charge utile de l'appareil.
    objet:
      typeof uplink.decoded_payload === "object" && uplink.decoded_payload !== null
        ? (uplink.decoded_payload as Record<string, unknown>)
        : undefined,
  };
}
