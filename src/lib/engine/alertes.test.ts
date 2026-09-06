import { describe, expect, it } from "vitest";
import { estCompteurMuet, estDebitInverse, estIndexAnormal } from "./alertes";

describe("estCompteurMuet", () => {
  const maintenant = new Date("2026-06-10T12:00:00Z");

  it("muet si aucun relevé n'existe", () => {
    expect(estCompteurMuet(null, maintenant)).toBe(true);
  });

  it("muet si le dernier relevé date de plus de 48h", () => {
    const dernierReleve = new Date("2026-06-08T11:59:00Z"); // 48h01
    expect(estCompteurMuet(dernierReleve, maintenant)).toBe(true);
  });

  it("pas muet si le dernier relevé date de moins de 48h", () => {
    const dernierReleve = new Date("2026-06-08T13:00:00Z"); // 47h
    expect(estCompteurMuet(dernierReleve, maintenant)).toBe(false);
  });
});

describe("estDebitInverse", () => {
  it("détecte un débit horaire négatif au-delà de la tolérance", () => {
    expect(estDebitInverse(-0.6)).toBe(true);
    expect(estDebitInverse(-3)).toBe(true);
  });

  it("ignore le bruit de mesure proche de zéro", () => {
    expect(estDebitInverse(-0.3)).toBe(false);
    expect(estDebitInverse(0)).toBe(false);
    expect(estDebitInverse(5)).toBe(false);
  });
});

describe("estIndexAnormal", () => {
  it("détecte un écart de plus de 5 écarts-types", () => {
    // moyenne 100, écart-type 5 -> seuil = max(25, 50, 1) = 50.
    expect(estIndexAnormal(160, 100, 5)).toBe(true); // écart 60 > 50
    expect(estIndexAnormal(140, 100, 5)).toBe(false); // écart 40 < 50
  });

  it("détecte un écart relatif important même à faible variance", () => {
    // moyenne 100, écart-type quasi nul -> seuil = max(0, 50, 1) = 50.
    expect(estIndexAnormal(200, 100, 0.01)).toBe(true);
  });

  it("plancher absolu de 1 m³ pour éviter les faux positifs sur de très petites moyennes", () => {
    // moyenne 0,1, écart-type 0,01 -> seuil = max(0.05, 0.05, 1) = 1.
    expect(estIndexAnormal(0.9, 0.1, 0.01)).toBe(false); // écart 0,8 < 1
    expect(estIndexAnormal(2, 0.1, 0.01)).toBe(true); // écart 1,9 > 1
  });
});
