// Calculateur de ROI (public /roi et usage interne) : réutilise les
// formules déjà testées de src/lib/rendement.ts et src/lib/engine/bilan.ts
// (source de vérité CLAUDE.md) — aucune formule de bilan n'est réécrite ici,
// seule la couche financière (pertes en €, pénalité, gains, retour sur
// investissement) est ajoutée par-dessus.
import { calculerBilan, type BilanCalcule } from "../engine/bilan";
import type { BilanEau } from "../rendement";

export interface EntreesRoi {
  bilan: BilanEau;
  /** Coût marginal de production/traitement d'un m³ supplémentaire (€/m³). */
  coutMarginalEurM3: number;
  /** Redevance prélèvement (agence de l'eau) sur le volume prélevé (€/m³). */
  redevanceEurM3: number;
  /** Prix de vente moyen / palier tarifaire du m³ facturé aux abonnés (€/m³). */
  prixPalierEurM3: number;
  /** Coût estimé des travaux de réduction de pertes (€), pour le calcul de retour sur investissement. */
  coutTravauxEur?: number;
  /** Taux de subvention (agence de l'eau, région...) sur ces travaux, en %. */
  tauxSubventionPct?: number;
}

export interface ResultatRoi {
  bilan: BilanCalcule;
  /** Valeur des pertes au coût marginal de production (ce qu'elles coûtent à produire). */
  pertesEuroCoutMarginal: number;
  /** Valeur des pertes au prix du palier (ce qu'elles auraient rapporté si facturées). */
  pertesEuroCommercial: number;
  /** Décret 2012-97 (art. L213-10-9 C. env.) : sans plan d'actions passé le délai,
   * la redevance prélèvement peut être doublée — surcoût potentiel estimé ici. */
  penalitePotentielleEur: number;
  /** Valeur économisée par m³ non prélevé : coût marginal évité + redevance évitée. */
  valeurM3EconomiseEur: number;
  gain10PctEur: number;
  gain20PctEur: number;
  coutNetTravauxEur: number;
  netApres10PctEur: number;
  netApres20PctEur: number;
  /** Années avant que le gain cumulé (à 10 %) ne couvre le coût net des travaux, si calculable. */
  dureeRetour10Annees: number | null;
  dureeRetour20Annees: number | null;
}

export function calculerRoi(entrees: EntreesRoi): ResultatRoi {
  const bilan = calculerBilan(entrees.bilan, "annee_civile", "", "");

  const pertesEuroCoutMarginal = bilan.pertes * entrees.coutMarginalEurM3;
  const pertesEuroCommercial = bilan.pertes * entrees.prixPalierEurM3;
  const penalitePotentielleEur = bilan.conformeDecret
    ? 0
    : entrees.redevanceEurM3 * entrees.bilan.vProduit;

  const valeurM3EconomiseEur = entrees.coutMarginalEurM3 + entrees.redevanceEurM3;
  const gain10PctEur = bilan.pertes * 0.1 * valeurM3EconomiseEur;
  const gain20PctEur = bilan.pertes * 0.2 * valeurM3EconomiseEur;

  const coutTravauxEur = entrees.coutTravauxEur ?? 0;
  const tauxSubventionPct = entrees.tauxSubventionPct ?? 0;
  const coutNetTravauxEur = coutTravauxEur * (1 - tauxSubventionPct / 100);

  const netApres10PctEur = gain10PctEur - coutNetTravauxEur;
  const netApres20PctEur = gain20PctEur - coutNetTravauxEur;

  const dureeRetour10Annees =
    coutNetTravauxEur > 0 && gain10PctEur > 0 ? coutNetTravauxEur / gain10PctEur : null;
  const dureeRetour20Annees =
    coutNetTravauxEur > 0 && gain20PctEur > 0 ? coutNetTravauxEur / gain20PctEur : null;

  return {
    bilan,
    pertesEuroCoutMarginal,
    pertesEuroCommercial,
    penalitePotentielleEur,
    valeurM3EconomiseEur,
    gain10PctEur,
    gain20PctEur,
    coutNetTravauxEur,
    netApres10PctEur,
    netApres20PctEur,
    dureeRetour10Annees,
    dureeRetour20Annees,
  };
}
