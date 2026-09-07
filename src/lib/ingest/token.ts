import { randomBytes } from "node:crypto";

/** Jeton opaque de webhook (secret), composant l'URL /ingest/<plateforme>/<jeton>. */
export function genererJetonWebhook(): string {
  return randomBytes(24).toString("hex");
}
