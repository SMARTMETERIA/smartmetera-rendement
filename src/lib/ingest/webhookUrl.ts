import type { Plateforme } from "./envelopes/index";

export function urlWebhookIngestion(
  supabaseUrl: string,
  plateforme: Plateforme,
  jeton: string,
): string {
  return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/ingest/${plateforme}/${jeton}`;
}

export const LABEL_PLATEFORME: Record<Plateforme, string> = {
  ttn: "The Things Network (TTN)",
  chirpstack: "ChirpStack",
  liveobjects: "Orange Live Objects",
  generic: "Générique (JSON)",
  mqtt: "Broker MQTT (Adeunis PULSE NB-IoT/LTE-M)",
};

/** Plateformes proposées pour une source LoRaWAN d'organisation (écrans Réseau). */
export const PLATEFORMES_LORAWAN: Plateforme[] = ["ttn", "chirpstack", "liveobjects", "generic"];
