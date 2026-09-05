import Papa from "papaparse";
import type { RowError } from "./types";

export function buildErrorReportCsv(errors: RowError[]): string {
  const data = errors.map((e) => ({
    ligne: e.rowNumber,
    raison: e.reason,
    contenu_brut: e.raw.join(" | "),
  }));
  return Papa.unparse(data, { delimiter: ";" });
}
