import { describe, expect, it } from "vitest";
import {
  COULEURS_NEUTRES,
  COULEURS_PLATEFORME,
  couleurTexteSur,
  marqueDepuisBranding,
  rapportContraste,
} from "./marque";

const brandingVide = {
  display_name: null,
  primary_color: null,
  logo_path: null,
  legal_footer: null,
  show_powered_by: null,
  reply_to_email: null,
};

describe("rapportContraste", () => {
  it("vaut 21 entre noir et blanc", () => {
    expect(rapportContraste("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
  });

  it("vaut 1 pour deux couleurs identiques", () => {
    expect(rapportContraste("#1B4F8A", "#1B4F8A")).toBeCloseTo(1, 5);
  });
});

describe("couleurTexteSur", () => {
  it("choisit le blanc sur le bleu plateforme", () => {
    expect(couleurTexteSur(COULEURS_PLATEFORME.bleu)).toBe(COULEURS_NEUTRES.blanc);
  });

  it("choisit l'encre sur un jaune clair", () => {
    expect(couleurTexteSur("#FFE066")).toBe(COULEURS_NEUTRES.texte);
  });

  it("choisit toujours le texte le plus contrasté des deux", () => {
    for (const fond of ["#1B4F8A", "#0FA3A3", "#E63946", "#F4A261", "#FFFFFF", "#000000"]) {
      const choisi = rapportContraste(fond, couleurTexteSur(fond));
      expect(choisi).toBeGreaterThanOrEqual(rapportContraste(fond, COULEURS_NEUTRES.blanc));
      expect(choisi).toBeGreaterThanOrEqual(rapportContraste(fond, COULEURS_NEUTRES.texte));
    }
  });
});

describe("marqueDepuisBranding", () => {
  it("retombe sur le nom de l'organisation et le bleu plateforme", () => {
    const marque = marqueDepuisBranding("Comptage Rhône", null);
    expect(marque.nom).toBe("Comptage Rhône");
    expect(marque.couleur).toBe(COULEURS_PLATEFORME.bleu);
    expect(marque.afficherPropulse).toBe(true);
    expect(marque.logoUrl).toBeNull();
  });

  it("utilise le nom affiché et la couleur du partenaire", () => {
    const marque = marqueDepuisBranding("Raison sociale SAS", {
      ...brandingVide,
      display_name: "Hydro Savoie",
      primary_color: "#2A9D8F",
      show_powered_by: false,
    });
    expect(marque.nom).toBe("Hydro Savoie");
    expect(marque.couleur).toBe("#2A9D8F");
    expect(marque.afficherPropulse).toBe(false);
  });

  it("ignore une couleur invalide et un logo non https", () => {
    const marque = marqueDepuisBranding("X", {
      ...brandingVide,
      primary_color: "rouge",
      logo_path: "http://exemple.fr/logo.png",
    });
    expect(marque.couleur).toBe(COULEURS_PLATEFORME.bleu);
    expect(marque.logoUrl).toBeNull();
  });
});
