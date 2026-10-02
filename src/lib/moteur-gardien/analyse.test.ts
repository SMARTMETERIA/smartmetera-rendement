import { describe, expect, it } from "vitest";
import {
  analyserSite,
  debutFenetre,
  joursARecalculer,
  type DonneesSite,
  type FuiteConnue,
  type JourCalcule,
  type JourStocke,
} from "./analyse";
import type { Releve } from "./debits";
import { REGLAGES_DEFAUT } from "./reglages";
import { lireReglagesTemperature } from "./temperatures";
import { HEURE_MS, decalerJour, instantLocal, partiesLocales } from "./temps";

const M = "compteur-1";

/** Relevés horaires d'un point : débit (L/h) selon la date et l'heure locales. */
function serie(
  fuseau: string,
  premierJour: string,
  finMs: number,
  debit: (date: string, heure: number) => number,
): Releve[] {
  const releves: Releve[] = [];
  for (let h = instantLocal(premierJour, 0, fuseau); h + HEURE_MS <= finMs; h += HEURE_MS) {
    const l = partiesLocales(h, fuseau);
    releves.push({ tsMs: h + HEURE_MS, volumeM3: debit(l.date, l.heure) / 1000 });
  }
  return releves;
}

/** Nuits à 3 L/h (0 h – 6 h), journées à 40 L/h. */
const normal = (_date: string, heure: number) => (heure < 6 ? 3 : 40);

function donnees(partiel: Partial<DonneesSite> & Pick<DonneesSite, "maintenantMs" | "jours">): DonneesSite {
  return {
    siteId: "site-1",
    fuseau: "Europe/Paris",
    periodesFermeture: [],
    reglages: REGLAGES_DEFAUT,
    reglagesTemperature: lireReglagesTemperature({
      seuils_c: { sortie_production: 55, retour_boucle: 50, point_eloigne: null },
      rappel_analyses_avant_reouverture_jours: null,
    }),
    compteurs: [{ id: M, nom: "Général", zone: "Général", surveillance: "complete" }],
    releves: {},
    historique: {},
    plages: [],
    fuites: [],
    appareils: [],
    points: [],
    alertes: [],
    ...partiel,
  };
}

const versStocke = (jours: JourCalcule[]): JourStocke[] =>
  jours.map((j) => ({
    day: j.day,
    nightMinLph: j.nightMinLph,
    maxHourlyLph: j.maxHourlyLph,
    closed: j.closed,
    baselineLph: j.baselineLph,
    thresholdLph: j.thresholdLph,
  }));

function scenarioFuiteNuit(fuseau: string) {
  // 1er au 30 septembre 2026 ; fuite de 25 L/h du 20 à 22 h au 22 à 18 h.
  const debutFuite = instantLocal("2026-09-20", 22, fuseau);
  const finFuite = instantLocal("2026-09-22", 18, fuseau);
  const debit = (date: string, heure: number) => {
    const t = instantLocal(date, heure, fuseau);
    return normal(date, heure) + (t >= debutFuite && t < finFuite ? 25 : 0);
  };
  return { debit, debutFuite };
}

describe("analyse d'un site : fuite de nuit détectée, chiffrée puis réparée", () => {
  for (const fuseau of ["Europe/Paris", "Africa/Casablanca"]) {
    it(`fuseau ${fuseau}`, () => {
      const { debit } = scenarioFuiteNuit(fuseau);
      // Détection : le 22 à 6 h 10 (heure du site), recalcul depuis le 1er.
      const detection = instantLocal("2026-09-22", 6, fuseau) + 10 * 60_000;
      const jours = joursARecalculer(detection, fuseau, 22);
      expect(jours[0]).toBe("2026-09-01");
      const premier = analyserSite(
        donnees({
          fuseau,
          maintenantMs: detection,
          jours,
          releves: { [M]: serie(fuseau, "2026-09-01", detection, debit) },
        }),
      );
      const nuit20 = premier.jours.find((j) => j.day === "2026-09-20")!;
      expect(nuit20).toMatchObject({ nightMinLph: 3, baselineMode: "normal", leakNight: false });
      expect(premier.jours.find((j) => j.day === "2026-09-21")).toMatchObject({
        nightMinLph: 28,
        baselineLph: 3,
        thresholdLph: 8,
        leakNight: true,
      });
      expect(premier.nouvellesFuites).toHaveLength(1);
      const fuite = premier.nouvellesFuites[0];
      expect(fuite).toMatchObject({ meterId: M, type: "fuite_nuit", excesLph: 25 });
      // Début estimé : 2 h (heure du site) de la première nuit anormale.
      expect(partiesLocales(fuite.startedAtMs, fuseau)).toMatchObject({ date: "2026-09-21", heure: 2 });
      expect(premier.reparations).toEqual([]);

      // Une heure plus tard : pas de doublon.
      const ensuite = analyserSite(
        donnees({
          fuseau,
          maintenantMs: detection + HEURE_MS,
          jours: joursARecalculer(detection + HEURE_MS, fuseau),
          releves: { [M]: serie(fuseau, "2026-09-21", detection + HEURE_MS, debit) },
          historique: { [M]: versStocke(premier.jours.filter((j) => j.day < "2026-09-21")) },
          fuites: [
            {
              id: "f1",
              meterId: M,
              type: "fuite_nuit",
              status: "ouverte",
              startedAtMs: fuite.startedAtMs,
              detectedAtMs: detection,
              closedAtMs: null,
            },
          ],
        }),
      );
      expect(ensuite.nouvellesFuites).toEqual([]);

      // Réparation : deux nuits normales après la détection (23 et 24).
      const reparation = instantLocal("2026-09-24", 6, fuseau) + 10 * 60_000;
      const fuiteConnue: FuiteConnue = {
        id: "f1",
        meterId: M,
        type: "fuite_nuit",
        status: "prise_en_compte",
        startedAtMs: fuite.startedAtMs,
        detectedAtMs: detection,
        closedAtMs: null,
      };
      const avant = analyserSite(
        donnees({
          fuseau,
          maintenantMs: reparation - 2 * HEURE_MS,
          jours: joursARecalculer(reparation - 2 * HEURE_MS, fuseau),
          releves: { [M]: serie(fuseau, "2026-09-23", reparation, debit) },
          historique: { [M]: versStocke(premier.jours) },
          fuites: [fuiteConnue],
        }),
      );
      expect(avant.reparations).toEqual([]);
      const apres = analyserSite(
        donnees({
          fuseau,
          maintenantMs: reparation,
          jours: joursARecalculer(reparation, fuseau),
          releves: { [M]: serie(fuseau, "2026-09-23", reparation, debit) },
          historique: { [M]: versStocke(premier.jours) },
          fuites: [fuiteConnue],
        }),
      );
      expect(apres.reparations).toEqual(["f1"]);
      expect(apres.nouvellesFuites).toEqual([]);
    });
  }

  it("ne redétecte pas les nuits d'une fuite déclarée fausse alerte", () => {
    const fuseau = "Europe/Paris";
    const { debit } = scenarioFuiteNuit(fuseau);
    const detection = instantLocal("2026-09-22", 9, fuseau);
    const r = analyserSite(
      donnees({
        maintenantMs: detection,
        jours: joursARecalculer(detection, fuseau, 22),
        releves: { [M]: serie(fuseau, "2026-09-01", detection, debit) },
        fuites: [
          {
            id: "f1",
            meterId: M,
            type: "fuite_nuit",
            status: "fausse_alerte",
            startedAtMs: instantLocal("2026-09-21", 2, fuseau),
            detectedAtMs: instantLocal("2026-09-22", 6, fuseau),
            closedAtMs: instantLocal("2026-09-22", 8, fuseau),
          },
        ],
      }),
    );
    expect(r.nouvellesFuites).toEqual([]);
  });
});

describe("autres détections", () => {
  const fuseau = "Europe/Paris";

  it("débit continu dès le premier jour (sans ligne de base)", () => {
    const maintenant = instantLocal("2026-09-10", 14, fuseau) + 10 * 60_000;
    const r = analyserSite(
      donnees({
        maintenantMs: maintenant,
        jours: joursARecalculer(maintenant, fuseau),
        releves: { [M]: serie(fuseau, "2026-09-09", maintenant, (_d, h) => (h < 6 ? 30 : 60)) },
      }),
    );
    expect(r.jours.every((j) => j.baselineMode === "apprentissage")).toBe(true);
    expect(r.nouvellesFuites).toMatchObject([{ type: "debit_continu", excesLph: 30 }]);
  });

  it("rupture : plus de 3 fois le maximum et plus de 500 L/h, alerte immédiate", () => {
    const maintenant = instantLocal("2026-09-10", 15, fuseau) + 10 * 60_000;
    const rupture = instantLocal("2026-09-10", 14, fuseau);
    const releves = serie(fuseau, "2026-09-09", maintenant, normal).map((x) =>
      x.tsMs === rupture + HEURE_MS ? { ...x, volumeM3: 0.9 } : x,
    );
    const r = analyserSite(
      donnees({ maintenantMs: maintenant, jours: joursARecalculer(maintenant, fuseau), releves: { [M]: releves } }),
    );
    expect(r.nouvellesFuites).toMatchObject([{ type: "rupture", excesLph: 860, startedAtMs: rupture }]);
  });

  it("compteur d'arrivée : le remplissage des réserves après une coupure n'est pas une rupture", () => {
    const maintenant = instantLocal("2026-09-10", 15, fuseau) + 10 * 60_000;
    const retour = instantLocal("2026-09-10", 14, fuseau);
    const releves = serie(fuseau, "2026-09-09", maintenant, normal).map((x) =>
      x.tsMs === retour + HEURE_MS ? { ...x, volumeM3: 6 } : x,
    );
    const compteur = { id: M, nom: "Arrivée", zone: "Arrivée", surveillance: "complete" as const };
    const r = analyserSite(
      donnees({
        maintenantMs: maintenant,
        jours: joursARecalculer(maintenant, fuseau),
        releves: { [M]: releves },
        compteurs: [{ ...compteur, periodesSansRupture: [{ debutMs: retour - 10 * HEURE_MS, finMs: retour + 24 * HEURE_MS }] }],
      }),
    );
    expect(r.nouvellesFuites).toEqual([]);
  });

  it("mode fermeture : plus de 2 L/h pendant 2 heures pendant une fermeture", () => {
    const maintenant = instantLocal("2026-12-10", 15, fuseau) + 10 * 60_000;
    const base = {
      maintenantMs: maintenant,
      jours: joursARecalculer(maintenant, fuseau),
      periodesFermeture: [{ debut: "2026-11-01", fin: "2027-03-31", libelle: "Hiver" }],
    };
    const gel = analyserSite(
      donnees({
        ...base,
        releves: { [M]: serie(fuseau, "2026-12-09", maintenant, (_d, h) => (h >= 13 ? 3 : 0)) },
      }),
    );
    expect(gel.nouvellesFuites).toMatchObject([{ type: "fuite_fermeture", excesLph: 3 }]);
    expect(gel.jours.every((j) => j.closed)).toBe(true);
    const sec = analyserSite(
      donnees({ ...base, releves: { [M]: serie(fuseau, "2026-12-09", maintenant, () => 1) } }),
    );
    expect(sec.nouvellesFuites).toEqual([]);
  });

  it("arrosage de nuit déclaré : aucune fausse alerte", () => {
    const maintenant = instantLocal("2026-09-30", 6, fuseau) + 10 * 60_000;
    // Arrosage de 1 h à 5 h depuis le 29 septembre.
    const arrosage = (date: string, heure: number) =>
      date >= "2026-09-29" && heure >= 1 && heure < 5 ? 600 : normal(date, heure);
    const releves = { [M]: serie(fuseau, "2026-09-01", maintenant, arrosage) };
    const jours = joursARecalculer(maintenant, fuseau, 30);
    const sans = analyserSite(donnees({ maintenantMs: maintenant, jours, releves }));
    expect(sans.nouvellesFuites.length).toBeGreaterThan(0);
    const avec = analyserSite(
      donnees({
        maintenantMs: maintenant,
        jours,
        releves,
        plages: [{ meterId: null, joursIso: null, debut: "01:00", fin: "05:00", depuis: null, jusqua: null }],
      }),
    );
    expect(avec.nouvellesFuites).toEqual([]);
    expect(avec.jours[avec.jours.length - 1].quietHours).toBe(4);
  });

  it("surveillance limitée : volumes seulement, aucune détection", () => {
    const maintenant = instantLocal("2026-09-10", 14, fuseau);
    const r = analyserSite(
      donnees({
        maintenantMs: maintenant,
        jours: joursARecalculer(maintenant, fuseau),
        compteurs: [{ id: M, nom: "Général", zone: null, surveillance: "limitee" }],
        releves: { [M]: serie(fuseau, "2026-09-09", maintenant, () => 30) },
      }),
    );
    expect(r.nouvellesFuites).toEqual([]);
    expect(r.jours[0]).toMatchObject({ volumeM3: 0.72, nightMinLph: null, maxHourlyLph: null });
  });

  it("changement d'heure d'automne : journée de 25 heures", () => {
    const maintenant = instantLocal("2026-10-26", 8, fuseau);
    const r = analyserSite(
      donnees({
        maintenantMs: maintenant,
        jours: joursARecalculer(maintenant, fuseau, 3),
        releves: { [M]: serie(fuseau, "2026-10-24", maintenant, normal) },
      }),
    );
    const jour = r.jours.find((j) => j.day === "2026-10-25")!;
    expect(jour.hoursCovered).toBe(25);
    expect(jour.nightHours).toBe(4);
    // Première heure de la fenêtre chargée : 2 h avant minuit local.
    expect(partiesLocales(debutFenetre(["2026-10-25"], fuseau), fuseau)).toMatchObject({
      date: "2026-10-24",
      heure: 22,
    });
  });
});

describe("capteurs muets, températures, analyses", () => {
  const fuseau = "Europe/Paris";
  const maintenant = instantLocal("2026-09-10", 12, fuseau);
  const jours = joursARecalculer(maintenant, fuseau);

  it("capteur LoRaWAN muet depuis 7 h : alerte ; de retour : résolue", () => {
    const appareil = {
      id: "d1",
      nom: "Cuisine",
      meterId: M,
      pointId: null,
      transmission: "lorawan",
      dernierMessageMs: maintenant - 7 * HEURE_MS,
      poseMs: null,
    };
    const muet = analyserSite(donnees({ maintenantMs: maintenant, jours, appareils: [appareil] }));
    expect(muet.alertesAOuvrir).toMatchObject([
      { type: "compteur_muet", cle: "muet:d1", titre: "Capteur muet : Cuisine" },
    ]);
    const retour = analyserSite(
      donnees({
        maintenantMs: maintenant,
        jours,
        appareils: [{ ...appareil, dernierMessageMs: maintenant - HEURE_MS }],
        alertes: [{ id: "a1", type: "compteur_muet", cle: "muet:d1", enCours: true }],
      }),
    );
    expect(retour.alertesAResoudre).toEqual(["a1"]);
    expect(retour.alertesAOuvrir).toEqual([]);
  });

  it("température sous le seuil du point : alerte ; remontée : résolue", () => {
    const point = {
      id: "p1",
      label: "Retour de boucle",
      type: "retour_boucle" as const,
      thresholdC: null,
      derniereValeurC: 48.5,
      dernierReleveMs: maintenant - 30 * 60_000,
    };
    const basse = analyserSite(donnees({ maintenantMs: maintenant, jours, points: [point] }));
    expect(basse.alertesAOuvrir).toHaveLength(1);
    expect(basse.alertesAOuvrir[0]).toMatchObject({ type: "temperature_basse", severite: "haute" });
    expect(basse.alertesAOuvrir[0].description.replace(/[  ]/g, " ")).toBe(
      "48,5 °C, sous le seuil de 50,0 °C.",
    );
    const remontee = analyserSite(
      donnees({
        maintenantMs: maintenant,
        jours,
        points: [{ ...point, derniereValeurC: 56 }],
        alertes: [{ id: "a2", type: "temperature_basse", cle: "temperature:p1", enCours: true }],
      }),
    );
    expect(remontee.alertesAResoudre).toEqual(["a2"]);
  });

  it("rappel des analyses seulement si le délai est paramétré", () => {
    const point = {
      id: "p1",
      label: "Sortie",
      type: "sortie_production" as const,
      thresholdC: null,
      derniereValeurC: null,
      dernierReleveMs: null,
    };
    const periodesFermeture = [{ debut: "2026-01-01", fin: decalerJour("2026-09-10", 10) }];
    const sansDelai = analyserSite(
      donnees({ maintenantMs: maintenant, jours, points: [point], periodesFermeture }),
    );
    expect(sansDelai.alertesAOuvrir).toEqual([]);
    const avecDelai = analyserSite(
      donnees({
        maintenantMs: maintenant,
        jours,
        points: [point],
        periodesFermeture,
        reglagesTemperature: lireReglagesTemperature({ rappel_analyses_avant_reouverture_jours: 15 }),
      }),
    );
    expect(avecDelai.alertesAOuvrir).toMatchObject([
      { type: "rappel_analyses", cle: "analyses:site-1:2026-09-20" },
    ]);
  });
});
