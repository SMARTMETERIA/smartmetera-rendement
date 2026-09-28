import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { TABLES_EXPORTEES, nomFichierExport } from "./exportOrganisation";

/**
 * L'export complet précède toute suppression d'organisation : une table
 * oubliée dans la liste, ce sont des données perdues sans trace. Chaque
 * table créée par les migrations avec une colonne organization_id doit y
 * figurer.
 */

const dossier = path.resolve(
  import.meta.dirname,
  "../../../supabase/migrations",
);
const sql = readdirSync(dossier)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(path.join(dossier, f), "utf8"))
  .join("\n")
  .replace(/--.*$/gm, "");

const tablesAvecOrganisation = [
  ...sql.matchAll(/create table public\.(\w+)\s*\(([\s\S]*?)\n\)/gi),
]
  .filter((m) => /\borganization_id\b/.test(m[2]))
  .map((m) => m[1]);

describe("export d'organisation", () => {
  it("trouve les tables des migrations", () => {
    expect(tablesAvecOrganisation).toContain("readings");
    expect(tablesAvecOrganisation).toContain("sites");
    expect(tablesAvecOrganisation).toContain("leak_events");
  });

  it.each(tablesAvecOrganisation)("exporte %s", (table) => {
    expect(TABLES_EXPORTEES.map((t) => t.table)).toContain(table);
  });

  it("n'exporte aucune table deux fois", () => {
    const noms = TABLES_EXPORTEES.map((t) => t.table);
    expect(new Set(noms).size).toBe(noms.length);
  });

  it("nomme le fichier avec le slug et la date", () => {
    expect(
      nomFichierExport("hotels-atlas", new Date("2026-09-28T10:00:00Z")),
    ).toBe("export-hotels-atlas-2026-09-28.ndjson");
  });
});
