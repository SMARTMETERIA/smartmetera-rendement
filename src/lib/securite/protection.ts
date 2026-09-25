// Protections des routes publiques (inscription, demande de lien) :
// CAPTCHA Cloudflare Turnstile vérifié côté serveur et limitation de débit
// en base (public.consommer_quota). À n'importer que depuis du code serveur.
//
// Pourquoi vérifier Turnstile ici plutôt que via les réglages CAPTCHA de
// Supabase Auth : les comptes sont créés par l'API Admin (generateLink),
// que le CAPTCHA de Supabase Auth ne couvre pas.
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export async function adresseIpAppelant(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip")?.trim() ||
    "inconnue"
  );
}

/**
 * true tant que le quota n'est pas dépassé. En cas d'erreur de la base, on
 * laisse passer (une panne de quota ne doit pas bloquer la connexion) mais
 * on le signale dans les journaux.
 */
export async function consommerQuota(
  cle: string,
  max: number,
  fenetreSecondes: number,
): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("consommer_quota", {
    p_cle: cle,
    p_max: max,
    p_fenetre_secondes: fenetreSecondes,
  });
  if (error) {
    console.error("[quota] vérification impossible :", error.message);
    return true;
  }
  return data === true;
}

export type VerificationCaptcha =
  | { ok: true; ignore: boolean }
  | { ok: false; erreur: string };

/**
 * Vérifie un jeton Turnstile. Sans TURNSTILE_SECRET_KEY, la vérification
 * est ignorée (développement). TODO(RAYAN) : créer les clés Turnstile
 * (voir docs/BLOCKERS.md) ; en production elles sont obligatoires
 * (docs/MISE_EN_LIGNE.md).
 */
export async function verifierCaptcha(
  jeton: string | null,
  ip: string,
): Promise<VerificationCaptcha> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.warn("[captcha] TURNSTILE_SECRET_KEY absente en production.");
    }
    return { ok: true, ignore: true };
  }
  if (!jeton) {
    return { ok: false, erreur: "Cochez la case de vérification anti-robot." };
  }
  const corps = new URLSearchParams({ secret, response: jeton });
  if (ip !== "inconnue") corps.set("remoteip", ip);
  try {
    const reponse = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body: corps },
    );
    const resultat = (await reponse.json()) as { success?: boolean };
    return resultat.success
      ? { ok: true, ignore: false }
      : {
          ok: false,
          erreur: "La vérification anti-robot a échoué. Réessayez.",
        };
  } catch {
    return {
      ok: false,
      erreur: "Vérification anti-robot indisponible. Réessayez dans un instant.",
    };
  }
}
