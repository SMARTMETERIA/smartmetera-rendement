// Marque d'une organisation pour les écrans, les PDF et les e-mails (code
// serveur) : org_branding si présent, sinon SmartMeteria.
import type { SupabaseClient } from "@supabase/supabase-js";
import { MARQUE_PLATEFORME, marqueDepuisBranding, type LigneMarque, type Marque } from "@/lib/marque";
import type { ContexteUtilisateur } from "@/lib/auth/destination";

export const COLONNES_MARQUE =
  "display_name, primary_color, accent_color, logo_path, legal_footer, show_powered_by, reply_to_email, sender_name";

export async function marqueOrganisation(supabase: SupabaseClient, organizationId: string): Promise<Marque> {
  const [{ data: branding }, { data: org }] = await Promise.all([
    supabase.from("org_branding").select(COLONNES_MARQUE).eq("organization_id", organizationId).maybeSingle(),
    supabase.from("organizations").select("nom").eq("id", organizationId).maybeSingle(),
  ]);
  return branding ? marqueDepuisBranding(org?.nom ?? "", branding as LigneMarque) : MARQUE_PLATEFORME;
}

/** Organisation dont la marque habille l'espace de la personne connectée. */
export function organisationDeMarque(ctx: ContexteUtilisateur): string | null {
  if (ctx.adhesion && ["sites", "immeuble"].includes(ctx.adhesion.kind)) return ctx.adhesion.organizationId;
  return ctx.adhesionsSite[0]?.organizationId ?? ctx.adhesionsClient[0]?.organizationId ?? null;
}

/** Marque renvoyée par page_preuve_publique ou marque_publique (sans connexion). */
export function marqueDepuisPreuve(brute: Record<string, unknown> | null): Marque {
  if (!brute) return MARQUE_PLATEFORME;
  return marqueDepuisBranding(String(brute.display_name ?? ""), {
    display_name: (brute.display_name as string | null) ?? null,
    primary_color: (brute.primary_color as string | null) ?? null,
    accent_color: (brute.accent_color as string | null) ?? null,
    logo_path: (brute.logo_path as string | null) ?? null,
    legal_footer: null,
    show_powered_by: (brute.show_powered_by as boolean | null) ?? true,
    reply_to_email: null,
  });
}
