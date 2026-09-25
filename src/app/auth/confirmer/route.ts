import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TYPES_LIEN, cheminInterneSur, type TypeLien } from "@/lib/auth/liens";

/**
 * Échange un lien reçu par e-mail (connexion, confirmation d'inscription,
 * invitation, réinitialisation, changement d'adresse) contre une session :
 * verifyOtp pose les cookies côté serveur, puis on redirige.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as TypeLien | null;
  const suivant = cheminInterneSur(searchParams.get("next"));

  if (tokenHash && type && TYPES_LIEN.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (!error) {
      return NextResponse.redirect(`${origin}${suivant}`);
    }
  }

  return NextResponse.redirect(`${origin}/connexion?erreur=lien_invalide`);
}
