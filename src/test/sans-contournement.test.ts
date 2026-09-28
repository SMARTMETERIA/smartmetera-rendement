import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Le compte « dev-superadmin » (mot de passe publié dans l'historique Git)
 * et la connexion automatique de développement ont été supprimés (phase 2
 * Immeuble, phase G2 Gardien). Ce test échoue si l'un d'eux réapparaît dans
 * le code, les scripts, les fonctions ou la configuration.
 *
 * Exceptions : la migration 0027 qui supprime le compte en base, et ce
 * fichier. La documentation (docs/) raconte l'historique et n'est pas lue.
 */

const racine = path.resolve(import.meta.dirname, "../..");

const MOTIFS = [
  /dev-superadmin/i,
  /DEV_AUTO_LOGIN/,
  /DevAutoLogin/,
  /create-dev-user/,
  /dev:seed-user/,
];

const EXCLUS = new Set([
  path.join("supabase", "migrations", "0027_roles_securite.sql"),
  path.join("src", "test", "sans-contournement.test.ts"),
]);

const DOSSIERS = ["src", "scripts", "supabase"];
const FICHIERS = [
  "package.json",
  ".env.example",
  "README.md",
  "next.config.ts",
  "AGENTS.md",
  "CLAUDE.md",
];
const EXTENSIONS = /\.(ts|tsx|js|mjs|cjs|sql|json|md|toml|sh)$/;

function lister(dossier: string): string[] {
  const complet = path.join(racine, dossier);
  let entrees: string[];
  try {
    entrees = readdirSync(complet);
  } catch {
    return [];
  }
  return entrees.flatMap((nom) => {
    const relatif = path.join(dossier, nom);
    if (nom === "node_modules" || nom.startsWith(".")) return [];
    return statSync(path.join(racine, relatif)).isDirectory()
      ? lister(relatif)
      : EXTENSIONS.test(nom)
        ? [relatif]
        : [];
  });
}

const fichiers = [
  ...DOSSIERS.flatMap(lister),
  ...FICHIERS.filter((f) => {
    try {
      return statSync(path.join(racine, f)).isFile();
    } catch {
      return false;
    }
  }),
].filter((f) => !EXCLUS.has(f));

describe("aucun contournement d'authentification", () => {
  it("parcourt le code", () => {
    expect(fichiers.length).toBeGreaterThan(50);
    expect(fichiers).toContain(path.join("src", "proxy.ts"));
  });

  it.each(fichiers)(
    "%s ne mentionne ni dev-superadmin ni connexion automatique",
    (f) => {
      const contenu = readFileSync(path.join(racine, f), "utf8");
      for (const motif of MOTIFS) {
        expect(contenu, `${f} contient ${motif}`).not.toMatch(motif);
      }
    },
  );
});
