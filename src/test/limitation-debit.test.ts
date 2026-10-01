import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Limitation de débit (plan, phase G10) : toute route qui fabrique un
 * document (PDF), coûteux en calcul, et la page preuve publique passent par
 * le quota en base. Les routes réservées au superadmin en sont dispensées.
 */

const app = path.resolve(import.meta.dirname, "../app");

function routes(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = path.join(dossier, nom);
    if (statSync(chemin).isDirectory()) return routes(chemin);
    return nom === "route.ts" ? [chemin] : [];
  });
}

describe("limitation de débit", () => {
  it("chaque route qui produit un PDF est limitée", () => {
    const sansLimite = routes(app)
      .filter((f) => /application\/pdf/.test(readFileSync(f, "utf8")))
      .filter((f) => !/limiterDebit\(/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(app, f));
    expect(sansLimite).toEqual([]);
  });

  it("la page preuve publique est limitée par adresse IP", () => {
    const page = readFileSync(path.join(app, "preuve", "[token]", "page.tsx"), "utf8");
    expect(page).toMatch(/consommerQuota\(`preuve:ip:/);
  });

  it("les formulaires publics restent limités (inscription, lien, mot de passe oublié, erreurs)", () => {
    const actions = readFileSync(path.join(app, "(auth)", "actions.ts"), "utf8");
    expect(actions).toMatch(/consommerQuota\(`inscription:ip:/);
    expect(actions).toMatch(/consommerQuota\(`reinit:ip:/);
    expect(readFileSync(path.join(app, "api", "auth", "lien", "route.ts"), "utf8")).toMatch(/consommerQuota\(`lien:ip:/);
    expect(readFileSync(path.join(app, "api", "erreurs", "route.ts"), "utf8")).toMatch(/consommerQuota\(`erreurs:ip:/);
  });
});
