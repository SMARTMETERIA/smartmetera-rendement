import { NextResponse } from "next/server";
import { emailValide, normaliserEmail } from "@/lib/auth/validation";
import { envoyerLienConnexion } from "@/lib/auth/envoisConnexion";
import { adresseIpAppelant, consommerQuota } from "@/lib/securite/protection";

/**
 * Demande de lien de connexion à la marque du partenaire. Réponse
 * identique que l'adresse soit connue ou non (pas d'énumération des
 * comptes). Limitation de débit par adresse IP et par adresse e-mail.
 */
export async function POST(request: Request) {
  let corps: { email?: unknown; slug?: unknown };
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ erreur: "Requête invalide." }, { status: 400 });
  }

  const email =
    typeof corps.email === "string" ? normaliserEmail(corps.email) : "";
  const slug =
    typeof corps.slug === "string" && /^[a-z0-9-]{1,64}$/.test(corps.slug)
      ? corps.slug
      : null;
  if (!emailValide(email)) {
    return NextResponse.json(
      { erreur: "Indiquez une adresse e-mail valide." },
      { status: 400 },
    );
  }

  const ip = await adresseIpAppelant();
  const quotaIp = await consommerQuota(`lien:ip:${ip}`, 10, 15 * 60);
  const quotaEmail = await consommerQuota(`lien:email:${email}`, 3, 15 * 60);
  if (!quotaIp || !quotaEmail) {
    return NextResponse.json(
      { erreur: "Trop de demandes. Réessayez dans quelques minutes." },
      { status: 429 },
    );
  }

  try {
    await envoyerLienConnexion(email, slug);
  } catch (err) {
    console.error(
      "[lien de connexion] envoi impossible :",
      err instanceof Error ? err.message : err,
    );
  }

  return NextResponse.json({ ok: true });
}
