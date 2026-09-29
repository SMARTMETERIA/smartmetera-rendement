import { describe, expect, it, vi } from "vitest";
import { configEnvois, notify, type Message } from "./notify";
import {
  canalRelance,
  clientDuSite,
  directeursDuSite,
  equipeDuSite,
  equipeOrganisation,
  etapesDues,
  responsablesAlerte,
  type Membre,
} from "./destinataires";
import { messageFuite, messageRapport } from "./messages";
import { MARQUE_PLATEFORME } from "../marque";

const texte = (s: string) => s.replace(/[  ]/g, " ");
const H = 3_600_000;

const email: Message = {
  canal: "email",
  destinataire: "tech@exemple.fr",
  sujet: "Fuite",
  texte: "Bonjour",
  html: "<p>Bonjour</p>",
  expediteur: "Camping Pro",
  repondreA: null,
};

describe("notify : rien de réel sans configuration explicite", () => {
  it("journal par défaut, même avec les clés Resend", () => {
    expect(configEnvois({}).mode).toBe("journal");
    expect(configEnvois({ RESEND_API_KEY: "k", RESEND_FROM_EMAIL: "a@b.fr" }).mode).toBe("journal");
    expect(configEnvois({ GARDIEN_ENVOIS_MODE: "reel" }).mode).toBe("journal");
    expect(
      configEnvois({ GARDIEN_ENVOIS_MODE: "redirection", RESEND_API_KEY: "k", RESEND_FROM_EMAIL: "a@b.fr" }).mode,
    ).toBe("journal");
  });

  it("journalise sans appeler personne", async () => {
    const recuperer = vi.fn();
    const r = await notify(email, configEnvois({}), recuperer);
    expect(r).toEqual({ mode: "journal", statut: "journalise", fournisseur: null, fournisseurId: null, erreur: null });
    expect(recuperer).not.toHaveBeenCalled();
  });

  it("SMS, appel et WhatsApp : journalisés tant qu'aucun fournisseur n'est choisi", async () => {
    const config = configEnvois({ GARDIEN_ENVOIS_MODE: "reel", RESEND_API_KEY: "k", RESEND_FROM_EMAIL: "a@b.fr" });
    const recuperer = vi.fn();
    for (const canal of ["sms", "appel", "whatsapp"] as const) {
      const r = await notify({ ...email, canal, destinataire: "+33612345678" }, config, recuperer);
      expect(r.statut).toBe("journalise");
      expect(r.erreur).toContain("TODO(RAYAN)");
    }
    expect(recuperer).not.toHaveBeenCalled();
  });

  it("redirection : tout part vers l'adresse de test", async () => {
    const recuperer = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      async () => new Response(JSON.stringify({ id: "abc" }), { status: 200 }),
    );
    const config = configEnvois({
      GARDIEN_ENVOIS_MODE: "redirection",
      GARDIEN_EMAIL_REDIRECT: "test@exemple.fr",
      RESEND_API_KEY: "k",
      RESEND_FROM_EMAIL: "SmartMeteria <alertes@exemple.fr>",
    });
    const r = await notify(email, config, recuperer);
    expect(r).toMatchObject({ mode: "redirection", statut: "envoye", fournisseurId: "abc" });
    const corps = JSON.parse(recuperer.mock.calls[0][1].body as string);
    expect(corps.to).toEqual(["test@exemple.fr"]);
    expect(corps.subject).toBe("[Test, pour tech@exemple.fr] Fuite");
    expect(corps.from).toBe('"Camping Pro" <alertes@exemple.fr>');
  });

  it("réel : échec signalé sans exception", async () => {
    const recuperer = vi.fn(async () => new Response("non", { status: 500 }));
    const config = configEnvois({ GARDIEN_ENVOIS_MODE: "reel", RESEND_API_KEY: "k", RESEND_FROM_EMAIL: "a@b.fr" });
    expect(await notify(email, config, recuperer)).toMatchObject({ statut: "echec", erreur: "Resend a répondu 500." });
  });
});

describe("destinataires et escalade", () => {
  const m = (userId: string, role: string, portee: "organisation" | "site", siteId: string | null = null): Membre => ({
    userId,
    email: `${userId}@exemple.fr`,
    telephone: null,
    role,
    portee,
    siteId,
  });
  const membres = [
    m("admin", "admin_client", "organisation"),
    m("agent", "agent", "organisation"),
    m("lecteur", "lecteur", "organisation"),
    m("tech", "technicien", "organisation"),
    m("techA", "technicien", "site", "A"),
    m("dirA", "directeur_site", "site", "A"),
    m("dirB", "directeur_site", "site", "B"),
  ];
  const ids = (liste: Membre[]) => liste.map((x) => x.userId).sort();

  it("alerte au technicien, sinon à l'administrateur et à l'agent ; jamais au lecteur", () => {
    expect(ids(responsablesAlerte(membres, "A"))).toEqual(["tech", "techA"]);
    expect(ids(responsablesAlerte(membres, "B"))).toEqual(["tech"]);
    const sansTech = membres.filter((x) => x.role !== "technicien");
    expect(ids(responsablesAlerte(sansTech, "A"))).toEqual(["admin", "agent"]);
  });

  it("escalade au directeur du site, sinon à l'administrateur", () => {
    expect(ids(directeursDuSite(membres, "A"))).toEqual(["dirA"]);
    expect(ids(directeursDuSite(membres, "C"))).toEqual(["admin"]);
    expect(ids(clientDuSite(membres, "B"))).toEqual(["admin", "dirB"]);
    expect(ids(equipeDuSite(membres, "A"))).toEqual(["dirA", "tech", "techA"]);
  });

  it("capteur muet : l'équipe de l'organisation, jamais le directeur", () => {
    expect(ids(equipeOrganisation(membres))).toEqual(["admin", "agent", "tech"]);
  });

  it("appel après 2 h, directeur après 12 h, rien une fois prise en charge", () => {
    const base = { detecteeMs: 0, appelH: 2, directeurH: 12 };
    expect(etapesDues({ ...base, statut: "ouverte", maintenantMs: H })).toEqual(["initial"]);
    expect(etapesDues({ ...base, statut: "ouverte", maintenantMs: 2 * H })).toEqual(["initial", "appel"]);
    expect(etapesDues({ ...base, statut: "ouverte", maintenantMs: 12 * H })).toEqual(["initial", "appel", "directeur"]);
    expect(etapesDues({ ...base, statut: "prise_en_compte", maintenantMs: 12 * H })).toEqual([]);
    expect(canalRelance("FR")).toBe("appel");
    expect(canalRelance("MA")).toBe("whatsapp");
  });
});

describe("messages", () => {
  const ctx = { marque: MARQUE_PLATEFORME, urlApp: "https://app.exemple.fr" };
  const fuite = {
    id: "f1",
    type: "fuite_nuit" as const,
    site: "Hôtel Atlas",
    zone: "Cuisine",
    fuseau: "Europe/Paris",
    detecteeMs: Date.UTC(2026, 8, 22, 4, 10),
    debutMs: Date.UTC(2026, 8, 21, 0, 0),
    excesLph: 25,
    prixM3: 4.89,
    monnaie: "EUR" as const,
    explication: null,
  };

  it("alerte fuite : coût par jour et par mois, lien « Je m'en occupe »", () => {
    const r = messageFuite(ctx, fuite, "initial", fuite.detecteeMs + 24 * H);
    expect(r.sujet).toBe("Fuite de nuit détectée : Hôtel Atlas, Cuisine");
    expect(texte(r.court)).toBe(
      "SmartMeteria : fuite de nuit à Hôtel Atlas, Cuisine, 25 L/h depuis 02:00. 2,93 € par jour, 88,02 € par mois si rien n'est fait. Je m'en occupe : https://app.exemple.fr/fuites/f1",
    );
    expect(texte(r.texte)).toContain("Coût depuis la détection : 2,93 €");
    expect(texte(r.texte)).toContain("Méthode prudente : 25,0 L/h d'excès mesuré × 4,89 €/m³");
    expect(r.texte).toContain("Surveillance fondée sur les données transmises par les capteurs.");
    expect(r.html).toContain("Je m'en occupe");
    expect(r.html).toContain('href="https://app.exemple.fr/fuites/f1"');
    expect(r.vocal).toContain("Personne ne l'a encore prise en charge");
  });

  it("au Maroc, en dirhams et à l'heure de Casablanca", () => {
    const r = messageFuite(
      ctx,
      { ...fuite, fuseau: "Africa/Casablanca", prixM3: 11.5, monnaie: "MAD" },
      "initial",
      fuite.detecteeMs,
    );
    // Le Maroc est à GMT+0 depuis le 20 septembre 2026 (base horaire 2026c).
    expect(texte(r.court)).toContain("depuis 00:00. 6,90 MAD par jour, 207,00 MAD par mois");
  });

  it("escalade au directeur", () => {
    const r = messageFuite(ctx, fuite, "directeur", fuite.detecteeMs + 12 * H);
    expect(r.sujet).toBe("Fuite sans prise en charge depuis 12 h : Hôtel Atlas, Cuisine");
  });

  it("annonce d'un rapport mensuel", () => {
    const r = messageRapport(ctx, {
      rapportId: "r1",
      type: "mensuel",
      site: "Hôtel Atlas",
      periode: "2026-09-01",
      resume: "Rien à signaler.",
    });
    expect(r.sujet).toBe("Rapport de septembre 2026 — Hôtel Atlas");
    expect(r.texte).toContain("https://app.exemple.fr/rapports/r1/pdf");
  });
});
