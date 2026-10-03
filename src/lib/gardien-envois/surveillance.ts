// Surveillance des tâches planifiées (plan, phase G10) : lecture de
// etat_taches_planifiees(), état de chaque tâche (à l'heure, en retard, en
// échec) pour l'onglet « Surveillance » du superadmin, et récapitulatif
// quotidien envoyé au superadmin par la fonction gardien-envois.

import type { Marque } from "../marque";
import { emailHtml, emailTexte, sujetEmail, type Bloc } from "./gabarit";
import { dateLongue, nombre } from "./format";

export interface TacheCron {
  nom: string;
  planification: string;
  active: boolean;
  dernier_debut: string | null;
  derniere_fin: string | null;
  dernier_statut: string | null;
  dernier_message: string | null;
  echecs_24h: number;
}

export interface TacheFonction {
  tache: string;
  dernier_debut: string | null;
  derniere_fin: string | null;
  dernier_statut: string | null;
  dernieres_erreurs: unknown;
  passages_24h: number;
  echecs_24h: number;
}

export interface EtatTaches {
  maintenant: string;
  cron: TacheCron[];
  fonctions: TacheFonction[];
  appels_http: { echecs_6h: number; total_6h: number } | null;
}

/** Passages écrits par les fonctions elles-mêmes, sans tâche pg_cron propre. */
export const PLANIFICATION_FONCTIONS: Record<string, string> = {
  "gardien-moteur": "10 * * * *",
  "gardien-envois": "*/15 * * * *",
  "recapitulatif-quotidien": "0 7 * * *",
  "purge-donnees-personnelles": "40 3 * * *",
};

export const LIBELLES_TACHES: Record<string, string> = {
  "gardien-moteur": "Détection des fuites et des températures",
  "gardien-envois": "Alertes, rapports et pilotes",
  "recapitulatif-quotidien": "Récapitulatif quotidien",
  "purge-donnees-personnelles": "Effacement des données personnelles anciennes",
  "readings-ensure-next-partition": "Préparation du stockage des relevés",
  "unknown-frames-purge": "Nettoyage des trames d'appareils inconnus",
  "moteur-nocturne-declencheur": "Moteur nocturne (offre Réseau, en pause)",
  "notifications-alertes": "Alertes (offre Réseau, en pause)",
  "notifications-digest-hebdo": "Résumé hebdomadaire (offre Réseau, en pause)",
  "rapport-mensuel-declencheur": "Rapport mensuel (offre Réseau, en pause)",
};

/** Intervalle entre deux passages, en minutes, d'une planification pg_cron simple. */
export function intervalleAttenduMinutes(planification: string): number | null {
  const champs = planification.trim().split(/\s+/);
  if (champs.length !== 5) return null;
  const [minute, heure, jour, mois, semaine] = champs;
  const pas = (c: string) => {
    const m = c.match(/^\*\/(\d+)$/);
    return m ? Number(m[1]) : null;
  };
  const fixe = (c: string) => /^\d+(,\d+)*$/.test(c);
  if (mois !== "*") return 366 * 24 * 60;
  if (jour !== "*") return fixe(jour) ? 31 * 24 * 60 : null;
  if (semaine !== "*") return fixe(semaine) ? 7 * 24 * 60 : null;
  if (heure !== "*") {
    const h = pas(heure);
    if (h) return h * 60;
    return fixe(heure) ? 24 * 60 : null;
  }
  if (minute === "*") return 1;
  const m = pas(minute);
  if (m) return m;
  return fixe(minute) ? 60 : null;
}

export type EtatTache = "a_l_heure" | "en_retard" | "en_echec" | "jamais" | "inactive";

export const LIBELLES_ETAT: Record<EtatTache, string> = {
  a_l_heure: "À l'heure",
  en_retard: "En retard",
  en_echec: "En échec",
  jamais: "Jamais lancée",
  inactive: "Désactivée",
};

export interface LigneSurveillance {
  cle: string;
  libelle: string;
  planification: string | null;
  dernierPassage: string | null;
  etat: EtatTache;
  echecs24h: number;
  detail: string | null;
}

const MARGE_MIN = 10;
/** Au-delà, un passage resté « en cours » a été interrompu (plantage, délai dépassé). */
const INTERROMPU_MIN = 60;

function passageEnEchec(statut: string | null, debut: string | null, maintenantMs: number): boolean {
  if (statut === "echec" || statut === "partiel") return true;
  return statut === "en_cours" && debut !== null && maintenantMs - Date.parse(debut) > INTERROMPU_MIN * 60_000;
}

function detailErreurs(erreurs: unknown): string | null {
  if (!Array.isArray(erreurs) || erreurs.length === 0) return null;
  const premiere = erreurs[0];
  const texte =
    typeof premiere === "string"
      ? premiere
      : premiere && typeof premiere === "object" && "message" in premiere
        ? String((premiere as { message: unknown }).message)
        : JSON.stringify(premiere);
  return `${texte.slice(0, 200)}${erreurs.length > 1 ? ` (et ${erreurs.length - 1} autre${erreurs.length > 2 ? "s" : ""})` : ""}`;
}

function interrompu(f: TacheFonction, maintenantMs: number): string | null {
  return f.dernier_statut === "en_cours" && passageEnEchec(f.dernier_statut, f.dernier_debut, maintenantMs)
    ? "Passage interrompu avant la fin."
    : null;
}

export function lignesSurveillance(etat: EtatTaches, maintenantMs: number): LigneSurveillance[] {
  const fonctions = new Map(etat.fonctions.map((f) => [f.tache, f]));
  const lignes: LigneSurveillance[] = [];
  const vues = new Set<string>();

  const juger = (
    cle: string,
    planification: string | null,
    active: boolean,
    dernierDebut: string | null,
    echec: boolean,
    echecs24h: number,
    detail: string | null,
  ) => {
    vues.add(cle);
    const intervalle = planification ? intervalleAttenduMinutes(planification) : null;
    const depuisMin = dernierDebut ? (maintenantMs - Date.parse(dernierDebut)) / 60_000 : null;
    let e: EtatTache = "a_l_heure";
    if (!active) e = "inactive";
    else if (depuisMin === null) e = "jamais";
    else if (echec) e = "en_echec";
    else if (intervalle !== null && depuisMin > 2 * intervalle + MARGE_MIN) e = "en_retard";
    lignes.push({
      cle,
      libelle: LIBELLES_TACHES[cle] ?? cle,
      planification,
      dernierPassage: dernierDebut,
      etat: e,
      echecs24h,
      detail,
    });
  };

  for (const c of etat.cron) {
    // Tâche qui appelle une fonction : l'état réel est celui écrit par la fonction.
    // Sans passage écrit, « succeeded » côté pg_cron veut seulement dire que
    // l'appel est parti : la fonction n'a peut-être jamais tourné.
    const f =
      fonctions.get(c.nom) ??
      (c.nom in PLANIFICATION_FONCTIONS
        ? { tache: c.nom, dernier_debut: null, derniere_fin: null, dernier_statut: null, dernieres_erreurs: [], passages_24h: 0, echecs_24h: 0 }
        : undefined);
    if (f) {
      juger(c.nom, c.planification, c.active, f.dernier_debut, passageEnEchec(f.dernier_statut, f.dernier_debut, maintenantMs), Number(f.echecs_24h), detailErreurs(f.dernieres_erreurs) ?? interrompu(f, maintenantMs));
    } else {
      juger(c.nom, c.planification, c.active, c.dernier_debut, c.dernier_statut === "failed", Number(c.echecs_24h), c.dernier_statut === "failed" ? (c.dernier_message ?? null) : null);
    }
  }
  for (const f of etat.fonctions) {
    if (vues.has(f.tache)) continue;
    juger(f.tache, PLANIFICATION_FONCTIONS[f.tache] ?? null, true, f.dernier_debut, passageEnEchec(f.dernier_statut, f.dernier_debut, maintenantMs), Number(f.echecs_24h), detailErreurs(f.dernieres_erreurs) ?? interrompu(f, maintenantMs));
  }
  const ordre: EtatTache[] = ["en_echec", "en_retard", "jamais", "inactive", "a_l_heure"];
  return lignes.sort((a, b) => ordre.indexOf(a.etat) - ordre.indexOf(b.etat) || a.libelle.localeCompare(b.libelle, "fr"));
}

/** Tâches qui demandent de l'attention (les tâches en pause de l'offre Réseau sont ignorées si désactivées). */
export function problemes(lignes: LigneSurveillance[]): LigneSurveillance[] {
  return lignes.filter((l) => l.etat === "en_echec" || l.etat === "en_retard");
}

export interface DonneesRecapitulatif {
  jour: string;
  taches: LigneSurveillance[];
  appelsHttp: { echecs_6h: number; total_6h: number } | null;
  envois: { envoyes: number; echecs: number; journalises: number };
  fuitesDetectees: number;
  tachesAFaire: number;
  pilotes: { site: string; organisation: string; fin: string }[];
  essais: { organisation: string; fin: string }[];
}

export function messageRecapitulatif(
  marque: Marque,
  urlApp: string,
  d: DonneesRecapitulatif,
): { sujet: string; html: string; texte: string } {
  const aSurveiller = problemes(d.taches);
  const titre = `Récapitulatif du ${dateLongue(d.jour)}`;
  const blocs: Bloc[] = [
    {
      type: "paragraphe",
      texte: aSurveiller.length
        ? `À regarder : ${aSurveiller.length === 1 ? "une tâche planifiée" : `${aSurveiller.length} tâches planifiées`} en échec ou en retard.`
        : "Toutes les tâches planifiées sont passées à l'heure.",
    },
  ];
  if (aSurveiller.length) {
    blocs.push({
      type: "liste",
      lignes: aSurveiller.map((l) => [
        l.libelle,
        `${LIBELLES_ETAT[l.etat].toLowerCase()}${l.detail ? ` : ${l.detail}` : ""}`,
      ]),
    });
  }
  const chiffres: [string, string][] = [
    ["Messages envoyés (24 h)", nombre(d.envois.envoyes, 0)],
    ["Messages en échec (24 h)", nombre(d.envois.echecs, 0)],
    ["Messages seulement journalisés (24 h)", nombre(d.envois.journalises, 0)],
    ["Fuites détectées (24 h)", nombre(d.fuitesDetectees, 0)],
    ["Tâches à faire (appels, remboursements)", nombre(d.tachesAFaire, 0)],
  ];
  if (d.appelsHttp && d.appelsHttp.echecs_6h > 0) {
    chiffres.push(["Appels de fonctions en échec (6 h)", `${nombre(d.appelsHttp.echecs_6h, 0)} sur ${nombre(d.appelsHttp.total_6h, 0)}`]);
  }
  blocs.push({ type: "liste", lignes: chiffres });
  if (d.pilotes.length) {
    blocs.push({ type: "paragraphe", texte: "Pilotes qui se terminent dans les 7 jours :" });
    blocs.push({ type: "liste", lignes: d.pilotes.map((p) => [`${p.site} (${p.organisation})`, dateLongue(p.fin)]) });
  }
  if (d.essais.length) {
    blocs.push({ type: "paragraphe", texte: "Essais qui se terminent dans les 7 jours :" });
    blocs.push({ type: "liste", lignes: d.essais.map((e) => [e.organisation, dateLongue(e.fin)]) });
  }
  blocs.push({ type: "bouton", libelle: "Ouvrir l'espace superadmin", lien: `${urlApp}/admin` });
  return { sujet: sujetEmail(marque, titre), html: emailHtml(marque, titre, blocs), texte: emailTexte(marque, titre, blocs) };
}
