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
};
