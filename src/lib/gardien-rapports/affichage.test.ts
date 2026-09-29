import { describe, expect, it } from "vitest";
import { vuePreuve, vueRapport } from "./affichage";
import {
  contenuFinPilote,
  contenuMensuel,
  contenuPagePreuve,
  contenuPremiereNuit,
  contenuPremiereSemaine,
  coutService,
  type FuiteSource,
  type SiteRapport,
} from "./contenus";
import { construirePdfVue, texteImprimable } from "../gardien/rapportPdf";
import { MARQUE_PLATEFORME } from "../marque";
import { formaterTelephone, normaliserTelephone } from "../gardien/telephone";

const texte = (s: string) => s.replace(/[  ]/g, " ");
const J = 86_400_000;
const site: SiteRapport = {
  id: "s1",
  nom: "Camping des Pins",
  type: "camping",
  ville: "Agde",
  pays: "FR",
  monnaie: "EUR",
  fuseau: "Europe/Paris",
  prixM3: 4.5,
  uniteActivite: "nuitee",
};
const reparee: FuiteSource = {
  id: "f1",
  type: "fuite_nuit",
  zone: "Sanitaires",
  statut: "reparee",
  detecteeMs: Date.UTC(2026, 8, 10, 4),
  repareeMs: Date.UTC(2026, 8, 12, 4),
  excesLph: 25,
  economieM3: 18,
  economieMontant: 81,
};

describe("vue des rapports (page et PDF)", () => {
  it("première nuit : le débit le plus bas en grand, la courbe de la nuit", () => {
    const vue = vueRapport(
      contenuPremiereNuit({
        site,
        nuit: "2026-09-02",
        courbe: [
          { heure: "22:00", lph: 40 },
          { heure: "03:00", lph: 3 },
        ],
        fuites: [],
        finMs: 0,
      }),
    );
    expect(vue.chiffre).toEqual({ valeur: "3 L/h", libelle: "débit le plus bas de la nuit" });
    expect(vue.sousTitre).toBe("Camping des Pins — nuit du 1 septembre 2026 au 2 septembre 2026");
    expect(vue.graphique?.points.map((p) => p.etiquette)).toEqual(["22 h", "03 h"]);
    expect(vue.notes).toEqual(["Surveillance fondée sur les données transmises par les capteurs."]);
  });

  it("première semaine : barres par jour et nuit la plus calme", () => {
    const vue = vueRapport(
      contenuPremiereSemaine({
        site,
        jours: [
          { date: "2026-09-01", volumeM3: 1.2, nuitLph: 3 },
          { date: "2026-09-02", volumeM3: 1.4, nuitLph: null },
        ],
        fuites: [],
        finMs: 0,
      }),
    );
    expect(texte(vue.chiffre!.valeur)).toBe("2,6 m³");
    expect(vue.blocs[0].lignes).toEqual([
      ["1 septembre 2026", "3 L/h"],
      ["2 septembre 2026", "pas assez de données"],
    ]);
  });

  it("mensuel : économies en grand, Clef Verte, méthode prudente", () => {
    const vue = vueRapport(
      contenuMensuel({
        site,
        mois: "2026-09",
        joursDansMois: 30,
        jours: [{ date: "2026-09-01", volumeM3: 405 }],
        volumeMoisPrecedentM3: null,
        volumeAnDernierM3: null,
        fuitesDuMois: [reparee],
        fuitesOuvertes: 0,
        reparees: [{ repareeMs: reparee.repareeMs as number, economieM3: 18, economieMontant: 81 }],
        debutMoisMs: Date.UTC(2026, 8, 1),
        finMoisMs: Date.UTC(2026, 9, 1),
        delaiJours: 30,
        quantiteActivite: 1350,
        capacite: null,
        tauxOccupation: null,
        autresLitresParUnite: [],
        temperatures: [],
      }),
    );
    expect(vue.titre).toBe("Rapport de septembre 2026");
    expect(texte(vue.chiffre!.valeur)).toBe("81 €");
    expect(vue.blocs.map((b) => b.titre)).toEqual([
      "Consommation",
      "Fuites du mois",
      "Consommation par activité",
      "Section Clef Verte",
      "Conseil",
    ]);
    expect(texte(vue.blocs[1].lignes![0][1])).toContain("réparée ; pertes 5,40 €, 81,00 € économisés");
    expect(vue.notes[0]).toContain("Méthode prudente");
  });

  it("fin de pilote et page preuve : un grand chiffre, une phrase", () => {
    const fin = vueRapport(
      contenuFinPilote({
        site,
        debut: "2026-09-01",
        fin: "2026-10-01",
        dureeJours: 30,
        fuites: [reparee],
        finMs: 30 * J,
        delaiJours: 30,
        pagePreuve: { token: "a".repeat(48), expireLe: "2026-12-30T00:00:00Z" },
      }),
      "https://app.exemple.fr/preuve/aaa",
    );
    expect(fin.titre).toBe("Ce que 30 jours de surveillance ont trouvé");
    expect(fin.blocs.at(-1)?.paragraphes?.[0]).toContain("https://app.exemple.fr/preuve/aaa");

    const preuve = vuePreuve(
      contenuPagePreuve({
        site,
        debut: "2026-09-01",
        fin: "2026-09-30",
        joursSurveillance: 30,
        fuites: [reparee],
        finMs: 30 * J,
        delaiJours: 30,
        cout: coutService({
          tarifs: { abonnement_premier_point: 19, mise_en_service_point: 349 },
          nbPoints: 1,
          nbSondes: 0,
          avecPasserelle: false,
          remiseFondateurPct: 0,
          nuiteesMois: null,
        }),
        courbe: [{ date: "2026-09-01", volumeM3: 12 }],
      }),
    );
    expect(texte(preuve.chiffre!.valeur)).toBe("81 €");
    expect(preuve.blocs.map((b) => b.titre)).toEqual(["Fuites trouvées", "Coût du service", "Retour sur investissement"]);
    expect(preuve.notes).toHaveLength(3);
  });
});

describe("PDF", () => {
  it("remplace les caractères inconnus des polices standard", () => {
    expect(texteImprimable("1 070,91 € — m³ ≈ œ")).toBe("1 070,91 € — m³ ? œ");
  });

  it("produit un PDF", async () => {
    const vue = vueRapport(
      contenuPremiereNuit({ site, nuit: "2026-09-02", courbe: [{ heure: "03:00", lph: 3 }], fuites: [], finMs: 0 }),
    );
    const pdf = await construirePdfVue(vue, MARQUE_PLATEFORME);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
  });
});

describe("téléphone d'alerte", () => {
  it("format international à partir de la saisie", () => {
    expect(normaliserTelephone("06 12 34 56 78", "FR")).toEqual({ ok: true, numero: "+33612345678" });
    expect(normaliserTelephone("06.12.34.56.78", "MA")).toEqual({ ok: true, numero: "+212612345678" });
    expect(normaliserTelephone("0033 6 12 34 56 78", "FR")).toEqual({ ok: true, numero: "+33612345678" });
    expect(normaliserTelephone("", "FR")).toEqual({ ok: true, numero: null });
    expect(normaliserTelephone("12", "FR").ok).toBe(false);
    expect(formaterTelephone("+33612345678")).toBe("+33 6 12 34 56 78");
  });
});
