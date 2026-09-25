import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cheminInterneSur } from "@/lib/auth/liens";

/**
 * Retour de connexion Google (OAuth, code PKCE) : échange le code contre
 * une session, puis redirige vers la page demandée (aiguillage par défaut).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = cheminInterneSur(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/connexion?erreur=lien_invalide`);
}
