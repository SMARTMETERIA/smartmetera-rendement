import { redirect } from "next/navigation";
import { getContexteUtilisateur } from "@/lib/auth/contexte";

export interface CurrentOrganization {
  organizationId: string;
  organizationName: string;
  /** Rôle d'adhésion, ou "superadmin" pour un superadmin de plateforme. */
  role: string;
  userId: string;
  isPlatformAdmin: boolean;
}

/**
 * Organisation Réseau courante de l'utilisateur connecté (pages du groupe
 * (dashboard)). Simplification tant qu'il n'y a pas de sélecteur
 * multi-organisation : la première adhésion à portée organisation.
 * Les autres profils sont renvoyés vers leur propre espace.
 */
export async function getCurrentOrganization(): Promise<CurrentOrganization> {
  const ctx = await getContexteUtilisateur();

  if (!ctx.adhesion) {
    redirect(ctx.isPlatformAdmin ? "/admin" : "/accueil");
  }
  if (ctx.adhesion.kind === "immeuble") {
    redirect("/immeuble");
  }

  return {
    organizationId: ctx.adhesion.organizationId,
    organizationName: ctx.adhesion.organizationName,
    role: ctx.isPlatformAdmin ? "superadmin" : ctx.adhesion.role,
    userId: ctx.userId,
    isPlatformAdmin: ctx.isPlatformAdmin,
  };
}
