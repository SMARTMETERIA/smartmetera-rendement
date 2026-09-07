import { describe, it, expect } from "vitest";
import { appliquerPointReleve, type EtatDevice } from "./computeDelta";

const MAX = 2 ** 32 - 1;
const point = (impulsions: number, nature: "index" | "delta" = "index") => ({
  impulsions,
  nature,
  horodatage: "2026-09-07T10:00:00.000Z",
});

describe("appliquerPointReleve", () => {
  it("ignore le premier relevé (aucune baseline) et initialise l'état", () => {
    const etat: EtatDevice = { dernierIndexImpulsions: null, dernierHorodatage: null };
    const res = appliquerPointReleve(etat, point(1000), 1, MAX);
    expect(res.ignorer).toBe(true);
    expect(res.nouvelEtat.dernierIndexImpulsions).toBe(1000);
  });

  it("calcule un delta simple, converti en m³ via litres_par_impulsion", () => {
    const etat: EtatDevice = {
      dernierIndexImpulsions: 1000,
      dernierHorodatage: "t0",
    };
    // 50 impulsions, 1 L/impulsion -> 0.05 m³
    const res = appliquerPointReleve(etat, point(1050), 1, MAX);
    expect(res.qualityFlag).toBe("valide");
    expect(res.volumeM3).toBeCloseTo(0.05, 6);
    expect(res.nouvelEtat.dernierIndexImpulsions).toBe(1050);
  });

  it("corrige un rollover plausible (compteur reparti de 0)", () => {
    const etat: EtatDevice = {
      dernierIndexImpulsions: MAX - 10,
      dernierHorodatage: "t0",
    };
    const res = appliquerPointReleve(etat, point(5), 1, MAX);
    expect(res.qualityFlag).toBe("corrigee");
    // delta réel : 10 impulsions avant rollover + 5 après = 15 impulsions = 0.015 m³
    expect(res.volumeM3).toBeCloseTo(0.015, 6);
  });

  it("signale un delta négatif implausible comme suspect, sans rejeter la trame", () => {
    const etat: EtatDevice = {
      dernierIndexImpulsions: 1_000_000,
      dernierHorodatage: "t0",
    };
    const res = appliquerPointReleve(etat, point(10), 1, MAX);
    expect(res.qualityFlag).toBe("suspecte");
    expect(res.volumeM3).toBe(0);
    expect(res.nouvelEtat.dernierIndexImpulsions).toBe(10);
  });

  it("mode delta direct (Dragino MOD=1) : pas de baseline nécessaire", () => {
    const etat: EtatDevice = { dernierIndexImpulsions: null, dernierHorodatage: null };
    const res = appliquerPointReleve(etat, point(20, "delta"), 2, MAX);
    expect(res.ignorer).toBeUndefined();
    expect(res.qualityFlag).toBe("valide");
    expect(res.volumeM3).toBeCloseTo(0.04, 6); // 20 impulsions * 2 L = 40 L = 0.04 m³
  });
});
