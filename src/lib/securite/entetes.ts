// En-têtes de sécurité de toutes les réponses (plan, phase G10), posés par
// next.config.ts. Sans nonce : les pages sont rendues à la demande mais la
// marque blanche et Recharts écrivent des styles en ligne, et Next insère
// des scripts en ligne ; 'unsafe-inline' reste donc nécessaire, compensé
// par l'absence de tout contenu HTML fourni par les utilisateurs.
// Aucun import : ce fichier est lu par next.config.ts.

const TURNSTILE = "https://challenges.cloudflare.com";

export interface OptionsEntetes {
  /** NEXT_PUBLIC_SUPABASE_URL : appels du navigateur (connexion, dépôt des logos et photos). */
  supabaseUrl: string | undefined;
  /** Développement : React a besoin de 'unsafe-eval', et pas de HSTS sur localhost. */
  developpement: boolean;
}

function origine(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function politiqueContenu({ supabaseUrl, developpement }: OptionsEntetes): string {
  const supabase = origine(supabaseUrl);
  const tempsReel = supabase ? supabase.replace(/^http/, "ws") : null;
  const directives: [string, (string | null | false)[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", "'unsafe-inline'", developpement && "'unsafe-eval'", TURNSTILE]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    // Logos des marques (stockage Supabase ou adresse https du partenaire).
    ["img-src", ["'self'", "data:", "blob:", "https:"]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", ["'self'", supabase, tempsReel, TURNSTILE]],
    ["frame-src", [TURNSTILE]],
    ["worker-src", ["'self'", "blob:"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];
  const texte = directives
    .map(([nom, valeurs]) => `${nom} ${valeurs.filter(Boolean).join(" ")}`)
    .join("; ");
  return developpement ? texte : `${texte}; upgrade-insecure-requests`;
}

export function entetesSecurite(options: OptionsEntetes): { key: string; value: string }[] {
  const entetes = [
    { key: "Content-Security-Policy", value: politiqueContenu(options) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Appareil photo : photo du compteur pendant la pose.
    {
      key: "Permissions-Policy",
      value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ];
  if (!options.developpement) {
    entetes.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  }
  return entetes;
}
