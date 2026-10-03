// Réponses de Rayan du 3 octobre 2026 (docs/A_FAIRE_RAYAN.md) : marque et
// nom du produit, tarifs EUR, MAD et USD (pas de facturation en francs
// congolais), capteur de niveau, pilote (abonnement offert), montants de la
// page preuve, du pré-diagnostic et de l'export d'usage dans les trois
// monnaies.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { usageMensuel, partOfferte, type SiteUsage } from "./usage";
import { prediagnostic, tarifsPrediagnostic, validerPrediagnostic, vuePrediagnostic } from "./prediagnostic";
import { trouverModele, MODELES_CAPTEURS } from "./modeles";
import { retenueSourceParDefaut } from "./pays";
import {
  contenuPagePreuve,
  coutService,
  monnaieFacturation,
  type FuiteSource,
  type SiteRapport,
  type Tarifs,
} from "@/lib/gardien-rapports/contenus";
import { vuePreuve } from "@/lib/gardien-rapports/affichage";
import { MARQUE_PLATEFORME, NOM_PRODUIT, marqueDepuisBranding } from "@/lib/marque";
import { emailHtml, emailTexte } from "@/lib/gardien-envois/gabarit";
import { messagesTest } from "@/lib/gardien-envois/messageTest";
import { canalRelance } from "@/lib/gardien-envois/destinataires";

const texte = (s: string) => s.replace(/[  ]/g, " ");
const racine = path.resolve(import.meta.dirname, "../../..");
const MIGRATION = readFileSync(path.join(racine, "supabase/migrations/0056_decisions_rayan.sql"), "utf8");

/** Tarifs HT décidés par Rayan (EUR : plan ; MAD : D4 ; USD : D6 ; niveau : D8). */
const TARIFS: Record<string, Tarifs & { retenue_source_pct_defaut: number }> = {
  EUR: {
    mise_en_service_point: 349,
    mise_en_service_premier_point_passerelle: 590,
    abonnement_premier_point: 19,
    abonnement_point_supplementaire: 12,
    sonde_temperature_mois: 9,
    capteur_niveau_mise_en_service: 390,
    capteur_niveau_mois: 15,
    retenue_source_pct_defaut: 0,
  },
  MAD: {
    mise_en_service_point: 2900,
    mise_en_service_premier_point_passerelle: 6500,
    abonnement_premier_point: 150,
    abonnement_point_supplementaire: 100,
    sonde_temperature_mois: 80,
    capteur_niveau_mise_en_service: 4500,
    capteur_niveau_mois: 150,
    retenue_source_pct_defaut: 10,
  },
  USD: {
    mise_en_service_point: 450,
    mise_en_service_premier_point_passerelle: 900,
    abonnement_premier_point: 29,
    abonnement_point_supplementaire: 19,
    sonde_temperature_mois: 12,
    capteur_niveau_mise_en_service: 550,
    capteur_niveau_mois: 25,
    retenue_source_pct_defaut: 0,
  },
};

const site = (p: Partial<SiteUsage>): SiteUsage => ({
  id: "s",
  nom: "Hôtel",
  monnaie: "EUR",
  surcharges: null,
  avecPasserelle: false,
  poses: [],
  sondes: 0,
  pilote: false,
  ...p,
});
const octobre = { debutMois: "2026-10-01", finMois: "2026-11-01", tarifs: TARIFS, remiseFondateurPct: 0 };

describe("tarifs saisis dans les réglages de plateforme (migration 0056)", () => {
  it.each(["MAD", "USD"])("%s : chaque tarif décidé est dans la migration", (monnaie) => {
    const debut = MIGRATION.indexOf(`'${monnaie}', jsonb_build_object(`);
    const bloc = MIGRATION.slice(debut, MIGRATION.indexOf("\n  )", debut));
    for (const [cle, valeur] of Object.entries(TARIFS[monnaie])) {
      expect(bloc, `${monnaie}.${cle}`).toContain(`'${cle}', ${valeur}`);
    }
  });

  it("capteur de niveau en euros, conservation 12 mois, abonnement offert en pilote, EM500-UDL", () => {
    expect(MIGRATION).toContain("'capteur_niveau_mise_en_service', 390");
    expect(MIGRATION).toContain("'capteur_niveau_mois', 15");
    expect(MIGRATION).toContain(`{"envois_mois": 12}`);
    expect(MIGRATION).toContain(`{"abonnement_offert": true}`);
    expect(MIGRATION).toContain(`"modele": "Milesight EM500-UDL", "champ": "distance", "unite": "mm"`);
    // Pas de facturation en francs congolais : la clé CDF est retirée.
    expect(MIGRATION).toContain("(value - 'CDF')");
  });

  it("retenue à la source par défaut : Maroc 10 %, RDC 0 %", () => {
    expect(retenueSourceParDefaut(TARIFS, "MA")).toBe(10);
    expect(retenueSourceParDefaut(TARIFS, "CD")).toBe(0);
    expect(retenueSourceParDefaut(TARIFS, "FR")).toBe(0);
  });
});

describe("export d'usage dans les trois monnaies", () => {
  it("Maroc : passerelle, 3 points, une sonde, retenue de 10 %", () => {
    const [u] = usageMensuel({
      ...octobre,
      retenuePct: 10,
      sites: [site({ monnaie: "MAD", avecPasserelle: true, sondes: 1, poses: ["2026-10-05T08:00:00Z", "2026-10-05T09:00:00Z", "2026-10-05T10:00:00Z"] })],
    });
    // 6 500 + 2 × 2 900 de mise en service ; 150 + 2 × 100 + 80 par mois.
    expect(u).toMatchObject({ monnaie: "MAD", brut: 12730, ht: 12730, retenue: 1273, net: 11457, incomplet: false });
  });

  it("RDC : un site en francs congolais est facturé en dollars avec le site en dollars", () => {
    const usages = usageMensuel({
      ...octobre,
      retenuePct: 0,
      sites: [
        site({ id: "a", nom: "Hôtel du Fleuve", monnaie: "USD", avecPasserelle: true, poses: ["2026-10-02T08:00:00Z", "2026-10-02T09:00:00Z"] }),
        site({ id: "b", nom: "Mine", monnaie: "CDF", poses: ["2026-09-10T08:00:00Z"] }),
      ],
    });
    expect(usages.map((u) => u.monnaie)).toEqual(["USD"]);
    // 900 + 450 + 29 + 19 (Kinshasa) ; 29 (Likasi, posé en septembre).
    expect(usages[0]).toMatchObject({ brut: 1427, ht: 1427, retenue: 0, net: 1427, incomplet: false, pointsActifs: 3 });
    expect(monnaieFacturation("CDF")).toBe("USD");
    expect(monnaieFacturation("MAD")).toBe("MAD");
  });

  it("capteur de niveau : mise en service le mois de sa première mesure, puis abonnement", () => {
    const [eur] = usageMensuel({
      ...octobre,
      retenuePct: 0,
      sites: [site({ poses: ["2026-09-01T08:00:00Z"], niveaux: ["2026-10-03T12:00:00Z"] })],
    });
    expect(eur).toMatchObject({ capteursNiveau: 1, brut: 19 + 15 + 390, incomplet: false });
    expect(eur.lignes.map((l) => l.libelle)).toContain("Hôtel : mise en service, capteur de niveau");
    const [mad] = usageMensuel({
      ...octobre,
      debutMois: "2026-11-01",
      finMois: "2026-12-01",
      retenuePct: 0,
      sites: [site({ monnaie: "MAD", poses: ["2026-09-01T08:00:00Z"], niveaux: ["2026-10-03T12:00:00Z"] })],
    });
    expect(mad).toMatchObject({ monnaie: "MAD", brut: 150 + 150, capteursNiveau: 1 });
    const [usd] = usageMensuel({ ...octobre, retenuePct: 0, sites: [site({ monnaie: "USD", poses: ["2026-09-01T08:00:00Z"], niveaux: ["2026-10-03T12:00:00Z"] })] });
    expect(usd).toMatchObject({ monnaie: "USD", brut: 29 + 25 + 550 });
  });

  it("pilote : mise en service facturée, abonnement offert jusqu'à la conversion", () => {
    const poses = ["2026-09-10T09:00:00Z", "2026-09-10T09:30:00Z"];
    const enCours = [{ debut: "2026-09-10T08:00:00Z", fin: null }];
    const [septembre] = usageMensuel({
      ...octobre,
      debutMois: "2026-09-01",
      finMois: "2026-10-01",
      retenuePct: 0,
      sites: [site({ poses, pilote: true, periodesPilote: enCours })],
    });
    // 2 × 349 de mise en service ; 19 + 12 d'abonnement entièrement offerts.
    expect(septembre).toMatchObject({ brut: 698, ht: 698 });
    expect(septembre.lignes.at(-1)).toMatchObject({ libelle: "Hôtel : abonnement offert pendant le pilote", montant: -31 });

    // Pas encore converti en octobre : rien n'est facturé sans accord écrit.
    const [attente] = usageMensuel({ ...octobre, retenuePct: 0, sites: [site({ poses, pilote: true, periodesPilote: enCours })] });
    expect(attente.ht).toBe(0);

    // Converti le 10 octobre : 9 jours offerts sur 31.
    const converti = [{ debut: "2026-09-10T08:00:00Z", fin: "2026-10-10T08:00:00Z" }];
    const [apres] = usageMensuel({ ...octobre, retenuePct: 0, sites: [site({ poses, periodesPilote: converti })] });
    expect(apres.ht).toBe(22);
    expect(apres.lignes.at(-1)?.libelle).toBe("Hôtel : abonnement offert pendant le pilote (9 jours sur 31)");

    // Réglage désactivé : abonnement facturé.
    const [sansOffre] = usageMensuel({
      ...octobre,
      debutMois: "2026-09-01",
      finMois: "2026-10-01",
      retenuePct: 0,
      abonnementOffertPilote: false,
      sites: [site({ poses, periodesPilote: enCours })],
    });
    expect(sansOffre.ht).toBe(729);
  });

  it("part offerte : comptée depuis la première pose, jamais au-delà du mois", () => {
    expect(partOfferte("2026-09-01", "2026-10-01", "2026-09-10T09:00:00Z", [{ debut: "2026-09-10T08:00:00Z", fin: null }])).toEqual({ jours: 21, sur: 21 });
    expect(partOfferte("2026-09-01", "2026-10-01", "2026-08-01T00:00:00Z", [{ debut: "2026-09-21T00:00:00Z", fin: null }])).toEqual({ jours: 10, sur: 30 });
    expect(partOfferte("2026-09-01", "2026-10-01", null, [{ debut: "2026-07-01T00:00:00Z", fin: "2026-08-01T00:00:00Z" }])).toBeNull();
  });
});

describe("page preuve : coût du service dans les trois monnaies", () => {
  const siteRapport = (monnaie: SiteRapport["monnaie"], pays: string): SiteRapport => ({
    id: "s1",
    nom: "Hôtel",
    type: "hotel",
    ville: null,
    pays,
    monnaie,
    fuseau: "Europe/Paris",
    prixM3: 4.5,
    uniteActivite: "nuitee",
  });
  const reparee: FuiteSource = {
    id: "f1",
    type: "fuite_nuit",
    zone: "Cuisine",
    statut: "reparee",
    detecteeMs: 0,
    repareeMs: 2 * 86_400_000,
    excesLph: 25,
    economieM3: 18,
    economieMontant: 81,
  };
  const preuve = (monnaie: SiteRapport["monnaie"], pays: string, p: { nbPoints: number; nbSondes?: number; nbNiveaux?: number; avecPasserelle?: boolean }) => {
    const mf = monnaieFacturation(monnaie);
    const cout = coutService({
      tarifs: TARIFS[mf],
      nbPoints: p.nbPoints,
      nbSondes: p.nbSondes ?? 0,
      nbNiveaux: p.nbNiveaux ?? 0,
      avecPasserelle: p.avecPasserelle ?? false,
      remiseFondateurPct: 0,
      nuiteesMois: null,
      monnaie: mf,
    });
    const c = contenuPagePreuve({
      site: siteRapport(monnaie, pays),
      debut: "2026-09-01",
      fin: "2026-09-30",
      joursSurveillance: 30,
      fuites: [reparee],
      finMs: 30 * 86_400_000,
      delaiJours: 30,
      cout,
      courbe: [],
    });
    const vue = vuePreuve(c);
    const bloc = (titre: string) => vue.blocs.find((b) => b.titre === titre)?.lignes?.map(([l, v]) => [l, texte(v)]);
    return { c, vue, bloc };
  };

  it("euros : point et capteur de niveau, retour sur investissement", () => {
    const { c, bloc } = preuve("EUR", "FR", { nbPoints: 1, nbNiveaux: 1 });
    expect(c.coutService).toMatchObject({ mensuel: 34, parJour: 1.12, miseEnService: 739, monnaie: "EUR" });
    expect(bloc("Coût du service")).toEqual([["Par jour", "1,12 €"], ["Par mois (hors taxes)", "34,00 €"]]);
    expect(c.retour.jours).not.toBeNull();
    expect(bloc("Retour sur investissement")?.[1][1]).toMatch(/ €$/);
  });

  it("dirhams : passerelle, 3 points, une sonde", () => {
    const { c, bloc } = preuve("MAD", "MA", { nbPoints: 3, nbSondes: 1, avecPasserelle: true });
    expect(c.coutService).toMatchObject({ mensuel: 430, parJour: 14.14, miseEnService: 12300 });
    expect(bloc("Coût du service")).toEqual([["Par jour", "14,14 MAD"], ["Par mois (hors taxes)", "430,00 MAD"]]);
    expect(texte(c.phrase)).toContain("pour un service à 14,14 MAD par jour");
  });

  it("dollars : passerelle, 2 points", () => {
    const { c, bloc } = preuve("USD", "CD", { nbPoints: 2, avecPasserelle: true });
    expect(c.coutService).toMatchObject({ mensuel: 48, parJour: 1.58, miseEnService: 1350 });
    expect(bloc("Coût du service")).toEqual([["Par jour", "1,58 USD"], ["Par mois (hors taxes)", "48,00 USD"]]);
    expect(c.retour.jours).not.toBeNull();
  });

  it("francs congolais : service en dollars, aucun retour sur investissement (pas de taux de change)", () => {
    const { c, bloc } = preuve("CDF", "CD", { nbPoints: 2, avecPasserelle: true });
    expect(bloc("Coût du service")?.[0]).toEqual(["Par jour", "1,58 USD"]);
    expect(c.retour).toEqual({ jours: null, coutEngage: null });
    expect(texte(c.phrase)).toContain("81 CDF évités");
    expect(texte(c.phrase)).toContain("pour un service à 1,58 USD par jour");
  });
});

describe("pré-diagnostic dans les trois monnaies", () => {
  const calcul = (entree: Record<string, unknown>) => {
    const v = validerPrediagnostic({ etablissement: "Hôtel", ...entree });
    if (!v.ok) throw new Error(v.erreur);
    const r = prediagnostic(v.entree, tarifsPrediagnostic(TARIFS, v.entree.monnaie));
    return { r, vue: vuePrediagnostic(v.entree, r) };
  };
  const service = (vue: ReturnType<typeof calcul>["vue"]) =>
    vue.blocs.find((b) => b.titre === "Le service de surveillance")?.lignes?.map(([l, v]) => [l, texte(v)]);

  it("euros", () => {
    const { r, vue } = calcul({ pays: "FR", prixM3: "4,89", nbPoints: "1" });
    expect(r.service).toMatchObject({ mensuel: 19, parJour: 0.62, miseEnService: 349 });
    expect(service(vue)).toContainEqual(["Par jour", "0,62 €"]);
  });

  it("dirhams", () => {
    const { r, vue } = calcul({ pays: "MA", prixM3: "10", nbPoints: "1" });
    expect(r.chasse).toMatchObject({ parJour: 6, parAn: 2190 });
    expect(r.service).toMatchObject({ mensuel: 150, parJour: 4.93, miseEnService: 2900 });
    expect(service(vue)).toContainEqual(["Mise en service (une fois)", "2 900,00 MAD"]);
    expect(texte(r.phrase)).toContain("La surveillance coûte 4,93 MAD par jour");
  });

  it("dollars", () => {
    const { r, vue } = calcul({ pays: "CD", monnaie: "USD", prixM3: "2", nbPoints: "2" });
    expect(r.service).toMatchObject({ mensuel: 48, parJour: 1.58, miseEnService: 900 });
    expect(service(vue)).toContainEqual(["Par mois (hors taxes)", "48,00 USD"]);
  });

  it("francs congolais : fuites en CDF, service en dollars", () => {
    const { r, vue } = calcul({ pays: "CD", monnaie: "CDF", prixM3: "3500", nbPoints: "1" });
    expect(r.monnaieService).toBe("USD");
    expect(texte(r.phrase)).toContain("CDF par an");
    expect(texte(r.phrase)).toContain("La surveillance coûte 0,95 USD par jour");
    expect(service(vue)).toContainEqual(["Par jour", "0,95 USD"]);
  });
});

describe("marque : Gardien de l'eau by SmartMeteria", () => {
  it("nom du produit, expéditeur, adresse de réponse, logo à fournir", () => {
    expect(NOM_PRODUIT).toBe("Gardien de l'eau by SmartMeteria");
    expect(MARQUE_PLATEFORME).toMatchObject({
      nom: NOM_PRODUIT,
      expediteur: "SmartMeteria",
      repondreA: "contact@smartmeteria.com",
      logoUrl: null,
    });
    // Un partenaire sans adresse de réponse : le contact SmartMeteria.
    expect(marqueDepuisBranding("Camping", null).repondreA).toBe("contact@smartmeteria.com");
    expect(
      marqueDepuisBranding("Camping", { display_name: "Camping", primary_color: null, logo_path: null, legal_footer: null, show_powered_by: true, reply_to_email: "a@camping.fr" }).repondreA,
    ).toBe("a@camping.fr");
  });

  it("en-tête des e-mails, objet, SMS et appel", () => {
    expect(emailHtml(MARQUE_PLATEFORME, "Titre", [])).toContain("Gardien de l'eau by SmartMeteria");
    expect(emailTexte(MARQUE_PLATEFORME, "Titre", [])).toMatch(/Gardien de l'eau by SmartMeteria$/);
    const [email, sms, appel] = messagesTest(
      MARQUE_PLATEFORME,
      { email: "rayan@exemple.fr", telephone: "+33612345678", canaux: ["email", "sms", "appel"] },
      "https://app.smartmeteria.com",
    );
    expect(email.sujet).toBe("Message de test — Gardien de l'eau by SmartMeteria");
    expect(sms.texte).toMatch(/^SmartMeteria : /);
    expect(appel.texte).toMatch(/^Bonjour, ici SmartMeteria\./);
  });

  it("aucune trace de l'ancienne orthographe dans le dépôt", () => {
    const ancienne = new RegExp("smart" + "metera", "i");
    const fichiers: string[] = [];
    const parcourir = (dossier: string) => {
      for (const nom of readdirSync(dossier)) {
        if (nom === "node_modules" || nom === ".next" || nom.startsWith(".git")) continue;
        const complet = path.join(dossier, nom);
        if (statSync(complet).isDirectory()) parcourir(complet);
        else if (/\.(ts|tsx|mjs|js|sql|md|json|css|example|toml|yml|yaml)$/.test(nom)) fichiers.push(complet);
      }
    };
    for (const d of ["src", "supabase", "docs", "scripts", "infra", "public"]) parcourir(path.join(racine, d));
    for (const f of ["README.md", "CLAUDE.md", "AGENTS.md", ".env.example", "package.json"]) fichiers.push(path.join(racine, f));
    const traces = fichiers.filter((f) => ancienne.test(readFileSync(f, "utf8"))).map((f) => path.relative(racine, f));
    expect(traces).toEqual([]);
  });
});

describe("matériel et relances", () => {
  it("EM300-DI : émission toutes les 60 minutes ; capteur de niveau : Milesight EM500-UDL", () => {
    expect(MODELES_CAPTEURS.milesight_em300_di.intervalleEmissionS).toBe(3600);
    expect(MODELES_CAPTEURS.capteur_niveau.libelle).toBe("Milesight EM500-UDL");
    expect(trouverModele("Milesight EM500-UDL")).toBe("capteur_niveau");
    expect(trouverModele("EM500 UDL")).toBe("capteur_niveau");
    expect(trouverModele("Milesight EM300-DI")).toBe("milesight_em300_di");
  });

  it("relance par WhatsApp au Maroc et en RDC, appel en France", () => {
    expect(canalRelance("CD")).toBe("whatsapp");
    expect(canalRelance("MA")).toBe("whatsapp");
    expect(canalRelance("FR")).toBe("appel");
  });
});
