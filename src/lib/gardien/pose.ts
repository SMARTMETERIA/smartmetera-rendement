// Assistant de pose (pur, testable) : valeurs proposées, vérification du
// poids d'impulsion, état affiché au technicien.

/** Poids d'impulsion courants des compteurs d'eau (litres par impulsion). */
export const POIDS_IMPULSION_COURANTS = [1, 10, 100, 1000] as const;

/** Poids reconnus lors d'une correction (litres par impulsion). */
const POIDS_CONNUS = [
  0.1, 0.25, 0.5, 1, 2.5, 5, 10, 25, 50, 100, 250, 500, 1000,
];

export const ZONES_COURANTES = [
  "Général",
  "Cuisine",
  "Chambres",
  "Piscine",
  "Arrosage",
  "Blanchisserie",
  "Sanitaires",
  "Spa",
] as const;

export type VerificationPoids =
  | { statut: "insuffisant"; message: string }
  | { statut: "correct"; ecartPct: number; message: string }
  | { statut: "a_corriger"; poidsSuggere: number; message: string }
  | { statut: "incoherent"; message: string };

/**
 * Compare la consommation lue sur le compteur (index lu − index de pose) à
 * celle mesurée par le capteur. Écart de moins de 10 % : réglage correct.
 * Sinon, propose le poids d'impulsion connu le plus proche du rapport
 * observé (à 15 % près), ou signale une incohérence.
 */
export function verifierPoidsImpulsion(params: {
  indexPoseM3: number;
  indexLuM3: number;
  volumeMesureM3: number;
  poidsActuelL: number;
}): VerificationPoids {
  const reel = params.indexLuM3 - params.indexPoseM3;
  const mesure = params.volumeMesureM3;
  if (reel < 0) {
    return {
      statut: "incoherent",
      message:
        "L'index lu est plus petit que l'index de pose : vérifiez la saisie.",
    };
  }
  if (reel < 0.05 || mesure < 0.05) {
    return {
      statut: "insuffisant",
      message:
        "Pas encore assez d'eau passée pour vérifier (au moins 50 litres). Réessayez dans quelques jours.",
    };
  }
  const rapport = reel / mesure;
  if (Math.abs(rapport - 1) <= 0.1) {
    return {
      statut: "correct",
      ecartPct: Math.round((rapport - 1) * 1000) / 10,
      message: "Le poids d'impulsion est correct.",
    };
  }
  const cible = params.poidsActuelL * rapport;
  const proche = POIDS_CONNUS.reduce((a, b) =>
    Math.abs(b - cible) < Math.abs(a - cible) ? b : a,
  );
  if (Math.abs(proche - cible) / cible <= 0.15) {
    return {
      statut: "a_corriger",
      poidsSuggere: proche,
      message: `Le compteur indique ${formaterNombre(reel)} m³ mais le capteur a mesuré ${formaterNombre(mesure)} m³ : le bon poids d'impulsion est probablement ${formaterNombre(proche)} litre${proche > 1 ? "s" : ""}.`,
    };
  }
  return {
    statut: "incoherent",
    message: `Le compteur indique ${formaterNombre(reel)} m³ mais le capteur a mesuré ${formaterNombre(mesure)} m³, sans poids d'impulsion courant qui l'explique : vérifiez le câblage et l'index lu.`,
  };
}

function formaterNombre(n: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(n);
}

export interface EtatPose {
  nature: "eau" | "temperature";
  premiere_donnee_at: string | null;
  ecoulement_detecte_at: string | null;
  temperature_c: number | null;
  expected_first_data_at: string | null;
}

export type EtapeAttente =
  | { etape: "attente"; heureAttendue: string | null }
  | { etape: "donnees_recues" }
  | { etape: "feu_vert" };

/** Ce que l'assistant affiche pendant le robinet test. */
export function etapeAttente(etat: EtatPose): EtapeAttente {
  if (etat.nature === "temperature") {
    return etat.temperature_c !== null
      ? { etape: "feu_vert" }
      : etat.premiere_donnee_at
        ? { etape: "donnees_recues" }
        : { etape: "attente", heureAttendue: etat.expected_first_data_at };
  }
  if (etat.ecoulement_detecte_at) return { etape: "feu_vert" };
  if (etat.premiere_donnee_at) return { etape: "donnees_recues" };
  return { etape: "attente", heureAttendue: etat.expected_first_data_at };
}
