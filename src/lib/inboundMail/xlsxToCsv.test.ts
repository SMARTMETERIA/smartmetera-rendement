import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { convertirXlsxEnCsv } from "./xlsxToCsv";

function construireClasseurXlsx(lignes: string[][]): Uint8Array {
  const feuille = XLSX.utils.aoa_to_sheet(lignes);
  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, feuille, "Feuil1");
  const buffer = XLSX.write(classeur, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Uint8Array(buffer);
}

describe("convertirXlsxEnCsv", () => {
  it("convertit un classeur simple en CSV avec le délimiteur demandé", () => {
    const bytes = construireClasseurXlsx([
      ["compteur", "date", "volume_m3"],
      ["PROD-001", "2026-09-01", "12.5"],
      ["PROD-001", "2026-09-02", "13.1"],
    ]);

    const csv = convertirXlsxEnCsv(bytes, 1, ";");

    expect(csv).toBe(
      ["compteur;date;volume_m3", "PROD-001;2026-09-01;12.5", "PROD-001;2026-09-02;13.1"].join(
        "\r\n",
      ),
    );
  });

  it("échappe les valeurs contenant le délimiteur", () => {
    const bytes = construireClasseurXlsx([
      ["nom", "valeur"],
      ["Secteur, Centre", "1,5"],
    ]);

    const csv = convertirXlsxEnCsv(bytes, 1, ",");
    expect(csv).toBe(['nom,valeur', '"Secteur, Centre","1,5"'].join("\r\n"));
  });
});
