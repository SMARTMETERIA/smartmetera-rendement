// Miroir Deno de src/lib/import/types.ts (Next.js) — voir README de la
// fonction pour l'explication de cette duplication contrôlée.

export type ValueType = "volume" | "index";
export type Unit = "m3" | "L";
export type QualityFlag = "valide" | "suspecte" | "corrigee";
export type ImportCible = "readings" | "balance_inputs";

export interface ReadingsColumnMapping {
  meter_ref: string;
  ts: string;
  value: string;
}

export interface ReadingsMappingConfig {
  delimiter: string;
  encoding: string;
  header_row: number;
  date_format: string;
  value_type: ValueType;
  unit: Unit;
  rollover_digits?: number;
  column_mapping: ReadingsColumnMapping;
}

export interface BalanceInputsColumnMapping {
  commune?: string;
  annee: string;
  volume_comptabilise: string;
  nb_abonnes?: string;
}

export interface BalanceInputsMappingConfig {
  delimiter: string;
  encoding: string;
  header_row: number;
  column_mapping: BalanceInputsColumnMapping;
}

export interface RawTable {
  headers: string[];
  rows: { rowNumber: number; cells: string[] }[];
}

export interface RowError {
  rowNumber: number;
  raw: string[];
  reason: string;
}

export interface NormalizedReading {
  rowNumber: number;
  meterRef: string;
  ts: Date;
  volumeM3: number;
  qualityFlag: QualityFlag;
  note?: string;
}

export interface ReadingsImportResult {
  readings: NormalizedReading[];
  ignoredRows: RowError[];
  errorRows: RowError[];
  unresolvedMeterRefs: string[];
}

export interface BalanceInputsImportResult {
  byYear: Map<number, { volumeComptabilise: number; nbAbonnes: number | null }>;
  errorRows: RowError[];
}
