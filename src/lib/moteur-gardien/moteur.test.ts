import { describe, expect, it } from "vitest";
import { coutFuite, economiesPrudentes, methodePertes } from "./economies";
import { debitsHoraires } from "./debits";
import { debitMinNocturne } from "./nuit";
import { ligneDeBase, nuitsExigees, seuilFuiteNuit, type NuitHistorique } from "./baseline";
import {
  capteurMuet,
  detecterDebitContinu,
  detecterFermeture,
  detecterFuiteNuit,
  detecterRupture,
  fuiteReparee,
} from "./detection";
import { REGLAGES_DEFAUT, fusionnerReglages } from "./reglages";
import { heureEnPlageCalme, lirePeriodesFermeture, periodeFermee } from "./plages";
import {
  fermetureAvantAnalyses,
  lireReglagesTemperature,
  registreMensuel,
  seuilPoint,
  temperatureBasse,
} from "./temperatures";
import { indicateurActivite } from "./activite";
import { dateLocale, instantLocal, partiesLocales, HEURE_MS, JOUR_MS } from "./temps";

const R = REGLAGES_DEFAUT;
// Les montants français utilisent des espaces fines insécables.
const texte = (s: string) => s.replace(/[  ]/g, " ");

describe("valeurs connues du plan (phase G4)", () => {
  it("fuite de 25 L/h à 4,89 €/m³ : 0,6 m³ et 2,93 € par jour, environ 1 071 € par an", () => {
    const c = coutFuite({ excesLph: 25, prixM3: 4.89, depuisMs: 0, maintenantMs: JOUR_MS });
    expect(c.m3ParJour).toBe(0.6);
    expect(c.coutParJour).toBe(2.93);
    expect(Math.round(c.coutAnnuel!)).toBe(1071);
    expect(c.m3Cumules).toBe(0.6);
    expect(c.coutCumule).toBe(2.93);
    expect(c.coutMensuelProjete).toBe(88.02);
  });

  it("fuite enterrée de 500 L/h : 12 m³ et 58,68 € par jour", () => {
    const c = coutFuite({ excesLph: 500, prixM3: 4.89, depuisMs: 0, maintenantMs: 0 });
    expect(c.m3ParJour).toBe(12);
    expect(c.coutParJour).toBe(58.68);
    expect(c.m3Cumules).toBe(0);
  });

  it("économies prudentes : 25 L/h, 4,50 €/m³, 30 jours = 18 m³, soit 81 €", () => {
    const e = economiesPrudentes({ excesLph: 25, delaiJours: 30, prixM3: 4.5, monnaie: "EUR" });
    expect(e.m3).toBe(18);
    expect(e.montant).toBe(81);
    expect(texte(e.methode)).toBe(
      "Méthode prudente : 25,0 L/h d'excès × 24 h × 30 jours de découverte évités × 4,50 €/m³ = 81,00 €.",
    );
  });

  it("même cas au Maroc, en dirhams", () => {
    const e = economiesPrudentes({ excesLph: 25, delaiJours: 30, prixM3: 11.5, monnaie: "MAD" });
    expect(e.m3).toBe(18);
    expect(e.montant).toBe(207);
    expect(texte(e.methode)).toContain("11,50 MAD/m³ = 207,00 MAD");
    expect(texte(methodePertes(25, 11.5, "MAD"))).toContain("MAD/m³");
  });

  it("sans prix de l'eau, les volumes restent calculés mais aucun montant n'est inventé", () => {
    const e = economiesPrudentes({ excesLph: 25, delaiJours: 30, prixM3: null, monnaie: "MAD" });
    expect(e).toMatchObject({ m3: 18, montant: null });
    expect(e.methode).toContain("à renseigner");
    expect(coutFuite({ excesLph: 25, prixM3: null, depuisMs: 0, maintenantMs: 0 }).coutParJour).toBeNull();
  });
});

describe("débits horaires", () => {
  const h = (heure: number, minute = 0) => Date.UTC(2026, 8, 10, heure, minute);

  it("cumule des relevés au quart d'heure", () => {
    const releves = [0, 15, 30, 45, 60].map((m) => ({ tsMs: h(1, m), volumeM3: 0.005 }));
    const d = debitsHoraires(releves, h(0, 45));
    const heure1 = d.find((x) => x.heureMs === h(1))!;
    expect(heure1.lph).toBeCloseTo(20, 6);
    expect(heure1.couverture).toBe(1);
  });

  it("répartit un relevé espacé sur les heures qu'il couvre", () => {
    const d = debitsHoraires([{ tsMs: h(4), volumeM3: 0.06 }], h(1));
    expect(d.map((x) => x.lph)).toEqual([20, 20, 20]);
    // Relevé sur 3 heures : volume juste, mais débit seulement moyen.
    expect(d.every((x) => x.lissee)).toBe(true);
    const horaire = debitsHoraires([{ tsMs: h(2), volumeM3: 0.02 }], h(1));
    expect(horaire[0].lissee).toBe(false);
  });

  it("ne répartit pas un trou de plus d'un jour", () => {
    const d = debitsHoraires([{ tsMs: h(1), volumeM3: 1 }], h(1) - 3 * JOUR_MS);
    expect(d).toEqual([]);
  });

  it("n'annonce pas de débit pour une heure trop peu couverte", () => {
    const d = debitsHoraires([{ tsMs: h(1, 10), volumeM3: 0.01 }], h(1));
    expect(d[0].lph).toBeNull();
  });
});

describe("nuit à l'heure locale du site", () => {
  function heuresConstantes(debutMs: number, n: number, lph: number) {
    return Array.from({ length: n }, (_, i) => ({
      heureMs: debutMs + i * HEURE_MS,
      litres: lph,
      couverture: 1,
      lph,
      lissee: false,
    }));
  }

  it("prend 2 h à 5 h, heure de Paris (3 heures)", () => {
    const debits = heuresConstantes(Date.UTC(2026, 8, 9, 20), 12, 10);
    debits[5].lph = 4; // 01:00Z = 03:00 à Paris (heure d'été)
    const n = debitMinNocturne(debits, "2026-09-10", "Europe/Paris", R.fuiteNuit, [], "m");
    expect(n).toMatchObject({ dmnLph: 4, heures: 3 });
  });

  it("changement d'heure de printemps : la nuit n'a que 2 heures", () => {
    const debits = heuresConstantes(Date.UTC(2026, 2, 28, 20), 12, 7);
    const n = debitMinNocturne(debits, "2026-03-29", "Europe/Paris", R.fuiteNuit, [], "m");
    expect(n.heures).toBe(2);
    expect(n.dmnLph).toBe(7);
  });

  it("changement d'heure d'automne : la nuit a 4 heures", () => {
    const debits = heuresConstantes(Date.UTC(2026, 9, 24, 20), 12, 7);
    const n = debitMinNocturne(debits, "2026-10-25", "Europe/Paris", R.fuiteNuit, [], "m");
    expect(n.heures).toBe(4);
  });

  it("à Casablanca : 2 h locale = 01:00 UTC, et 02:00 UTC pendant le Ramadan", () => {
    expect(partiesLocales(Date.UTC(2026, 8, 10, 1), "Africa/Casablanca").heure).toBe(2);
    expect(partiesLocales(Date.UTC(2026, 1, 25, 2), "Africa/Casablanca").heure).toBe(2);
    const debits = heuresConstantes(Date.UTC(2026, 8, 9, 20), 12, 9);
    debits[6].lph = 3; // 02:00Z = 03:00 à Casablanca
    const n = debitMinNocturne(debits, "2026-09-10", "Africa/Casablanca", R.fuiteNuit, [], "m");
    expect(n).toMatchObject({ dmnLph: 3, heures: 3 });
  });

  it("écarte les heures d'une plage calme (arrosage de 22 h à 6 h, le jeudi)", () => {
    const plages = [
      { meterId: null, joursIso: [4], debut: "22:00", fin: "06:00", depuis: null, jusqua: null },
    ];
    // Nuit du jeudi 10 au vendredi 11 septembre 2026 : plage commencée jeudi.
    const debits = heuresConstantes(Date.UTC(2026, 8, 10, 20), 12, 30);
    const n = debitMinNocturne(debits, "2026-09-11", "Europe/Paris", R.fuiteNuit, plages, "m");
    expect(n).toMatchObject({ dmnLph: null, heures: 0, heuresCalmes: 3 });
    expect(heureEnPlageCalme(Date.UTC(2026, 8, 11, 10), "Europe/Paris", plages, "m")).toBe(false);
  });

  it("convertit une heure locale en instant UTC", () => {
    expect(new Date(instantLocal("2026-09-10", 2, "Europe/Paris")).toISOString()).toBe(
      "2026-09-10T00:00:00.000Z",
    );
    expect(new Date(instantLocal("2026-03-29", 2, "Europe/Paris")).toISOString()).toBe(
      "2026-03-29T01:00:00.000Z",
    );
    expect(dateLocale(Date.UTC(2026, 8, 9, 23), "Europe/Paris")).toBe("2026-09-10");
  });
});

describe("ligne de base auto-calibrée", () => {
  const nuits = (n: number, valeur: (i: number) => number): NuitHistorique[] =>
    Array.from({ length: n }, (_, i) => ({
      date: `2026-08-${String(i + 1).padStart(2, "0")}`,
      jourIso: ((i + 5) % 7) + 1, // 1er août 2026 = samedi
      dmnLph: valeur(i),
    }));

  it("apprend pendant 7 nuits sans détecter", () => {
    const b = ligneDeBase(nuits(6, () => 3), 1, R);
    expect(b).toMatchObject({ mode: "apprentissage", valeurLph: null });
    expect(seuilFuiteNuit(b, R)).toBeNull();
  });

  it("reste prudente jusqu'à 14 nuits : seuil doublé et 3 nuits exigées", () => {
    const b = ligneDeBase(nuits(10, () => 3), 1, R);
    expect(b.mode).toBe("prudent");
    expect(seuilFuiteNuit(b, R)).toBe(13); // 3 + max(40 % de 3, 10 L/h)
    expect(nuitsExigees(b.mode, R)).toBe(3);
  });

  it("suit le jour de la semaine avec assez d'historique", () => {
    // Samedis à 12 L/h (piscine), autres jours à 3 L/h.
    const h = nuits(28, (i) => (((i + 5) % 7) + 1 === 6 ? 12 : 3));
    expect(ligneDeBase(h, 6, R)).toMatchObject({ valeurLph: 12, parJourDeSemaine: true, mode: "normal" });
    expect(ligneDeBase(h, 2, R)).toMatchObject({ valeurLph: 3 });
    expect(seuilFuiteNuit(ligneDeBase(h, 2, R), R)).toBe(8); // 3 + max(20 %, 5 L/h)
    expect(nuitsExigees("normal", R)).toBe(2);
  });

  it("accepte des seuils surchargés par la plateforme ou l'organisation", () => {
    const r = fusionnerReglages(R, { fuite_nuit: { nuits: 3, marge_min_lph: 8 }, rupture: { min_lph: "x" } });
    expect(r.fuiteNuit.nuits).toBe(3);
    expect(r.fuiteNuit.margeMinLph).toBe(8);
    expect(r.rupture.minLph).toBe(500);
  });
});

describe("détections", () => {
  const nuit = (dmn: number | null, base = 3, seuil = 8) => ({
    date: "x",
    dmnLph: dmn,
    baselineLph: base,
    seuilLph: seuil,
  });

  it("fuite de nuit : deux nuits de suite au-dessus du seuil", () => {
    expect(detecterFuiteNuit([nuit(3), nuit(28)], 2)).toBeNull();
    expect(detecterFuiteNuit([nuit(29), nuit(28)], 2)).toEqual({ excesLph: 25 });
    expect(detecterFuiteNuit([nuit(29), nuit(null)], 2)).toBeNull();
  });

  it("fin de fuite : retour à la ligne de base deux nuits de suite", () => {
    expect(fuiteReparee([nuit(28), nuit(4)], 2)).toBe(false);
    expect(fuiteReparee([nuit(4), nuit(3)], 2)).toBe(true);
    expect(fuiteReparee([nuit(3)], 2)).toBe(false);
  });

  it("débit continu : jamais sous 5 L/h pendant 24 h", () => {
    expect(detecterDebitContinu(Array(24).fill(6), R)).toEqual({ excesLph: 6 });
    expect(detecterDebitContinu([...Array(23).fill(40), 4], R)).toBeNull();
    expect(detecterDebitContinu(Array(10).fill(40), R)).toBeNull();
  });

  it("rupture : plus de 3 fois le maximum sur 30 jours et plus de 500 L/h", () => {
    expect(detecterRupture(900, 250, R)).toEqual({ excesLph: 650 });
    expect(detecterRupture(700, 250, R)).toBeNull(); // < 750
    expect(detecterRupture(450, 100, R)).toBeNull(); // < 500
    expect(detecterRupture(900, null, R)).toBeNull();
  });

  it("mode fermeture : plus de 2 L/h pendant 2 heures", () => {
    expect(detecterFermeture([0, 3, 4], R)).toEqual({ excesLph: 3 });
    expect(detecterFermeture([3, 1], R)).toBeNull();
    const periodes = lirePeriodesFermeture([
      { start: "2026-11-01", end: "2027-03-31", label: "Hiver" },
      { start: "mauvais" },
    ]);
    expect(periodes).toHaveLength(1);
    expect(periodeFermee(periodes, "2026-12-24")?.libelle).toBe("Hiver");
    expect(periodeFermee(periodes, "2026-10-31")).toBeNull();
  });

  it("capteur muet : 36 h en cellulaire, 6 h en LoRaWAN, jamais pour un import", () => {
    const maintenant = Date.UTC(2026, 8, 28, 12);
    expect(capteurMuet(maintenant - 7 * HEURE_MS, "lorawan", maintenant, R)).toBe(true);
    expect(capteurMuet(maintenant - 7 * HEURE_MS, "cellulaire", maintenant, R)).toBe(false);
    expect(capteurMuet(maintenant - 37 * HEURE_MS, "cellulaire", maintenant, R)).toBe(true);
    expect(capteurMuet(null, "import", maintenant, R)).toBe(false);
  });
});

describe("températures", () => {
  const reglages = lireReglagesTemperature({
    seuils_c: { sortie_production: 55, retour_boucle: 50, point_eloigne: null },
    rappel_analyses_avant_reouverture_jours: null,
  });

  it("alerte sous le seuil du point ou de son type", () => {
    expect(seuilPoint({ type: "sortie_production", thresholdC: null }, reglages)).toBe(55);
    expect(seuilPoint({ type: "retour_boucle", thresholdC: 52 }, reglages)).toBe(52);
    expect(seuilPoint({ type: "point_eloigne", thresholdC: null }, reglages)).toBeNull();
    expect(temperatureBasse(48.5, 50)).toBe(true);
    expect(temperatureBasse(50, 50)).toBe(false);
    expect(temperatureBasse(20, null)).toBe(false);
  });

  it("rappelle les analyses avant la réouverture, seulement si le délai est paramétré", () => {
    const periodes = [{ debut: "2026-11-01", fin: "2027-03-31" }];
    expect(fermetureAvantAnalyses(periodes, "2027-03-20", null)).toBeNull();
    expect(fermetureAvantAnalyses(periodes, "2027-03-20", 15)).toEqual(periodes[0]);
    expect(fermetureAvantAnalyses(periodes, "2027-02-01", 15)).toBeNull();
  });

  it("tient le registre mensuel : premier relevé, minimum, maximum", () => {
    const r = registreMensuel(
      [
        { tsMs: 3, valeurC: 57, mois: "2026-09" },
        { tsMs: 1, valeurC: 58, mois: "2026-09" },
        { tsMs: 2, valeurC: 49, mois: "2026-09" },
        { tsMs: 4, valeurC: 56, mois: "2026-10" },
      ],
      50,
    );
    expect(r).toEqual([
      { mois: "2026-09", premierReleveMs: 1, premiereValeurC: 58, minC: 49, maxC: 58, nbReleves: 3, nbSousSeuil: 1 },
      { mois: "2026-10", premierReleveMs: 4, premiereValeurC: 56, minC: 56, maxC: 56, nbReleves: 1, nbSousSeuil: 0 },
    ]);
  });
});

describe("indicateur par activité", () => {
  it("litres par nuitée saisie", () => {
    expect(
      indicateurActivite({ volumeM3: 405, quantiteSaisie: 1350, capacite: 60, tauxOccupation: 0.7, joursDansMois: 30, unite: "nuitee" }),
    ).toEqual({ litresParUnite: 300, estimation: false, quantite: 1350 });
  });

  it("estimation signalée faute de saisie", () => {
    expect(
      indicateurActivite({ volumeM3: 378, quantiteSaisie: null, capacite: 60, tauxOccupation: 0.7, joursDansMois: 30, unite: "nuitee" }),
    ).toEqual({ litresParUnite: 300, estimation: true, quantite: 1260 });
    expect(
      indicateurActivite({ volumeM3: 10, quantiteSaisie: null, capacite: null, tauxOccupation: null, joursDansMois: 30, unite: "nuitee" }),
    ).toBeNull();
    expect(
      indicateurActivite({ volumeM3: 10, quantiteSaisie: 5, capacite: null, tauxOccupation: null, joursDansMois: 30, unite: "aucune" }),
    ).toBeNull();
  });
});
