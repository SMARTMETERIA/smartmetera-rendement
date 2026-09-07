// Miroir Deno de src/lib/inboundMail/token.ts (sans genererJetonEntrant,
// jamais appelé côté Edge Function — les jetons sont générés par l'app).
export function extraireToken(adresse: string): string | null {
  const match = adresse.match(/([a-zA-Z0-9._%+-]+)@[a-zA-Z0-9.-]+/);
  if (!match) return null;
  const local = match[1];
  const segments = local.split("+");
  const jeton = segments.length > 1 ? segments[segments.length - 1] : segments[0];
  return jeton.toLowerCase() || null;
}
