import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CONTRASTE_MINIMUM, rapportContraste } from "@/lib/marque";

/**
 * Thème de base (docs/DESIGN.md) : chaque texte posé sur son fond atteint
 * le contraste AA de 4,5:1. Lit les variables de :root dans globals.css.
 */
const css = readFileSync(path.resolve(import.meta.dirname, "../app/globals.css"), "utf8");
const racine = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
const variables = Object.fromEntries(
  [...racine.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(([, nom, valeur]) => [nom, valeur]),
);
const BLANC = "#ffffff";

describe("contraste du thème de base", () => {
  it.each([
    ["foreground", BLANC],
    ["muted-foreground", BLANC],
    ["muted-foreground", "muted"],
    ["foreground", "muted"],
    ["secondary-foreground", "secondary"],
    ["accent-foreground", "accent"],
    ["primary", BLANC],
  ])("%s sur %s", (texte, fond) => {
    const couleurTexte = variables[texte];
    const couleurFond = fond.startsWith("#") ? fond : variables[fond];
    expect(couleurTexte, `variable --${texte}`).toBeDefined();
    expect(couleurFond, `variable --${fond}`).toBeDefined();
    expect(rapportContraste(couleurTexte, couleurFond)).toBeGreaterThanOrEqual(CONTRASTE_MINIMUM);
  });

  it("palette SmartMeteria", () => {
    expect(variables.primary.toLowerCase()).toBe("#1b4f8a");
    expect(variables["accent-marque"].toLowerCase()).toBe("#0fa3a3");
    expect(variables.foreground.toLowerCase()).toBe("#0a2540");
  });
});
