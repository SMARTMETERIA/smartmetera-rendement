// Test de fumée après une mise en ligne (plan, phase G10).
//
//   npm run fumee -- https://app.smartmeteria.com
//
// Lecture seule : ne crée aucun compte, n'écrit rien en base, n'envoie
// aucun message (sauf --sentry, qui envoie une erreur de test à Sentry).
//
// 1. Site : pages publiques en français, page introuvable, page preuve au
//    lien invalide, espace protégé renvoyé vers la connexion.
// 2. Sécurité : en-têtes (CSP, HSTS, cadres interdits…), région Vercel cdg1.
// 3. Base (si NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY sont
//    connues) : un visiteur sans compte ne lit aucune donnée.
// 4. Compte (si FUMEE_EMAIL et FUMEE_MOT_DE_PASSE sont donnés) : connexion,
//    organisation visible ; pour un superadmin, tâches planifiées à l'heure.
//
// Variables lues dans l'environnement ou dans le fichier donné par
// --env <fichier> (par exemple .env.production.local, jamais versionné).
// Code de sortie 1 si une vérification échoue. Les étapes manuelles qui
// restent (inscription d'essai, pose, message de test, page preuve) sont
// rappelées à la fin : docs/A_FAIRE_RAYAN.md, point R9 « Test de fumée ».
import { createRequire } from "node:module";
import path from "node:path";

const racine = path.resolve(import.meta.dirname, "..");

// ---------------------------------------------------------------------------
// Vérifications pures (testées par src/test/test-fumee.test.ts)
// ---------------------------------------------------------------------------

/** En-têtes de sécurité attendus sur toute page (src/lib/securite/entetes.ts). */
export function verifierEntetes(entetes, https) {
  const lire = (cle) => entetes.get(cle) ?? "";
  const problemes = [];
  const csp = lire("content-security-policy");
  if (!csp.includes("frame-ancestors 'none'")) problemes.push("CSP absente ou sans frame-ancestors 'none'");
  if (csp.includes("'unsafe-eval'")) problemes.push("CSP de développement ('unsafe-eval') en ligne");
  if (lire("x-frame-options").toUpperCase() !== "DENY") problemes.push("X-Frame-Options différent de DENY");
  if (lire("x-content-type-options") !== "nosniff") problemes.push("X-Content-Type-Options absent");
  if (!lire("referrer-policy")) problemes.push("Referrer-Policy absente");
  if (!lire("permissions-policy").includes("geolocation=()")) problemes.push("Permissions-Policy absente");
  if (https && !lire("strict-transport-security").includes("max-age=")) problemes.push("HSTS absent");
  if (lire("x-powered-by")) problemes.push("X-Powered-By présent");
  return problemes;
}

/**
 * Région d'exécution d'après x-vercel-id (« cdg1::iad1::… » : point d'entrée,
 * puis région de la fonction ; « cdg1::… » pour une page statique).
 */
export function regionVercel(identifiant) {
  if (!identifiant) return null;
  const parties = identifiant.split("::").filter(Boolean);
  if (parties.length >= 3) return { entree: parties[0], fonction: parties[parties.length - 2] };
  return { entree: parties[0], fonction: null };
}

/** Tâches planifiées en retard d'après etat_taches_planifiees(). */
export function tachesEnRetard(etat, maintenantMs) {
  const attendues = { "gardien-moteur": 2 * 60, "gardien-envois": 45 };
  const problemes = [];
  const fonctions = new Map((etat?.fonctions ?? []).map((f) => [f.tache, f]));
  for (const [tache, minutes] of Object.entries(attendues)) {
    const f = fonctions.get(tache);
    if (!f?.dernier_debut) problemes.push(`${tache} : jamais passée`);
    else if (maintenantMs - Date.parse(f.dernier_debut) > minutes * 60_000) problemes.push(`${tache} : en retard`);
    else if (f.dernier_statut === "echec") problemes.push(`${tache} : dernier passage en échec`);
  }
  for (const c of etat?.cron ?? []) {
    if (c.active && c.dernier_statut === "failed") problemes.push(`${c.nom} : dernier passage pg_cron en échec`);
  }
  return problemes;
}

// ---------------------------------------------------------------------------
// Exécution
// ---------------------------------------------------------------------------

async function principal() {
  const args = process.argv.slice(2);
  const option = (nom) => {
    const i = args.indexOf(nom);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const fichierEnv = option("--env");
  if (fichierEnv) {
    const require = createRequire(path.join(racine, "package.json"));
    require("dotenv").config({ path: path.resolve(fichierEnv), quiet: true });
  }
  const base = (args.find((a) => /^https?:\/\//.test(a)) ?? process.env.FUMEE_URL ?? "").replace(/\/$/, "");
  if (!base) {
    console.error("Adresse du site manquante : npm run fumee -- https://app.smartmeteria.com");
    process.exit(2);
  }
  const https = base.startsWith("https://");
  let echecs = 0;
  let alertes = 0;
  const ok = (texte) => console.log(`  OK      ${texte}`);
  const ko = (texte) => {
    echecs++;
    console.log(`  ÉCHEC   ${texte}`);
  };
  const attention = (texte) => {
    alertes++;
    console.log(`  À VOIR  ${texte}`);
  };
  const recuperer = (chemin, init = {}) =>
    fetch(chemin.startsWith("http") ? chemin : `${base}${chemin}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
      ...init,
    });

  console.log(`Test de fumée : ${base}\n`);

  console.log("1. Site");
  const pages = [
    ["/", "Gardien de l'eau"],
    ["/connexion", "Connexion"],
    ["/inscription", "Créer un compte"],
    ["/mot-de-passe-oublie", "Mot de passe oublié"],
    ["/legal", "Informations légales"],
    ["/legal/cgv", "obligation de moyens"],
  ];
  let accueil = null;
  for (const [chemin, attendu] of pages) {
    try {
      const r = await recuperer(chemin);
      const texte = await r.text();
      if (chemin === "/") accueil = r;
      if (r.status !== 200) ko(`${chemin} : statut ${r.status}`);
      else if (!texte.includes('lang="fr"') || !texte.replace(/&#x27;|&#39;/g, "'").includes(attendu)) {
        ko(`${chemin} : texte attendu « ${attendu} » absent`);
      } else ok(`${chemin}`);
    } catch (e) {
      ko(`${chemin} : injoignable (${e.message})`);
    }
  }
  try {
    const r = await recuperer("/page-introuvable-test-de-fumee");
    const texte = await r.text();
    if (r.status === 404 && texte.includes("Page introuvable")) ok("page introuvable en français (404)");
    else ko(`page introuvable : statut ${r.status}`);
  } catch (e) {
    ko(`page introuvable : ${e.message}`);
  }
  try {
    const r = await recuperer(`/preuve/${"0".repeat(48)}`);
    const texte = await r.text();
    if (texte.includes("Lien expiré ou invalide")) ok("page preuve au lien invalide refusée");
    else ko("page preuve au lien invalide : message attendu absent");
  } catch (e) {
    ko(`page preuve : ${e.message}`);
  }
  try {
    const r = await recuperer("/sites");
    const cible = r.headers.get("location") ?? "";
    if (r.status >= 300 && r.status < 400 && cible.includes("/connexion")) ok("espace protégé : renvoi vers la connexion");
    else ko(`espace protégé sans connexion : statut ${r.status}${cible ? ` vers ${cible}` : ""}`);
  } catch (e) {
    ko(`espace protégé : ${e.message}`);
  }

  console.log("\n2. Sécurité et hébergement");
  if (accueil) {
    const problemes = verifierEntetes(accueil.headers, https);
    if (problemes.length) problemes.forEach((p) => ko(`en-têtes : ${p}`));
    else ok("en-têtes de sécurité");
  }
  if (!https) attention("le site n'est pas en https (normal seulement en local)");
  try {
    const r = await recuperer("/connexion");
    const region = regionVercel(r.headers.get("x-vercel-id"));
    if (!region) attention("hébergement hors Vercel (pas d'en-tête x-vercel-id) : région non vérifiée");
    else if (region.fonction && region.fonction !== "cdg1") ko(`région des fonctions : ${region.fonction} (attendu : cdg1)`);
    else if (region.fonction) ok("région des fonctions Vercel : cdg1 (Paris)");
    else attention(`région Vercel non visible (point d'entrée ${region.entree})`);
  } catch (e) {
    ko(`région : ${e.message}`);
  }
  try {
    const sentry = args.includes("--sentry");
    const r = await recuperer("/api/erreurs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        sentry
          ? { type: "TestDeFumee", message: "Test de fumée SmartMeteria (erreur volontaire)", chemin: "/test-de-fumee" }
          : {},
      ),
    });
    if (sentry) {
      if (r.status === 204) ok("erreur de test transmise : vérifiez qu'elle apparaît dans Sentry");
      else ko(`relais Sentry : statut ${r.status}`);
    } else if (r.status === 204) attention("Sentry inactif (SENTRY_DSN vide) ; relancez avec --sentry une fois la clé posée");
    else if (r.status === 400) ok("relais des erreurs actif (Sentry configuré)");
    else ko(`relais des erreurs : statut ${r.status}`);
  } catch (e) {
    ko(`relais des erreurs : ${e.message}`);
  }

  const urlSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  console.log("\n3. Base de données");
  if (!urlSupabase || !anon) {
    attention("NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY inconnues : vérifications sautées (--env)");
  } else {
    const rest = (chemin, jeton = anon) =>
      fetch(`${urlSupabase}${chemin}`, {
        headers: { apikey: anon, Authorization: `Bearer ${jeton}` },
        signal: AbortSignal.timeout(20_000),
      });
    for (const table of ["organizations", "sites", "readings", "envois", "memberships", "proof_pages"]) {
      try {
        const r = await rest(`/rest/v1/${table}?select=*&limit=1`);
        const corps = await r.json().catch(() => null);
        if (r.ok && Array.isArray(corps) && corps.length === 0) ok(`visiteur sans compte : ${table} illisible`);
        else if (!r.ok) ok(`visiteur sans compte : ${table} refusé (${r.status})`);
        else ko(`visiteur sans compte : ${table} LISIBLE`);
      } catch (e) {
        ko(`${table} : ${e.message}`);
      }
    }

    console.log("\n4. Compte de test");
    const email = process.env.FUMEE_EMAIL;
    const motDePasse = process.env.FUMEE_MOT_DE_PASSE;
    if (!email || !motDePasse) {
      attention("FUMEE_EMAIL et FUMEE_MOT_DE_PASSE absents : connexion non vérifiée");
    } else {
      try {
        const r = await fetch(`${urlSupabase}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: { apikey: anon, "Content-Type": "application/json" },
          body: JSON.stringify({ email, password: motDePasse }),
          signal: AbortSignal.timeout(20_000),
        });
        const session = await r.json().catch(() => ({}));
        if (!r.ok || !session.access_token) {
          ko(`connexion refusée (${r.status})`);
        } else {
          ok("connexion par mot de passe");
          const orgs = await (await rest("/rest/v1/organizations?select=id,nom&limit=5", session.access_token)).json();
          if (Array.isArray(orgs) && orgs.length) ok(`organisation visible : ${orgs.map((o) => o.nom).join(", ")}`);
          else attention("aucune organisation visible pour ce compte");
          const rpc = (nom) =>
            fetch(`${urlSupabase}/rest/v1/rpc/${nom}`, {
              method: "POST",
              headers: { apikey: anon, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
              body: "{}",
              signal: AbortSignal.timeout(20_000),
            });
          const estAdmin = await (await rpc("is_platform_admin")).json().catch(() => false);
          if (estAdmin === true) {
            const etat = await (await rpc("etat_taches_planifiees")).json();
            const problemes = tachesEnRetard(etat, Date.now());
            if (problemes.length) problemes.forEach((p) => ko(`tâches planifiées : ${p}`));
            else ok("tâches planifiées à l'heure (détection, envois)");
          } else {
            attention("compte non superadmin : état des tâches planifiées non vérifié");
          }
        }
      } catch (e) {
        ko(`compte de test : ${e.message}`);
      }
    }
  }

  console.log(`\nRésultat : ${echecs} échec(s), ${alertes} point(s) à regarder.`);
  console.log(`
Reste à faire à la main (docs/A_FAIRE_RAYAN.md, point R9 « Test de fumée ») :
  - créer un compte d'essai depuis /inscription avec une adresse de test ;
  - poser un capteur de test avec l'assistant (/pose) et attendre « données reçues » ;
  - espace superadmin > Surveillance > « Envoyer le message de test » vers votre téléphone ;
  - créer une page preuve et l'ouvrir dans une fenêtre privée.`);
  process.exit(echecs ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await principal();
}
