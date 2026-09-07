// The Things Stack v3 (TTN) — webhook HTTP d'uplink. Champs confirmés par
// la doc officielle : https://www.thethingsindustries.com/docs/integrations/webhooks/webhook-templates/format/
import type { EnveloppeUplink, ErreurEnveloppe } from "../types.ts";
import { base64ToBytes } from "../bytes.ts";

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

  return {
    devEui: devEui.toUpperCase(),
    fPort: typeof uplink.f_port === "number" ? uplink.f_port : undefined,
    fCnt: typeof uplink.f_cnt === "number" ? uplink.f_cnt : undefined,
    payload: base64ToBytes(uplink.frm_payload),
    recuLe,
  };
}
