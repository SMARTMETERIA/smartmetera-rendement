import {
  type BilanEau,
  estConformeDecret,
  indiceLineaireConsommation,
  indiceLineairePertes,
  pertes,
  rendementReseau,
  seuilReglementaire,
  volumeConsommeAutorise,
  volumeMisEnDistribution,
} from "../rendement";

export type TypePeriode = "annee_civile" | "glissant_12m";

export interface BilanCalcule extends BilanEau {
  typePeriode: TypePeriode;
  periodeDebut: string;
  periodeFin: string;
  volumeMisEnDistribution: number;
  volumeConsommeAutorise: number;
  pertes: number;
  rendement: number;
  ilp: number;
  ilc: number;
  seuilReglementaire: number;
  /** rendement - seuil : positif = marge au-dessus du seuil, négatif = écart au seuil (non conforme). */
  distanceAuSeuil: number;
  conformeDecret: boolean;
}

/** Calcule tous les indicateurs dérivés d'un bilan — mêmes formules que
 * upsert_bilan_calcule() (SQL) et recalculer_balance() (trigger). */
export function calculerBilan(
  bilan: BilanEau,
  typePeriode: TypePeriode,
  periodeDebut: string,
  periodeFin: string,
): BilanCalcule {
  const rendement = rendementReseau(bilan);
  const seuil = seuilReglementaire(bilan);
  return {
    ...bilan,
    typePeriode,
    periodeDebut,
    periodeFin,
    volumeMisEnDistribution: volumeMisEnDistribution(bilan),
    volumeConsommeAutorise: volumeConsommeAutorise(bilan),
    pertes: pertes(bilan),
    rendement,
    ilp: indiceLineairePertes(bilan),
    ilc: indiceLineaireConsommation(bilan),
    seuilReglementaire: seuil,
    distanceAuSeuil: rendement - seuil,
    conformeDecret: estConformeDecret(bilan),
  };
}

export interface EntreeAnnuelleBilan {
  annee: number;
  vComptabilise: number;
  vSansComptage: number;
  vService: number;
  lineaireKm: number;
  zoneDeRepartitionDesEaux: boolean;
}

/**
 * Répartit au prorata des jours chevauchés les composantes annuelles
 * (comptabilisé/sans comptage/service/linéaire) d'une fenêtre glissante de
 * 365 jours à cheval sur un ou deux exercices civils — même logique que
 * calculer_bilan_glissant_12m() en SQL. vProduit/vImporte/vExporte ne sont
 * PAS interpolés : ils viennent de la télérelève réelle sur la fenêtre
 * exacte, à fournir séparément (mesurés, pas déclarés).
 */
export function repartirComposantesAnnuelles(
  periodeDebut: Date,
  periodeFin: Date,
  entreesParAnnee: Map<number, EntreeAnnuelleBilan>,
): {
  vComptabilise: number;
  vSansComptage: number;
  vService: number;
  lineaireKm: number;
  zoneDeRepartitionDesEaux: boolean;
} {
  let vComptabilise = 0;
  let vSansComptage = 0;
  let vService = 0;
  let lineaireKmPondere = 0;
  let poidsTotal = 0;
  let zoneDeRepartitionDesEaux = false;

  const anneeDebut = periodeDebut.getUTCFullYear();
  const anneeFin = periodeFin.getUTCFullYear();

  for (let annee = anneeDebut; annee <= anneeFin; annee++) {
    const debutAnnee = new Date(Date.UTC(annee, 0, 1));
    const finAnnee = new Date(Date.UTC(annee, 11, 31));
    const overlapDebut = periodeDebut > debutAnnee ? periodeDebut : debutAnnee;
    const overlapFin = periodeFin < finAnnee ? periodeFin : finAnnee;
    if (overlapDebut > overlapFin) continue;

    const joursOverlap =
      Math.round((overlapFin.getTime() - overlapDebut.getTime()) / 86_400_000) +
      1;
    const joursAnnee =
      Math.round((finAnnee.getTime() - debutAnnee.getTime()) / 86_400_000) + 1;

    const entree = entreesParAnnee.get(annee);
    if (!entree) continue;

    vComptabilise += (entree.vComptabilise / joursAnnee) * joursOverlap;
    vSansComptage += (entree.vSansComptage / joursAnnee) * joursOverlap;
    vService += (entree.vService / joursAnnee) * joursOverlap;
    lineaireKmPondere += entree.lineaireKm * joursOverlap;
    poidsTotal += joursOverlap;
    zoneDeRepartitionDesEaux = entree.zoneDeRepartitionDesEaux;
  }

  return {
    vComptabilise,
    vSansComptage,
    vService,
    lineaireKm: poidsTotal > 0 ? lineaireKmPondere / poidsTotal : 0,
    zoneDeRepartitionDesEaux,
  };
}
