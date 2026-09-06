import { describe, expect, it } from "vitest";
import {
  calculerBaseline,
  calculerDebitMinNocturne,
  depasseSeuilAlerte,
  detecterAlerteFuite,
  estimerFuiteM3j,
} from "./dmn";

describe("calculerDebitMinNocturne", () => {
  // 15 janvier 2026 (hiver, UTC+1) : 01:00Z->02h locale, 02:00Z->03h,
  // 03:00Z->04h, 04:00Z->05h. Fenêtre [2h,4h) locale = heures 3 et 4.
  const debits = [
    { ts: new Date("2026-01-15T01:00:00Z"), debitM3h: 100 }, // 02h locale : hors fenêtre
    { ts: new Date("2026-01-15T02:00:00Z"), debitM3h: 10 }, // 03h locale : dans la fenêtre
    { ts: new Date("2026-01-15T03:00:00Z"), debitM3h: 5 }, // 04h locale : dans la fenêtre
    { ts: new Date("2026-01-15T04:00:00Z"), debitM3h: 1 }, // 05h locale : hors fenêtre
  ];

  it("prend le minimum sur [2h,4h) heure locale uniquement", () => {
    expect(calculerDebitMinNocturne(debits)).toBe(5);
  });

  it("retourne null si aucune donnée sur la fenêtre", () => {
    expect(
      calculerDebitMinNocturne([
        { ts: new Date("2026-01-15T04:00:00Z"), debitM3h: 1 },
      ]),
    ).toBeNull();
  });

  it("reste correct un jour de changement d'heure (passage heure d'été, mars)", () => {
    // Dernier dimanche de mars : 2h locale saute directement à 3h (pas de 2h-3h).
    // 00:00Z -> 01h locale (hiver, avant bascule) ; 01:00Z -> 03h locale (été, après bascule à 1h UTC).
    const debitsDst = [
      { ts: new Date("2026-03-29T01:00:00Z"), debitM3h: 20 }, // 03h locale (été)
      { ts: new Date("2026-03-29T02:00:00Z"), debitM3h: 8 }, // 04h locale
    ];
    expect(calculerDebitMinNocturne(debitsDst)).toBe(8);
  });
});

describe("calculerBaseline (médiane)", () => {
  it("médiane sur nombre impair de nuits", () => {
    expect(calculerBaseline([10, 12, 8])).toBe(10);
  });

  it("médiane sur nombre pair de nuits (moyenne des deux centrales)", () => {
    expect(calculerBaseline([10, 12, 8, 14])).toBe(11);
  });

  it("null si aucun historique", () => {
    expect(calculerBaseline([])).toBeNull();
  });
});

describe("estimerFuiteM3j", () => {
  it("formule CLAUDE.md : (DMN - abonnés×1,7L/h) × 20", () => {
    // 1000 abonnés × 1,7 L/h = 1,7 m³/h. DMN = 5 -> (5-1,7)*20 = 66.
    expect(estimerFuiteM3j(5, 1000)).toBeCloseTo(66, 5);
  });

  it("jamais négative (DMN sous la consommation légitime)", () => {
    expect(estimerFuiteM3j(1, 1000)).toBe(0);
  });
});

describe("depasseSeuilAlerte / detecterAlerteFuite", () => {
  it("dépasse si > baseline + 20 % (baseline élevée)", () => {
    // baseline 40 -> seuil = 40 + max(8, 0.5) = 48.
    expect(depasseSeuilAlerte(49, 40)).toBe(true);
    expect(depasseSeuilAlerte(47, 40)).toBe(false);
  });

  it("dépasse si > baseline + 0,5 m³/h (baseline faible, plancher absolu)", () => {
    // baseline 1 -> seuil = 1 + max(0.2, 0.5) = 1.5.
    expect(depasseSeuilAlerte(1.6, 1)).toBe(true);
    expect(depasseSeuilAlerte(1.4, 1)).toBe(false);
  });

  it("alerte si les 3 dernières nuits dépassent chacune leur seuil", () => {
    const nuits = [
      { dmn: 20, baseline: 15 }, // ne compte pas (avant les 3 dernières)
      { dmn: 49, baseline: 40 },
      { dmn: 50, baseline: 40 },
      { dmn: 51, baseline: 40 },
    ];
    expect(detecterAlerteFuite(nuits)).toBe(true);
  });

  it("pas d'alerte si une seule des 3 dernières nuits ne dépasse pas", () => {
    const nuits = [
      { dmn: 49, baseline: 40 },
      { dmn: 44, baseline: 40 }, // sous le seuil (48)
      { dmn: 51, baseline: 40 },
    ];
    expect(detecterAlerteFuite(nuits)).toBe(false);
  });

  it("pas d'alerte avec moins de 3 nuits d'historique", () => {
    expect(detecterAlerteFuite([{ dmn: 49, baseline: 40 }])).toBe(false);
  });

  it("pas d'alerte si la baseline manque une nuit (historique insuffisant)", () => {
    const nuits = [
      { dmn: 49, baseline: null },
      { dmn: 50, baseline: 40 },
      { dmn: 51, baseline: 40 },
    ];
    expect(detecterAlerteFuite(nuits)).toBe(false);
  });
});
