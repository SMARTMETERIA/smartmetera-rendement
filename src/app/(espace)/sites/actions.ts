"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getEspaceSites } from "@/lib/auth/espaces";
import { validerNouveauSite } from "@/lib/gardien/sites";

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
