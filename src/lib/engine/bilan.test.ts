import { describe, expect, it } from "vitest";
import {
  calculerBilan,
  repartirComposantesAnnuelles,
  type EntreeAnnuelleBilan,
} from "./bilan";
import type { BilanEau } from "../rendement";

describe("calculerBilan — valeurs connues fournies", () => {
  // Vproduit 2 000 000, Vimporté 0, Vexporté 0, Vcomptabilisé 1 220 000,
  // sans comptage 10 000, service 20 000, 800 km, non ZRE
  // -> rendement 62,5 %, ILP 2,568, ILC 4,281, seuil 65,86 %, non conforme.
  const bilan: BilanEau = {
    vProduit: 2_000_000,
    vImporte: 0,
    vExporte: 0,
    vComptabilise: 1_220_000,
    vSansComptage: 10_000,
    vService: 20_000,
    lineaireKm: 800,
    zoneDeRepartitionDesEaux: false,
  };

  const resultat = calculerBilan(
    bilan,
    "annee_civile",
    "2026-01-01",
    "2026-12-31",
  );

  it("volume mis en distribution et consommé autorisé", () => {
    expect(resultat.volumeMisEnDistribution).toBe(2_000_000);
    expect(resultat.volumeConsommeAutorise).toBe(1_250_000);
    expect(resultat.pertes).toBe(750_000);
  });

  it("rendement = 62,5 %", () => {
    expect(resultat.rendement).toBeCloseTo(0.625, 6);
  });

  it("ILP = 2,568", () => {
    expect(resultat.ilp).toBeCloseTo(2.568, 3);
  });

  it("ILC = 4,281", () => {
    expect(resultat.ilc).toBeCloseTo(4.281, 3);
  });

  it("seuil réglementaire = 65,86 %", () => {
    expect(resultat.seuilReglementaire).toBeCloseTo(0.6586, 4);
  });

  it("non conforme (rendement < 85 % et < seuil)", () => {
    expect(resultat.conformeDecret).toBe(false);
  });

  it("distance au seuil négative (rendement en-dessous du seuil)", () => {
    expect(resultat.distanceAuSeuil).toBeCloseTo(0.625 - 0.6586, 4);
    expect(resultat.distanceAuSeuil).toBeLessThan(0);
  });
});

describe("calculerBilan — cas conforme, distance positive", () => {
  it("rendement au-dessus du seuil 85 % : distance positive, conforme", () => {
    const bilan: BilanEau = {
      vProduit: 1_000_000,
      vImporte: 0,
      vExporte: 0,
      vComptabilise: 850_000,
      vSansComptage: 20_000,
      vService: 30_000,
      lineaireKm: 400,
      zoneDeRepartitionDesEaux: false,
    };
    const resultat = calculerBilan(
      bilan,
      "annee_civile",
      "2026-01-01",
      "2026-12-31",
    );
    expect(resultat.rendement).toBeCloseTo(0.9, 5);
    expect(resultat.conformeDecret).toBe(true);
    expect(resultat.distanceAuSeuil).toBeGreaterThan(0);
  });
});

describe("repartirComposantesAnnuelles — fenêtre glissante à cheval sur deux exercices", () => {
  const entrees = new Map<number, EntreeAnnuelleBilan>([
    [
      2025,
      {
        annee: 2025,
        vComptabilise: 3_650_000,
        vSansComptage: 0,
        vService: 0,
        lineaireKm: 100,
        zoneDeRepartitionDesEaux: false,
      },
    ],
    [
      2026,
      {
        annee: 2026,
        vComptabilise: 7_300_000,
        vSansComptage: 0,
        vService: 0,
        lineaireKm: 200,
        zoneDeRepartitionDesEaux: false,
      },
    ],
  ]);

  it("répartit exactement au prorata des jours (10 000 m³/j en 2025, 20 000 m³/j en 2026)", () => {
    // 2025 non bissextile (365j) : 3 650 000/365 = 10 000 m³/j.
    // 2026 non bissextile (365j) : 7 300 000/365 = 20 000 m³/j.
    const debut = new Date(Date.UTC(2025, 11, 1)); // 1er décembre 2025
    const fin = new Date(Date.UTC(2026, 0, 30)); // 30 janvier 2026 : 31 jours en 2025, 30 en 2026
    const resultat = repartirComposantesAnnuelles(debut, fin, entrees);

    expect(resultat.vComptabilise).toBeCloseTo(31 * 10_000 + 30 * 20_000, 0);
    expect(resultat.lineaireKm).toBeCloseTo((31 * 100 + 30 * 200) / 61, 3);
  });

  it("année sans donnée saisie : ignorée sans erreur", () => {
    const debut = new Date(Date.UTC(2030, 0, 1));
    const fin = new Date(Date.UTC(2030, 11, 31));
    const resultat = repartirComposantesAnnuelles(debut, fin, entrees);
    expect(resultat.vComptabilise).toBe(0);
    expect(resultat.lineaireKm).toBe(0);
  });
});
