import { describe, it, expect } from "vitest";
import { construireCsvRpqs, nomFichierRpqs } from "./rpqsExport";

const DONNEES = {
  annee: 2026,
  rendement: 0.625,
  ilp: 2.568,
  ilc: 4.281,
  vProduit: 2000000,
  vImporte: 0,
  vExporte: 0,
  vMiseEnDistribution: 2000000,
  vComptabilise: 1220000,
  vSansComptage: 10000,
  vService: 20000,
  vConsommeAutorise: 1250000,
  pertes: 750000,
  lineaireReseauKm: 800,
  nbAbonnes: 20000,
  conformeDecret: false,
};

describe("construireCsvRpqs", () => {
  it("inclut P104.3, P106.3, ILC et les volumes avec séparateur point-virgule", () => {
    const csv = construireCsvRpqs(DONNEES);
    const lignes = csv.split("\r\n");

    expect(lignes[0]).toBe("Code;Indicateur;Valeur;Unité");
    expect(csv).toContain("P104.3;Rendement du réseau de distribution;62,5;%");
    expect(csv).toContain("P106.3;Indice linéaire de pertes en réseau (ILP);2,568;m³/km/j");
    expect(csv).toContain("ILC;Indice linéaire de consommation (indicateur interne);4,281;m³/km/j");
    expect(csv).toContain("Volume produit;2000000;m³");
    expect(csv).toContain("Non");
  });

  it("gère les valeurs manquantes sans planter", () => {
    const csv = construireCsvRpqs({ ...DONNEES, rendement: null, ilp: null, conformeDecret: null });
    expect(csv).toContain("P104.3;Rendement du réseau de distribution;;%");
    expect(csv.split("\r\n").length).toBe(16);
  });

  it("nomme le fichier avec l'année", () => {
    expect(nomFichierRpqs(2026)).toBe("indicateurs-rpqs-sispea-2026.csv");
  });
});
