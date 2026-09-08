// Types partagés par l'assemblage du contenu du rapport (pur, testable) et
// son rendu PDF (Deno, pdf-lib — voir supabase/functions/reports).

export interface BilanRapport {
  periodeDebut: string;
  periodeFin: string;
  rendement: number | null;
  seuilReglementaire: number | null;
  distanceSeuil: number | null;
  conformeDecret: boolean | null;
  ilp: number | null;
  ilc: number | null;
  vProduit: number;
  vImporte: number;
  vExporte: number;
  vComptabilise: number;
  vSansComptage: number;
  vService: number;
  vMiseEnDistribution: number;
  vConsommeAutorise: number;
  pertes: number;
}

export interface SecteurRapport {
  nom: string;
  nbAbonnes: number | null;
  lineaireKm: number | null;
  dernierDmnM3h: number | null;
  derniereBaselineM3h: number | null;
  derniereFuiteEstimeeM3j: number | null;
}

export interface AlerteRapport {
  titre: string;
  type: string;
  severite: string;
  declencheeLe: string;
  secteurNom: string | null;
}

export interface InterventionRapport {
  type: string;
  statut: string;
  secteurNom: string | null;
  date: string | null;
  volumeRecupereM3j: number | null;
  resultat: string | null;
}

export interface ActionRapport {
  titre: string;
  categorie: string | null;
  statut: string;
  priorite: string;
  echeance: string | null;
}

export interface PlanActionsRapport {
  nom: string;
  anneeDebut: number | null;
  anneeFin: number | null;
  actions: ActionRapport[];
}

export interface ContenuRapportMensuel {
  organisationNom: string;
  lineaireReseauKm: number | null;
  nbAbonnes: number | null;
  zoneRepartitionEaux: boolean;
  mois: number;
  annee: number;
  genereLe: string;
  bilan: BilanRapport | null;
  secteurs: SecteurRapport[];
  alertes: AlerteRapport[];
  interventions: InterventionRapport[];
  volumeTotalRecupereM3j: number;
  planActions: PlanActionsRapport | null;
}
