import { describe, expect, it } from "vitest";
import { lignesCsvUsage, usageMensuel, type SiteUsage } from "./usage";
import { prediagnostic, validerPrediagnostic } from "./prediagnostic";
import { csvClefVerte, vueBreeam, vueClefVerte, vueRegistreTemperatures } from "./exports";
import { REGLAGES_DEFAUT } from "@/lib/moteur-gardien/reglages";

const texte = (s: string) => s.replace(/[  ]/g, " ");

const TARIFS = {
  EUR: {
    mise_en_service_point: 349,
    mise_en_service_premier_point_passerelle: 590,
    abonnement_premier_point: 19,
    abonnement_point_supplementaire: 12,
    sonde_temperature_mois: 9,
  },
  MAD: {
    mise_en_service_point: 2500,
    mise_en_service_premier_point_passerelle: null,
    abonnement_premier_point: 120,
    abonnement_point_supplementaire: null,
    sonde_temperature_mois: null,
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

describe("usage mensuel (facturation)", () => {
  it("France : 2 points posés dans le mois, une sonde, remise fondateur de 10 %", () => {
    const [u] = usageMensuel({
      debutMois: "2026-09-01",
      finMois: "2026-10-01",
      tarifs: TARIFS,
      sites: [site({ poses: ["2026-09-03T10:00:00Z", "2026-09-03T11:00:00Z"], sondes: 1 })],
      remiseFondateurPct: 10,
      retenuePct: 0,
    });
    expect(u).toMatchObject({ monnaie: "EUR", pointsActifs: 2, misesEnService: 2, sondes: 1, brut: 738, remise: 4, ht: 734, net: 734, incomplet: false });
  });

  it("premier point d'un site avec passerelle : 590 € ; mois suivant : abonnement seul", () => {
    const poses = ["2026-09-03T10:00:00Z", "2026-09-03T11:00:00Z"];
    const [septembre] = usageMensuel({ debutMois: "2026-09-01", finMois: "2026-10-01", tarifs: TARIFS, sites: [site({ poses, avecPasserelle: true })], remiseFondateurPct: 0, retenuePct: 0 });
    expect(septembre.ht).toBe(590 + 349 + 19 + 12);
    const [octobre] = usageMensuel({ debutMois: "2026-10-01", finMois: "2026-11-01", tarifs: TARIFS, sites: [site({ poses, avecPasserelle: true })], remiseFondateurPct: 0, retenuePct: 0 });
    expect(octobre).toMatchObject({ misesEnService: 0, ht: 31 });
  });

  it("Maroc : retenue à la source de 10 %, tarif manquant signalé", () => {
    const [u] = usageMensuel({
      debutMois: "2026-09-01",
      finMois: "2026-10-01",
      tarifs: TARIFS,
      sites: [site({ monnaie: "MAD", poses: ["2026-09-05T08:00:00Z"] })],
      remiseFondateurPct: 0,
      retenuePct: 10,
    });
    expect(u).toMatchObject({ monnaie: "MAD", ht: 2620, retenue: 262, net: 2358, incomplet: false });
    const [deux] = usageMensuel({
      debutMois: "2026-09-01",
      finMois: "2026-10-01",
      tarifs: TARIFS,
      sites: [site({ monnaie: "MAD", poses: ["2026-09-05T08:00:00Z", "2026-09-05T09:00:00Z"] })],
      remiseFondateurPct: 0,
      retenuePct: 10,
    });
    expect(deux.incomplet).toBe(true);
    expect(deux.lignes.find((l) => l.libelle.includes("supplémentaire"))?.montant).toBeNull();
  });

  it("export CSV lisible dans Excel en français", () => {
    const usages = usageMensuel({ debutMois: "2026-09-01", finMois: "2026-10-01", tarifs: TARIFS, sites: [site({ poses: ["2026-08-01T00:00:00Z"], pilote: true })], remiseFondateurPct: 0, retenuePct: 0 });
    expect(lignesCsvUsage("Hôtels; Atlas", "2026-09", usages)).toEqual([
      '"Hôtels; Atlas";2026-09;EUR;1;0;0;19;0;19;0;0;19;non;Hôtel',
    ]);
  });
});

describe("pré-diagnostic", () => {
  it("valeurs du plan : chasse d'eau 25 L/h et fuite enterrée 500 L/h à 4,89 €/m³", () => {
    const v = validerPrediagnostic({ etablissement: "Hôtel du Lac", pays: "FR", prixM3: "4,89", factureAnnuelle: "21 000", capacite: "60", tauxOccupation: "70", nbPoints: "1" });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const r = prediagnostic(v.entree, TARIFS.EUR);
    expect(r.chasse).toMatchObject({ m3ParJour: 0.6, parJour: 2.93, parAn: 1070.91 });
    expect(r.enterree).toMatchObject({ m3ParJour: 12, parJour: 58.68 });
    expect(r.service).toMatchObject({ mensuel: 19, parJour: 0.62, parNuitee: 0.02 });
    expect(r.partFacturePct).toBe(5);
    expect(texte(r.phrase)).toBe(
      "Une seule chasse d'eau qui fuit coûte 1 071 € par an à Hôtel du Lac (5 % de la facture d'eau) ; une fuite enterrée, 21 418 € par an. La surveillance coûte 0,62 € par jour, soit 0,02 € par nuitée.",
    );
  });

  it("refuse une saisie incomplète", () => {
    expect(validerPrediagnostic({ etablissement: "", prixM3: 4 })).toMatchObject({ ok: false });
    expect(validerPrediagnostic({ etablissement: "A", prixM3: "" })).toMatchObject({ ok: false });
    expect(validerPrediagnostic({ etablissement: "A", prixM3: 4, tauxOccupation: 150 })).toMatchObject({ ok: false });
  });
});

describe("exports du registre eau", () => {
  it("registre des températures par point et par mois", () => {
    const vue = vueRegistreTemperatures({ nom: "Hôtel", fuseau: "Europe/Paris" }, { debut: "2026-09-01", fin: "2026-09-30" }, [
      { label: "Retour de boucle", type: "retour_boucle", seuil_c: 50, mois: "2026-09-01", premier_releve: "2026-09-01T06:00:00Z", premiere_valeur_c: 57, min_c: 48, max_c: 58, nb_releves: 720, nb_sous_seuil: 3 },
    ]);
    expect(vue.blocs[0].titre).toBe("Retour de boucle (retour de boucle, seuil 50 °C)");
    expect(texte(vue.blocs[0].lignes![0][1])).toBe(
      "57 °C le 1 septembre à 08:00 ; min. 48 °C ; max. 58 °C ; 720 relevés, 3 sous le seuil",
    );
  });

  it("Clef Verte : CSV et vue sans seuil", () => {
    const mois = [
      { mois: "2026-08", volumeM3: 405, nuitees: 1350, estimation: false, litresParNuitee: 300 },
      { mois: "2026-09", volumeM3: 12.5, nuitees: null, estimation: false, litresParNuitee: null },
    ];
    expect(csvClefVerte({ nom: "Camping" }, mois)).toBe(
      "Site;Mois;Volume (m3);Nuitées;Estimation;Litres par nuitée\nCamping;2026-08;405;1350;non;300\nCamping;2026-09;12,5;;non;",
    );
    expect(vueClefVerte({ nom: "Camping" }, mois).chiffre?.valeur).toBe("300 L");
  });

  it("BREEAM Wat 03 : règles réelles du moteur et journal des alertes", () => {
    const vue = vueBreeam(
      { nom: "Hôtel", fuseau: "Europe/Paris" },
      {
        points: [{ zone: "Général", transmission: "lorawan" }],
        reglages: REGLAGES_DEFAUT,
        alertes: [{ type: "rupture", zone: "Piscine", detecteeLe: "2026-09-10T12:00:00Z", statut: "reparee", excesLph: 650 }],
        appelH: 2,
        directeurH: 12,
      },
    );
    expect(vue.blocs[1].lignes![0][1]).toBe(
      "débit minimum entre 2 h et 5 h au-dessus de la ligne de base + 20 % (au moins 5 L/h), 2 nuits de suite",
    );
    expect(vue.blocs[3].lignes![0][1]).toBe("Rupture — Piscine, 650 L/h, réparée");
    expect(vue.notes[0]).toContain("appréciée par l'évaluateur");
  });
});
