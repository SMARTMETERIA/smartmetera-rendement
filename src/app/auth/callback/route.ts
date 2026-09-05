import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Échange le code du lien magique contre une session Supabase,
 * puis redirige vers la page demandée (ou l'accueil par défaut).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/connexion?erreur=lien_invalide`);
}
