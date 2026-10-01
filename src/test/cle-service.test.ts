import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * La clé service_role ne doit jamais atteindre le navigateur (plan, phase
 * G10). Depuis chaque composant client (« use client »), on suit les
 * imports du code (sauf les actions serveur « use server », qui restent sur
 * le serveur) : aucun ne doit mener au client service_role ni lire la clé.
 * Et aucune variable publique (NEXT_PUBLIC_…) ne porte de secret.
 */

const racine = path.resolve(import.meta.dirname, "../..");
const src = path.join(racine, "src");

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = path.join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    return /\.(ts|tsx)$/.test(nom) && !/\.test\.tsx?$/.test(nom) ? [chemin] : [];
  });
}

const directive = (texte: string, nom: string) =>
  new RegExp(`^(\\s|//[^\\n]*\\n|/\\*[\\s\\S]*?\\*/)*["']${nom}["']`).test(texte);

function resoudre(depuis: string, specifiant: string): string | null {
  const base = specifiant.startsWith("@/")
    ? path.join(src, specifiant.slice(2))
    : specifiant.startsWith(".")
      ? path.resolve(path.dirname(depuis), specifiant)
      : null;
  if (!base) return null;
  for (const candidat of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (existsSync(candidat) && statSync(candidat).isFile()) return candidat;
  }
  return null;
}

function importsDuCode(fichier: string, texte: string): string[] {
  const resultat: string[] = [];
  const motif = /(?:import|export)\s+(type\s+)?(?:[\w*{}\s,$]+\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  for (const m of texte.matchAll(motif)) {
    if (m[1]) continue;
    const cible = resoudre(fichier, m[2] ?? m[3]);
    if (cible) resultat.push(cible);
  }
  return resultat;
}

const ADMIN = path.join(src, "lib", "supabase", "admin.ts");

describe("clé service_role côté serveur uniquement", () => {
  const tous = fichiers(src);
  const textes = new Map(tous.map((f) => [f, readFileSync(f, "utf8")]));

  it("aucun composant client ne mène au client service_role ni ne lit la clé", () => {
    const fautifs: string[] = [];
    for (const [fichier, texte] of textes) {
      if (!directive(texte, "use client")) continue;
      const vus = new Set<string>();
      const pile: string[][] = [[fichier]];
      while (pile.length) {
        const chemin = pile.pop()!;
        const courant = chemin[chemin.length - 1];
        if (vus.has(courant)) continue;
        vus.add(courant);
        const contenu = textes.get(courant) ?? "";
        if (courant !== fichier && directive(contenu, "use server")) continue;
        if (courant === ADMIN || /SUPABASE_SERVICE_ROLE_KEY/.test(contenu)) {
          fautifs.push(chemin.map((c) => path.relative(racine, c)).join(" → "));
          continue;
        }
        for (const suivant of importsDuCode(courant, contenu)) pile.push([...chemin, suivant]);
      }
    }
    expect(fautifs).toEqual([]);
  });

  it("aucune variable publique ne porte de secret", () => {
    const sources = [...textes.values(), readFileSync(path.join(racine, ".env.example"), "utf8")];
    const publiques = new Set(sources.flatMap((t) => t.match(/NEXT_PUBLIC_[A-Z0-9_]+/g) ?? []));
    expect([...publiques].filter((v) => /SERVICE|SECRET|PRIVATE|API_KEY|DSN|TOKEN/.test(v))).toEqual([]);
  });
});
