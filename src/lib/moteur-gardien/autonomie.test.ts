import { describe, expect, it } from "vitest";
import {
  REGLAGES_AUTONOMIE_DEFAUT,
  analyserAutonomie,
  decisionsAutonomie,
  dureeLisible,
  instantLisible,
  lireReglagesAutonomie,
  volumeA,
  type DonneesAutonomie,
  type MesureNiveau,
} from "./autonomie";
import {
  fractionVolume,
  hauteurEau,
  mesurePourVolumeUtile,
  volumeUtileM3,
  volumeUtileMaxM3,
  volumeUtileMesure,
  type ReserveEau,
} from "./reserves";
import type { Releve } from "./debits";
import { HEURE_MS } from "./temps";

const texte = (s: string) => s.replace(/[  ]/g, " ");

const citerne = (r: Partial<ReserveEau> = {}): ReserveEau => ({
  id: "r1",
  nom: "Citerne",
  capaciteM3: 30,
  hauteurPleineM: 3,
  hauteurPriseM: 0,
  forme: "verticale",
  montage: "hauteur",
  hauteurCapteurM: null,
  seuilBasPct: null,
  ...r,
});

describe("volume des réserves", () => {
  it("cuve debout : volume proportionnel à la hauteur, prise d'eau déduite", () => {
    const r = citerne({ capaciteM3: 10, hauteurPleineM: 2, hauteurPriseM: 0.2, montage: "distance", hauteurCapteurM: 2.3 });
    expect(volumeUtileMaxM3(r)).toBeCloseTo(9, 6);
    // Capteur à 2,30 m du fond, surface à 1,30 m du capteur : 1 m d'eau.
    expect(hauteurEau(1.3, r)).toBeCloseTo(1, 6);
    expect(volumeUtileMesure(1.3, r)).toBeCloseTo(4, 6);
    // Sous la prise d'eau : rien d'utilisable ; au-dessus du plein : borné.
    expect(volumeUtileMesure(2.25, r)).toBe(0);
    expect(volumeUtileMesure(0.1, r)).toBeCloseTo(9, 6);
  });

  it("cuve couchée : segment de disque", () => {
    const r = citerne({ capaciteM3: 10, hauteurPleineM: 2, forme: "cylindre_horizontal" });
    expect(fractionVolume(1, r)).toBeCloseTo(0.5, 6);
    expect(volumeUtileM3(0.5, r)).toBeCloseTo(1.955, 3);
    expect(volumeUtileM3(1.5, r)).toBeCloseTo(10 - 1.955, 3);
  });

  it("mesure inverse (démonstration et essais)", () => {
    const r = citerne({ forme: "cylindre_horizontal", montage: "distance", hauteurCapteurM: 3.2, hauteurPriseM: 0.3 });
    const m = mesurePourVolumeUtile(12.5, r);
    expect(volumeUtileMesure(m, r)).toBeCloseTo(12.5, 4);
  });
});

describe("réglages et mise en forme", () => {
  it("surcharges successives, valeurs absurdes ignorées", () => {
    const r = lireReglagesAutonomie({ seuil_bas_pct: 30, coupure: { heures: 3 } }, { alerte_avant_seuil_h: 4, seuil_bas_pct: -5 });
    expect(r).toEqual({
      ...REGLAGES_AUTONOMIE_DEFAUT,
      seuilBasPct: 30,
      alerteAvantSeuilH: 4,
      coupure: { ...REGLAGES_AUTONOMIE_DEFAUT.coupure, heures: 3 },
    });
  });

  it("durées et heures lisibles, à l'heure du site", () => {
    expect(dureeLisible(0.4)).toBe("moins d'une heure");
    expect(dureeLisible(13.6)).toBe("14 h");
    expect(dureeLisible(54)).toBe("2 jours et 6 h");
    const maintenant = Date.UTC(2026, 9, 2, 10, 10);
    // Kinshasa : UTC+1 ; Lubumbashi : UTC+2.
    expect(instantLisible(Date.UTC(2026, 9, 2, 16), "Africa/Kinshasa", maintenant)).toBe("à 17:00");
    expect(instantLisible(Date.UTC(2026, 9, 2, 23), "Africa/Lubumbashi", maintenant)).toBe("demain à 01:00");
    expect(instantLisible(Date.UTC(2026, 9, 5, 7), "Africa/Kinshasa", maintenant)).toBe("le 5 octobre à 08:00");
  });

  it("interpolation du volume entre deux mesures proches seulement", () => {
    const points = [
      { tsMs: 0, volumeM3: 10 },
      { tsMs: 2 * HEURE_MS, volumeM3: 8 },
      { tsMs: 10 * HEURE_MS, volumeM3: 4 },
    ];
    expect(volumeA(points, HEURE_MS)).toBe(9);
    expect(volumeA(points, 5 * HEURE_MS)).toBeNull();
    expect(volumeA(points, 10.5 * HEURE_MS)).toBe(4);
    expect(volumeA(points, 12 * HEURE_MS)).toBeNull();
  });
});

// Hôtel : 1 m³/h consommé jour et nuit, une citerne de 30 m³ (3 m), tenue
// pleine par un robinet à flotteur. Coupure du réseau 18 h avant H.
const H = Date.UTC(2026, 9, 2, 10);
const MAINTENANT = H + 10 * 60_000;
const FUSEAU = "Europe/Paris";

function scenario(p: { coupureH: number | null; retourH?: number; consoM3h?: number; volumeDepart?: number }) {
  const conso = p.consoM3h ?? 1;
  const mesures: MesureNiveau[] = [];
  const arrivee: Releve[] = [];
  let v = p.volumeDepart ?? 30;
  for (let t = H - 8 * 24 * HEURE_MS; t < H; t += HEURE_MS) {
    const coupe = p.coupureH !== null && t >= H - p.coupureH * HEURE_MS && (p.retourH === undefined || t < H - p.retourH * HEURE_MS);
    mesures.push({ tsMs: t, mesureM: v / 10 });
    if (coupe) {
      v = Math.max(0, v - conso);
      arrivee.push({ tsMs: t + HEURE_MS, volumeM3: 0 });
    } else {
      // Le flotteur remplit jusqu'au plein.
      const apport = Math.min(30, v + 6) - v + conso;
      v = Math.min(30, v + 6);
      arrivee.push({ tsMs: t + HEURE_MS, volumeM3: apport });
    }
  }
  mesures.push({ tsMs: H, mesureM: v / 10 });
  return { mesures, arrivee };
}

function donnees(s: { mesures: MesureNiveau[]; arrivee: Releve[] | null }, extra: Partial<DonneesAutonomie> = {}): DonneesAutonomie {
  return {
    fuseau: FUSEAU,
    maintenantMs: MAINTENANT,
    reglages: REGLAGES_AUTONOMIE_DEFAUT,
    reserves: [{ reserve: citerne(), mesures: s.mesures }],
    arrivees: s.arrivee ? [s.arrivee] : null,
    coupureEnCours: null,
    ...extra,
  };
}

describe("autonomie au rythme de consommation réel", () => {
  it("réseau alimenté : réserves pleines, autonomie en cas de coupure", () => {
    const e = analyserAutonomie(donnees(scenario({ coupureH: null })));
    expect(e.arrivee).toBe("alimente");
    expect(e.volumeUtileM3).toBe(30);
    expect(e.pct).toBe(100);
    expect(e.consommationM3h).toBe(1);
    // 30 m³ à 1 m³/h depuis H (10 minutes avant maintenant).
    expect(e.autonomieH).toBeCloseTo(29.8, 1);
    expect(e.nouvelleCoupure).toBeNull();
    expect(e.raisons).toEqual([]);
  });

  it("arrivée nulle mais réserves pleines (flotteur fermé) : pas de coupure", () => {
    const s = scenario({ coupureH: null, consoM3h: 0 });
    const e = analyserAutonomie(donnees({ mesures: s.mesures, arrivee: s.arrivee.map((r) => ({ ...r, volumeM3: 0 })) }));
    expect(e.nouvelleCoupure).toBeNull();
    expect(e.arrivee).toBe("alimente");
    expect(e.auDelaHorizon).toBe(true);
  });

  it("coupure détectée : début, volume restant, heure du niveau bas", () => {
    const e = analyserAutonomie(donnees(scenario({ coupureH: 18 })));
    expect(e.nouvelleCoupure).toEqual({ debutMs: H - 18 * HEURE_MS });
    expect(e.arrivee).toBe("coupe");
    expect(e.volumeUtileM3).toBe(12);
    expect(e.seuilBasM3).toBe(6);
    expect(e.consommationM3h).toBe(1);
    expect(e.heureSeuilBasMs).toBe(H + 6 * HEURE_MS);
    expect(e.heureVideMs).toBe(H + 12 * HEURE_MS);
    expect(e.autonomieH).toBeCloseTo(11.8, 1);
    expect(e.courbe.at(-1)).toEqual({ tMs: H, volumeM3: 12 });
    expect(e.prevision.at(-1)).toEqual({ tMs: H + 12 * HEURE_MS, volumeM3: 0 });
  });

  it("coupure trop courte (1 h) : rien", () => {
    const e = analyserAutonomie(donnees(scenario({ coupureH: 1 })));
    expect(e.nouvelleCoupure).toBeNull();
  });

  it("retour de l'eau : fin de la coupure enregistrée", () => {
    const e = analyserAutonomie(
      donnees(scenario({ coupureH: 10, retourH: 3 }), { coupureEnCours: { id: "c1", debutMs: H - 10 * HEURE_MS } }),
    );
    expect(e.finCoupureMs).toBe(H - 3 * HEURE_MS);
    expect(e.arrivee).toBe("alimente");
  });

  it("sans compteur d'arrivée : consommation estimée sur les baisses, pas de coupure", () => {
    const s = scenario({ coupureH: 18 });
    const e = analyserAutonomie(donnees({ mesures: s.mesures, arrivee: null }));
    expect(e.consommationEstimee).toBe(true);
    expect(e.consommationM3h).toBe(1);
    expect(e.nouvelleCoupure).toBeNull();
    expect(e.arrivee).toBe("inconnu");
    expect(e.raisons.join(" ")).toContain("Aucun compteur d'arrivée");
  });

  it("capteur de niveau muet : niveau inconnu, aucune prévision", () => {
    const s = scenario({ coupureH: null });
    const e = analyserAutonomie(donnees(s, { maintenantMs: H + 7 * HEURE_MS }));
    expect(e.reserves[0].muette).toBe(true);
    expect(e.volumeUtileM3).toBeNull();
    expect(e.autonomieH).toBeNull();
    expect(e.raisons.join(" ")).toContain("aucune mesure de niveau depuis plus de 6 heures");
  });
});

describe("décisions d'alerte", () => {
  const decider = (e: ReturnType<typeof analyserAutonomie>, coupureEnCours: { id: string; debutMs: number } | null, alertes: Parameters<typeof decisionsAutonomie>[0]["alertes"] = []) =>
    decisionsAutonomie({ siteId: "s1", fuseau: FUSEAU, maintenantMs: MAINTENANT, reglages: REGLAGES_AUTONOMIE_DEFAUT, etat: e, coupureEnCours, alertes });

  it("à la coupure : alerte coupure et niveau bas prévu dans moins de 6 h", () => {
    const d = decider(analyserAutonomie(donnees(scenario({ coupureH: 18 }))), null);
    expect(d.nouvelleCoupure).toEqual({ debutMs: H - 18 * HEURE_MS });
    expect(d.alertesAOuvrir.map((a) => a.type)).toEqual(["coupure_reseau", "reserve_basse"]);
    const [coupure, basse] = d.alertesAOuvrir;
    expect(coupure.cle).toBe(`coupure:s1:${new Date(H - 18 * HEURE_MS).toISOString()}`);
    expect(texte(coupure.description)).toContain("depuis hier à 18:00 alors que les réserves baissent");
    expect(texte(coupure.description)).toContain("Réserves : 40 % (12 m³ utiles sur 30 m³)");
    expect(texte(basse.description)).toContain("niveau bas à 18:00 (dans 6 h)");
  });

  it("coupure récente, niveau bas lointain : seulement l'alerte coupure", () => {
    const d = decider(analyserAutonomie(donnees(scenario({ coupureH: 4 }))), null);
    expect(d.alertesAOuvrir.map((a) => a.type)).toEqual(["coupure_reseau"]);
  });

  it("coupure en cours : suivi, pas de seconde alerte", () => {
    const e = analyserAutonomie(donnees(scenario({ coupureH: 18 }), { coupureEnCours: { id: "c1", debutMs: H - 18 * HEURE_MS } }));
    const d = decider(e, { id: "c1", debutMs: H - 18 * HEURE_MS }, [
      { id: "a1", type: "coupure_reseau", cle: "x" },
      { id: "a2", type: "reserve_basse", cle: "reserve_basse:s1" },
    ]);
    expect(d.nouvelleCoupure).toBeNull();
    expect(d.suiviCoupure).toEqual({ autonomieH: e.autonomieH, volumeUtileM3: 12 });
    expect(d.alertesAOuvrir).toEqual([]);
    expect(d.alertesAResoudre).toEqual([]);
  });

  it("retour de l'eau et réserves remontées : alertes résolues", () => {
    const e = analyserAutonomie(
      donnees(scenario({ coupureH: 10, retourH: 3 }), { coupureEnCours: { id: "c1", debutMs: H - 10 * HEURE_MS } }),
    );
    const d = decider(e, { id: "c1", debutMs: H - 10 * HEURE_MS }, [
      { id: "a1", type: "coupure_reseau", cle: "x" },
      { id: "a2", type: "reserve_basse", cle: "reserve_basse:s1" },
    ]);
    expect(d.finCoupure).toEqual({ id: "c1", finMs: H - 3 * HEURE_MS });
    expect(d.alertesAResoudre).toEqual(["a1", "a2"]);
  });

  it("sous le niveau bas sans coupure (consommation plus forte que l'arrivée) : alerte", () => {
    const s = scenario({ coupureH: null, volumeDepart: 4 });
    // Arrivée faible : la citerne reste à 4 m³ (13 %).
    const mesures = s.mesures.map((m) => ({ ...m, mesureM: 0.4 }));
    const d = decider(analyserAutonomie(donnees({ mesures, arrivee: s.arrivee })), null);
    expect(d.alertesAOuvrir.map((a) => a.type)).toEqual(["reserve_basse"]);
    expect(d.alertesAOuvrir[0].titre).toBe("Réserves d'eau sous le niveau bas");
  });
});
