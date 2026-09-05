import * as XLSX from "xlsx";
import type { RawTable } from "./types";

export function parseExcel(
  data: ArrayBuffer,
  headerRow: number,
  sheetName?: string,
): RawTable {
  const workbook = XLSX.read(data, { type: "array" });
  const name = sheetName ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[name];
  if (!sheet) {
    return { headers: [], rows: [] };
  }

  const allRows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });
  const headerIndex = Math.max(0, headerRow - 1);
  const headers = (allRows[headerIndex] ?? []).map((h) =>
    String(h ?? "").trim(),
  );

  const rows = allRows
    .slice(headerIndex + 1)
    .map((cells, i) => ({
      rowNumber: headerIndex + 2 + i,
      cells: (cells ?? []).map((c) => String(c ?? "")),
    }))
    .filter((r) => r.cells.some((c) => c.trim() !== ""));

  return { headers, rows };
}
