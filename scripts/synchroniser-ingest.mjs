// Recopie les modules testés utilisés par les fonctions Supabase (Deno) :
// réception (src/lib/ingest → supabase/functions/ingest/lib), moteur du
// Gardien (src/lib/moteur-gardien → supabase/functions/gardien-moteur/lib)
// et envois du Gardien (supabase/functions/gardien-envois/lib, avec la même
// arborescence que src/lib pour garder les imports relatifs), en ajoutant
// l'extension « .ts » aux imports relatifs comme l'exige Deno.
// Usage : node scripts/synchroniser-ingest.mjs
// Le test src/test/ingest-synchro.test.ts échoue si les copies divergent.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const racine = path.resolve(import.meta.dirname, "..");
const ENVOIS = "supabase/functions/gardien-envois/lib";

/** source : dossier ou fichier ; cible : même nature. */
export const COPIES = [
  {
    source: "src/lib/ingest",
    cible: "supabase/functions/ingest/lib",
    // Modules propres à l'application (non utilisés par la fonction).
    exclus: new Set(["exemples.ts", "token.ts", "webhookUrl.ts"]),
  },
  { source: "src/lib/moteur-gardien", cible: "supabase/functions/gardien-moteur/lib", exclus: new Set() },
  { source: "src/lib/marque.ts", cible: `${ENVOIS}/marque.ts`, exclus: new Set() },
  { source: "src/lib/email/expediteur.ts", cible: `${ENVOIS}/email/expediteur.ts`, exclus: new Set() },
  { source: "src/lib/moteur-gardien", cible: `${ENVOIS}/moteur-gardien`, exclus: new Set() },
  { source: "src/lib/gardien-envois", cible: `${ENVOIS}/gardien-envois`, exclus: new Set() },
  { source: "src/lib/gardien-rapports", cible: `${ENVOIS}/gardien-rapports`, exclus: new Set() },
];

export function versDeno(contenu) {
  return contenu.replace(
    /(from\s+["'])(\.{1,2}\/[^"']+?)(["'])/g,
    (tout, avant, chemin, apres) =>
      chemin.endsWith(".ts") ? tout : `${avant}${chemin}.ts${apres}`,
  );
}

/** Dossiers source et cible d'une copie (le dossier parent pour un fichier). */
export function dossiers(copie) {
  const source = path.join(racine, copie.source);
  return statSync(source).isFile()
    ? { source: path.dirname(source), cible: path.join(racine, path.dirname(copie.cible)) }
    : { source, cible: path.join(racine, copie.cible) };
}

export function modulesAReproduire(copie = COPIES[0], dossier, relatif = "") {
  const source = path.join(racine, copie.source);
  if (!dossier && statSync(source).isFile()) return [path.basename(source)];
  const base = dossier ?? source;
  return readdirSync(base).flatMap((nom) => {
    const complet = path.join(base, nom);
    const rel = relatif ? `${relatif}/${nom}` : nom;
    if (statSync(complet).isDirectory()) return modulesAReproduire(copie, complet, rel);
    if (!nom.endsWith(".ts") || nom.endsWith(".test.ts") || copie.exclus.has(rel)) return [];
    return [rel];
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  for (const copie of COPIES) {
    const { source, cible } = dossiers(copie);
    for (const rel of modulesAReproduire(copie)) {
      const destination = path.join(cible, rel);
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, versDeno(readFileSync(path.join(source, rel), "utf8")));
      console.log(`copié : ${path.relative(racine, destination)}`);
    }
  }
}
