import Papa from "npm:papaparse@5.7.0";
import type { RowError } from "./types.ts";

export function buildErrorReportCsv(errors: RowError[]): string {
  const data = errors.map((e) => ({
    ligne: e.rowNumber,
    raison: e.reason,
    contenu_brut: e.raw.join(" | "),
  }));
  return Papa.unparse(data, { delimiter: ";" });
}
