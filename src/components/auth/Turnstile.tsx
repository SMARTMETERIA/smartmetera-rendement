"use client";

import { useEffect, useRef } from "react";

interface TurnstileApi {
  render: (
    element: HTMLElement,
    options: { sitekey: string; language?: string; "response-field-name"?: string },
  ) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function chargerScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existant = document.getElementById(SCRIPT_ID);
    const script =
      (existant as HTMLScriptElement | null) ?? document.createElement("script");
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(), { once: true });
    if (!existant) {
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

/**
 * Case anti-robot Cloudflare Turnstile. Le jeton est ajouté au formulaire
 * dans le champ caché « cf-turnstile-response », vérifié côté serveur.
 * Rien n'est affiché sans NEXT_PUBLIC_TURNSTILE_SITE_KEY (développement).
 */
export function Turnstile() {
  const conteneur = useRef<HTMLDivElement>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey || !conteneur.current) return;
    let widgetId: string | null = null;
    let annule = false;
    chargerScript()
      .then(() => {
        if (annule || !conteneur.current || !window.turnstile) return;
        widgetId = window.turnstile.render(conteneur.current, {
          sitekey: siteKey,
          language: "fr",
        });
      })
      .catch(() => {
        // Le serveur refusera le formulaire sans jeton : message explicite.
      });
    return () => {
      annule = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  if (!siteKey) return null;
  return <div ref={conteneur} className="min-h-[65px]" />;
}
