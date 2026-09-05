import type {
  BalanceInputsImportResult,
  BalanceInputsMappingConfig,
  RawTable,
  RowError,
} from "./types.ts";
import { parseLocaleNumber } from "./numbers.ts";
import { findHeaderIndex } from "./headers.ts";

export function transformBalanceInputs(
  table: RawTable,
  config: BalanceInputsMappingConfig,
): BalanceInputsImportResult {
  const { annee, volume_comptabilise, nb_abonnes } = config.column_mapping;
  const idxAnnee = findHeaderIndex(table.headers, annee);
  const idxVolume = findHeaderIndex(table.headers, volume_comptabilise);
  const idxAbonnes = nb_abonnes
    ? findHeaderIndex(table.headers, nb_abonnes)
    : -1;

  if (idxAnnee === -1 || idxVolume === -1) {
    return {
      byYear: new Map(),
      errorRows: [
        {
          rowNumber: 0,
          raw: [],
          reason: "Mapping incomplet : colonnes année/volume introuvables",
        },
      ],
    };
  }

  const errorRows: RowError[] = [];
  const byYear = new Map<
    number,
    { volumeComptabilise: number; nbAbonnes: number | null }
  >();

  for (const row of table.rows) {
    const yearStr = (row.cells[idxAnnee] ?? "").trim();
    const year = Number.parseInt(yearStr, 10);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      errorRows.push({
        rowNumber: row.rowNumber,
        raw: row.cells,
        reason: `Année illisible : "${yearStr}"`,
      });
      continue;
    }

    const volume = parseLocaleNumber(row.cells[idxVolume] ?? "");
    if (volume === null || volume < 0) {
      errorRows.push({
        rowNumber: row.rowNumber,
        raw: row.cells,
        reason: `Volume illisible : "${row.cells[idxVolume] ?? ""}"`,
      });
      continue;
    }

    const abonnes =
      idxAbonnes !== -1 ? parseLocaleNumber(row.cells[idxAbonnes] ?? "") : null;
    const existing = byYear.get(year) ?? {
      volumeComptabilise: 0,
      nbAbonnes: null,
    };
    existing.volumeComptabilise += volume;
    if (abonnes !== null) {
      existing.nbAbonnes = (existing.nbAbonnes ?? 0) + abonnes;
    }
    byYear.set(year, existing);
  }

  return { byYear, errorRows };
}
