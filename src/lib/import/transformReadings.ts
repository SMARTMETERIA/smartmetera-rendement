import type {
  NormalizedReading,
  RawTable,
  ReadingsImportResult,
  ReadingsMappingConfig,
  RowError,
} from "./types";
import { parseDate } from "./dates";
import { parseLocaleNumber } from "./numbers";
import { findHeaderIndex } from "./headers";
import { computeDeltasForMeter } from "./computeDeltas";

interface ParsedCell {
  rowNumber: number;
  meterRef: string;
  date: Date;
  rawValue: number;
}

export function transformReadings(
  table: RawTable,
  config: ReadingsMappingConfig,
): ReadingsImportResult {
  const { meter_ref, ts, value } = config.column_mapping;
  const idxMeterRef = findHeaderIndex(table.headers, meter_ref);
  const idxTs = findHeaderIndex(table.headers, ts);
  const idxValue = findHeaderIndex(table.headers, value);

  if (idxMeterRef === -1 || idxTs === -1 || idxValue === -1) {
    return {
      readings: [],
      ignoredRows: [],
      errorRows: [
        {
          rowNumber: 0,
          raw: [],
          reason:
            "Mapping incomplet : une ou plusieurs colonnes sont introuvables dans le fichier",
        },
      ],
      unresolvedMeterRefs: [],
    };
  }

  const unitFactor = config.unit === "L" ? 0.001 : 1;
  const errorRows: RowError[] = [];
  const parsed: ParsedCell[] = [];

  for (const row of table.rows) {
    const meterRef = (row.cells[idxMeterRef] ?? "").trim();
    const rawDate = row.cells[idxTs] ?? "";
    const rawValueStr = row.cells[idxValue] ?? "";

    if (!meterRef) {
      errorRows.push({
        rowNumber: row.rowNumber,
        raw: row.cells,
        reason: "Identifiant compteur manquant",
      });
      continue;
    }
    const date = parseDate(rawDate, config.date_format);
    if (!date) {
      errorRows.push({
        rowNumber: row.rowNumber,
        raw: row.cells,
        reason: `Date illisible : "${rawDate}" (format attendu ${config.date_format})`,
      });
      continue;
    }
    const numeric = parseLocaleNumber(rawValueStr);
    if (numeric === null) {
      errorRows.push({
        rowNumber: row.rowNumber,
        raw: row.cells,
        reason: `Valeur non numérique : "${rawValueStr}"`,
      });
      continue;
    }
    if (numeric < 0) {
      errorRows.push({
        rowNumber: row.rowNumber,
        raw: row.cells,
        reason: "Valeur négative refusée en entrée",
      });
      continue;
    }

    parsed.push({
      rowNumber: row.rowNumber,
      meterRef,
      date,
      rawValue: numeric * unitFactor,
    });
  }

  const readings: NormalizedReading[] = [];
  const ignoredRows: RowError[] = [];

  if (config.value_type === "volume") {
    for (const p of parsed) {
      readings.push({
        rowNumber: p.rowNumber,
        meterRef: p.meterRef,
        ts: p.date,
        volumeM3: p.rawValue,
        qualityFlag: "valide",
      });
    }
  } else {
    // rawValue est déjà converti en m³ (unitFactor ci-dessus) : le seuil de
    // rollover doit l'être identiquement, sinon la comparaison est fausse
    // d'un facteur 1000 pour les modèles exprimés en litres.
    const maxValueM3 = config.rollover_digits
      ? 10 ** config.rollover_digits * unitFactor
      : undefined;

    const byMeter = new Map<
      string,
      { rowNumber: number; ts: Date; indexM3: number }[]
    >();
    for (const p of parsed) {
      const list = byMeter.get(p.meterRef) ?? [];
      list.push({ rowNumber: p.rowNumber, ts: p.date, indexM3: p.rawValue });
      byMeter.set(p.meterRef, list);
    }
    for (const [meterRef, points] of byMeter) {
      const { readings: computed, ignored } = computeDeltasForMeter(
        points,
        maxValueM3,
      );
      for (const r of computed) readings.push({ ...r, meterRef });
      ignoredRows.push(...ignored);
    }
  }

  return { readings, ignoredRows, errorRows, unresolvedMeterRefs: [] };
}
