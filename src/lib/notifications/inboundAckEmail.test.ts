import { describe, it, expect } from "vitest";
import { construireEmailAccuseReception, construireEmailErreurImport } from "./inboundAckEmail";

const APP_URL = "https://app.smartmeteria.test";

describe("construireEmailAccuseReception", () => {
  it("résume les statistiques d'import", () => {
    const rendu = construireEmailAccuseReception(
      "Régie des Sources",
      { fichierNom: "export.csv", nbLignesImportees: 10, nbLignesRejetees: 2, nbLignesIgnorees: 1 },
      APP_URL,
    );
    expect(rendu.subject).toBe("[SmartMeteria] Import reçu — export.csv");
    expect(rendu.html).toContain("10 ligne(s) importée(s)");
    expect(rendu.html).toContain("joint à cet e-mail");
  });

  it("n'affiche pas la mention de pièce jointe s'il n'y a aucun rejet", () => {
    const rendu = construireEmailAccuseReception(
      "Régie des Sources",
      { fichierNom: "export.csv", nbLignesImportees: 10, nbLignesRejetees: 0, nbLignesIgnorees: 0 },
      APP_URL,
    );
    expect(rendu.html).not.toContain("joint à cet e-mail");
  });
});

describe("construireEmailErreurImport", () => {
  it("inclut la raison de l'échec", () => {
    const rendu = construireEmailErreurImport(
      "Régie des Sources",
      "export.pdf",
      "Format non reconnu : formats acceptés CSV et XLSX",
      APP_URL,
    );
    expect(rendu.subject).toBe("[SmartMeteria] Échec d'import — export.pdf");
    expect(rendu.html).toContain("Format non reconnu");
  });
});
