import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv } from "./parseCsv";
import { transformReadings } from "./transformReadings";
import { transformBalanceInputs } from "./transformBalanceInputs";
import { SYSTEM_TEMPLATES } from "./systemTemplates";
import type { ReadingsMappingConfig } from "./types";

const SAMPLES_DIR = path.resolve(
  import.meta.dirname,
  "../../../supabase/sample-imports",
);

function loadSample(name: string): string {
  return readFileSync(path.join(SAMPLES_DIR, `${name}.csv`), "utf-8");
}

describe("modèles système — parsing des fichiers d'exemple", () => {
  it("générique : volume direct, deux compteurs, 4 relevés chacun", () => {
    const { config } = SYSTEM_TEMPLATES.generique;
    const table = parseCsv(
      loadSample("generique"),
      config.delimiter,
      config.header_row,
    );
    const result = transformReadings(table, config);

    expect(result.errorRows).toHaveLength(0);
    expect(result.readings).toHaveLength(8);
    expect(result.readings.every((r) => r.qualityFlag === "valide")).toBe(true);
    expect(result.readings[0]).toMatchObject({
      meterRef: "PROD-001",
      volumeM3: 191.4,
    });
  });

  it("Topkapi : index m³, nombre décimal à virgule, delta négatif inexpliqué flaggé suspect", () => {
    const { config } = SYSTEM_TEMPLATES.topkapi;
    const table = parseCsv(
      loadSample("topkapi"),
      config.delimiter,
      config.header_row,
    );
    const result = transformReadings(table, config);

    expect(result.errorRows).toHaveLength(0);
    // SECT-01-A : 4 relevés -> 1 ignoré (premier point), 3 deltas.
    const sect1a = result.readings.filter((r) => r.meterRef === "SECT-01-A");
    expect(sect1a).toHaveLength(3);
    expect(sect1a[0].volumeM3).toBeCloseTo(60.7, 5); // 125491.2 - 125430.5
    expect(sect1a[1].volumeM3).toBeCloseTo(50.6, 5); // 125541.8 - 125491.2
    // La 4e ligne revient à l'index initial : pas un rollover plausible (seuil bien plus haut) -> suspect.
    expect(sect1a[2].qualityFlag).toBe("suspecte");
    expect(sect1a[2].volumeM3).toBe(0);
  });

  it("Sofrel S4W : volume direct, virgule décimale, point-virgule", () => {
    const { config } = SYSTEM_TEMPLATES.sofrel_s4w;
    const table = parseCsv(
      loadSample("sofrel_s4w"),
      config.delimiter,
      config.header_row,
    );
    const result = transformReadings(table, config);

    expect(result.errorRows).toHaveLength(0);
    expect(result.readings).toHaveLength(6);
    expect(result.readings[0].volumeM3).toBeCloseTo(56.1, 5);
  });

  it("EWEBTEL (Plum) : index en litres, rollover détecté et corrigé", () => {
    const { config } = SYSTEM_TEMPLATES.ewebtel_plum;
    const table = parseCsv(
      loadSample("ewebtel_plum"),
      config.delimiter,
      config.header_row,
    );
    const result = transformReadings(table, config);

    expect(result.errorRows).toHaveLength(0);
    const d01 = result.readings.filter((r) => r.meterRef === "D-PLUM-01");
    expect(d01).toHaveLength(2);
    expect(d01[0].qualityFlag).toBe("valide");
    expect(d01[0].volumeM3).toBeCloseTo(0.4, 5); // (99999900-99999500)/1000
    expect(d01[1].qualityFlag).toBe("corrigee");
    expect(d01[1].volumeM3).toBeCloseTo(0.6, 5); // rollover : (1e5 - 99999.9) + 0.5
  });

  it("Kamstrup READy : volume direct, format ISO T", () => {
    const { config } = SYSTEM_TEMPLATES.kamstrup_ready;
    const table = parseCsv(
      loadSample("kamstrup_ready"),
      config.delimiter,
      config.header_row,
    );
    const result = transformReadings(table, config);

    expect(result.errorRows).toHaveLength(0);
    expect(result.readings).toHaveLength(6);
  });

  it("Diehl IZAR@NET : index en litres, format date à points", () => {
    const { config } = SYSTEM_TEMPLATES.diehl_izarnet;
    const table = parseCsv(
      loadSample("diehl_izarnet"),
      config.delimiter,
      config.header_row,
    );
    const result = transformReadings(table, config);

    expect(result.errorRows).toHaveLength(0);
    const prod1 = result.readings.filter((r) => r.meterRef === "PROD-001");
    expect(prod1).toHaveLength(2);
    expect(prod1.every((r) => r.qualityFlag === "valide")).toBe(true);
  });

  it("Itron Temetra : index en litres, rollover_digits élevé", () => {
    const { config } = SYSTEM_TEMPLATES.itron_temetra;
    const table = parseCsv(
      loadSample("itron_temetra"),
      config.delimiter,
      config.header_row,
    );
    const result = transformReadings(table, config);

    expect(result.errorRows).toHaveLength(0);
    expect(result.readings.every((r) => r.qualityFlag === "valide")).toBe(true);
  });

  it("Export facturation JVS : agrège plusieurs communes par exercice dans balance_inputs", () => {
    const { config } = SYSTEM_TEMPLATES.jvs_facturation;
    const table = parseCsv(
      loadSample("jvs_facturation"),
      config.delimiter,
      config.header_row,
    );
    const result = transformBalanceInputs(table, config);

    expect(result.errorRows).toHaveLength(0);
    expect(result.byYear.get(2025)).toEqual({
      volumeComptabilise: 2435000,
      nbAbonnes: 20000,
    });
    expect(result.byYear.get(2026)).toEqual({
      volumeComptabilise: 2455000,
      nbAbonnes: 20150,
    });
  });
});

describe("transformReadings — validations", () => {
  const baseConfig: ReadingsMappingConfig = {
    delimiter: ",",
    encoding: "utf-8",
    header_row: 1,
    date_format: "YYYY-MM-DD HH:mm:ss",
    value_type: "volume",
    unit: "m3",
    column_mapping: { meter_ref: "compteur", ts: "date", value: "volume" },
  };

  it("rejette une ligne avec identifiant compteur manquant", () => {
    const csv = "compteur,date,volume\n,2026-01-01 00:00:00,10\n";
    const table = parseCsv(csv, ",", 1);
    const result = transformReadings(table, baseConfig);
    expect(result.readings).toHaveLength(0);
    expect(result.errorRows[0].reason).toMatch(/manquant/);
  });

  it("rejette une date illisible", () => {
    const csv = "compteur,date,volume\nC1,pas-une-date,10\n";
    const table = parseCsv(csv, ",", 1);
    const result = transformReadings(table, baseConfig);
    expect(result.errorRows[0].reason).toMatch(/Date illisible/);
  });

  it("rejette une valeur négative", () => {
    const csv = "compteur,date,volume\nC1,2026-01-01 00:00:00,-5\n";
    const table = parseCsv(csv, ",", 1);
    const result = transformReadings(table, baseConfig);
    expect(result.errorRows[0].reason).toMatch(/négative/);
  });

  it("convertit les litres en m³", () => {
    const csv = "compteur,date,volume\nC1,2026-01-01 00:00:00,1500\n";
    const table = parseCsv(csv, ",", 1);
    const result = transformReadings(table, { ...baseConfig, unit: "L" });
    expect(result.readings[0].volumeM3).toBe(1.5);
  });
});
