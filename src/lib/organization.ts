import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface CurrentOrganization {
  organizationId: string;
  organizationName: string;
  role: string;
  userId: string;
}

/**
 * Organisation courante de l'utilisateur connecté. Simplification tant
 * qu'il n'y a pas de sélecteur multi-organisation dans l'application (une
 * seule adhésion attendue pour l'instant — voir aussi src/app/import).
 */
export async function getCurrentOrganization(): Promise<CurrentOrganization> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    redirect("/connexion");
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("organization_id, role, organizations(nom)")
    .eq("user_id", userData.user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    redirect("/connexion");
  }

  const organizations = membership.organizations as unknown as {
    nom: string;
  } | null;

  return {
    organizationId: membership.organization_id,
    organizationName: organizations?.nom ?? "",
    role: membership.role,
    userId: userData.user.id,
  };
}
