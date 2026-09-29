import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  modulesAReproduire,
  versDeno,
} from "../../scripts/synchroniser-ingest.mjs";

/**
 * La fonction de réception (Deno) embarque une copie des modules testés de
 * src/lib/ingest. Ce test échoue si une copie manque ou diverge : lancer
 * « node scripts/synchroniser-ingest.mjs » puis redéployer la fonction.
 */
const racine = path.resolve(import.meta.dirname, "../..");
const modules: string[] = modulesAReproduire();

describe("copie des modules de réception dans la fonction Supabase", () => {
  it("trouve les modules", () => {
    expect(modules).toContain("decoders/adeunisPulseMqtt.ts");
    expect(modules).toContain("envelopes/mqtt.ts");
  });

  it.each(modules)("%s est à jour", (rel) => {
    const deno = path.join(racine, "supabase/functions/ingest/lib", rel);
    expect(existsSync(deno), `${rel} absent de la fonction`).toBe(true);
    const attendu = versDeno(
      readFileSync(path.join(racine, "src/lib/ingest", rel), "utf8"),
    );
    expect(readFileSync(deno, "utf8").replace(/\r\n/g, "\n")).toBe(
      attendu.replace(/\r\n/g, "\n"),
    );
  });
});
