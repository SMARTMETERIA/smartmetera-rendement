// Orange Live Objects — message "DATA" LoRaWAN. Format reconstitué (doc
// officielle Live Objects non explorable automatiquement, SPA) à partir du
// blog officiel Orange et de références tierces documentant le même
// connecteur LoRa : DevEUI dans metadata.network.lora.devEUI, fPort dans
// metadata.network.lora.port, fCnt dans metadata.network.lora.fcnt, payload
// hexadécimal brut dans value. À valider/ajuster contre une trame réelle
// capturée depuis le portail Live Objects du client (voir README) — en cas
// d'écart, utiliser l'endpoint /ingest/generic en attendant l'ajustement.
import type { EnveloppeUplink, ErreurEnveloppe } from "../types";
import { hexToBytes } from "../bytes";

export function parseEnveloppeLiveObjects(
  body: unknown,
): EnveloppeUplink | ErreurEnveloppe {
  if (typeof body !== "object" || body === null) {
    return { erreur: "Corps de requête Live Objects invalide (JSON attendu)" };
  }
  const b = body as Record<string, unknown>;
  const metadata = b.metadata as Record<string, unknown> | undefined;
  const network = metadata?.network as Record<string, unknown> | undefined;
  const lora = network?.lora as Record<string, unknown> | undefined;
  const devEui = lora?.devEUI;
  if (typeof devEui !== "string") {
    return {
      erreur: "metadata.network.lora.devEUI manquant dans la trame Live Objects",
    };
  }
  if (typeof b.value !== "string") {
    return { erreur: "value (payload hexadécimal) manquant dans la trame Live Objects" };
  }

  const recuLe =
    typeof b.timestamp === "string" ? b.timestamp : new Date().toISOString();

  return {
    devEui: devEui.toUpperCase(),
    fPort: typeof lora?.port === "number" ? lora.port : undefined,
    fCnt: typeof lora?.fcnt === "number" ? lora.fcnt : undefined,
    payload: hexToBytes(b.value),
    recuLe,
  };
}
