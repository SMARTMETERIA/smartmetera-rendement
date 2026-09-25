import { redirect } from "next/navigation";
import { getContexteUtilisateur } from "./contexte";
import type { AdhesionOrganisation, ContexteUtilisateur } from "./destination";

/** Espace partenaire (/immeuble) : adhésion à une organisation Immeuble. */
export async function getEspacePartenaire(): Promise<
  ContexteUtilisateur & { adhesion: AdhesionOrganisation }
> {
  const ctx = await getContexteUtilisateur();
  if (!ctx.adhesion || ctx.adhesion.kind !== "immeuble") redirect("/accueil");
  return { ...ctx, adhesion: ctx.adhesion };
}

export function estAdminPartenaire(ctx: ContexteUtilisateur): boolean {
  return ctx.isPlatformAdmin || ctx.adhesion?.role === "admin_client";
}
