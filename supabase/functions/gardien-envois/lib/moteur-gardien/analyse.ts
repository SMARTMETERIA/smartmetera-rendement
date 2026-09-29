// Analyse d'un site pour une exécution du moteur (fonction gardien-moteur) :
// à partir des données chargées, calcule les bilans quotidiens des points
// de comptage et décide des fuites à ouvrir ou à clore et des alertes à
// ouvrir ou à résoudre. Fonction pure : aucune lecture ni écriture.
import {
  ligneDeBase,
  nuitsExigees,
  seuilFuiteNuit,
  type ModeLigneDeBase,
  type NuitHistorique,
} from "./baseline.ts";
import { debitsHoraires, type DebitHoraire, type Releve } from "./debits.ts";
import {
  capteurMuet,
  detecterDebitContinu,
  detecterFermeture,
  detecterFuiteNuit,
  detecterRupture,
  fuiteReparee,
  type NuitEvaluee,
} from "./detection.ts";
import { debitMinNocturne } from "./nuit.ts";
import { heureEnPlageCalme, periodeFermee, type PeriodeFermeture, type PlageCalme } from "./plages.ts";
import type { ReglagesDetection } from "./reglages.ts";
import {
  fermetureAvantAnalyses,
  seuilPoint,
  temperatureBasse,
  type ReglagesTemperature,
  type TypePoint,
} from "./temperatures.ts";
import {
  HEURE_MS,
  dateLocale,
  debutHeure,
  decalerJour,
  instantLocal,
  jourIsoDeDate,
  partiesLocales,
} from "./temps.ts";

export type TypeFuite = "fuite_nuit" | "debit_continu" | "rupture" | "fuite_fermeture";
export type StatutFuite = "ouverte" | "prise_en_compte" | "reparee" | "fausse_alerte";

/** Fenêtre glissante de la ligne de base (8 semaines : suit les saisons). */
export const FENETRE_LIGNE_DE_BASE_JOURS = 56;
/** Historique du maximum horaire pour la détection de rupture. */
export const FENETRE_RUPTURE_JOURS = 30;
/** Au-delà, le dernier relevé de température n'est pas évalué. */
export const FRAICHEUR_TEMPERATURE_MS = 3 * HEURE_MS;

export interface CompteurSite {
  id: string;
  nom: string;
  zone: string | null;
  surveillance: "complete" | "limitee";
}

/** Bilan d'un jour déjà enregistré (table meter_days). */
export interface JourStocke {
  day: string;
  nightMinLph: number | null;
  maxHourlyLph: number | null;
  closed: boolean;
  baselineLph: number | null;
  thresholdLph: number | null;
}

export interface FuiteConnue {
  id: string;
  meterId: string;
  type: TypeFuite;
  status: StatutFuite;
  startedAtMs: number | null;
  detectedAtMs: number;
  /** Réparation ou fausse alerte : moment de la clôture. */
  closedAtMs: number | null;
}

export interface AppareilSurveille {
  id: string;
  nom: string;
  meterId: string | null;
  pointId: string | null;
  transmission: string | null;
  dernierMessageMs: number | null;
  /** Référence si aucun message n'est encore arrivé (pose). */
  poseMs: number | null;
}

export interface PointTemperature {
  id: string;
  label: string;
  type: TypePoint;
  thresholdC: number | null;
  derniereValeurC: number | null;
  dernierReleveMs: number | null;
}

export interface AlerteConnue {
  id: string;
  type: string;
  cle: string;
  enCours: boolean;
}

export interface DonneesSite {
  siteId: string;
  fuseau: string;
  periodesFermeture: PeriodeFermeture[];
  maintenantMs: number;
  /** Dates locales à recalculer, chronologiques, jusqu'à aujourd'hui inclus. */
  jours: string[];
  reglages: ReglagesDetection;
  reglagesTemperature: ReglagesTemperature;
  compteurs: CompteurSite[];
  /** Relevés par compteur depuis debutFenetre(jours). */
  releves: Record<string, Releve[]>;
  /** Bilans enregistrés avant le premier jour recalculé. */
  historique: Record<string, JourStocke[]>;
  plages: PlageCalme[];
  fuites: FuiteConnue[];
  appareils: AppareilSurveille[];
  points: PointTemperature[];
  alertes: AlerteConnue[];
}

export interface JourCalcule {
  meterId: string;
  day: string;
  volumeM3: number;
  hoursCovered: number;
  nightMinLph: number | null;
  nightHours: number;
  quietHours: number;
  maxHourlyLph: number | null;
  minHourlyLph: number | null;
  closed: boolean;
  baselineLph: number | null;
  thresholdLph: number | null;
  baselineMode: ModeLigneDeBase;
  leakNight: boolean;
}

export interface NouvelleFuite {
  meterId: string;
  type: TypeFuite;
  excesLph: number;
  startedAtMs: number;
  details: Record<string, unknown>;
}

export interface NouvelleAlerte {
  type: "compteur_muet" | "temperature_basse" | "rappel_analyses";
  cle: string;
  severite: "moyenne" | "haute";
  titre: string;
  description: string;
  donnees: Record<string, unknown>;
}

export interface ResultatSite {
  jours: JourCalcule[];
  nouvellesFuites: NouvelleFuite[];
  reparations: string[];
  alertesAOuvrir: NouvelleAlerte[];
  alertesAResoudre: string[];
}

/** Début des relevés à charger : minuit local du premier jour, moins 2 h. */
export function debutFenetre(jours: string[], fuseau: string): number {
  return instantLocal(jours[0], 0, fuseau) - 2 * HEURE_MS;
}

/** Jours à recalculer : les n derniers jours locaux, aujourd'hui compris (n ≥ 2). */
export function joursARecalculer(maintenantMs: number, fuseau: string, n = 2): string[] {
  const aujourdhui = dateLocale(maintenantMs, fuseau);
  const total = Math.max(2, n);
  return Array.from({ length: total }, (_, i) => decalerJour(aujourdhui, i - total + 1));
}

const un = (n: number) => Math.round(n * 10) / 10;
const fr = (n: number, decimales = 1) =>
  new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(n);

interface Heure extends DebitHoraire {
  date: string;
  calme: boolean;
}

interface NuitConnue extends NuitEvaluee {
  closed: boolean;
}

const OUVERTES: StatutFuite[] = ["ouverte", "prise_en_compte"];

export function analyserSite(d: DonneesSite): ResultatSite {
  const r = d.reglages;
  const resultat: ResultatSite = {
    jours: [],
    nouvellesFuites: [],
    reparations: [],
    alertesAOuvrir: [],
    alertesAResoudre: [],
  };
  const aujourdhui = d.jours[d.jours.length - 1];
  const finNuit = (date: string) => instantLocal(date, r.fuiteNuit.finH, d.fuseau);
  const derniereNuit = d.maintenantMs >= finNuit(aujourdhui) ? aujourdhui : decalerJour(aujourdhui, -1);
  const heureCourante = debutHeure(d.maintenantMs);
  const fermee = (date: string) => periodeFermee(d.periodesFermeture, date) !== null;

  for (const compteur of d.compteurs) {
    const detaille = compteur.surveillance === "complete";
    const heures: Heure[] = debitsHoraires(d.releves[compteur.id] ?? [])
      .filter((h) => h.heureMs < d.maintenantMs)
      .map((h) => ({
        ...h,
        // Heure lissée ou surveillance limitée : volume seul, pas de débit.
        lph: detaille && !h.lissee ? h.lph : null,
        date: partiesLocales(h.heureMs, d.fuseau).date,
        calme: heureEnPlageCalme(h.heureMs, d.fuseau, d.plages, compteur.id),
      }));
    const parHeure = new Map(heures.map((h) => [h.heureMs, h]));

    // Fuites connues de ce point : périodes exclues des lignes de base,
    // dernière clôture (on ne redétecte pas sur des nuits déjà jugées).
    const fuites = d.fuites.filter((f) => f.meterId === compteur.id).map((f) => ({ ...f }));
    const periodesFuite = fuites
      .filter((f) => f.status !== "fausse_alerte")
      .map((f) => ({ debut: f.startedAtMs ?? f.detectedAtMs, fin: f.closedAtMs ?? Infinity }));
    const enFuite = (date: string) => {
      const t = instantLocal(date, r.fuiteNuit.debutH, d.fuseau);
      return periodesFuite.some((p) => t >= p.debut && t <= p.fin);
    };
    const derniereClotureMs = (types: TypeFuite[] | null) =>
      Math.max(
        -Infinity,
        ...fuites
          .filter((f) => !OUVERTES.includes(f.status) && (!types || types.includes(f.type)))
          .map((f) => f.closedAtMs ?? f.detectedAtMs),
      );

    // Nuits connues : historique puis jours recalculés.
    const nuits = new Map<string, NuitConnue>();
    const maxHoraires = new Map<string, number | null>();
    for (const h of d.historique[compteur.id] ?? []) {
      nuits.set(h.day, {
        date: h.day,
        dmnLph: h.nightMinLph,
        baselineLph: h.baselineLph,
        seuilLph: h.thresholdLph,
        closed: h.closed,
      });
      maxHoraires.set(h.day, h.maxHourlyLph);
    }

    for (const jour of d.jours) {
      const duJour = heures.filter((h) => h.date === jour);
      const mesurees = duJour.filter((h) => h.lph !== null && !h.calme).map((h) => h.lph as number);
      const nuit = debitMinNocturne(duJour, jour, d.fuseau, r.fuiteNuit, d.plages, compteur.id);
      const closed = fermee(jour);
      const historiqueBase: NuitHistorique[] = [...nuits.values()]
        .filter(
          (n) =>
            n.date < jour &&
            n.date >= decalerJour(jour, -FENETRE_LIGNE_DE_BASE_JOURS) &&
            n.dmnLph !== null &&
            !n.closed &&
            !enFuite(n.date),
        )
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((n) => ({ date: n.date, jourIso: jourIsoDeDate(n.date), dmnLph: n.dmnLph as number }));
      const base = ligneDeBase(historiqueBase, jourIsoDeDate(jour), r);
      const seuil = seuilFuiteNuit(base, r);
      const dmn = d.maintenantMs >= finNuit(jour) && nuit.dmnLph !== null ? un(nuit.dmnLph) : null;
      const calcule: JourCalcule = {
        meterId: compteur.id,
        day: jour,
        volumeM3: Math.round(duJour.reduce((s, h) => s + h.litres, 0)) / 1000,
        hoursCovered: duJour.filter((h) => h.couverture >= 0.5).length,
        nightMinLph: dmn,
        nightHours: nuit.heures,
        quietHours: duJour.filter((h) => h.calme).length,
        maxHourlyLph: mesurees.length ? un(Math.max(...mesurees)) : null,
        minHourlyLph: mesurees.length ? un(Math.min(...mesurees)) : null,
        closed,
        baselineLph: base.valeurLph === null ? null : un(base.valeurLph),
        thresholdLph: seuil === null ? null : un(seuil),
        baselineMode: base.mode,
        leakNight: dmn !== null && seuil !== null && !closed && dmn > un(seuil),
      };
      resultat.jours.push(calcule);
      nuits.set(jour, {
        date: jour,
        dmnLph: calcule.nightMinLph,
        baselineLph: calcule.baselineLph,
        seuilLph: calcule.thresholdLph,
        closed,
      });
      maxHoraires.set(jour, calcule.maxHourlyLph);
    }

    if (!detaille) continue;

    const nuitsJusqua = (fin: string, n: number) =>
      Array.from({ length: n }, (_, i) => decalerJour(fin, i - n + 1));

    // 1) Réparations automatiques : retour sous le seuil n nuits de suite
    //    après la détection (seuil de fermeture pendant une fermeture).
    const ouvertes = fuites.filter((f) => OUVERTES.includes(f.status));
    for (const f of ouvertes) {
      const dateDetection = dateLocale(f.detectedAtMs, d.fuseau);
      const dates = nuitsJusqua(derniereNuit, r.reparation.nuits);
      if (!dates.every((x) => x > dateDetection && nuits.has(x))) continue;
      const evaluees = dates.map((x) => {
        const n = nuits.get(x) as NuitConnue;
        return {
          ...n,
          seuilLph: n.closed ? r.fermeture.minLph : (n.seuilLph ?? r.debitContinu.minLph),
        };
      });
      if (fuiteReparee(evaluees, r.reparation.nuits)) {
        resultat.reparations.push(f.id);
        f.status = "reparee";
        f.closedAtMs = d.maintenantMs;
      }
    }

    const ouverte = (types: TypeFuite[]) =>
      fuites.some((f) => OUVERTES.includes(f.status) && types.includes(f.type)) ||
      resultat.nouvellesFuites.some((n) => n.meterId === compteur.id && types.includes(n.type));
    const NON_RUPTURE: TypeFuite[] = ["fuite_nuit", "debit_continu", "fuite_fermeture"];
    const ouvrir = (fuite: Omit<NouvelleFuite, "meterId">) =>
      resultat.nouvellesFuites.push({
        meterId: compteur.id,
        ...fuite,
        details: { zone: compteur.zone, ...fuite.details },
      });
    const complete = (h: number) => h + HEURE_MS <= d.maintenantMs;

    // 2) Fuite de nuit : n nuits de suite au-dessus du seuil, postérieures
    //    à la dernière clôture d'une fuite de ce point.
    const derniere = nuits.get(derniereNuit);
    const modeDerniere = resultat.jours.find(
      (j) => j.meterId === compteur.id && j.day === derniereNuit,
    )?.baselineMode;
    if (derniere && modeDerniere && !ouverte(NON_RUPTURE)) {
      const k = nuitsExigees(modeDerniere, r);
      const dates = nuitsJusqua(derniereNuit, k);
      const cloture = derniereClotureMs(null);
      const dateCloture = cloture === -Infinity ? "" : dateLocale(cloture, d.fuseau);
      if (dates.every((x) => nuits.has(x) && !nuits.get(x)?.closed && x > dateCloture)) {
        const evaluees = dates.map((x) => nuits.get(x) as NuitConnue);
        const detection = detecterFuiteNuit(evaluees, k);
        if (detection) {
          const excesLph = un(detection.excesLph);
          ouvrir({
            type: "fuite_nuit",
            excesLph,
            startedAtMs: instantLocal(dates[0], r.fuiteNuit.debutH, d.fuseau),
            details: {
              explication: `Débit de nuit au-dessus de ${fr(evaluees[evaluees.length - 1].seuilLph as number)} L/h ${k} nuits de suite, pour une ligne de base de ${fr(evaluees[evaluees.length - 1].baselineLph as number)} L/h.`,
              nuits: evaluees.map((n) => ({ date: n.date, dmn_lph: n.dmnLph, ligne_de_base_lph: n.baselineLph, seuil_lph: n.seuilLph })),
              mode: modeDerniere,
            },
          });
        }
      }
    }

    // 3) Débit continu : jamais sous le seuil pendant 24 h (hors plages
    //    calmes), hors fermeture (le mode fermeture est plus strict).
    const nbContinu = r.debitContinu.heures;
    const debutContinu = heureCourante - nbContinu * HEURE_MS;
    const heuresContinu = Array.from({ length: nbContinu }, (_, i) => debutContinu + i * HEURE_MS);
    if (
      !ouverte(NON_RUPTURE) &&
      derniereClotureMs(null) < debutContinu &&
      !heuresContinu.some((h) => fermee(partiesLocales(h, d.fuseau).date))
    ) {
      const liste = heuresContinu.map((h) => {
        const x = parHeure.get(h);
        return x && !x.calme ? x.lph : null;
      });
      const detection = detecterDebitContinu(liste, r);
      if (detection) {
        ouvrir({
          type: "debit_continu",
          excesLph: un(detection.excesLph),
          startedAtMs: debutContinu,
          details: {
            explication: `Le débit n'est jamais descendu sous ${fr(r.debitContinu.minLph)} L/h pendant ${nbContinu} heures (minimum : ${fr(detection.excesLph)} L/h).`,
          },
        });
      }
    }

    // 4) Rupture : active sans période d'apprentissage, dès qu'un débit
    //    horaire antérieur est connu. Dernières heures complètes.
    if (!ouverte(["rupture"])) {
      const limite = decalerJour(d.jours[0], -FENETRE_RUPTURE_JOURS);
      const maxStocke = [...maxHoraires.entries()]
        .filter(([jour, v]) => jour >= limite && jour < d.jours[0] && v !== null)
        .map(([, v]) => v as number);
      const candidates = heures.filter(
        (h) => complete(h.heureMs) && h.heureMs >= heureCourante - 3 * HEURE_MS,
      );
      for (const h of candidates) {
        if (h.calme || h.lph === null || h.heureMs <= derniereClotureMs(["rupture"])) continue;
        const avant = heures
          .filter((x) => x.heureMs < h.heureMs && !x.calme && x.lph !== null)
          .map((x) => x.lph as number);
        const valeurs = [...maxStocke, ...avant];
        const max30 = valeurs.length ? Math.max(...valeurs) : null;
        const detection = detecterRupture(h.lph, max30, r);
        if (detection) {
          ouvrir({
            type: "rupture",
            excesLph: un(detection.excesLph),
            startedAtMs: h.heureMs,
            details: {
              explication: `Débit de ${fr(h.lph)} L/h, plus de ${fr(r.rupture.facteurMax30j, 0)} fois le maximum observé (${fr(max30 as number)} L/h).`,
              debit_lph: un(h.lph),
              max_observe_lph: un(max30 as number),
            },
          });
          break;
        }
      }
    }

    // 5) Mode fermeture : consommation au-dessus du seuil pendant n heures.
    const nbFermeture = r.fermeture.heures;
    const debutFermeture = heureCourante - nbFermeture * HEURE_MS;
    const heuresFermeture = Array.from({ length: nbFermeture }, (_, i) => debutFermeture + i * HEURE_MS);
    const periode = periodeFermee(d.periodesFermeture, partiesLocales(debutFermeture, d.fuseau).date);
    if (
      periode &&
      !ouverte(NON_RUPTURE) &&
      derniereClotureMs(null) < debutFermeture &&
      heuresFermeture.every((h) => fermee(partiesLocales(h, d.fuseau).date))
    ) {
      const liste = heuresFermeture.map((h) => {
        const x = parHeure.get(h);
        return x && !x.calme ? x.lph : null;
      });
      const detection = detecterFermeture(liste, r);
      if (detection) {
        ouvrir({
          type: "fuite_fermeture",
          excesLph: un(detection.excesLph),
          startedAtMs: debutFermeture,
          details: {
            explication: `Consommation de ${fr(detection.excesLph)} L/h pendant ${nbFermeture} heures alors que le site est fermé${periode.libelle ? ` (${periode.libelle})` : ""}.`,
            periode: { debut: periode.debut, fin: periode.fin, libelle: periode.libelle ?? null },
          },
        });
      }
    }
  }

  // 6) Capteurs muets : alerte distincte d'une fuite, résolue au retour
  //    des données.
  const enCours = (cle: string) => d.alertes.find((a) => a.cle === cle && a.enCours);
  for (const a of d.appareils) {
    const reference = a.dernierMessageMs ?? a.poseMs;
    if (reference === null) continue;
    const muet = capteurMuet(reference, a.transmission, d.maintenantMs, r);
    const cle = `muet:${a.id}`;
    const existante = enCours(cle);
    if (muet && !existante) {
      const limiteH = a.transmission === "cellulaire" ? r.capteurMuet.cellulaireH : r.capteurMuet.lorawanH;
      resultat.alertesAOuvrir.push({
        type: "compteur_muet",
        cle,
        severite: "moyenne",
        titre: `Capteur muet : ${a.nom}`,
        description: a.dernierMessageMs
          ? `Aucune donnée reçue depuis plus de ${fr(limiteH, 0)} heures.`
          : `Aucune donnée reçue depuis la pose (plus de ${fr(limiteH, 0)} heures).`,
        donnees: {
          device_id: a.id,
          meter_id: a.meterId,
          point_id: a.pointId,
          dernier_message: a.dernierMessageMs ? new Date(a.dernierMessageMs).toISOString() : null,
        },
      });
    } else if (!muet && existante) {
      resultat.alertesAResoudre.push(existante.id);
    }
  }

  // 7) Températures sous le seuil du point.
  for (const p of d.points) {
    if (
      p.derniereValeurC === null ||
      p.dernierReleveMs === null ||
      d.maintenantMs - p.dernierReleveMs > FRAICHEUR_TEMPERATURE_MS
    ) {
      continue;
    }
    const seuil = seuilPoint(p, d.reglagesTemperature);
    const basse = temperatureBasse(p.derniereValeurC, seuil);
    const cle = `temperature:${p.id}`;
    const existante = enCours(cle);
    if (basse && !existante) {
      resultat.alertesAOuvrir.push({
        type: "temperature_basse",
        cle,
        severite: "haute",
        titre: `Température basse : ${p.label}`,
        description: `${fr(p.derniereValeurC)} °C, sous le seuil de ${fr(seuil as number)} °C.`,
        donnees: {
          point_id: p.id,
          valeur_c: p.derniereValeurC,
          seuil_c: seuil,
          releve: new Date(p.dernierReleveMs).toISOString(),
        },
      });
    } else if (!basse && existante) {
      resultat.alertesAResoudre.push(existante.id);
    }
  }

  // 8) Rappel des analyses avant la réouverture (délai paramétré seulement).
  if (d.points.length > 0) {
    const periode = fermetureAvantAnalyses(
      d.periodesFermeture,
      aujourdhui,
      d.reglagesTemperature.rappelAnalysesJours,
    );
    const cle = periode ? `analyses:${d.siteId}:${periode.fin}` : null;
    if (periode && cle && !d.alertes.some((a) => a.cle === cle)) {
      const fin = new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${periode.fin}T12:00:00Z`));
      resultat.alertesAOuvrir.push({
        type: "rappel_analyses",
        cle,
        severite: "moyenne",
        titre: "Analyses d'eau avant la réouverture",
        description: `La fermeture se termine le ${fin} : prévoir les analyses d'eau avant la réouverture.`,
        donnees: { fin_fermeture: periode.fin, libelle: periode.libelle ?? null },
      });
    }
  }

  return resultat;
}
