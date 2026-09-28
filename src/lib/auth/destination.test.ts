import { describe, expect, it } from "vitest";
import { choisirDestination, type ContexteUtilisateur } from "./destination";

const base: ContexteUtilisateur = {
  userId: "u",
  email: "a@example.com",
  isPlatformAdmin: false,
  adhesion: null,
  adhesionsClient: [],
  adhesionsSite: [],
  estOccupant: false,
};

function adhesion(kind: "reseau" | "immeuble" | "sites") {
  return {
    organizationId: "o",
    organizationName: "Org",
    role: "admin_client",
    kind,
    status: "actif",
    trialEndsAt: null,
  };
}

describe("aiguillage après connexion", () => {
  it("envoie chaque offre vers son espace", () => {
    expect(choisirDestination({ ...base, adhesion: adhesion("reseau") })).toBe(
      "/app",
    );
    expect(
      choisirDestination({ ...base, adhesion: adhesion("immeuble") }),
    ).toBe("/immeuble");
    expect(choisirDestination({ ...base, adhesion: adhesion("sites") })).toBe(
      "/sites",
    );
  });

  it("envoie un directeur de site vers ses sites", () => {
    expect(
      choisirDestination({
        ...base,
        adhesionsSite: [
          {
            organizationId: "o",
            organizationName: "Chaîne",
            siteId: "s",
            siteName: "Hôtel du Port",
            role: "directeur_site",
          },
        ],
      }),
    ).toBe("/sites");
  });

  it("garde les espaces Immeuble et superadmin", () => {
    expect(
      choisirDestination({
        ...base,
        adhesionsClient: [
          { organizationId: "o", organizationName: "P", clientId: "c" },
        ],
      }),
    ).toBe("/gestion");
    expect(choisirDestination({ ...base, estOccupant: true })).toBe(
      "/mon-logement",
    );
    expect(choisirDestination({ ...base, isPlatformAdmin: true })).toBe(
      "/admin",
    );
  });

  it("ne choisit rien pour un compte sans accès", () => {
    expect(choisirDestination(base)).toBeNull();
  });
});
