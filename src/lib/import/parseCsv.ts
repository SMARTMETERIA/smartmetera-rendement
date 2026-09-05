import Papa from "papaparse";
import type { RawTable } from "./types";

export function parseCsv(
  text: string,
  delimiter: string,
  headerRow: number,
): RawTable {
  const result = Papa.parse<string[]>(text, {
    delimiter,
    skipEmptyLines: true,
  });
  const allRows = result.data;
  const headerIndex = Math.max(0, headerRow - 1);
  const headers = (allRows[headerIndex] ?? []).map((h) => (h ?? "").trim());

  const rows = allRows
    .slice(headerIndex + 1)
    .map((cells, i) => ({ rowNumber: headerIndex + 2 + i, cells: cells ?? [] }))
    .filter((r) => r.cells.some((c) => c && c.trim() !== ""));

  return { headers, rows };
}
