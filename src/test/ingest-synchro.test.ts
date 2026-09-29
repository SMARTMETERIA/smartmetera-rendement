import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  COPIES,
  modulesAReproduire,
  versDeno,
} from "../../scripts/synchroniser-ingest.mjs";

/**
 * Les fonctions Deno (réception, moteur du Gardien) embarquent une copie
 * des modules testés. Ce test échoue si une copie manque ou diverge :
 * lancer « node scripts/synchroniser-ingest.mjs » puis redéployer.
 */
const racine = path.resolve(import.meta.dirname, "../..");

describe.each(COPIES)("copie de $source dans $cible", (copie) => {
  const modules: string[] = modulesAReproduire(copie);

  it("trouve les modules", () => {
    expect(modules.length).toBeGreaterThan(0);
  });

  it.each(modules)("%s est à jour", (rel) => {
    const deno = path.join(racine, copie.cible, rel);
    expect(existsSync(deno), `${rel} absent de la fonction`).toBe(true);
    const attendu = versDeno(readFileSync(path.join(racine, copie.source, rel), "utf8"));
    expect(readFileSync(deno, "utf8").replace(/\r\n/g, "\n")).toBe(
      attendu.replace(/\r\n/g, "\n"),
    );
  });
});

describe("modules attendus", () => {
  it("réception et moteur", () => {
    expect(modulesAReproduire(COPIES[0])).toContain("decoders/adeunisPulseMqtt.ts");
    expect(modulesAReproduire(COPIES[0])).toContain("envelopes/mqtt.ts");
    expect(modulesAReproduire(COPIES[1])).toContain("detection.ts");
    expect(modulesAReproduire(COPIES[1])).toContain("temps.ts");
  });
});
