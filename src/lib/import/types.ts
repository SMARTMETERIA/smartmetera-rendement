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
  /** Lignes de données, hors en-tête. rowNumber = position 1-indexée dans le fichier source (en-tête inclus). */
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

export interface NormalizedBalanceRow {
  rowNumber: number;
  annee: number;
  volumeComptabilise: number;
  nbAbonnes: number | null;
  commune?: string;
}

export interface ReadingsImportResult {
  readings: NormalizedReading[];
  ignoredRows: RowError[];
  errorRows: RowError[];
  unresolvedMeterRefs: string[];
}

export interface BalanceInputsImportResult {
  /** Une entrée par exercice (année), agrégée sur toutes les lignes/communes du fichier. */
  byYear: Map<number, { volumeComptabilise: number; nbAbonnes: number | null }>;
  errorRows: RowError[];
}
