// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { construirePlancheEtiquettes } from "./planchePdf";

describe("planche d'étiquettes PDF", () => {
  it("produit une page A4 par tranche de 24 étiquettes", async () => {
    const etiquettes = Array.from({ length: 26 }, (_, i) => ({
      qrCode: `ABCDEFGH${String(i).padStart(2, "2")}`,
      reference: "351358816993213",
      modele: "Adeunis PULSE NB-IoT/LTE-M",
    }));
    const octets = await construirePlancheEtiquettes(
      etiquettes,
      "https://app.exemple.fr",
    );
    expect(new TextDecoder().decode(octets.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(octets);
    expect(pdf.getPageCount()).toBe(2);
    const { width, height } = pdf.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });
});
