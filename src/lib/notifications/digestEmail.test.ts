import { describe, it, expect } from "vitest";
import { construireEmailDigest } from "./digestEmail";

const APP_URL = "https://app.smartmeteria.test";

describe("construireEmailDigest", () => {
  it("affiche le rendement et une liste vide d'alertes", () => {
    const rendu = construireEmailDigest(
      "Régie des Sources",
      { rendement: 0.625, ilp: 2.568, ilc: 4.281, conformeDecret: false, periodeFin: "2026-09-06" },
      [],
      3,
      APP_URL,
    );

    expect(rendu.subject).toBe("[SmartMeteria] Point hebdomadaire — Régie des Sources");
    expect(rendu.html).toContain("62.5 %");
    expect(rendu.html).toContain("non conforme");
    expect(rendu.html).toContain("Aucune nouvelle alerte cette semaine");
    expect(rendu.text).toContain("3 alerte(s) ouverte(s)");
  });

  it("liste les alertes de la semaine et gère l'absence de bilan", () => {
    const rendu = construireEmailDigest(
      "Régie des Sources",
      null,
      [
        {
          type: "fuite_suspectee",
          severite: "haute",
          titre: "Fuite suspectée",
          description: null,
          secteurNom: "Secteur Centre",
          declencheeLe: "2026-09-07T03:00:00.000Z",
        },
      ],
      1,
      APP_URL,
    );

    expect(rendu.html).toContain("Bilan pas encore calculé");
    expect(rendu.html).toContain("1 alerte(s) déclenchée(s)");
    expect(rendu.html).toContain("Fuite suspectée");
  });
});
