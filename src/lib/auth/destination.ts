// Aiguillage après connexion (pur, testable) : chaque profil a son espace.

export type Offre = "reseau" | "immeuble" | "sites";

export interface AdhesionOrganisation {
  organizationId: string;
  organizationName: string;
  role: string;
  kind: Offre;
  status: string;
  trialEndsAt: string | null;
}

export interface AdhesionClient {
  organizationId: string;
  organizationName: string;
  clientId: string;
}

/** Adhésion à portée site (directeur de site, technicien d'un site). */
export interface AdhesionSite {
  organizationId: string;
  organizationName: string;
  siteId: string;
  siteName: string;
  role: string;
}

export interface ContexteUtilisateur {
  userId: string;
  email: string;
  isPlatformAdmin: boolean;
  /** Adhésion à portée organisation (partenaire, chaîne ou régie), la première. */
  adhesion: AdhesionOrganisation | null;
  /** Adhésions gestionnaire (portée client). */
  adhesionsClient: AdhesionClient[];
  /** Adhésions à portée site (Gardien de l'eau). */
  adhesionsSite: AdhesionSite[];
  estOccupant: boolean;
}

export type Destination =
  | "/app"
  | "/immeuble"
  | "/sites"
  | "/gestion"
  | "/mon-logement"
  | "/admin"
  | null;

const ESPACE_PAR_OFFRE: Record<Offre, Destination> = {
  reseau: "/app",
  immeuble: "/immeuble",
  sites: "/sites",
};

/** null : compte rattaché à aucun espace. */
export function choisirDestination(ctx: ContexteUtilisateur): Destination {
  if (ctx.adhesion) return ESPACE_PAR_OFFRE[ctx.adhesion.kind] ?? "/app";
  if (ctx.adhesionsSite.length > 0) return "/sites";
  if (ctx.adhesionsClient.length > 0) return "/gestion";
  if (ctx.estOccupant) return "/mon-logement";
  if (ctx.isPlatformAdmin) return "/admin";
  return null;
}

export const LIBELLES_ROLE: Record<string, string> = {
  superadmin: "superadmin",
  admin_client: "administrateur",
  agent: "agent",
  lecteur: "lecteur",
  gestionnaire: "gestionnaire",
  directeur_site: "directeur de site",
  technicien: "technicien",
};
