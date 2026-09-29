// Recopie les modules testés utilisés par les fonctions Supabase (Deno) :
// réception (src/lib/ingest → supabase/functions/ingest/lib) et moteur du
// Gardien (src/lib/moteur-gardien → supabase/functions/gardien-moteur/lib),
// en ajoutant l'extension « .ts » aux imports relatifs comme l'exige Deno.
// Usage : node scripts/synchroniser-ingest.mjs
// Le test src/test/ingest-synchro.test.ts échoue si les copies divergent.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const racine = path.resolve(import.meta.dirname, "..");

export const COPIES = [
  {
    source: "src/lib/ingest",
    cible: "supabase/functions/ingest/lib",
    // Modules propres à l'application (non utilisés par la fonction).
    exclus: new Set(["exemples.ts", "token.ts", "webhookUrl.ts"]),
  },
  {
    source: "src/lib/moteur-gardien",
    cible: "supabase/functions/gardien-moteur/lib",
    exclus: new Set(),
  },
];

export function versDeno(contenu) {
  return contenu.replace(
    /(from\s+["'])(\.{1,2}\/[^"']+?)(["'])/g,
    (tout, avant, chemin, apres) =>
      chemin.endsWith(".ts") ? tout : `${avant}${chemin}.ts${apres}`,
  );
}

export function modulesAReproduire(copie = COPIES[0], dossier, relatif = "") {
  const base = dossier ?? path.join(racine, copie.source);
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
    for (const rel of modulesAReproduire(copie)) {
      const destination = path.join(racine, copie.cible, rel);
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, versDeno(readFileSync(path.join(racine, copie.source, rel), "utf8")));
      console.log(`copié : ${copie.cible}/${rel}`);
    }
  }
}
