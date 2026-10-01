import { describe, expect, it, vi } from "vitest";
import {
  cadresDepuisPile,
  cheminSansParametres,
  decrireErreur,
  enveloppe,
  evenementSentry,
  lireDsn,
  masquer,
  signalerErreur,
} from "./sentry";

const DSN = "https://abc123cle@o42.ingest.de.sentry.io/4507";

describe("adresse Sentry (DSN)", () => {
  it("donne l'adresse d'envoi et la clé publique", () => {
    expect(lireDsn(DSN)).toEqual({
      url: "https://o42.ingest.de.sentry.io/api/4507/envelope/",
      cle: "abc123cle",
      brut: DSN,
    });
  });

  it("refuse une adresse absente, non chiffrée ou incomplète", () => {
    expect(lireDsn(undefined)).toBeNull();
    expect(lireDsn("")).toBeNull();
    expect(lireDsn("http://cle@o42.ingest.sentry.io/1")).toBeNull();
    expect(lireDsn("https://o42.ingest.sentry.io/1")).toBeNull();
    expect(lireDsn("https://cle@o42.ingest.sentry.io/projet")).toBeNull();
    expect(lireDsn("pas une adresse")).toBeNull();
  });
});

describe("masquage des données personnelles", () => {
  it("masque les adresses e-mail, les téléphones et les jetons", () => {
    const texte = masquer(
      "Échec pour marie.durand+test@hotel-atlas.ma (+212 6 12 34 56 78, 06 12 34 56 78) avec Bearer abc.def et eyJhbGciOi.eyJzdWIi.c2lnbmF0dXJl",
    );
    expect(texte).not.toContain("marie");
    expect(texte).not.toContain("12 34");
    expect(texte).not.toContain("abc.def");
    expect(texte).not.toContain("eyJ");
    expect(texte).toContain("[e-mail]");
    expect(texte).toContain("[téléphone]");
    expect(texte).toContain("Bearer [jeton]");
  });

  it("masque le jeton d'une page preuve mais garde les identifiants et les noms du code", () => {
    const jeton = "3f9a2c7e1b5d4a8f9e0c3b2a1d4e5f6a7b8c9d0e1f2a3b4c";
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    expect(cheminSansParametres(`https://app.smartmeteria.com/preuve/${jeton}?utm=x`)).toBe("/preuve/[jeton]");
    expect(cheminSansParametres(`/sites/${uuid}?email=a@b.fr`)).toBe(`/sites/${uuid}`);
    expect(masquer("envois_objet_objet_id_etape_canal_destinataire_key")).toBe(
      "envois_objet_objet_id_etape_canal_destinataire_key",
    );
  });
});

describe("pile d'appels", () => {
  it("lit les piles V8 et Firefox, l'appel le plus ancien en premier", () => {
    const pile = [
      "TypeError: x is undefined",
      "    at calculer (https://app.smartmeteria.com/_next/static/chunks/app-page.js?v=1:10:20)",
      "    at async Page (/var/task/.next/server/app/sites/page.js:3:4)",
      "rendre@https://app.smartmeteria.com/_next/static/chunks/main.js:5:6",
    ].join("\n");
    const cadres = cadresDepuisPile(pile);
    expect(cadres.map((c) => c.function)).toEqual(["rendre", "async Page", "calculer"]);
    expect(cadres[2]).toMatchObject({ filename: "/_next/static/chunks/app-page.js", lineno: 10, colno: 20, in_app: true });
    expect(cadres[0].in_app).toBe(false);
  });
});

describe("événement envoyé", () => {
  it("ne contient ni utilisateur, ni adresse IP, ni paramètres, et seulement organization_id comme appartenance", () => {
    const erreur = new Error("Aucun site pour jean@exemple.fr");
    const evenement = evenementSentry(
      decrireErreur(erreur),
      {
        origine: "serveur",
        chemin: "/sites/alertes?telephone=0612345678",
        methode: "POST",
        environnement: "production",
        version: "abc123",
        organizationId: "123e4567-e89b-12d3-a456-426614174000",
        etiquettes: { route: "/(espace)/sites/alertes", type: "render" },
      },
      Date.UTC(2026, 8, 29),
      "0".repeat(32),
    );
    const texte = JSON.stringify(evenement);
    expect(texte).not.toContain("jean");
    expect(texte).not.toContain("0612345678");
    expect(evenement).not.toHaveProperty("user");
    expect(evenement).toMatchObject({
      level: "error",
      platform: "node",
      environment: "production",
      release: "abc123",
      request: { url: "/sites/alertes", method: "POST" },
      tags: {
        origine: "serveur",
        organization_id: "123e4567-e89b-12d3-a456-426614174000",
        route: "/(espace)/sites/alertes",
      },
    });
  });

  it("ignore une étiquette organization_id qui n'est pas un identifiant", () => {
    const evenement = evenementSentry(
      { type: "Error", message: "x" },
      { origine: "navigateur", environnement: "production", organizationId: "Hôtel Atlas" },
      0,
      "1".repeat(32),
    );
    expect(evenement.tags).toEqual({ origine: "navigateur" });
  });

  it("forme une enveloppe de trois lignes JSON", () => {
    const dsn = lireDsn(DSN)!;
    const lignes = enveloppe({ event_id: "e".repeat(32) }, dsn, 0).split("\n").map((l) => JSON.parse(l));
    expect(lignes[0]).toMatchObject({ event_id: "e".repeat(32), dsn: DSN });
    expect(lignes[1]).toEqual({ type: "event" });
  });
});

describe("envoi", () => {
  it("n'envoie rien sans DSN", async () => {
    const recuperer = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
    expect(await signalerErreur(new Error("x"), { origine: "serveur", environnement: "test" }, { dsn: "", recuperer })).toBe(false);
    expect(recuperer).not.toHaveBeenCalled();
  });

  it("envoie à Sentry avec l'en-tête d'authentification, et ne lève jamais", async () => {
    const recuperer = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response("{}", { status: 200 }));
    expect(await signalerErreur(new Error("x"), { origine: "serveur", environnement: "test" }, { dsn: DSN, recuperer })).toBe(true);
    const [url, init] = recuperer.mock.calls[0];
    expect(url).toBe("https://o42.ingest.de.sentry.io/api/4507/envelope/");
    expect((init.headers as Record<string, string>)["X-Sentry-Auth"]).toContain("sentry_key=abc123cle");

    const enPanne = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => {
      throw new Error("réseau");
    });
    expect(await signalerErreur(new Error("x"), { origine: "serveur", environnement: "test" }, { dsn: DSN, recuperer: enPanne })).toBe(false);
  });
});
