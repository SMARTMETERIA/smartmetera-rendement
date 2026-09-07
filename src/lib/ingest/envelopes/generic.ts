// Enveloppe "generic" : schéma JSON propre à SmartMeteria, pour les
// plateformes réseau non couvertes nativement, la saisie manuelle de test,
// et le testeur de trame de /parametres/sources.
//   { "dev_eui": "0018B2...", "payload_hex": "46200001..." | "payload_base64": "...",
//     "port"?: number, "fcnt"?: number, "horodatage"?: "2026-...Z" }
import type { EnveloppeUplink, ErreurEnveloppe } from "../types";
import { base64ToBytes, hexToBytes } from "../bytes";

export function parseEnveloppeGenerique(
  body: unknown,
): EnveloppeUplink | ErreurEnveloppe {
  if (typeof body !== "object" || body === null) {
    return { erreur: "Corps de requête invalide (JSON attendu)" };
  }
  const b = body as Record<string, unknown>;
  const devEui = b.dev_eui;
  if (typeof devEui !== "string") {
    return { erreur: "dev_eui manquant" };
  }

  let payload: Uint8Array;
  if (typeof b.payload_hex === "string") {
    payload = hexToBytes(b.payload_hex);
  } else if (typeof b.payload_base64 === "string") {
    payload = base64ToBytes(b.payload_base64);
  } else {
    return { erreur: "payload_hex ou payload_base64 requis" };
  }

  return {
    devEui: devEui.toUpperCase(),
    fPort: typeof b.port === "number" ? b.port : undefined,
    fCnt: typeof b.fcnt === "number" ? b.fcnt : undefined,
    payload,
    recuLe:
      typeof b.horodatage === "string" ? b.horodatage : new Date().toISOString(),
  };
}
