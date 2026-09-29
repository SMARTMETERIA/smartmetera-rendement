// ChirpStack v4 — intégration HTTP. Le type d'événement est donné par le
// paramètre d'URL « event » (up, status, join, ack, txack, log,
// location, integration). Champs confirmés par integration.proto (mapping
// protobuf-JSON camelCase) et la page des événements :
// https://www.chirpstack.io/docs/chirpstack/integrations/http.html
// https://www.chirpstack.io/docs/chirpstack/integrations/events.html
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

  // Meilleure réception parmi les passerelles.
  let rssi: number | undefined;
  let snr: number | undefined;
  if (Array.isArray(b.rxInfo)) {
    for (const rx of b.rxInfo as Record<string, unknown>[]) {
      if (typeof rx?.rssi === "number" && (rssi === undefined || rx.rssi > rssi)) {
        rssi = rx.rssi;
        snr = typeof rx.snr === "number" ? rx.snr : snr;
      }
    }
  }

  return {
    devEui: devEui.toUpperCase(),
    fPort: typeof b.fPort === "number" ? b.fPort : undefined,
    fCnt: typeof b.fCnt === "number" ? b.fCnt : undefined,
    payload: base64ToBytes(b.data),
    recuLe,
    rssi,
    snr,
    objet:
      typeof b.object === "object" && b.object !== null
        ? (b.object as Record<string, unknown>)
        : undefined,
  };
}

export interface StatutChirpstack {
  devEui: string;
  /** Niveau de pile en %, absent si l'appareil ne le communique pas. */
  batteriePct?: number;
  marge?: number;
}

/** Événement « status » : niveau de pile et marge radio de l'appareil. */
export function parseStatutChirpstack(
  body: unknown,
): StatutChirpstack | ErreurEnveloppe {
  if (typeof body !== "object" || body === null) {
    return { erreur: "Corps de requête ChirpStack invalide (JSON attendu)" };
  }
  const b = body as Record<string, unknown>;
  const devEui = (b.deviceInfo as Record<string, unknown> | undefined)?.devEui;
  if (typeof devEui !== "string") {
    return { erreur: "deviceInfo.devEui manquant dans l'événement status" };
  }
  const batterie =
    typeof b.batteryLevel === "number" && b.batteryLevelUnavailable !== true
      ? Math.max(0, Math.min(100, b.batteryLevel))
      : undefined;
  return {
    devEui: devEui.toUpperCase(),
    batteriePct: batterie,
    marge: typeof b.margin === "number" ? b.margin : undefined,
  };
}

/** Événements ChirpStack traités : les autres sont acquittés et ignorés. */
export function evenementChirpstack(url: string): "up" | "status" | "autre" {
  const event = new URL(url).searchParams.get("event");
  if (event === null || event === "up") return "up";
  if (event === "status") return "status";
  return "autre";
}
