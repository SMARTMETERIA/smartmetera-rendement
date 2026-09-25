// Aiguillage après connexion (pur, testable) : chaque profil a son espace.

export type Offre = "reseau" | "immeuble";

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

export interface ContexteUtilisateur {
  userId: string;
  email: string;
  isPlatformAdmin: boolean;
  /** Adhésion à portée organisation (partenaire ou régie), la première. */
  adhesion: AdhesionOrganisation | null;
  /** Adhésions gestionnaire (portée client). */
  adhesionsClient: AdhesionClient[];
  estOccupant: boolean;
}

export type Destination =
  | "/app"
  | "/immeuble"
  | "/gestion"
  | "/mon-logement"
  | "/admin"
  | null;

/** null : compte rattaché à aucun espace. */
export function choisirDestination(ctx: ContexteUtilisateur): Destination {
  if (ctx.adhesion) {
    return ctx.adhesion.kind === "immeuble" ? "/immeuble" : "/app";
  }
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
};
