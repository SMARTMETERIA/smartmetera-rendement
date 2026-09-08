import { describe, it, expect } from "vitest";
import { calculerRoi } from "./calculateurRoi";

// Exemple de référence du moteur de calcul (voir README) : 2 000 000 m³
// produits, 0 importé, 0 exporté, 1 220 000 comptabilisé, 10 000 sans
// comptage, 20 000 service, 800 km, hors ZRE -> rendement 62,5 %, non
// conforme (seuil 65,86 %), pertes 750 000 m³.
const BILAN_REFERENCE = {
  vProduit: 2_000_000,
  vImporte: 0,
  vExporte: 0,
  vComptabilise: 1_220_000,
  vSansComptage: 10_000,
  vService: 20_000,
  lineaireKm: 800,
  zoneDeRepartitionDesEaux: false,
};

describe("calculerRoi", () => {
  it("reprend les formules de bilan de référence (rendement, pertes, conformité)", () => {
    const resultat = calculerRoi({
      bilan: BILAN_REFERENCE,
      coutMarginalEurM3: 0.5,
      redevanceEurM3: 0.1,
      prixPalierEurM3: 2,
    });

    expect(resultat.bilan.rendement).toBeCloseTo(0.625, 3);
    expect(resultat.bilan.pertes).toBeCloseTo(750_000, 0);
    expect(resultat.bilan.conformeDecret).toBe(false);
  });

  it("calcule les pertes en euros aux deux valorisations", () => {
    const resultat = calculerRoi({
      bilan: BILAN_REFERENCE,
      coutMarginalEurM3: 0.5,
      redevanceEurM3: 0.1,
      prixPalierEurM3: 2,
    });

    expect(resultat.pertesEuroCoutMarginal).toBeCloseTo(375_000, 0);
    expect(resultat.pertesEuroCommercial).toBeCloseTo(1_500_000, 0);
  });

  it("estime la pénalité potentielle (doublement de la redevance) si non conforme", () => {
    const resultat = calculerRoi({
      bilan: BILAN_REFERENCE,
      coutMarginalEurM3: 0.5,
      redevanceEurM3: 0.1,
      prixPalierEurM3: 2,
    });
    expect(resultat.penalitePotentielleEur).toBeCloseTo(200_000, 0);
  });

  it("ne calcule aucune pénalité si le réseau est conforme", () => {
    const resultat = calculerRoi({
      bilan: { ...BILAN_REFERENCE, vComptabilise: 1_900_000 },
      coutMarginalEurM3: 0.5,
      redevanceEurM3: 0.1,
      prixPalierEurM3: 2,
    });
    expect(resultat.bilan.conformeDecret).toBe(true);
    expect(resultat.penalitePotentielleEur).toBe(0);
  });

  it("calcule les gains a 10 % et 20 % de recuperation", () => {
    const resultat = calculerRoi({
      bilan: BILAN_REFERENCE,
      coutMarginalEurM3: 0.5,
      redevanceEurM3: 0.1,
      prixPalierEurM3: 2,
    });
    // valeur m3 economise = 0.5 + 0.1 = 0.6 ; pertes = 750 000
    expect(resultat.gain10PctEur).toBeCloseTo(45_000, 0);
    expect(resultat.gain20PctEur).toBeCloseTo(90_000, 0);
  });

  it("calcule le net apres subvention et la duree de retour", () => {
    const resultat = calculerRoi({
      bilan: BILAN_REFERENCE,
      coutMarginalEurM3: 0.5,
      redevanceEurM3: 0.1,
      prixPalierEurM3: 2,
      coutTravauxEur: 500_000,
      tauxSubventionPct: 40,
    });
    expect(resultat.coutNetTravauxEur).toBeCloseTo(300_000, 0);
    expect(resultat.netApres10PctEur).toBeCloseTo(-255_000, 0);
    expect(resultat.netApres20PctEur).toBeCloseTo(-210_000, 0);
    expect(resultat.dureeRetour10Annees).toBeCloseTo(6.667, 2);
    expect(resultat.dureeRetour20Annees).toBeCloseTo(3.333, 2);
  });

  it("ne calcule pas de duree de retour sans cout de travaux", () => {
    const resultat = calculerRoi({
      bilan: BILAN_REFERENCE,
      coutMarginalEurM3: 0.5,
      redevanceEurM3: 0.1,
      prixPalierEurM3: 2,
    });
    expect(resultat.dureeRetour10Annees).toBeNull();
    expect(resultat.dureeRetour20Annees).toBeNull();
  });
});
