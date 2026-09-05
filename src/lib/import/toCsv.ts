import Papa from "papaparse";
import type { RawTable } from "./types";

/**
 * Les fichiers Excel sont convertis en CSV côté client avant upload : la
 * fonction Edge (Deno) ne traite que du CSV, pour éviter d'embarquer le
 * volumineux bundle SheetJS dans l'exécution serveur (voir README de
 * supabase/functions/process-import).
 */
export function rawTableToCsv(table: RawTable, delimiter = ","): string {
  const rows = [table.headers, ...table.rows.map((r) => r.cells)];
  return Papa.unparse(rows, { delimiter });
}
