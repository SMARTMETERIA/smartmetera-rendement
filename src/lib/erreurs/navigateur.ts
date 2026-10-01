// Erreurs du navigateur : envoyées à /api/erreurs (même origine, clé Sentry
// jamais exposée), qui masque puis transmet à Sentry. Au plus 5 par page,
// chacune une seule fois, et seulement en production.

const deja = new Set<string>();
const MAX_PAR_PAGE = 5;

export function envoyerErreurNavigateur(erreur: unknown): void {
  if (process.env.NODE_ENV !== "production" || typeof window === "undefined") return;
  try {
    const e = erreur instanceof Error ? erreur : new Error(typeof erreur === "string" ? erreur : "Erreur inconnue");
    const digest = (e as Error & { digest?: string }).digest;
    const cle = `${e.name}:${e.message}`;
    if (deja.has(cle) || deja.size >= MAX_PAR_PAGE) return;
    deja.add(cle);
    const corps = JSON.stringify({
      type: e.name,
      message: `${e.message}${digest ? ` (digest ${digest})` : ""}`.slice(0, 2000),
      pile: e.stack?.slice(0, 8000),
      chemin: window.location.pathname,
    });
    const envoye =
      typeof navigator.sendBeacon === "function" &&
      navigator.sendBeacon("/api/erreurs", new Blob([corps], { type: "application/json" }));
    if (!envoye) {
      void fetch("/api/erreurs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: corps,
        keepalive: true,
      }).catch(() => undefined);
    }
  } catch {
    // Le signalement ne doit jamais provoquer d'autre erreur.
  }
}
