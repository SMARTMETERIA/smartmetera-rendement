import { describe, expect, it } from "vitest";
import { lienActif } from "./NavEspace";

describe("navigation des espaces", () => {
  const liens = ["/sites", "/sites/alertes", "/pose", "/compte"];

  it("met en évidence la page en cours, le lien le plus précis gagnant", () => {
    expect(lienActif("/sites", liens)).toBe("/sites");
    expect(lienActif("/sites/alertes", liens)).toBe("/sites/alertes");
    expect(lienActif("/sites/3f0c", liens)).toBe("/sites");
    expect(lienActif("/pose/ABC123", liens)).toBe("/pose");
  });

  it("aucun lien actif hors de la navigation", () => {
    expect(lienActif("/fuites/1", liens)).toBeNull();
    expect(lienActif("/sitesx", liens)).toBeNull();
  });
});
