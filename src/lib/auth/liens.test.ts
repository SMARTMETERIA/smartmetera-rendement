import { describe, expect, it } from "vitest";
import { cheminInterneSur, lienConfirmation } from "./liens";

describe("liens de connexion", () => {
  it("n'accepte que des chemins internes", () => {
    expect(cheminInterneSur("/sites")).toBe("/sites");
    expect(cheminInterneSur("https://pirate.example")).toBe("/accueil");
    expect(cheminInterneSur("//pirate.example")).toBe("/accueil");
    expect(cheminInterneSur("/\\pirate.example")).toBe("/accueil");
    expect(cheminInterneSur("/a\r\nb")).toBe("/accueil");
    expect(cheminInterneSur(null, "/connexion")).toBe("/connexion");
  });

  it("construit un lien vers la route de confirmation", () => {
    const lien = new URL(
      lienConfirmation(
        "https://app.exemple.fr",
        "abc123",
        "magiclink",
        "/sites",
      ),
    );
    expect(lien.origin + lien.pathname).toBe(
      "https://app.exemple.fr/auth/confirmer",
    );
    expect(lien.searchParams.get("token_hash")).toBe("abc123");
    expect(lien.searchParams.get("type")).toBe("magiclink");
    expect(lien.searchParams.get("next")).toBe("/sites");
  });

  it("remplace une destination externe par l'accueil", () => {
    const lien = new URL(
      lienConfirmation(
        "https://app.exemple.fr",
        "t",
        "recovery",
        "https://pirate.example",
      ),
    );
    expect(lien.searchParams.get("next")).toBe("/accueil");
  });
});
