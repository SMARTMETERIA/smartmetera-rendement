import { NextResponse } from "next/server";
import { environnementCourant, lireDsn, signalerErreur, versionCourante } from "@/lib/erreurs/sentry";
import { adresseIpAppelant, consommerQuota } from "@/lib/securite/protection";

/**
 * Relais des erreurs du navigateur vers Sentry : la clé reste côté serveur,
 * tout est masqué avant l'envoi (voir src/lib/erreurs/sentry.ts). Sans
 * SENTRY_DSN, rien n'est fait. Limité à 20 signalements par adresse IP
 * et par tranche de 10 minutes.
 */
export async function POST(request: Request) {
  if (!lireDsn(process.env.SENTRY_DSN)) return new NextResponse(null, { status: 204 });

  let corps: { type?: unknown; message?: unknown; pile?: unknown; chemin?: unknown };
  try {
    const texte = await request.text();
    if (texte.length > 12_000) return new NextResponse(null, { status: 413 });
    corps = JSON.parse(texte);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const texte = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
  const message = texte(corps.message, 2000);
  if (!message) return new NextResponse(null, { status: 400 });

  const ip = await adresseIpAppelant();
  if (!(await consommerQuota(`erreurs:ip:${ip}`, 20, 10 * 60))) {
    return new NextResponse(null, { status: 429 });
  }

  const erreur = new Error(message);
  erreur.name = texte(corps.type, 100) ?? "Error";
  erreur.stack = texte(corps.pile, 8000);
  await signalerErreur(erreur, {
    origine: "navigateur",
    chemin: texte(corps.chemin, 500),
    environnement: environnementCourant(),
    version: versionCourante(),
  });
  return new NextResponse(null, { status: 204 });
}
