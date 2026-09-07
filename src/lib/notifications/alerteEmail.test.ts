import { describe, it, expect } from "vitest";
import { construireEmailAlertes } from "./alerteEmail";

const APP_URL = "https://app.smartmeteria.test";

describe("construireEmailAlertes", () => {
  it("au singulier pour une seule alerte", () => {
    const rendu = construireEmailAlertes(
      "Régie des Sources",
      [
        {
          type: "fuite_suspectee",
          severite: "haute",
          titre: "Fuite suspectée : Secteur Centre",
          description: "DMN 5.2 m³/h > baseline 3.1 m³/h",
          secteurNom: "Secteur Centre",
          declencheeLe: "2026-09-07T03:00:00.000Z",
        },
      ],
      APP_URL,
    );

    expect(rendu.subject).toBe("[SmartMeteria] Nouvelle alerte — Régie des Sources");
    expect(rendu.html).toContain("Fuite suspectée : Secteur Centre");
    expect(rendu.html).toContain("Fuite suspectée");
    expect(rendu.html).toContain("Secteur Centre");
    expect(rendu.text).toContain("Une nouvelle alerte");
    expect(rendu.text).toContain(APP_URL);
  });

  it("au pluriel et échappe le HTML des champs libres", () => {
    const rendu = construireEmailAlertes(
      "Régie <Test> & Cie",
      [
        {
          type: "compteur_muet",
          severite: "moyenne",
          titre: "<script>alert(1)</script>",
          description: null,
          secteurNom: null,
          declencheeLe: "2026-09-07T03:00:00.000Z",
        },
        {
          type: "index_anormal",
          severite: "moyenne",
          titre: "Volume anormal",
          description: null,
          secteurNom: null,
          declencheeLe: "2026-09-07T03:00:00.000Z",
        },
      ],
      APP_URL,
    );

    expect(rendu.subject).toContain("2 nouvelles alertes");
    expect(rendu.html).not.toContain("<script>alert(1)</script>");
    expect(rendu.html).toContain("&lt;script&gt;");
    expect(rendu.html).toContain("Régie &lt;Test&gt; &amp; Cie");
  });
});
