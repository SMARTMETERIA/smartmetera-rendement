import { describe, expect, it } from "vitest";
import { entetesSecurite, politiqueContenu } from "./entetes";

const URL_SUPABASE = "https://abcdefgh.supabase.co";

const valeur = (dev: boolean, cle: string) =>
  entetesSecurite({ supabaseUrl: URL_SUPABASE, developpement: dev }).find((e) => e.key === cle)?.value;

describe("en-têtes de sécurité", () => {
  it("interdit l'affichage dans un cadre et les objets", () => {
    const csp = politiqueContenu({ supabaseUrl: URL_SUPABASE, developpement: false });
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(valeur(false, "X-Frame-Options")).toBe("DENY");
  });

  it("autorise Supabase (https et temps réel) et la case anti-robot", () => {
    const csp = politiqueContenu({ supabaseUrl: `${URL_SUPABASE}/`, developpement: false });
    expect(csp).toMatch(/connect-src 'self' https:\/\/abcdefgh\.supabase\.co wss:\/\/abcdefgh\.supabase\.co https:\/\/challenges\.cloudflare\.com/);
    expect(csp).toContain("frame-src https://challenges.cloudflare.com");
    expect(csp).toMatch(/script-src [^;]*https:\/\/challenges\.cloudflare\.com/);
  });

  it("n'autorise eval qu'en développement ; HSTS et https forcé en production seulement", () => {
    expect(politiqueContenu({ supabaseUrl: URL_SUPABASE, developpement: true })).toContain("'unsafe-eval'");
    expect(politiqueContenu({ supabaseUrl: URL_SUPABASE, developpement: false })).not.toContain("'unsafe-eval'");
    expect(politiqueContenu({ supabaseUrl: URL_SUPABASE, developpement: false })).toContain("upgrade-insecure-requests");
    expect(valeur(false, "Strict-Transport-Security")).toContain("max-age=63072000");
    expect(valeur(true, "Strict-Transport-Security")).toBeUndefined();
  });

  it("reste valide sans adresse Supabase", () => {
    const csp = politiqueContenu({ supabaseUrl: undefined, developpement: false });
    expect(csp).toContain("connect-src 'self' https://challenges.cloudflare.com");
    expect(csp).not.toContain("null");
    expect(politiqueContenu({ supabaseUrl: "pas une adresse", developpement: false })).not.toContain("pas");
  });

  it("limite les autorisations du navigateur et la fuite de l'adresse d'origine", () => {
    expect(valeur(false, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(valeur(false, "Permissions-Policy")).toContain("camera=(self)");
    expect(valeur(false, "Permissions-Policy")).toContain("geolocation=()");
    expect(valeur(false, "X-Content-Type-Options")).toBe("nosniff");
  });
});
