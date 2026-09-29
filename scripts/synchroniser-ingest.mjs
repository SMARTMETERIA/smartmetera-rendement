// Recopie les modules de réception testés (src/lib/ingest) dans la
// fonction Supabase (supabase/functions/ingest/lib), en ajoutant
// l'extension « .ts » aux imports relatifs comme l'exige Deno.
// Usage : node scripts/synchroniser-ingest.mjs
// Le test src/test/ingest-synchro.test.ts échoue si les copies divergent.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const racine = path.resolve(import.meta.dirname, "..");
const source = path.join(racine, "src/lib/ingest");
const cible = path.join(racine, "supabase/functions/ingest/lib");

// Modules propres à l'application (non utilisés par la fonction).
const EXCLUS = new Set(["exemples.ts", "token.ts", "webhookUrl.ts"]);

export function versDeno(contenu) {
  return contenu.replace(
    /(from\s+["'])(\.{1,2}\/[^"']+?)(["'])/g,
    (tout, avant, chemin, apres) =>
      chemin.endsWith(".ts") ? tout : `${avant}${chemin}.ts${apres}`,
  );
}

export function modulesAReproduire(dossier = source, relatif = "") {
  return readdirSync(dossier).flatMap((nom) => {
    const complet = path.join(dossier, nom);
    const rel = relatif ? `${relatif}/${nom}` : nom;
    if (statSync(complet).isDirectory()) return modulesAReproduire(complet, rel);
    if (!nom.endsWith(".ts") || nom.endsWith(".test.ts") || EXCLUS.has(rel)) return [];
    return [rel];
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  for (const rel of modulesAReproduire()) {
    const destination = path.join(cible, rel);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, versDeno(readFileSync(path.join(source, rel), "utf8")));
    console.log(`copié : ${rel}`);
  }
}
