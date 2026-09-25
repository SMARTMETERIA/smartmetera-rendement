// Liens envoyés par e-mail (connexion, confirmation, réinitialisation…).
//
// On n'utilise pas l'action_link de Supabase (il renvoie les jetons dans le
// fragment d'URL, illisible côté serveur) : on construit un lien vers
// /auth/confirmer avec le hashed_token, que la route échange contre une
// session via verifyOtp (cookies posés côté serveur).
import type { EmailOtpType } from "@supabase/supabase-js";

export type TypeLien = Extract<
  EmailOtpType,
  "signup" | "invite" | "magiclink" | "recovery" | "email_change"
>;

export const TYPES_LIEN: readonly TypeLien[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
];

export function urlSite(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
}

/** Chemin interne sûr (pas de redirection vers un autre site). */
export function cheminInterneSur(
  suivant: string | null | undefined,
  defaut = "/accueil",
): string {
  if (!suivant || !suivant.startsWith("/") || suivant.startsWith("//")) {
    return defaut;
  }
  if (suivant.includes("\\") || /[\r\n]/.test(suivant)) return defaut;
  return suivant;
}

export function lienConfirmation(
  site: string,
  hashedToken: string,
  type: TypeLien,
  suivant = "/accueil",
): string {
  const params = new URLSearchParams({
    token_hash: hashedToken,
    type,
    next: cheminInterneSur(suivant),
  });
  return `${site}/auth/confirmer?${params.toString()}`;
}
