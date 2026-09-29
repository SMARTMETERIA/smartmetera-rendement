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

/**
 * Espace Gardien de l'eau (/sites) : adhésion à une organisation « sites »
 * (partenaire, chaîne, client direct) ou à un ou plusieurs de ses sites
 * (directeur de site, technicien d'un site).
 */
export async function getEspaceSites(): Promise<ContexteUtilisateur> {
  const ctx = await getContexteUtilisateur();
  const membreOrganisation = ctx.adhesion?.kind === "sites";
  if (!membreOrganisation && ctx.adhesionsSite.length === 0) {
    redirect("/accueil");
  }
  return ctx;
}

/** Organisation « sites » de l'espace : adhésion organisation, sinon celle du premier site. */
export function organisationEspaceSites(ctx: ContexteUtilisateur): {
  organizationId: string;
  organizationName: string;
} {
  if (ctx.adhesion?.kind === "sites") {
    return {
      organizationId: ctx.adhesion.organizationId,
      organizationName: ctx.adhesion.organizationName,
    };
  }
  const premier = ctx.adhesionsSite[0];
  return {
    organizationId: premier.organizationId,
    organizationName: premier.organizationName,
  };
}

/** Pose de capteurs : admin, agent ou technicien (organisation ou site). */
export function peutPoser(ctx: ContexteUtilisateur): boolean {
  return (
    (ctx.adhesion?.kind === "sites" &&
      ["admin_client", "agent", "technicien"].includes(ctx.adhesion.role)) ||
    ctx.adhesionsSite.some((a) => a.role === "technicien")
  );
}

/** Stock et attribution des appareils : admin ou agent de l'organisation. */
export function peutGererAppareils(ctx: ContexteUtilisateur): boolean {
  return (
    ctx.adhesion?.kind === "sites" &&
    ["admin_client", "agent"].includes(ctx.adhesion.role)
  );
}

/** Admin de l'organisation « sites » (gère l'équipe et les sites). */
export function estAdminSites(ctx: ContexteUtilisateur): boolean {
  return (
    ctx.isPlatformAdmin ||
    (ctx.adhesion?.kind === "sites" && ctx.adhesion.role === "admin_client")
  );
}
