// ChirpStack v4 — intégration HTTP, événement "up". Champs confirmés par
// integration.proto (mapping protobuf-JSON camelCase) :
// https://www.chirpstack.io/docs/chirpstack/integrations/http.html
import type { EnveloppeUplink, ErreurEnveloppe } from "../types.ts";
import { base64ToBytes } from "../bytes.ts";

export function parseEnveloppeChirpstack(
  body: unknown,
): EnveloppeUplink | ErreurEnveloppe {
  if (typeof body !== "object" || body === null) {
    return { erreur: "Corps de requête ChirpStack invalide (JSON attendu)" };
  }
  const b = body as Record<string, unknown>;
  const deviceInfo = b.deviceInfo as Record<string, unknown> | undefined;
  const devEui = deviceInfo?.devEui;
  if (typeof devEui !== "string") {
    return { erreur: "deviceInfo.devEui manquant dans la trame ChirpStack" };
  }
  if (typeof b.data !== "string") {
    return { erreur: "data (payload base64) manquant dans la trame ChirpStack" };
  }

  const recuLe = typeof b.time === "string" ? b.time : new Date().toISOString();

  return {
    devEui: devEui.toUpperCase(),
    fPort: typeof b.fPort === "number" ? b.fPort : undefined,
    fCnt: typeof b.fCnt === "number" ? b.fCnt : undefined,
    payload: base64ToBytes(b.data),
    recuLe,
  };
}
