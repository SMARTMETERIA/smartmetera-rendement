import type {
  BalanceInputsMappingConfig,
  ReadingsMappingConfig,
} from "./types";

/**
 * Miroir TypeScript des modèles système seedés par
 * supabase/migrations/0006_import_pipeline.sql — permet des tests de
 * parsing rapides et hors-ligne. Toute modification d'un mapping doit être
 * répercutée dans les deux fichiers.
 */
export const SYSTEM_TEMPLATES = {
  generique: {
    source_type: "generique",
    cible: "readings",
    config: {
      delimiter: ",",
      encoding: "utf-8",
      header_row: 1,
      date_format: "YYYY-MM-DD HH:mm:ss",
      value_type: "volume",
      unit: "m3",
      column_mapping: { meter_ref: "compteur", ts: "date", value: "volume_m3" },
    } satisfies ReadingsMappingConfig,
  },
  topkapi: {
    source_type: "topkapi",
    cible: "readings",
    config: {
      delimiter: ";",
      encoding: "iso-8859-1",
      header_row: 1,
      date_format: "DD/MM/YYYY HH:mm",
      value_type: "index",
      unit: "m3",
      rollover_digits: 8,
      column_mapping: {
        meter_ref: "Identifiant compteur",
        ts: "Date releve",
        value: "Index (m3)",
      },
    } satisfies ReadingsMappingConfig,
  },
  sofrel_s4w: {
    source_type: "sofrel_s4w",
    cible: "readings",
    config: {
      delimiter: ";",
      encoding: "iso-8859-1",
      header_row: 1,
      date_format: "DD/MM/YYYY HH:mm:ss",
      value_type: "volume",
      unit: "m3",
      column_mapping: {
        meter_ref: "Ouvrage",
        ts: "Horodatage",
        value: "Valeur",
      },
    } satisfies ReadingsMappingConfig,
  },
  ewebtel_plum: {
    source_type: "ewebtel_plum",
    cible: "readings",
    config: {
      delimiter: ",",
      encoding: "utf-8",
      header_row: 1,
      date_format: "YYYY-MM-DD HH:mm:ss",
      value_type: "index",
      unit: "L",
      rollover_digits: 8,
      column_mapping: {
        meter_ref: "Device ID",
        ts: "Timestamp",
        value: "Reading",
      },
    } satisfies ReadingsMappingConfig,
  },
  kamstrup_ready: {
    source_type: "kamstrup_ready",
    cible: "readings",
    config: {
      delimiter: ",",
      encoding: "utf-8",
      header_row: 1,
      date_format: "YYYY-MM-DDTHH:mm:ss",
      value_type: "volume",
      unit: "m3",
      column_mapping: {
        meter_ref: "Meter Number",
        ts: "Date/Time",
        value: "Consumption (m3)",
      },
    } satisfies ReadingsMappingConfig,
  },
  diehl_izarnet: {
    source_type: "diehl_izarnet",
    cible: "readings",
    config: {
      delimiter: ";",
      encoding: "utf-8",
      header_row: 1,
      date_format: "DD.MM.YYYY HH:mm",
      value_type: "index",
      unit: "L",
      rollover_digits: 8,
      column_mapping: {
        meter_ref: "Serial Number",
        ts: "Reading Date",
        value: "Index Value",
      },
    } satisfies ReadingsMappingConfig,
  },
  itron_temetra: {
    source_type: "itron_temetra",
    cible: "readings",
    config: {
      delimiter: ",",
      encoding: "utf-8",
      header_row: 1,
      date_format: "YYYY-MM-DD HH:mm:ss",
      value_type: "index",
      unit: "L",
      rollover_digits: 9,
      column_mapping: {
        meter_ref: "Device Reference",
        ts: "Reading Date",
        value: "Cumulative Volume (L)",
      },
    } satisfies ReadingsMappingConfig,
  },
  jvs_facturation: {
    source_type: "jvs_facturation",
    cible: "balance_inputs",
    config: {
      delimiter: ";",
      encoding: "iso-8859-1",
      header_row: 1,
      column_mapping: {
        commune: "Commune",
        annee: "Exercice",
        volume_comptabilise: "Volume facture (m3)",
        nb_abonnes: "Nombre abonnes",
      },
    } satisfies BalanceInputsMappingConfig,
  },
} as const;
