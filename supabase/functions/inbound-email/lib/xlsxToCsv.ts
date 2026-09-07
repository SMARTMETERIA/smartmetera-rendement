// Conversion XLSX -> CSV côté serveur, nécessaire uniquement pour les
// pièces jointes reçues par e-mail (pas d'étape navigateur possible ici,
// contrairement à l'upload manuel — voir src/lib/import/toCsv.ts et
// src/lib/inboundMail/xlsxToCsv.ts, dont ce fichier est le miroir Deno).
// SheetJS n'est utilisé QUE dans cette fonction Edge, jamais dans
// process-import ni ingest, pour ne pas alourdir leur bundle.
import * as XLSX from "npm:xlsx@0.18.5";

interface RawTable {
  headers: string[];
  rows: { rowNumber: number; cells: string[] }[];
}

function parseExcel(data: ArrayBuffer, headerRow: number): RawTable {
  const workbook = XLSX.read(data, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return { headers: [], rows: [] };

  const allRows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });
  const headerIndex = Math.max(0, headerRow - 1);
  const headers = (allRows[headerIndex] ?? []).map((h) => String(h ?? "").trim());
  const rows = allRows
    .slice(headerIndex + 1)
    .map((cells, i) => ({
      rowNumber: headerIndex + 2 + i,
      cells: (cells ?? []).map((c) => String(c ?? "")),
    }))
    .filter((r) => r.cells.some((c) => c.trim() !== ""));

  return { headers, rows };
}

function construireCsv(table: RawTable, delimiter = ","): string {
  const echapper = (valeur: string): string => {
    if (
      valeur.includes(delimiter) ||
      valeur.includes('"') ||
      valeur.includes("\n") ||
      valeur.includes("\r")
    ) {
      return `"${valeur.replace(/"/g, '""')}"`;
    }
    return valeur;
  };
  const lignes = [table.headers, ...table.rows.map((r) => r.cells)];
  return lignes.map((ligne) => ligne.map(echapper).join(delimiter)).join("\r\n");
}

export function convertirXlsxEnCsv(
  bytes: Uint8Array,
  headerRow: number,
  delimiter = ",",
): string {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const table = parseExcel(buffer, headerRow);
  return construireCsv(table, delimiter);
}
