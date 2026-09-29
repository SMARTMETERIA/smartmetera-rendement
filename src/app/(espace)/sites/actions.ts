"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getEspaceSites } from "@/lib/auth/espaces";
import { validerNouveauSite } from "@/lib/gardien/sites";
import { urlSite } from "@/lib/auth/liens";
import { validerMarque } from "@/lib/gardien/marqueSaisie";

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

/** Nuitées, emplacements occupés ou couverts du mois (1er du mois). */
export async function enregistrerActivite(params: {
  siteId: string;
  mois: string;
  quantite: string;
}): Promise<Resultat> {
  await getEspaceSites();
  if (!/^\d{4}-\d{2}$/.test(params.mois)) return { erreur: "Mois invalide." };
  const quantite = Number(params.quantite.replace(",", ".").replace(/\s/g, ""));
  if (!Number.isFinite(quantite) || quantite < 0 || quantite > 10_000_000) {
    return { erreur: "Indiquez un nombre (par exemple 1 350)." };
  }
  const supabase = await createClient();
  const { data: site } = await supabase.from("sites").select("organization_id").eq("id", params.siteId).maybeSingle();
  if (!site) return { erreur: "Site introuvable." };
  const { error } = await supabase.from("activity_data").upsert(
    {
      organization_id: site.organization_id,
      site_id: params.siteId,
      date: `${params.mois}-01`,
      period: "mois",
      quantity: quantite,
    },
    { onConflict: "site_id,date,period" },
  );
  if (error) return { erreur: "Votre rôle ne permet pas de saisir l'activité de ce site." };
  revalidatePath(`/sites/${params.siteId}`);
  return { ok: true, message: "Enregistré." };
}

/** Consentement écrit du client à la conversion automatique du pilote. */
export async function consentirConversion(params: {
  piloteId: string;
  siteId: string;
  nom: string;
  accepte: boolean;
}): Promise<Resultat> {
  await getEspaceSites();
  const supabase = await createClient();
  const { error } = params.accepte
    ? await supabase.rpc("accepter_conversion_pilote", { p_pilot_id: params.piloteId, p_nom: params.nom })
    : await supabase.rpc("retirer_conversion_pilote", { p_pilot_id: params.piloteId });
  if (error) {
    return {
      erreur:
        error.code === "42501"
          ? "Seul l'administrateur ou le directeur du site peut donner cet accord."
          : error.code === "22023"
            ? error.message
            : "Enregistrement impossible. Réessayez.",
    };
  }
  revalidatePath(`/sites/${params.siteId}`);
  return { ok: true };
}

/**
 * Marque de l'organisation (administrateur) : nom affiché, couleurs, logo,
 * expéditeur, adresse de réponse, pied de page. La mention « Propulsé par »
 * reste réservée au superadmin (protégée par la base).
 */
export async function enregistrerMarque(champs: {
  nomAffiche: string;
  couleur: string;
  accent: string;
  logo: string | null;
  expediteur: string;
  repondreA: string;
  piedDePage: string;
}): Promise<Resultat> {
  const ctx = await getEspaceSites();
  const adhesion = ctx.adhesion?.kind === "sites" ? ctx.adhesion : null;
  if (!adhesion || adhesion.role !== "admin_client") {
    return { erreur: "Seul l'administrateur de l'organisation peut modifier la marque." };
  }
  const validation = validerMarque(champs);
  if (!validation.ok) return { erreur: validation.erreur };
  const supabase = await createClient();
  const { error } = await supabase
    .from("org_branding")
    .upsert({ organization_id: adhesion.organizationId, ...validation.ligne }, { onConflict: "organization_id" });
  if (error) return { erreur: "Enregistrement impossible. Réessayez." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Marque enregistrée." };
}
