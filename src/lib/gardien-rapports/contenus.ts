// Contenus figés des rapports (première nuit, première semaine, mensuel,
// fin de pilote) et de la page preuve (plan, phase G5). Fonctions pures :
// la fonction gardien-envois charge les données, l'application affiche
// et imprime. Nombres bruts (jamais de texte mis en forme) sauf les
// phrases ; méthode prudente toujours jointe aux montants.
import { mediane } from "../moteur-gardien/baseline";
import { coutFuite, type Monnaie } from "../moteur-gardien/economies";
import { indicateurActivite } from "../moteur-gardien/activite";
import type { StatutFuite, TypeFuite } from "../moteur-gardien/analyse";
import { montant, montantRond, nombre, pourcentage, volume } from "../gardien-envois/format";

export const MENTION_SURVEILLANCE =
  "Surveillance fondée sur les données transmises par les capteurs.";
export const PHRASE_SANS_FUITE =
  "Aucune fuite ce mois : votre eau est sous surveillance jour et nuit.";

export type TypeRapport = "premiere_nuit" | "premiere_semaine" | "mensuel" | "fin_pilote";

export const TITRES_RAPPORT: Record<TypeRapport, string> = {
  premiere_nuit: "Première nuit sous surveillance",
  premiere_semaine: "Première semaine sous surveillance",
  mensuel: "Rapport mensuel",
  fin_pilote: "Fin du pilote",
};

export const UNITES_ACTIVITE: Record<string, string> = {
  nuitee: "nuitée",
  emplacement: "emplacement occupé",
  couvert: "couvert",
  m2: "m²",
};

export interface SiteRapport {
  id: string;
  nom: string;
  type: string;
  ville: string | null;
  pays: string;
  monnaie: Monnaie;
  fuseau: string;
  prixM3: number | null;
  uniteActivite: string;
}

export interface FuiteSource {
  id: string;
  type: TypeFuite;
  zone: string | null;
  statut: StatutFuite;
  detecteeMs: number;
  repareeMs: number | null;
  excesLph: number;
  economieM3: number | null;
  economieMontant: number | null;
}

export interface FuiteRapport {
  type: TypeFuite;
  zone: string | null;
  statut: StatutFuite;
  detecteeLe: string;
  repareeLe: string | null;
  excesLph: number;
  /** Pertes prudentes depuis la détection jusqu'à la réparation (ou la fin de période). */
  perteM3: number;
  perteMontant: number | null;
  economieM3: number | null;
  economieMontant: number | null;
}

/** Fuites affichées dans un rapport : jamais les fausses alertes. */
export function fuitesRapport(sources: FuiteSource[], prixM3: number | null, finMs: number): FuiteRapport[] {
  return sources
    .filter((f) => f.statut !== "fausse_alerte")
    .sort((a, b) => a.detecteeMs - b.detecteeMs)
    .map((f) => {
      const cout = coutFuite({
        excesLph: f.excesLph,
        prixM3,
        depuisMs: f.detecteeMs,
        maintenantMs: Math.min(f.repareeMs ?? finMs, finMs),
      });
      return {
        type: f.type,
        zone: f.zone,
        statut: f.statut,
        detecteeLe: new Date(f.detecteeMs).toISOString(),
        repareeLe: f.repareeMs ? new Date(f.repareeMs).toISOString() : null,
        excesLph: f.excesLph,
        perteM3: cout.m3Cumules,
        perteMontant: cout.coutCumule,
        economieM3: f.economieM3,
        economieMontant: f.economieMontant,
      };
    });
}

const somme = (valeurs: (number | null)[]) => valeurs.reduce<number>((s, v) => s + (v ?? 0), 0);
const arrondi = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

// ---------------------------------------------------------------------------
// Première nuit
// ---------------------------------------------------------------------------

export interface ContenuPremiereNuit {
  version: 1;
  type: "premiere_nuit";
  site: SiteRapport;
  /** Date locale du matin. */
  nuit: string;
  courbe: { heure: string; lph: number | null }[];
  debitMinLph: number | null;
  donnees: boolean;
  fuites: FuiteRapport[];
  rienASignaler: boolean;
  phrase: string;
  mention: string;
}

export function contenuPremiereNuit(p: {
  site: SiteRapport;
  nuit: string;
  courbe: { heure: string; lph: number | null }[];
  fuites: FuiteSource[];
  finMs: number;
}): ContenuPremiereNuit {
  const mesures = p.courbe.map((c) => c.lph).filter((v): v is number => v !== null);
  const fuites = fuitesRapport(p.fuites, p.site.prixM3, p.finMs);
  const donnees = mesures.length > 0;
  const debitMinLph = donnees ? arrondi(Math.min(...mesures), 1) : null;
  const coutJour = fuites.reduce<number | null>((s, f) => {
    const c = coutFuite({ excesLph: f.excesLph, prixM3: p.site.prixM3, depuisMs: 0, maintenantMs: 0 });
    return c.coutParJour === null ? s : (s ?? 0) + c.coutParJour;
  }, null);
  let phrase: string;
  if (fuites.length) {
    phrase = `Première nuit sous surveillance : ${fuites.length === 1 ? "une anomalie détectée" : `${fuites.length} anomalies détectées`}${coutJour !== null ? `, soit environ ${montant(coutJour, p.site.monnaie)} par jour` : ""}.`;
  } else if (!donnees) {
    phrase = "Aucune donnée reçue cette nuit : vérifiez que le capteur transmet.";
  } else {
    phrase = `Première nuit sous surveillance : rien à signaler. Débit le plus bas de la nuit : ${nombre(debitMinLph as number)} L/h.`;
  }
  return {
    version: 1,
    type: "premiere_nuit",
    site: p.site,
    nuit: p.nuit,
    courbe: p.courbe,
    debitMinLph,
    donnees,
    fuites,
    rienASignaler: donnees && fuites.length === 0,
    phrase,
    mention: MENTION_SURVEILLANCE,
  };
}

// ---------------------------------------------------------------------------
// Première semaine
// ---------------------------------------------------------------------------

export interface JourRapport {
  date: string;
  volumeM3: number;
  nuitLph: number | null;
}

export interface ContenuPremiereSemaine {
  version: 1;
  type: "premiere_semaine";
  site: SiteRapport;
  debut: string;
  fin: string;
  jours: JourRapport[];
  volumeTotalM3: number;
  fuites: FuiteRapport[];
  rienASignaler: boolean;
  phrase: string;
  mention: string;
}

export function contenuPremiereSemaine(p: {
  site: SiteRapport;
  jours: JourRapport[];
  fuites: FuiteSource[];
  finMs: number;
}): ContenuPremiereSemaine {
  const fuites = fuitesRapport(p.fuites, p.site.prixM3, p.finMs);
  const volumeTotalM3 = arrondi(somme(p.jours.map((j) => j.volumeM3)), 3);
  const perte = somme(fuites.map((f) => f.perteMontant));
  const phrase = fuites.length
    ? `Première semaine : ${fuites.length === 1 ? "une anomalie trouvée" : `${fuites.length} anomalies trouvées`}${p.site.prixM3 !== null ? `, ${montant(perte, p.site.monnaie)} de pertes estimées depuis leur détection` : ""}.`
    : `Première semaine : rien à signaler. ${volume(volumeTotalM3)} consommés en 7 jours.`;
  return {
    version: 1,
    type: "premiere_semaine",
    site: p.site,
    debut: p.jours[0]?.date ?? "",
    fin: p.jours[p.jours.length - 1]?.date ?? "",
    jours: p.jours,
    volumeTotalM3,
    fuites,
    rienASignaler: fuites.length === 0,
    phrase,
    mention: MENTION_SURVEILLANCE,
  };
}

// ---------------------------------------------------------------------------
// Rapport mensuel
// ---------------------------------------------------------------------------

export interface LigneTemperatureRapport {
  label: string;
  type: string;
  seuilC: number | null;
  premierReleve: string;
  premiereValeurC: number;
  minC: number;
  maxC: number;
  nbReleves: number;
  nbSousSeuil: number;
}

export interface Comparaison {
  nbSites: number;
  medianeLitresParUnite: number;
  ecartPct: number;
}

/** Comparaison anonyme : seulement à partir de 5 sites comparables. */
export function comparaison(valeurSite: number | null, autres: number[]): Comparaison | null {
  if (valeurSite === null || autres.length < 5) return null;
  const med = mediane(autres) as number;
  if (med <= 0) return null;
  return {
    nbSites: autres.length,
    medianeLitresParUnite: Math.round(med),
    ecartPct: Math.round(((valeurSite - med) / med) * 100),
  };
}

export function variationPct(actuel: number, reference: number | null): number | null {
  if (reference === null || reference <= 0) return null;
  return Math.round(((actuel - reference) / reference) * 100);
}

export function conseilMensuel(p: {
  fuitesOuvertes: number;
  fuitesDuMois: number;
  variationMoisPct: number | null;
  temperaturesSousSeuil: number;
}): string {
  if (p.fuitesOuvertes > 0) {
    return "Une fuite est encore en cours : chaque jour sans réparation se paie. Faites intervenir un plombier puis indiquez « C'est réparé ».";
  }
  if (p.temperaturesSousSeuil > 0) {
    return "Des températures d'eau chaude sont passées sous le seuil réglé : faites vérifier la production et la boucle d'eau chaude.";
  }
  if (p.variationMoisPct !== null && p.variationMoisPct >= 15) {
    return `Consommation en hausse de ${nombre(p.variationMoisPct, 0)} % sur un mois : vérifiez les chasses d'eau et les robinets qui gouttent.`;
  }
  if (p.fuitesDuMois > 0) return "Toutes les fuites du mois sont réparées : bravo.";
  return PHRASE_SANS_FUITE;
}

export interface ContenuMensuel {
  version: 1;
  type: "mensuel";
  site: SiteRapport;
  /** « AAAA-MM ». */
  mois: string;
  jours: { date: string; volumeM3: number }[];
  volumeM3: number;
  volumeMoisPrecedentM3: number | null;
  volumeAnDernierM3: number | null;
  variationMoisPct: number | null;
  variationAnPct: number | null;
  fuites: FuiteRapport[];
  economiesDuMois: { m3: number; montant: number | null };
  economiesCumulees: { m3: number; montant: number | null; depuis: string | null };
  methodeEconomies: string;
  activite: {
    unite: string;
    libelleUnite: string;
    litresParUnite: number;
    estimation: boolean;
    quantite: number;
  } | null;
  comparaison: Comparaison | null;
  temperatures: LigneTemperatureRapport[];
  clefVerte: { litresParNuitee: number; estimation: boolean } | null;
  conseil: string;
  phraseSansFuite: string | null;
  mention: string;
}

export function methodeEconomies(delaiJours: number): string {
  return `Méthode prudente : excès de débit × 24 h × ${delaiJours} jours de découverte évités × prix du m³ du site.`;
}

export function contenuMensuel(p: {
  site: SiteRapport;
  mois: string;
  joursDansMois: number;
  jours: { date: string; volumeM3: number }[];
  volumeMoisPrecedentM3: number | null;
  volumeAnDernierM3: number | null;
  fuitesDuMois: FuiteSource[];
  fuitesOuvertes: number;
  reparees: { repareeMs: number; economieM3: number | null; economieMontant: number | null }[];
  debutMoisMs: number;
  finMoisMs: number;
  delaiJours: number;
  quantiteActivite: number | null;
  capacite: number | null;
  tauxOccupation: number | null;
  autresLitresParUnite: number[];
  temperatures: LigneTemperatureRapport[];
}): ContenuMensuel {
  const volumeM3 = arrondi(somme(p.jours.map((j) => j.volumeM3)), 3);
  const fuites = fuitesRapport(p.fuitesDuMois, p.site.prixM3, p.finMoisMs);
  const duMois = p.reparees.filter((r) => r.repareeMs >= p.debutMoisMs && r.repareeMs < p.finMoisMs);
  const montantOuNull = (liste: { economieMontant: number | null }[]) =>
    liste.some((r) => r.economieMontant !== null) ? arrondi(somme(liste.map((r) => r.economieMontant)), 2) : null;
  const cumulees = p.reparees.filter((r) => r.repareeMs < p.finMoisMs);
  const activiteBrute = indicateurActivite({
    volumeM3,
    quantiteSaisie: p.quantiteActivite,
    capacite: p.capacite,
    tauxOccupation: p.tauxOccupation,
    joursDansMois: p.joursDansMois,
    unite: p.site.uniteActivite,
  });
  const activite = activiteBrute
    ? {
        unite: p.site.uniteActivite,
        libelleUnite: UNITES_ACTIVITE[p.site.uniteActivite] ?? p.site.uniteActivite,
        ...activiteBrute,
      }
    : null;
  const variationMoisPct = variationPct(volumeM3, p.volumeMoisPrecedentM3);
  const temperaturesSousSeuil = p.temperatures.reduce((s, t) => s + t.nbSousSeuil, 0);
  return {
    version: 1,
    type: "mensuel",
    site: p.site,
    mois: p.mois,
    jours: p.jours,
    volumeM3,
    volumeMoisPrecedentM3: p.volumeMoisPrecedentM3,
    volumeAnDernierM3: p.volumeAnDernierM3,
    variationMoisPct,
    variationAnPct: variationPct(volumeM3, p.volumeAnDernierM3),
    fuites,
    economiesDuMois: {
      m3: arrondi(somme(duMois.map((r) => r.economieM3)), 3),
      montant: montantOuNull(duMois),
    },
    economiesCumulees: {
      m3: arrondi(somme(cumulees.map((r) => r.economieM3)), 3),
      montant: montantOuNull(cumulees),
      depuis: cumulees.length
        ? new Date(Math.min(...cumulees.map((r) => r.repareeMs))).toISOString()
        : null,
    },
    methodeEconomies: methodeEconomies(p.delaiJours),
    activite,
    comparaison: comparaison(activite?.litresParUnite ?? null, p.autresLitresParUnite),
    temperatures: p.temperatures,
    clefVerte:
      activite && p.site.uniteActivite === "nuitee"
        ? { litresParNuitee: activite.litresParUnite, estimation: activite.estimation }
        : null,
    conseil: conseilMensuel({
      fuitesOuvertes: p.fuitesOuvertes,
      fuitesDuMois: fuites.length,
      variationMoisPct,
      temperaturesSousSeuil,
    }),
    phraseSansFuite: fuites.length === 0 ? PHRASE_SANS_FUITE : null,
    mention: MENTION_SURVEILLANCE,
  };
}

// ---------------------------------------------------------------------------
// Coût du service et retour sur investissement (page preuve)
// ---------------------------------------------------------------------------

export interface Tarifs {
  mise_en_service_point?: number | null;
  mise_en_service_premier_point_passerelle?: number | null;
  abonnement_premier_point?: number | null;
  abonnement_point_supplementaire?: number | null;
  sonde_temperature_mois?: number | null;
}

export interface CoutService {
  mensuel: number;
  parJour: number;
  parNuitee: number | null;
  miseEnService: number | null;
}

const valeur = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Abonnement HT du site : premier point, points supplémentaires, sondes,
 * remise fondateur ; null si un tarif utile n'est pas paramétré.
 */
export function coutService(p: {
  tarifs: Tarifs | null;
  nbPoints: number;
  nbSondes: number;
  avecPasserelle: boolean;
  remiseFondateurPct: number;
  nuiteesMois: number | null;
}): CoutService | null {
  const t = p.tarifs ?? {};
  if (p.nbPoints < 1) return null;
  const premier = valeur(t.abonnement_premier_point);
  const supplementaire = valeur(t.abonnement_point_supplementaire);
  const sonde = valeur(t.sonde_temperature_mois);
  if (premier === null) return null;
  if (p.nbPoints > 1 && supplementaire === null) return null;
  if (p.nbSondes > 0 && sonde === null) return null;
  const brut = premier + (p.nbPoints - 1) * (supplementaire ?? 0) + p.nbSondes * (sonde ?? 0);
  const mensuel = arrondi(brut * (1 - (p.remiseFondateurPct || 0) / 100), 2);
  const miseEnPoint = valeur(t.mise_en_service_point);
  const miseEnPasserelle = valeur(t.mise_en_service_premier_point_passerelle);
  const premierPoint = p.avecPasserelle ? miseEnPasserelle : miseEnPoint;
  const miseEnService =
    premierPoint === null || (p.nbPoints > 1 && miseEnPoint === null)
      ? null
      : arrondi(premierPoint + (p.nbPoints - 1) * (miseEnPoint ?? 0), 2);
  return {
    mensuel,
    parJour: arrondi((mensuel * 12) / 365, 2),
    parNuitee: p.nuiteesMois && p.nuiteesMois > 0 ? arrondi(mensuel / p.nuiteesMois, 2) : null,
    miseEnService,
  };
}

export const METHODE_RETOUR =
  "Retour sur investissement : (mise en service + abonnement depuis le début) ÷ économies prudentes par jour de surveillance.";

export function retourInvestissement(p: {
  cout: CoutService | null;
  joursSurveillance: number;
  economies: number | null;
}): { jours: number | null; coutEngage: number | null } {
  if (!p.cout || p.cout.miseEnService === null || p.joursSurveillance <= 0) {
    return { jours: null, coutEngage: null };
  }
  const coutEngage = arrondi(
    p.cout.miseEnService + (p.cout.mensuel * 12 * p.joursSurveillance) / 365,
    2,
  );
  if (!p.economies || p.economies <= 0) return { jours: null, coutEngage };
  const parJour = p.economies / p.joursSurveillance;
  return { jours: Math.ceil(coutEngage / parJour), coutEngage };
}

// ---------------------------------------------------------------------------
// Fin de pilote et page preuve
// ---------------------------------------------------------------------------

export interface ContenuFinPilote {
  version: 1;
  type: "fin_pilote";
  site: SiteRapport;
  debut: string;
  fin: string;
  dureeJours: number;
  titre: string;
  fuites: FuiteRapport[];
  anomalies: number;
  economies: { m3: number; montant: number | null };
  methodeEconomies: string;
  pagePreuve: { token: string; expireLe: string } | null;
  phrase: string;
  mention: string;
}

export function contenuFinPilote(p: {
  site: SiteRapport;
  debut: string;
  fin: string;
  dureeJours: number;
  fuites: FuiteSource[];
  finMs: number;
  delaiJours: number;
  pagePreuve: { token: string; expireLe: string } | null;
}): ContenuFinPilote {
  const fuites = fuitesRapport(p.fuites, p.site.prixM3, p.finMs);
  const reparees = fuites.filter((f) => f.statut === "reparee");
  const economies = {
    m3: arrondi(somme(reparees.map((f) => f.economieM3)), 3),
    montant: reparees.some((f) => f.economieMontant !== null)
      ? arrondi(somme(reparees.map((f) => f.economieMontant)), 2)
      : null,
  };
  const phrase = fuites.length
    ? `${fuites.length === 1 ? "Une anomalie trouvée" : `${fuites.length} anomalies trouvées`} en ${p.dureeJours} jours${economies.montant ? `, ${montant(economies.montant, p.site.monnaie)} économisés (méthode prudente)` : ""}.`
    : `Aucune fuite en ${p.dureeJours} jours : votre eau est sous surveillance jour et nuit.`;
  return {
    version: 1,
    type: "fin_pilote",
    site: p.site,
    debut: p.debut,
    fin: p.fin,
    dureeJours: p.dureeJours,
    titre: `Ce que ${p.dureeJours} jours de surveillance ont trouvé`,
    fuites,
    anomalies: fuites.length,
    economies,
    methodeEconomies: methodeEconomies(p.delaiJours),
    pagePreuve: p.pagePreuve,
    phrase,
    mention: MENTION_SURVEILLANCE,
  };
}

/** Contenu figé d'une page preuve : aucune donnée personnelle. */
export interface ContenuPagePreuve {
  version: 1;
  site: { nom: string; type: string; ville: string | null; pays: string; monnaie: Monnaie };
  periode: { debut: string; fin: string };
  joursSurveillance: number;
  fuitesTrouvees: number;
  fuites: { type: TypeFuite; zone: string | null; detecteeLe: string; excesLph: number; statut: StatutFuite; economieMontant: number | null; perteMontant: number | null }[];
  economies: { m3: number; montant: number | null };
  methodeEconomies: string;
  coutService: CoutService | null;
  retour: { jours: number | null; coutEngage: number | null };
  methodeRetour: string;
  courbe: { date: string; volumeM3: number }[];
  phrase: string;
  mention: string;
}

export function contenuPagePreuve(p: {
  site: SiteRapport;
  debut: string;
  fin: string;
  joursSurveillance: number;
  fuites: FuiteSource[];
  finMs: number;
  delaiJours: number;
  cout: CoutService | null;
  courbe: { date: string; volumeM3: number }[];
}): ContenuPagePreuve {
  const fuites = fuitesRapport(p.fuites, p.site.prixM3, p.finMs);
  const reparees = fuites.filter((f) => f.statut === "reparee");
  const economies = {
    m3: arrondi(somme(reparees.map((f) => f.economieM3)), 3),
    montant: reparees.some((f) => f.economieMontant !== null)
      ? arrondi(somme(reparees.map((f) => f.economieMontant)), 2)
      : null,
  };
  const retour = retourInvestissement({
    cout: p.cout,
    joursSurveillance: p.joursSurveillance,
    economies: economies.montant,
  });
  const m = p.site.monnaie;
  let phrase: string;
  if (economies.montant) {
    const trouvees = reparees.length === 1 ? "une fuite trouvée et réparée" : `${reparees.length} fuites trouvées et réparées`;
    phrase = `${montantRond(economies.montant, m)} évités en ${p.joursSurveillance} jours grâce à ${trouvees}${p.cout ? `, pour un service à ${montant(p.cout.parJour, m)} par jour` : ""}.`;
  } else if (fuites.length) {
    phrase = `${fuites.length === 1 ? "Une fuite trouvée" : `${fuites.length} fuites trouvées`} en ${p.joursSurveillance} jours : les économies seront comptées dès la réparation.`;
  } else {
    phrase = `Aucune fuite en ${p.joursSurveillance} jours : l'eau du site est sous surveillance jour et nuit.`;
  }
  return {
    version: 1,
    site: { nom: p.site.nom, type: p.site.type, ville: p.site.ville, pays: p.site.pays, monnaie: m },
    periode: { debut: p.debut, fin: p.fin },
    joursSurveillance: p.joursSurveillance,
    fuitesTrouvees: fuites.length,
    fuites: fuites.map((f) => ({
      type: f.type,
      zone: f.zone,
      detecteeLe: f.detecteeLe,
      excesLph: f.excesLph,
      statut: f.statut,
      economieMontant: f.economieMontant,
      perteMontant: f.perteMontant,
    })),
    economies,
    methodeEconomies: methodeEconomies(p.delaiJours),
    coutService: p.cout,
    retour,
    methodeRetour: METHODE_RETOUR,
    courbe: p.courbe,
    phrase,
    mention: MENTION_SURVEILLANCE,
  };
}

/** Phrase courte d'un rapport, pour l'e-mail qui l'annonce. */
export function resumeRapport(
  c: ContenuPremiereNuit | ContenuPremiereSemaine | ContenuMensuel | ContenuFinPilote,
): string {
  if (c.type === "mensuel") {
    const economies =
      c.economiesCumulees.montant !== null
        ? ` Économies depuis le début : ${montant(c.economiesCumulees.montant, c.site.monnaie)}.`
        : "";
    const variation = c.variationMoisPct !== null ? ` (${pourcentage(c.variationMoisPct)} sur un mois)` : "";
    return `${volume(c.volumeM3)} consommés${variation}. ${c.fuites.length === 0 ? PHRASE_SANS_FUITE : `${c.fuites.length === 1 ? "Une fuite" : `${c.fuites.length} fuites`} ce mois.`}${economies}`;
  }
  return c.phrase;
}
