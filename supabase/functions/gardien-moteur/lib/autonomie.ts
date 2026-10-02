// Autonomie en eau d'un site (phase G11) : volume utile des réserves,
// rythme de consommation réel, heures d'autonomie, prévision de l'heure du
// niveau bas, détection de la coupure du réseau public et décisions
// d'alerte. Fonctions pures, partagées par le moteur (gardien-moteur), les
// écrans et les rapports.
//
// Consommation d'une heure = eau arrivée par le compteur d'arrivée du
// réseau public − variation du volume stocké dans les réserves. Pendant
// une coupure, rien n'arrive : la consommation est la baisse des réserves.
//
// Coupure : plus aucune arrivée d'eau pendant n heures (2 par défaut)
// alors que les réserves baissent. Une arrivée nulle avec des réserves
// pleines est normale (robinet à flotteur fermé) : elle ne déclenche rien.
import { mediane } from "./baseline.ts";
import { debitsHoraires, type Releve } from "./debits.ts";
import { HEURE_MS, debutHeure, partiesLocales } from "./temps.ts";
import {
  volumeStockeM3,
  volumeUtileMaxM3,
  hauteurEau,
  type ReserveEau,
} from "./reserves.ts";

export interface ReglagesAutonomie {
  coupure: { heures: number; arriveeMaxLph: number; baisseMinPct: number };
  /** Niveau bas par défaut (% du volume utile). */
  seuilBasPct: number;
  /** Alerte quand le niveau bas est prévu dans moins de n heures (pendant une coupure). */
  alerteAvantSeuilH: number;
  /** Jours d'historique pour le profil de consommation heure par heure. */
  profilJours: number;
}

/**
 * Valeurs de départ, à valider sur le terrain (TODO(RAYAN)) : surchargées
 * par platform_settings.autonomie puis organizations.settings.gardien.autonomie.
 */
export const REGLAGES_AUTONOMIE_DEFAUT: ReglagesAutonomie = {
  coupure: { heures: 2, arriveeMaxLph: 1, baisseMinPct: 2 },
  seuilBasPct: 20,
  alerteAvantSeuilH: 6,
  profilJours: 7,
};

/** Au-delà, le niveau d'une réserve est inconnu (capteur muet). */
export const FRAICHEUR_NIVEAU_MS = 6 * HEURE_MS;
/** Écart maximal entre deux mesures pour interpoler le volume. */
export const ECART_INTERPOLATION_MS = 3 * HEURE_MS;
/** Horizon de la prévision. */
export const HORIZON_H = 14 * 24;
/** Fenêtre de la courbe affichée. */
export const COURBE_H = 48;
/** Heures de consommation connues exigées pour calculer un rythme. */
export const HEURES_MIN_RYTHME = 6;

type Brut = Record<string, unknown> | null | undefined;

function nombre(v: unknown, defaut: number, max = Infinity): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : defaut;
}

function bloc(brut: Brut, cle: string): Record<string, unknown> {
  const v = brut?.[cle];
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

/** Réglages successifs (plateforme puis organisation), clés en snake_case. */
export function lireReglagesAutonomie(...bruts: unknown[]): ReglagesAutonomie {
  return bruts.reduce<ReglagesAutonomie>((base, b) => {
    const brut = (typeof b === "object" && b !== null ? b : null) as Brut;
    const c = bloc(brut, "coupure");
    return {
      coupure: {
        heures: Math.max(1, Math.round(nombre(c.heures, base.coupure.heures, 48))),
        arriveeMaxLph: nombre(c.arrivee_max_lph, base.coupure.arriveeMaxLph),
        baisseMinPct: nombre(c.baisse_min_pct, base.coupure.baisseMinPct, 100),
      },
      seuilBasPct: nombre(brut?.seuil_bas_pct, base.seuilBasPct, 100),
      alerteAvantSeuilH: nombre(brut?.alerte_avant_seuil_h, base.alerteAvantSeuilH, HORIZON_H),
      profilJours: Math.max(1, Math.round(nombre(brut?.profil_jours, base.profilJours, 56))),
    };
  }, REGLAGES_AUTONOMIE_DEFAUT);
}

export interface MesureNiveau {
  tsMs: number;
  /** Valeur du capteur en mètres (distance ou hauteur selon le montage). */
  mesureM: number;
}

export interface DonneesAutonomie {
  fuseau: string;
  maintenantMs: number;
  reglages: ReglagesAutonomie;
  reserves: { reserve: ReserveEau; mesures: MesureNiveau[] }[];
  /** Relevés de chaque compteur d'arrivée du réseau public ; null : aucun compteur d'arrivée. */
  arrivees: Releve[][] | null;
  /** Coupure déjà enregistrée et non terminée. */
  coupureEnCours: { id: string; debutMs: number } | null;
}

export interface EtatReserve {
  id: string;
  nom: string;
  hauteurM: number | null;
  volumeUtileM3: number | null;
  volumeUtileMaxM3: number;
  /** Part du volume utile (0 à 100). */
  pct: number | null;
  seuilBasPct: number;
  derniereMesureMs: number | null;
  /** Mesure trop ancienne ou absente. */
  muette: boolean;
}

export type EtatArrivee = "alimente" | "coupe" | "inconnu";

export interface EtatAutonomie {
  reserves: EtatReserve[];
  volumeUtileM3: number | null;
  volumeUtileMaxM3: number;
  pct: number | null;
  seuilBasM3: number;
  sousSeuil: boolean;
  /** Moyenne des dernières 24 h (m³/h). */
  consommationM3h: number | null;
  /** Sans compteur d'arrivée : consommation déduite des seules baisses de niveau. */
  consommationEstimee: boolean;
  /** Profil par heure locale (0 à 23), m³/h. */
  profil: (number | null)[];
  /** Instant de la dernière mesure prise en compte (départ de la prévision). */
  referenceMs: number | null;
  /** Heures avant d'épuiser le volume utile, depuis maintenant. */
  autonomieH: number | null;
  heureVideMs: number | null;
  /** Consommation connue mais réserves non épuisées dans l'horizon (14 jours). */
  auDelaHorizon: boolean;
  /** Null si déjà sous le niveau bas ou au-delà de l'horizon. */
  heureSeuilBasMs: number | null;
  arrivee: EtatArrivee;
  /** Coupure repérée par cette analyse (non encore enregistrée). */
  nouvelleCoupure: { debutMs: number } | null;
  /** Fin d'une coupure enregistrée : retour de l'eau. */
  finCoupureMs: number | null;
  /** Volume utile heure par heure (48 dernières heures). */
  courbe: { tMs: number; volumeM3: number | null }[];
  /** Prévision heure par heure, au rythme réel, sans arrivée d'eau. */
  prevision: { tMs: number; volumeM3: number }[];
  raisons: string[];
}

const arrondi = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

interface PointVolume {
  tsMs: number;
  volumeM3: number;
}

/** Volume stocké à l'instant t : interpolation entre deux mesures proches. */
export function volumeA(points: PointVolume[], t: number): number | null {
  if (!points.length || t < points[0].tsMs) return null;
  let bas = 0;
  let haut = points.length - 1;
  if (t >= points[haut].tsMs) {
    return t - points[haut].tsMs <= HEURE_MS ? points[haut].volumeM3 : null;
  }
  while (haut - bas > 1) {
    const m = (bas + haut) >> 1;
    if (points[m].tsMs <= t) bas = m;
    else haut = m;
  }
  const a = points[bas];
  const b = points[haut];
  if (t === a.tsMs) return a.volumeM3;
  if (b.tsMs - a.tsMs > ECART_INTERPOLATION_MS) return null;
  return a.volumeM3 + ((b.volumeM3 - a.volumeM3) * (t - a.tsMs)) / (b.tsMs - a.tsMs);
}

/** « 14 h », « 2 jours et 6 h », « moins d'une heure ». */
export function dureeLisible(heures: number): string {
  if (heures < 1) return "moins d'une heure";
  const h = Math.round(heures);
  if (h < 48) return `${h} h`;
  const j = Math.floor(h / 24);
  const r = h % 24;
  return `${j} jours${r ? ` et ${r} h` : ""}`;
}

function hhmm(ms: number, fuseau: string): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: fuseau }).format(new Date(ms));
}

/** « à 14:30 », « hier à 18:00 », « demain à 03:00 », « le 1er octobre à 03:00 » (heure du site). */
export function instantLisible(ms: number, fuseau: string, maintenantMs: number): string {
  const jour = partiesLocales(ms, fuseau).date;
  const decale = (n: number) => partiesLocales(maintenantMs + n * 24 * HEURE_MS, fuseau).date;
  const heure = hhmm(ms, fuseau);
  if (jour === decale(0)) return `à ${heure}`;
  if (jour === decale(1)) return `demain à ${heure}`;
  if (jour === decale(-1)) return `hier à ${heure}`;
  const mois = new Intl.DateTimeFormat("fr-FR", { month: "long", timeZone: "UTC" }).format(new Date(`${jour}T12:00:00Z`));
  const n = Number(jour.slice(8));
  return `le ${n === 1 ? "1er" : n} ${mois} à ${heure}`;
}

export function analyserAutonomie(d: DonneesAutonomie): EtatAutonomie {
  const r = d.reglages;
  const raisons: string[] = [];
  const heureCourante = debutHeure(d.maintenantMs);
  const premiereHeure = heureCourante - r.profilJours * 24 * HEURE_MS;

  // 1) Réserves : volumes stockés dans le temps, état présent.
  const series = d.reserves.map(({ reserve, mesures }) => {
    const points: (PointVolume & { hauteurM: number })[] = mesures
      .filter((m) => m.tsMs <= d.maintenantMs)
      .map((m) => {
        const h = hauteurEau(m.mesureM, reserve);
        return h === null ? null : { tsMs: m.tsMs, volumeM3: volumeStockeM3(h, reserve), hauteurM: h };
      })
      .filter((p): p is PointVolume & { hauteurM: number } => p !== null)
      .sort((a, b) => a.tsMs - b.tsMs);
    return { reserve, points, prise: volumeStockeM3(reserve.hauteurPriseM, reserve) };
  });

  const reserves: EtatReserve[] = series.map(({ reserve, points, prise }) => {
    const derniere = points[points.length - 1] ?? null;
    const max = volumeUtileMaxM3(reserve);
    const muette = !derniere || d.maintenantMs - derniere.tsMs > FRAICHEUR_NIVEAU_MS;
    const utile = muette ? null : Math.max(0, derniere.volumeM3 - prise);
    const hauteur = muette ? null : derniere.hauteurM;
    if (muette) {
      raisons.push(
        derniere
          ? `« ${reserve.nom} » : aucune mesure de niveau depuis plus de ${FRAICHEUR_NIVEAU_MS / HEURE_MS} heures.`
          : `« ${reserve.nom} » : aucune mesure de niveau reçue.`,
      );
    }
    return {
      id: reserve.id,
      nom: reserve.nom,
      hauteurM: hauteur === null ? null : arrondi(hauteur, 3),
      volumeUtileM3: utile === null ? null : arrondi(utile),
      volumeUtileMaxM3: arrondi(max),
      pct: utile === null || max <= 0 ? null : arrondi((utile / max) * 100, 1),
      seuilBasPct: reserve.seuilBasPct ?? r.seuilBasPct,
      derniereMesureMs: derniere?.tsMs ?? null,
      muette,
    };
  });
  if (!d.reserves.length) raisons.push("Aucune réserve d'eau enregistrée pour ce site.");

  const volumeUtileMax = reserves.reduce((s, x) => s + x.volumeUtileMaxM3, 0);
  const seuilBasM3 = reserves.reduce((s, x) => s + (x.volumeUtileMaxM3 * x.seuilBasPct) / 100, 0);
  const connu = reserves.length > 0 && reserves.every((x) => x.volumeUtileM3 !== null);
  const volumeUtile = connu ? reserves.reduce((s, x) => s + (x.volumeUtileM3 as number), 0) : null;
  const referenceMs = connu ? Math.max(...reserves.map((x) => x.derniereMesureMs as number)) : null;

  /** Volume stocké total du site à l'instant t (null si une réserve manque). */
  const totalStocke = (t: number): number | null => {
    if (!series.length) return null;
    let s = 0;
    for (const x of series) {
      const v = volumeA(x.points, t);
      if (v === null) return null;
      s += v;
    }
    return s;
  };
  const totalPrise = series.reduce((s, x) => s + x.prise, 0);

  // 2) Arrivées du réseau public, heure par heure (litres).
  const arriveesParHeure: Map<number, { litres: number; couverture: number }>[] | null = d.arrivees
    ? d.arrivees.map(
        (releves) => new Map(debitsHoraires(releves).map((h) => [h.heureMs, { litres: h.litres, couverture: h.couverture }])),
      )
    : null;
  if (!arriveesParHeure) {
    raisons.push("Aucun compteur d'arrivée du réseau public désigné : une coupure ne peut pas être détectée.");
  }
  const arrivee = (h: number): number | null => {
    if (!arriveesParHeure || !arriveesParHeure.length) return null;
    let s = 0;
    for (const m of arriveesParHeure) {
      const x = m.get(h);
      if (!x || x.couverture < 0.5) return null;
      s += x.litres;
    }
    return s;
  };

  // 3) Consommation réelle heure par heure (m³), sur la fenêtre du profil.
  const consommations = new Map<number, number>();
  for (let h = premiereHeure; h < heureCourante; h += HEURE_MS) {
    const v0 = totalStocke(h);
    const v1 = totalStocke(h + HEURE_MS);
    if (v0 === null || v1 === null) continue;
    const variation = v1 - v0;
    if (arriveesParHeure) {
      const a = arrivee(h);
      if (a === null) continue;
      consommations.set(h, Math.max(0, a / 1000 - variation));
    } else if (variation < 0) {
      consommations.set(h, -variation);
    }
  }
  const dernieres24 = [...consommations.entries()].filter(([h]) => h >= heureCourante - 24 * HEURE_MS).map(([, v]) => v);
  const toutes = [...consommations.values()];
  const moyenne = (liste: number[]) => liste.reduce((s, v) => s + v, 0) / liste.length;
  const consommationM3h =
    dernieres24.length >= HEURES_MIN_RYTHME
      ? arrondi(moyenne(dernieres24))
      : toutes.length >= HEURES_MIN_RYTHME
        ? arrondi(moyenne(toutes))
        : null;
  const profil: (number | null)[] = Array.from({ length: 24 }, (_, k) => {
    const valeurs = [...consommations.entries()]
      .filter(([h]) => partiesLocales(h, d.fuseau).heure === k)
      .map(([, v]) => v);
    return valeurs.length >= 2 ? arrondi(mediane(valeurs) as number) : null;
  });
  if (d.reserves.length && consommationM3h === null) {
    raisons.push(`Pas encore assez de mesures pour connaître le rythme de consommation (au moins ${HEURES_MIN_RYTHME} heures).`);
  }

  // 4) Prévision au rythme réel, sans arrivée d'eau.
  let heureVideMs: number | null = null;
  let heureSeuilBasMs: number | null = null;
  let projete = false;
  const prevision: { tMs: number; volumeM3: number }[] = [];
  if (volumeUtile !== null && referenceMs !== null && consommationM3h !== null) {
    projete = true;
    let v = volumeUtile;
    let t = referenceMs;
    const fin = referenceMs + HORIZON_H * HEURE_MS;
    prevision.push({ tMs: t, volumeM3: arrondi(v) });
    while (t < fin && heureVideMs === null) {
      const suivante = debutHeure(t) + HEURE_MS;
      const debit = profil[partiesLocales(t, d.fuseau).heure] ?? consommationM3h;
      const dureeH = (suivante - t) / HEURE_MS;
      const apres = v - debit * dureeH;
      if (heureSeuilBasMs === null && v > seuilBasM3 && apres <= seuilBasM3 && debit > 0) {
        heureSeuilBasMs = Math.round(t + ((v - seuilBasM3) / debit) * HEURE_MS);
      }
      if (apres <= 0 && debit > 0) {
        heureVideMs = Math.round(t + (v / debit) * HEURE_MS);
        v = 0;
      } else {
        v = apres;
      }
      t = suivante;
      if (t - referenceMs <= COURBE_H * HEURE_MS || heureVideMs !== null) {
        prevision.push({ tMs: heureVideMs ?? t, volumeM3: arrondi(Math.max(0, v)) });
      }
    }
  }
  const sousSeuil = volumeUtile !== null && volumeUtile < seuilBasM3;

  // 5) Coupure du réseau public.
  let nouvelleCoupure: { debutMs: number } | null = null;
  let finCoupureMs: number | null = null;
  const derniereHeure = heureCourante - HEURE_MS;
  const seuilArrivee = r.coupure.arriveeMaxLph;
  if (arriveesParHeure && d.coupureEnCours) {
    for (let h = debutHeure(d.coupureEnCours.debutMs); h <= derniereHeure; h += HEURE_MS) {
      const a = arrivee(h);
      if (a !== null && a > seuilArrivee) {
        finCoupureMs = h;
        break;
      }
    }
  } else if (arriveesParHeure && series.length) {
    let n = 0;
    let h = derniereHeure;
    while (n < 48) {
      const a = arrivee(h);
      if (a === null || a > seuilArrivee) break;
      n++;
      h -= HEURE_MS;
    }
    if (n >= r.coupure.heures) {
      const debutRun = h + HEURE_MS;
      const finRun = derniereHeure + HEURE_MS;
      let vDebut: number | null = null;
      for (let t = debutRun; t <= finRun && vDebut === null; t += HEURE_MS) vDebut = totalStocke(t);
      let vFin: number | null = null;
      for (let t = finRun; t >= debutRun && vFin === null; t -= HEURE_MS) vFin = totalStocke(t);
      const baisseMin = Math.max((r.coupure.baisseMinPct / 100) * volumeUtileMax, 0.05);
      if (vDebut !== null && vFin !== null && vDebut - vFin >= baisseMin) {
        nouvelleCoupure = { debutMs: debutRun };
      }
    }
  }

  const coupe = (d.coupureEnCours !== null && finCoupureMs === null) || nouvelleCoupure !== null;
  let etatArrivee: EtatArrivee = "inconnu";
  if (coupe) etatArrivee = "coupe";
  else if (arriveesParHeure) {
    for (let h = derniereHeure; h > derniereHeure - 3 * HEURE_MS; h -= HEURE_MS) {
      if (arrivee(h) !== null) {
        etatArrivee = "alimente";
        break;
      }
    }
  }

  // 6) Courbe des 48 dernières heures (volume utile).
  const courbe: { tMs: number; volumeM3: number | null }[] = [];
  for (let t = heureCourante - COURBE_H * HEURE_MS; t <= heureCourante; t += HEURE_MS) {
    const v = totalStocke(t);
    courbe.push({ tMs: t, volumeM3: v === null ? null : arrondi(Math.max(0, v - totalPrise)) });
  }

  return {
    reserves,
    volumeUtileM3: volumeUtile === null ? null : arrondi(volumeUtile),
    volumeUtileMaxM3: arrondi(volumeUtileMax),
    pct: volumeUtile === null || volumeUtileMax <= 0 ? null : arrondi((volumeUtile / volumeUtileMax) * 100, 1),
    seuilBasM3: arrondi(seuilBasM3),
    sousSeuil,
    consommationM3h,
    consommationEstimee: d.arrivees === null,
    profil,
    referenceMs,
    autonomieH: heureVideMs === null ? null : arrondi(Math.max(0, (heureVideMs - d.maintenantMs) / HEURE_MS), 1),
    heureVideMs,
    auDelaHorizon: projete && heureVideMs === null,
    heureSeuilBasMs: sousSeuil ? null : heureSeuilBasMs,
    arrivee: etatArrivee,
    nouvelleCoupure,
    finCoupureMs,
    courbe,
    prevision,
    raisons,
  };
}

// ---------------------------------------------------------------------------
// Décisions du moteur : coupures et alertes
// ---------------------------------------------------------------------------

export interface AlerteAutonomieConnue {
  id: string;
  type: "coupure_reseau" | "reserve_basse";
  cle: string;
}

export interface AlerteAutonomie {
  type: "coupure_reseau" | "reserve_basse";
  cle: string;
  severite: "haute";
  titre: string;
  description: string;
  donnees: Record<string, unknown>;
}

export interface DecisionsAutonomie {
  nouvelleCoupure: { debutMs: number } | null;
  finCoupure: { id: string; finMs: number } | null;
  /** Coupure toujours en cours : autonomie et volume du moment (minimum suivi). */
  suiviCoupure: { autonomieH: number | null; volumeUtileM3: number | null } | null;
  alertesAOuvrir: AlerteAutonomie[];
  alertesAResoudre: string[];
}

const fr = (n: number, d = 1) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: d }).format(n);

/** Phrase « Réserves : 25 % (9,6 m³ utiles). » */
export function phraseReserves(e: EtatAutonomie): string {
  return e.volumeUtileM3 === null
    ? "Niveau des réserves inconnu."
    : `Réserves : ${fr(e.pct ?? 0, 0)} % (${fr(e.volumeUtileM3, 1)} m³ utiles sur ${fr(e.volumeUtileMaxM3, 1)} m³).`;
}

/** Phrase d'autonomie au rythme réel, avec l'heure du niveau bas. */
export function phraseAutonomie(e: EtatAutonomie, fuseau: string, maintenantMs: number): string {
  if (e.auDelaHorizon) return `Autonomie estimée au rythme de consommation réel : plus de ${HORIZON_H / 24} jours.`;
  if (e.autonomieH === null) return "Autonomie non calculable pour l'instant.";
  const seuil = e.heureSeuilBasMs !== null ? `, niveau bas prévu ${instantLisible(e.heureSeuilBasMs, fuseau, maintenantMs)}` : "";
  return `Autonomie estimée au rythme de consommation réel : ${dureeLisible(e.autonomieH)}${seuil}.`;
}

export function decisionsAutonomie(p: {
  siteId: string;
  fuseau: string;
  maintenantMs: number;
  reglages: ReglagesAutonomie;
  etat: EtatAutonomie;
  coupureEnCours: { id: string; debutMs: number } | null;
  alertes: AlerteAutonomieConnue[];
}): DecisionsAutonomie {
  const { etat: e, fuseau, maintenantMs: now } = p;
  const decisions: DecisionsAutonomie = {
    nouvelleCoupure: e.nouvelleCoupure,
    finCoupure: p.coupureEnCours && e.finCoupureMs !== null ? { id: p.coupureEnCours.id, finMs: e.finCoupureMs } : null,
    suiviCoupure:
      p.coupureEnCours && e.finCoupureMs === null
        ? { autonomieH: e.autonomieH, volumeUtileM3: e.volumeUtileM3 }
        : null,
    alertesAOuvrir: [],
    alertesAResoudre: [],
  };
  const ouvertes = (type: AlerteAutonomieConnue["type"]) => p.alertes.filter((a) => a.type === type);

  // Coupure : alerte à la détection, résolue au retour de l'eau.
  if (e.nouvelleCoupure && !ouvertes("coupure_reseau").length) {
    decisions.alertesAOuvrir.push({
      type: "coupure_reseau",
      cle: `coupure:${p.siteId}:${new Date(e.nouvelleCoupure.debutMs).toISOString()}`,
      severite: "haute",
      titre: "Coupure du réseau public",
      description: `Plus aucune arrivée d'eau sur le compteur d'arrivée depuis ${instantLisible(e.nouvelleCoupure.debutMs, fuseau, now).replace(/^à /, "")} alors que les réserves baissent : coupure du réseau public ou vanne d'arrivée fermée. ${phraseReserves(e)} ${phraseAutonomie(e, fuseau, now)}`,
      donnees: {
        debut: new Date(e.nouvelleCoupure.debutMs).toISOString(),
        volume_utile_m3: e.volumeUtileM3,
        autonomie_h: e.autonomieH,
        niveau_bas_prevu: e.heureSeuilBasMs ? new Date(e.heureSeuilBasMs).toISOString() : null,
      },
    });
  }
  if (decisions.finCoupure) {
    decisions.alertesAResoudre.push(...ouvertes("coupure_reseau").map((a) => a.id));
  }

  // Niveau bas : prévu dans moins de n heures pendant une coupure, ou atteint.
  const coupe = e.arrivee === "coupe";
  const basse = ouvertes("reserve_basse");
  const prochain =
    coupe &&
    e.heureSeuilBasMs !== null &&
    e.heureSeuilBasMs - now <= p.reglages.alerteAvantSeuilH * HEURE_MS;
  if (e.volumeUtileM3 !== null && (e.sousSeuil || prochain) && !basse.length) {
    decisions.alertesAOuvrir.push({
      type: "reserve_basse",
      cle: `reserve_basse:${p.siteId}`,
      severite: "haute",
      titre: e.sousSeuil ? "Réserves d'eau sous le niveau bas" : "Niveau bas des réserves bientôt atteint",
      description: e.sousSeuil
        ? `${phraseReserves(e)} Le niveau bas réglé est de ${fr(e.seuilBasM3, 1)} m³. ${phraseAutonomie(e, fuseau, now)}`
        : `Au rythme de consommation réel, les réserves atteindront le niveau bas ${instantLisible(e.heureSeuilBasMs as number, fuseau, now)} (dans ${dureeLisible((e.heureSeuilBasMs as number - now) / HEURE_MS)}). ${phraseReserves(e)} Prévoyez une solution d'appoint (camion-citerne, économies d'eau).`,
      donnees: {
        volume_utile_m3: e.volumeUtileM3,
        pct: e.pct,
        autonomie_h: e.autonomieH,
        niveau_bas_prevu: e.heureSeuilBasMs ? new Date(e.heureSeuilBasMs).toISOString() : null,
        coupure: coupe,
      },
    });
  } else if (basse.length && !coupe && e.volumeUtileM3 !== null && !e.sousSeuil) {
    decisions.alertesAResoudre.push(...basse.map((a) => a.id));
  }
  return decisions;
}
