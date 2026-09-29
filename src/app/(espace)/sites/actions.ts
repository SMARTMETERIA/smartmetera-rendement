"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getEspaceSites } from "@/lib/auth/espaces";
import { validerNouveauSite } from "@/lib/gardien/sites";
import { urlSite } from "@/lib/auth/liens";

export type Resultat = { ok: true; message?: string } | { erreur: string };

/**
 * Ajoute un site à l'organisation (admin ou agent). Le prix de l'eau par
 * défaut est posé par la base selon la monnaie du site.
 */
export async function creerSite(params: {
  name: string;
  type: string;
  pays: string;
  ville: string;
}): Promise<Resultat> {
  const ctx = await getEspaceSites();
  const adhesion = ctx.adhesion?.kind === "sites" ? ctx.adhesion : null;
  if (!adhesion || !["admin_client", "agent"].includes(adhesion.role)) {
    return { erreur: "Votre rôle ne permet pas d'ajouter un site." };
  }
  const validation = validerNouveauSite(params);
  if (!validation.ok) return { erreur: validation.erreur };

  const supabase = await createClient();
  const { error } = await supabase.from("sites").insert({
    organization_id: adhesion.organizationId,
    ...validation.site,
  });
  if (error) return { erreur: "Création du site impossible. Réessayez." };
  revalidatePath("/sites");
  return { ok: true };
}

/**
 * Page preuve à la demande (30 derniers jours) : administrateur ou agent de
 * l'organisation, ou directeur du site. Construite par la fonction
 * gardien-envois (mêmes calculs que la page de fin de pilote).
 */
export async function creerPagePreuve(siteId: string): Promise<{ ok: true; url: string } | { erreur: string }> {
  const ctx = await getEspaceSites();
  const autorise =
    (ctx.adhesion?.kind === "sites" && ["admin_client", "agent"].includes(ctx.adhesion.role)) ||
    ctx.adhesionsSite.some((a) => a.siteId === siteId && a.role === "directeur_site");
  if (!autorise) return { erreur: "Votre rôle ne permet pas de créer une page preuve." };
  const supabase = await createClient();
  const { data: site } = await supabase.from("sites").select("id").eq("id", siteId).maybeSingle();
  if (!site) return { erreur: "Site introuvable." };
  const reponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/gardien-envois`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ page_preuve: siteId }),
  });
  const corps = (await reponse.json().catch(() => ({}))) as { token?: string };
  if (!reponse.ok || !corps.token) return { erreur: "Création impossible. Réessayez." };
  return { ok: true, url: `${urlSite()}/preuve/${corps.token}` };
}
