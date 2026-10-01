// Signalement des erreurs à Sentry sans données personnelles (plan, phase
// G10), sans dépendance : les événements sont envoyés directement à
// l'adresse « envelope » de Sentry (format public, documenté par Sentry).
// Pourquoi pas @sentry/nextjs : une dépendance lourde (instrumentation
// complète, dizaines de paquets) pour un besoin limité aux erreurs ; ici on
// contrôle exactement ce qui part. Limite : pas d'envoi des « source maps »,
// les piles du navigateur restent minifiées (voir docs/BLOCKERS.md).
//
// Ce qui part : type et message de l'erreur, pile (fichiers et lignes),
// chemin de la page sans paramètres, méthode, environnement, version.
// Ce qui est masqué : adresses e-mail, numéros de téléphone, jetons
// (JWT, clés, jetons de pages preuve), paramètres d'adresse. Aucune
// adresse IP, aucun cookie, aucun en-tête, aucun utilisateur. Seule
// étiquette d'appartenance permise : organization_id.

export interface Dsn {
  url: string;
  cle: string;
  brut: string;
}

export function lireDsn(dsn: string | undefined | null): Dsn | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn.trim());
    const projet = u.pathname.replace(/^\/+|\/+$/g, "");
    if (u.protocol !== "https:" || !u.username || !/^\d+$/.test(projet)) return null;
    return { url: `https://${u.host}/api/${projet}/envelope/`, cle: u.username, brut: dsn.trim() };
  } catch {
    return null;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;

/** Jeton : longue suite de lettres ET de chiffres (les identifiants longs du code n'ont pas de chiffres). */
function jeton(m: string): string {
  return UUID.test(m) || !/\d/.test(m) || !/[A-Za-z]/.test(m) ? m : "[jeton]";
}

export function masquer(texte: string): string {
  return texte
    .replace(EMAIL, "[e-mail]")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[jeton]")
    .replace(/\b(Bearer|Basic)\s+[\w.~+/=-]+/gi, "$1 [jeton]")
    .replace(/(\+|\b00)\d[\d .-]{7,}\d/g, "[téléphone]")
    .replace(/\b0[1-9](?:[ .-]?\d{2}){4}\b/g, "[téléphone]")
    .replace(/[A-Za-z0-9_-]{24,}/g, jeton);
}

function sansDomaineNiParametres(adresse: string): string {
  return adresse.replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/)[0] || "/";
}

export function cheminSansParametres(chemin: string): string {
  return masquer(sansDomaineNiParametres(chemin));
}

export interface Cadre {
  filename: string;
  function: string;
  lineno?: number;
  colno?: number;
  in_app: boolean;
}

/** Piles V8 (« at f (fichier:ligne:colonne) ») et Firefox/Safari (« f@fichier:ligne:colonne »). */
export function cadresDepuisPile(pile: string | undefined): Cadre[] {
  if (!pile) return [];
  const cadres: Cadre[] = [];
  for (const ligne of pile.split("\n").slice(0, 60)) {
    const v8 = ligne.match(/^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/);
    const autre = v8 ? null : ligne.match(/^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/);
    const m = v8 ?? autre;
    if (!m) continue;
    // Noms de fichiers : seules les adresses e-mail sont masquées (les noms
    // des morceaux de code contiennent des empreintes qui ne sont pas des jetons).
    const fichier = sansDomaineNiParametres(m[2]).replace(EMAIL, "[e-mail]");
    cadres.push({
      filename: fichier,
      function: (m[1] || "?").replace(EMAIL, "[e-mail]").slice(0, 200),
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: !/node_modules|\/_next\/static\/chunks\/(framework|main|webpack)/.test(fichier),
    });
  }
  // Sentry attend l'appel le plus ancien en premier.
  return cadres.reverse();
}

export interface DescriptionErreur {
  type: string;
  message: string;
  pile?: string;
}

export function decrireErreur(erreur: unknown): DescriptionErreur {
  if (erreur instanceof Error) {
    const digest = (erreur as Error & { digest?: unknown }).digest;
    return {
      type: erreur.name || "Error",
      message: `${erreur.message}${typeof digest === "string" ? ` (digest ${digest})` : ""}`,
      pile: erreur.stack,
    };
  }
  return { type: "Erreur", message: typeof erreur === "string" ? erreur : JSON.stringify(erreur) ?? String(erreur) };
}

export interface ContexteErreur {
  origine: "serveur" | "navigateur";
  chemin?: string;
  methode?: string;
  environnement: string;
  version?: string | null;
  organizationId?: string | null;
  etiquettes?: Record<string, string | undefined>;
}

export function evenementSentry(
  erreur: DescriptionErreur,
  contexte: ContexteErreur,
  maintenantMs: number,
  idEvenement: string,
): Record<string, unknown> {
  const etiquettes: Record<string, string> = { origine: contexte.origine };
  for (const [cle, v] of Object.entries(contexte.etiquettes ?? {})) {
    if (v) etiquettes[cle] = masquer(v).slice(0, 200);
  }
  if (contexte.organizationId && UUID.test(contexte.organizationId)) {
    etiquettes.organization_id = contexte.organizationId;
  }
  const cadres = cadresDepuisPile(erreur.pile);
  return {
    event_id: idEvenement,
    timestamp: maintenantMs / 1000,
    platform: contexte.origine === "serveur" ? "node" : "javascript",
    level: "error",
    environment: contexte.environnement,
    ...(contexte.version ? { release: contexte.version } : {}),
    tags: etiquettes,
    ...(contexte.chemin
      ? { request: { url: cheminSansParametres(contexte.chemin), method: contexte.methode ?? "GET" } }
      : {}),
    exception: {
      values: [
        {
          type: masquer(erreur.type).slice(0, 100),
          value: masquer(erreur.message).slice(0, 2000),
          ...(cadres.length ? { stacktrace: { frames: cadres } } : {}),
        },
      ],
    },
  };
}

export function enveloppe(evenement: Record<string, unknown>, dsn: Dsn, maintenantMs: number): string {
  return [
    JSON.stringify({ event_id: evenement.event_id, sent_at: new Date(maintenantMs).toISOString(), dsn: dsn.brut }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(evenement),
  ].join("\n");
}

type Recuperer = (url: string, init: RequestInit) => Promise<Response>;

function nouvelId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

/** Envoie l'erreur si SENTRY_DSN est renseignée ; ne lève jamais. */
export async function signalerErreur(
  erreur: unknown,
  contexte: ContexteErreur,
  options: { dsn?: string | null; recuperer?: Recuperer; maintenantMs?: number } = {},
): Promise<boolean> {
  const dsn = lireDsn(options.dsn ?? process.env.SENTRY_DSN);
  if (!dsn) return false;
  const maintenantMs = options.maintenantMs ?? Date.now();
  try {
    const evenement = evenementSentry(decrireErreur(erreur), contexte, maintenantMs, nouvelId());
    const reponse = await (options.recuperer ?? fetch)(dsn.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.cle}, sentry_client=smartmeteria/1.0`,
      },
      body: enveloppe(evenement, dsn, maintenantMs),
    });
    return reponse.ok;
  } catch {
    return false;
  }
}

export function environnementCourant(): string {
  return process.env.SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
}

export function versionCourante(): string | null {
  return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null;
}
