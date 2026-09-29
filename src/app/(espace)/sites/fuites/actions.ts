"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEspaceSites, peutGererAppareils } from "@/lib/auth/espaces";
import type { Resultat } from "../actions";

// Actions sur une fuite : chaque fonction SQL vérifie elle-même le rôle
// de l'utilisateur (peut_agir_fuite).

const MESSAGES: Record<string, string> = {
  "42501": "Votre rôle ne permet pas cette action sur ce site.",
  "22023": "Cette fuite a déjà été traitée. Rechargez la page.",
};

async function appeler(fonction: string, params: Record<string, unknown>): Promise<Resultat> {
  await getEspaceSites();
  const supabase = await createClient();
  const { error } = await supabase.rpc(fonction, params);
  if (error) return { erreur: MESSAGES[error.code ?? ""] ?? "Action impossible. Réessayez." };
  revalidatePath("/sites");
  return { ok: true };
}

export async function prendreEnCharge(leakId: string): Promise<Resultat> {
  return appeler("fuite_prendre_en_charge", { p_leak_id: leakId });
}

export async function declarerReparee(leakId: string): Promise<Resultat> {
  return appeler("fuite_declarer_reparee", { p_leak_id: leakId });
}

export async function declarerFausseAlerte(leakId: string, motif: string): Promise<Resultat> {
  return appeler("fuite_declarer_fausse_alerte", {
    p_leak_id: leakId,
    p_motif: motif.trim() || null,
  });
}

/**
 * Essai en développement seulement : crée une fuite simulée de 25 L/h
 * (détectée il y a 2 heures) sur le premier point de comptage du site,
 * ou sur un « Point d'essai » créé pour l'occasion. Marquée
 * details.simulation = true.
 */
export async function simulerFuite(siteId: string): Promise<Resultat> {
  if (process.env.NODE_ENV !== "development") {
    return { erreur: "La simulation n'existe qu'en développement." };
  }
  const ctx = await getEspaceSites();
  if (!peutGererAppareils(ctx) || ctx.adhesion?.kind !== "sites") {
    return { erreur: "Réservé à l'administrateur ou à un agent de l'organisation." };
  }
  const admin = createAdminClient();
  const { data: site } = await admin
    .from("sites")
    .select("id, organization_id, currency")
    .eq("id", siteId)
    .eq("organization_id", ctx.adhesion.organizationId)
    .maybeSingle();
  if (!site) return { erreur: "Site introuvable." };

  let { data: compteur } = await admin
    .from("meters")
    .select("id, zone")
    .eq("site_id", site.id)
    .eq("type", "point_comptage")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!compteur) {
    const cree = await admin
      .from("meters")
      .insert({
        organization_id: site.organization_id,
        site_id: site.id,
        type: "point_comptage",
        numero_serie: `ESSAI-${crypto.randomUUID().slice(0, 8)}`,
        nom: "Point d'essai",
        zone: "Point d'essai",
        transmission: "import",
      })
      .select("id, zone")
      .single();
    if (cree.error) return { erreur: "Création du point d'essai impossible." };
    compteur = cree.data;
  }

  const maintenant = Date.now();
  const { error } = await admin.from("leak_events").insert({
    organization_id: site.organization_id,
    site_id: site.id,
    meter_id: compteur.id,
    type: "fuite_nuit",
    started_at: new Date(maintenant - 28 * 3_600_000).toISOString(),
    detected_at: new Date(maintenant - 2 * 3_600_000).toISOString(),
    excess_flow_lph: 25,
    currency: site.currency,
    details: {
      simulation: true,
      zone: compteur.zone,
      explication: "Fuite simulée pour essai : 25 L/h de plus que d'habitude la nuit, 2 nuits de suite.",
    },
  });
  if (error?.code === "23505") {
    return { erreur: "Une fuite est déjà en cours sur ce point : traitez-la d'abord." };
  }
  if (error) return { erreur: "Simulation impossible. Réessayez." };
  revalidatePath("/sites");
  return { ok: true };
}
