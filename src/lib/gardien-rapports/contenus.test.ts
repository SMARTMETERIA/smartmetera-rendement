import { describe, expect, it } from "vitest";
import {
  PHRASE_SANS_FUITE,
  comparaison,
  contenuFinPilote,
  contenuMensuel,
  contenuPagePreuve,
  contenuPremiereNuit,
  contenuPremiereSemaine,
  coutService,
  fuitesRapport,
  retourInvestissement,
  type FuiteSource,
  type SiteRapport,
} from "./contenus";

const texte = (s: string) => s.replace(/[  ]/g, " ");
const H = 3_600_000;
const J = 24 * H;

const site: SiteRapport = {
  id: "s1",
  nom: "Hôtel Atlas",
  type: "hotel",
  ville: "Lyon",
  pays: "FR",
  monnaie: "EUR",
  fuseau: "Europe/Paris",
  prixM3: 4.89,
  uniteActivite: "nuitee",
};

const fuite = (p: Partial<FuiteSource> = {}): FuiteSource => ({
  id: "f1",
  type: "fuite_nuit",
  zone: "Cuisine",
  statut: "ouverte",
  detecteeMs: 0,
  repareeMs: null,
  excesLph: 25,
  economieM3: null,
  economieMontant: null,
  ...p,
});

const TARIFS_FR = {
  mise_en_service_point: 349,
  mise_en_service_premier_point_passerelle: 590,
  abonnement_premier_point: 19,
  abonnement_point_supplementaire: 12,
  sonde_temperature_mois: 9,
};

describe("pertes d'une fuite dans un rapport", () => {
  it("25 L/h pendant un jour : 0,6 m³ et 2,93 € ; les fausses alertes n'apparaissent pas", () => {
    const r = fuitesRapport(
      [fuite(), fuite({ id: "f2", statut: "fausse_alerte" })],
      4.89,
      J,
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ perteM3: 0.6, perteMontant: 2.93 });
  });

  it("une fuite réparée ne compte ses pertes que jusqu'à la réparation", () => {
    const [r] = fuitesRapport([fuite({ statut: "reparee", repareeMs: 12 * H })], 4.89, 10 * J);
    expect(r.perteM3).toBe(0.3);
  });
});

describe("coût du service et retour sur investissement", () => {
  it("un point en France : 19 € par mois, 0,62 € par jour", () => {
    expect(
      coutService({ tarifs: TARIFS_FR, nbPoints: 1, nbSondes: 0, avecPasserelle: false, remiseFondateurPct: 0, nuiteesMois: 1260 }),
    ).toEqual({ mensuel: 19, parJour: 0.62, parNuitee: 0.02, miseEnService: 349 });
  });

  it("deux points, une sonde, passerelle : 40 € par mois, 939 € de mise en service", () => {
    expect(
      coutService({ tarifs: TARIFS_FR, nbPoints: 2, nbSondes: 1, avecPasserelle: true, remiseFondateurPct: 0, nuiteesMois: null }),
    ).toMatchObject({ mensuel: 40, miseEnService: 939, parNuitee: null });
  });

  it("remise fondateur appliquée à l'abonnement", () => {
    expect(
      coutService({ tarifs: TARIFS_FR, nbPoints: 1, nbSondes: 0, avecPasserelle: false, remiseFondateurPct: 20, nuiteesMois: null })?.mensuel,
    ).toBe(15.2);
  });

  it("Maroc : tarif manquant, aucun coût inventé", () => {
    const tarifsMa = { mise_en_service_point: 2500, abonnement_premier_point: 120, abonnement_point_supplementaire: null };
    expect(coutService({ tarifs: tarifsMa, nbPoints: 1, nbSondes: 0, avecPasserelle: false, remiseFondateurPct: 0, nuiteesMois: null })?.mensuel).toBe(120);
    expect(coutService({ tarifs: tarifsMa, nbPoints: 2, nbSondes: 0, avecPasserelle: false, remiseFondateurPct: 0, nuiteesMois: null })).toBeNull();
  });

  it("349 € + 19 €/mois, 81 € économisés en 30 jours : remboursé en 137 jours", () => {
    const cout = coutService({ tarifs: TARIFS_FR, nbPoints: 1, nbSondes: 0, avecPasserelle: false, remiseFondateurPct: 0, nuiteesMois: null });
    expect(retourInvestissement({ cout, joursSurveillance: 30, economies: 81 })).toEqual({
      jours: 137,
      coutEngage: 367.74,
    });
    expect(retourInvestissement({ cout, joursSurveillance: 30, economies: 0 }).jours).toBeNull();
  });
});

describe("comparaison anonyme", () => {
  it("seulement à partir de 5 sites comparables", () => {
    expect(comparaison(300, [200, 250, 280, 320])).toBeNull();
    expect(comparaison(300, [200, 250, 280, 320, 400])).toEqual({ nbSites: 5, medianeLitresParUnite: 280, ecartPct: 7 });
  });
});

describe("rapports", () => {
  it("première nuit sans anomalie", () => {
    const c = contenuPremiereNuit({
      site,
      nuit: "2026-09-22",
      courbe: [
        { heure: "22:00", lph: 40 },
        { heure: "03:00", lph: 3.2 },
        { heure: "04:00", lph: null },
      ],
      fuites: [],
      finMs: 0,
    });
    expect(c.rienASignaler).toBe(true);
    expect(texte(c.phrase)).toBe(
      "Première nuit sous surveillance : rien à signaler. Débit le plus bas de la nuit : 3,2 L/h.",
    );
  });

  it("première nuit avec une fuite chiffrée ; sans donnée, pas de « rien à signaler »", () => {
    const avec = contenuPremiereNuit({ site, nuit: "2026-09-22", courbe: [{ heure: "03:00", lph: 28 }], fuites: [fuite()], finMs: J });
    expect(texte(avec.phrase)).toBe("Première nuit sous surveillance : une anomalie détectée, soit environ 2,93 € par jour.");
    const vide = contenuPremiereNuit({ site, nuit: "2026-09-22", courbe: [{ heure: "03:00", lph: null }], fuites: [], finMs: 0 });
    expect(vide.rienASignaler).toBe(false);
    expect(vide.phrase).toContain("Aucune donnée reçue");
  });

  it("première semaine", () => {
    const c = contenuPremiereSemaine({
      site,
      jours: Array.from({ length: 7 }, (_, i) => ({ date: `2026-09-${22 + i}`, volumeM3: 1.5, nuitLph: 3 })),
      fuites: [],
      finMs: 0,
    });
    expect(texte(c.phrase)).toBe("Première semaine : rien à signaler. 10,5 m³ consommés en 7 jours.");
    expect(c).toMatchObject({ debut: "2026-09-22", fin: "2026-09-28" });
  });

  it("rapport mensuel sans fuite : phrase du plan, Clef Verte, comparaison, économies cumulées", () => {
    const c = contenuMensuel({
      site,
      mois: "2026-09",
      joursDansMois: 30,
      jours: [{ date: "2026-09-01", volumeM3: 405 }],
      volumeMoisPrecedentM3: 450,
      volumeAnDernierM3: null,
      fuitesDuMois: [],
      fuitesOuvertes: 0,
      reparees: [{ repareeMs: Date.UTC(2026, 7, 10), economieM3: 18, economieMontant: 81 }],
      debutMoisMs: Date.UTC(2026, 8, 1),
      finMoisMs: Date.UTC(2026, 9, 1),
      delaiJours: 30,
      quantiteActivite: 1350,
      capacite: 60,
      tauxOccupation: 0.7,
      autresLitresParUnite: [250, 280, 320, 350, 400],
      temperatures: [],
    });
    expect(c.phraseSansFuite).toBe(PHRASE_SANS_FUITE);
    expect(c.conseil).toBe(PHRASE_SANS_FUITE);
    expect(c.variationMoisPct).toBe(-10);
    expect(c.activite).toMatchObject({ litresParUnite: 300, estimation: false, libelleUnite: "nuitée" });
    expect(c.clefVerte).toEqual({ litresParNuitee: 300, estimation: false });
    expect(c.comparaison).toEqual({ nbSites: 5, medianeLitresParUnite: 320, ecartPct: -6 });
    expect(c.economiesCumulees).toMatchObject({ m3: 18, montant: 81 });
    expect(c.economiesDuMois).toEqual({ m3: 0, montant: null });
    expect(c.methodeEconomies).toBe(
      "Méthode prudente : excès de débit × 24 h × 30 jours de découverte évités × prix du m³ du site.",
    );
  });

  it("fin de pilote : titre du plan, anomalies, économies", () => {
    const c = contenuFinPilote({
      site,
      debut: "2026-09-01",
      fin: "2026-10-01",
      dureeJours: 30,
      fuites: [fuite({ statut: "reparee", repareeMs: 2 * J, economieM3: 18, economieMontant: 81 })],
      finMs: 25 * J,
      delaiJours: 30,
      pagePreuve: { token: "a".repeat(48), expireLe: "2026-12-30T00:00:00Z" },
    });
    expect(c.titre).toBe("Ce que 30 jours de surveillance ont trouvé");
    expect(texte(c.phrase)).toBe("Une anomalie trouvée en 30 jours, 81,00 € économisés (méthode prudente).");
    expect(c.anomalies).toBe(1);
  });

  it("page preuve : un grand chiffre, une phrase, aucune donnée personnelle", () => {
    const cout = coutService({ tarifs: TARIFS_FR, nbPoints: 1, nbSondes: 0, avecPasserelle: false, remiseFondateurPct: 0, nuiteesMois: 1260 });
    const c = contenuPagePreuve({
      site,
      debut: "2026-09-01",
      fin: "2026-09-30",
      joursSurveillance: 30,
      fuites: [fuite({ statut: "reparee", repareeMs: 2 * J, economieM3: 18, economieMontant: 81 })],
      finMs: 30 * J,
      delaiJours: 30,
      cout,
      courbe: [],
    });
    expect(texte(c.phrase)).toBe(
      "81 € évités en 30 jours grâce à une fuite trouvée et réparée, pour un service à 0,62 € par jour.",
    );
    expect(c.retour).toEqual({ jours: 137, coutEngage: 367.74 });
    expect(JSON.stringify(c)).not.toMatch(/@|user|email|telephone/i);
  });
});
