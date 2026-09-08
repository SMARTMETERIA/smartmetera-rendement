import type {
  ActionRapport,
  AlerteRapport,
  BilanRapport,
  ContenuRapportMensuel,
  InterventionRapport,
  PlanActionsRapport,
  SecteurRapport,
} from "./types";

export interface LigneBilan {
  periode_debut: string;
  periode_fin: string;
  rendement: number | null;
  seuil_reglementaire: number | null;
  distance_seuil: number | null;
  conforme_decret: boolean | null;
  ilp: number | null;
  ilc: number | null;
  v_produit: number;
  v_importe: number;
  v_exporte: number;
  v_comptabilise: number;
  v_sans_comptage: number;
  v_service: number;
  v_mise_en_distribution: number;
  v_consomme_autorise: number;
  pertes: number;
}

export interface LigneSecteur {
  nom: string;
  nb_abonnes: number | null;
  lineaire_km: number | null;
}

export interface LigneNightline {
  sector_id: string;
  debit_min_nocturne_m3h: number;
  baseline_m3h: number | null;
  volume_fuite_estime_m3j: number | null;
  nuit_date: string;
}

export interface LigneAlerte {
  titre: string;
  type: string;
  severite: string;
  declenchee_le: string;
  sector_nom: string | null;
}

export interface LigneIntervention {
  type: string;
  statut: string;
  sector_nom: string | null;
  date: string | null;
  volume_recupere_m3j: number | null;
  resultat: string | null;
}

export interface LigneAction {
  titre: string;
  categorie: string | null;
  statut: string;
  priorite: string;
  echeance: string | null;
}

export function assemblerContenuRapportMensuel(params: {
  organisationNom: string;
  lineaireReseauKm: number | null;
  nbAbonnes: number | null;
  zoneRepartitionEaux: boolean;
  mois: number;
  annee: number;
  genereLe: string;
  bilan: LigneBilan | null;
  secteurs: LigneSecteur[];
  /** Une ligne nightline par secteur, la plus récente (déjà filtrée en amont). */
  dernieresNightlines: Map<string, LigneNightline>;
  secteursIdParNom: Map<string, string>;
  alertes: LigneAlerte[];
  interventions: LigneIntervention[];
  planActions: { nom: string; annee_debut: number | null; annee_fin: number | null; actions: LigneAction[] } | null;
}): ContenuRapportMensuel {
  const secteurs: SecteurRapport[] = params.secteurs.map((s) => {
    const id = params.secteursIdParNom.get(s.nom);
    const nightline = id ? params.dernieresNightlines.get(id) : undefined;
    return {
      nom: s.nom,
      nbAbonnes: s.nb_abonnes,
      lineaireKm: s.lineaire_km,
      dernierDmnM3h: nightline?.debit_min_nocturne_m3h ?? null,
      derniereBaselineM3h: nightline?.baseline_m3h ?? null,
      derniereFuiteEstimeeM3j: nightline?.volume_fuite_estime_m3j ?? null,
    };
  });

  const alertes: AlerteRapport[] = params.alertes.map((a) => ({
    titre: a.titre,
    type: a.type,
    severite: a.severite,
    declencheeLe: a.declenchee_le,
    secteurNom: a.sector_nom,
  }));

  const interventions: InterventionRapport[] = params.interventions.map((i) => ({
    type: i.type,
    statut: i.statut,
    secteurNom: i.sector_nom,
    date: i.date,
    volumeRecupereM3j: i.volume_recupere_m3j,
    resultat: i.resultat,
  }));

  const volumeTotalRecupereM3j = interventions.reduce(
    (somme, i) => somme + (i.volumeRecupereM3j ?? 0),
    0,
  );

  const bilan: BilanRapport | null = params.bilan
    ? {
        periodeDebut: params.bilan.periode_debut,
        periodeFin: params.bilan.periode_fin,
        rendement: params.bilan.rendement,
        seuilReglementaire: params.bilan.seuil_reglementaire,
        distanceSeuil: params.bilan.distance_seuil,
        conformeDecret: params.bilan.conforme_decret,
        ilp: params.bilan.ilp,
        ilc: params.bilan.ilc,
        vProduit: params.bilan.v_produit,
        vImporte: params.bilan.v_importe,
        vExporte: params.bilan.v_exporte,
        vComptabilise: params.bilan.v_comptabilise,
        vSansComptage: params.bilan.v_sans_comptage,
        vService: params.bilan.v_service,
        vMiseEnDistribution: params.bilan.v_mise_en_distribution,
        vConsommeAutorise: params.bilan.v_consomme_autorise,
        pertes: params.bilan.pertes,
      }
    : null;

  const planActions: PlanActionsRapport | null = params.planActions
    ? {
        nom: params.planActions.nom,
        anneeDebut: params.planActions.annee_debut,
        anneeFin: params.planActions.annee_fin,
        actions: params.planActions.actions.map(
          (a): ActionRapport => ({
            titre: a.titre,
            categorie: a.categorie,
            statut: a.statut,
            priorite: a.priorite,
            echeance: a.echeance,
          }),
        ),
      }
    : null;

  return {
    organisationNom: params.organisationNom,
    lineaireReseauKm: params.lineaireReseauKm,
    nbAbonnes: params.nbAbonnes,
    zoneRepartitionEaux: params.zoneRepartitionEaux,
    mois: params.mois,
    annee: params.annee,
    genereLe: params.genereLe,
    bilan,
    secteurs,
    alertes,
    interventions,
    volumeTotalRecupereM3j,
    planActions,
  };
}
