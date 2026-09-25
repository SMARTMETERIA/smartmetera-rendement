import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  AdhesionClient,
  AdhesionOrganisation,
  ContexteUtilisateur,
  Offre,
} from "./destination";

export type { ContexteUtilisateur } from "./destination";

interface LigneAdhesion {
  organization_id: string;
  role: string;
  scope_type: "organisation" | "client";
  scope_id: string | null;
  organizations: {
    nom: string;
    kind: Offre;
    status: string;
    trial_ends_at: string | null;
  } | null;
}

/**
 * Qui est connecté et à quoi il a accès (lu avec ses propres droits : RLS).
 * Redirige vers /connexion sans session.
 */
export async function getContexteUtilisateur(): Promise<ContexteUtilisateur> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/connexion");

  const [{ data: adhesions }, { data: admin }, { data: occupations }] =
    await Promise.all([
      supabase
        .from("memberships")
        .select(
          "organization_id, role, scope_type, scope_id, organizations(nom, kind, status, trial_ends_at)",
        )
        .eq("user_id", user.id)
        .order("created_at"),
      supabase
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.rpc("mes_occupations"),
    ]);

  const lignes = (adhesions ?? []) as unknown as LigneAdhesion[];
  const orga = lignes.find((l) => l.scope_type === "organisation");
  const adhesion: AdhesionOrganisation | null = orga
    ? {
        organizationId: orga.organization_id,
        organizationName: orga.organizations?.nom ?? "",
        role: orga.role,
        kind: orga.organizations?.kind ?? "reseau",
        status: orga.organizations?.status ?? "actif",
        trialEndsAt: orga.organizations?.trial_ends_at ?? null,
      }
    : null;
  const adhesionsClient: AdhesionClient[] = lignes
    .filter((l) => l.scope_type === "client" && l.scope_id)
    .map((l) => ({
      organizationId: l.organization_id,
      organizationName: l.organizations?.nom ?? "",
      clientId: l.scope_id!,
    }));

  return {
    userId: user.id,
    email: user.email ?? "",
    isPlatformAdmin: Boolean(admin),
    adhesion,
    adhesionsClient,
    estOccupant: Array.isArray(occupations) && occupations.length > 0,
  };
}
