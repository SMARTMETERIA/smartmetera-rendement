import { describe, expect, it } from "vitest";
import {
  estConformeDecret,
  indiceLineaireConsommation,
  indiceLineairePertes,
  pertes,
  rendementReseau,
  volumeConsommeAutorise,
  volumeMisEnDistribution,
  type BilanEau,
} from "./rendement";

const bilanExemple: BilanEau = {
  vProduit: 100_000,
  vImporte: 0,
  vExporte: 0,
  vComptabilise: 80_000,
  vSansComptage: 1_000,
  vService: 500,
  lineaireKm: 50,
};

describe("bilan d'eau", () => {
  it("calcule le volume mis en distribution", () => {
    expect(volumeMisEnDistribution(bilanExemple)).toBe(100_000);
  });

  it("calcule le volume consommé autorisé", () => {
    expect(volumeConsommeAutorise(bilanExemple)).toBe(81_500);
  });

  it("calcule les pertes", () => {
    expect(pertes(bilanExemple)).toBe(18_500);
  });

  it("calcule le rendement de réseau", () => {
    expect(rendementReseau(bilanExemple)).toBeCloseTo(0.815, 5);
  });

  it("calcule l'ILP et l'ILC", () => {
    expect(indiceLineairePertes(bilanExemple)).toBeCloseTo(
      18_500 / (365 * 50),
      5,
    );
    expect(indiceLineaireConsommation(bilanExemple)).toBeCloseTo(
      81_500 / (365 * 50),
      5,
    );
  });

  it("est conforme sous le seuil de 85 % si le seuil ILC (réseau peu chargé) est atteint", () => {
    // rendement 0,815 < 0,85 mais réseau étendu (ILC bas) : seuil ILC ≈ 0,659 → conforme.
    expect(rendementReseau(bilanExemple)).toBeLessThan(0.85);
    expect(estConformeDecret(bilanExemple)).toBe(true);
  });

  it("est non conforme si ni le seuil de 85 % ni le seuil ILC ne sont atteints (réseau dense)", () => {
    const bilanReseauDense = { ...bilanExemple, lineaireKm: 2 };
    expect(estConformeDecret(bilanReseauDense)).toBe(false);
  });

  it("applique le terme fixe majoré (70) en zone de répartition des eaux", () => {
    const bilanFrontiere = { ...bilanExemple, lineaireKm: 3 };
    expect(estConformeDecret(bilanFrontiere)).toBe(true);
    expect(
      estConformeDecret({ ...bilanFrontiere, zoneDeRepartitionDesEaux: true }),
    ).toBe(false);
  });
});
