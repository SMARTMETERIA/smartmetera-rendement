import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Règle absolue (CLAUDE.md) : toute table métier a RLS activée et au moins
 * une politique. Vérification statique sur l'ensemble des migrations
 * versionnées, pour qu'un oubli dans une nouvelle migration casse les tests
 * avant d'atteindre la base.
 */

const dossier = path.resolve(import.meta.dirname, "../../supabase/migrations");
const sql = readdirSync(dossier)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(path.join(dossier, f), "utf8"))
  .join("\n")
  // Retire les commentaires SQL pour ne pas compter un gabarit commenté.
  .replace(/--.*$/gm, "");

const tables = [...sql.matchAll(/create table public\.(\w+)\s*\(/gi)].map(
  (m) => m[1],
);

describe("migrations : RLS sur chaque table", () => {
  it("trouve les tables des migrations", () => {
    expect(tables).toContain("readings");
    expect(tables).toContain("buildings");
    expect(tables).toContain("deliveries");
  });

  it.each(tables)("%s a RLS activée", (table) => {
    expect(sql).toMatch(
      new RegExp(
        `alter table public\\.${table} enable row level security`,
        "i",
      ),
    );
  });

  it.each(tables)("%s a au moins une politique", (table) => {
    expect(sql).toMatch(
      new RegExp(`create policy "[^"]+" on public\\.${table}\\b`, "i"),
    );
  });
});
