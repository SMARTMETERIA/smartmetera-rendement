import { randomBytes } from "node:crypto";

/** Extrait le jeton d'une adresse e-mail : suffixe après "+" si présent
 * (adressage Postmark natif "hash+jeton@..."), sinon la local-part entière
 * (adressage par domaine dédié ou route catch-all Mailgun "jeton@domaine"). */
export function extraireToken(adresse: string): string | null {
  const match = adresse.match(/([a-zA-Z0-9._%+-]+)@[a-zA-Z0-9.-]+/);
  if (!match) return null;
  const local = match[1];
  const segments = local.split("+");
  const jeton = segments.length > 1 ? segments[segments.length - 1] : segments[0];
  return jeton.toLowerCase() || null;
}

/** Jeton opaque identifiant une source e-mail entrante (Next.js uniquement — non dupliqué côté Deno, jamais généré par l'Edge Function). */
export function genererJetonEntrant(): string {
  return randomBytes(16).toString("hex");
}
