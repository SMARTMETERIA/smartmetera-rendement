// Invitations dans une organisation « sites » (pur, testable) : rôle et
// portée de l'accès créé.

export const ROLES_INVITABLES_SITES = [
  "admin_client",
  "agent",
  "lecteur",
  "technicien",
  "directeur_site",
] as const;

export type RoleInvitableSites = (typeof ROLES_INVITABLES_SITES)[number];

export type PorteeAcces =
  | { scopeType: "organisation"; siteId: null }
  | { scopeType: "site"; siteId: string };

/**
 * Un directeur de site est toujours limité à un site. Un technicien l'est
 * si un site est choisi, sinon il intervient sur tous les sites (par
 * exemple l'installateur d'un partenaire). Les autres rôles portent sur
 * toute l'organisation.
 */
export function porteeInvitation(
  role: string,
  siteId: string | null | undefined,
):
  | { ok: true; role: RoleInvitableSites; portee: PorteeAcces }
  | { ok: false; erreur: string } {
  if (!(ROLES_INVITABLES_SITES as readonly string[]).includes(role)) {
    return { ok: false, erreur: "Rôle inconnu." };
  }
  const r = role as RoleInvitableSites;
  const site = siteId?.trim() || null;
  if (r === "directeur_site") {
    if (!site)
      return { ok: false, erreur: "Choisissez le site de ce directeur." };
    return { ok: true, role: r, portee: { scopeType: "site", siteId: site } };
  }
  if (r === "technicien" && site) {
    return { ok: true, role: r, portee: { scopeType: "site", siteId: site } };
  }
  return {
    ok: true,
    role: r,
    portee: { scopeType: "organisation", siteId: null },
  };
}
