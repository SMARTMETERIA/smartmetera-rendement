// Marque d'une organisation Gardien pour les écrans et les PDF (code
// serveur) : org_branding si présent, sinon SmartMeteria.
import type { SupabaseClient } from "@supabase/supabase-js";
import { MARQUE_PLATEFORME, marqueDepuisBranding, type LigneMarque, type Marque } from "@/lib/marque";

export async function marqueOrganisation(supabase: SupabaseClient, organizationId: string): Promise<Marque> {
  const [{ data: branding }, { data: org }] = await Promise.all([
    supabase
      .from("org_branding")
      .select("display_name, primary_color, logo_path, legal_footer, show_powered_by, reply_to_email")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase.from("organizations").select("nom").eq("id", organizationId).maybeSingle(),
  ]);
  return branding ? marqueDepuisBranding(org?.nom ?? "", branding as LigneMarque) : MARQUE_PLATEFORME;
}

/** Marque renvoyée par page_preuve_publique (sans connexion). */
export function marqueDepuisPreuve(brute: Record<string, unknown> | null): Marque {
  if (!brute) return MARQUE_PLATEFORME;
  return marqueDepuisBranding(String(brute.display_name ?? ""), {
    display_name: (brute.display_name as string | null) ?? null,
    primary_color: (brute.primary_color as string | null) ?? null,
    logo_path: (brute.logo_path as string | null) ?? null,
    legal_footer: null,
    show_powered_by: (brute.show_powered_by as boolean | null) ?? true,
    reply_to_email: null,
  });
}
