// Pertes et économies, toujours par la méthode prudente, affichée à côté du
// montant (plan, section 3). Montants dans la monnaie du site.

export type Monnaie = "EUR" | "MAD";

export interface CoutFuite {
  m3ParJour: number;
  coutParJour: number | null;
  /** Depuis le début de la fuite jusqu'à maintenant. */
  m3Cumules: number;
  coutCumule: number | null;
  /** Si rien n'est fait : 30 jours. */
  coutMensuelProjete: number | null;
  coutAnnuel: number | null;
}

const arrondi = (n: number, decimales: number) => {
  const f = 10 ** decimales;
  return Math.round(n * f) / f;
};

/** Compteur de pertes en direct d'une fuite ouverte. */
export function coutFuite(params: {
  excesLph: number;
  prixM3: number | null;
  depuisMs: number;
  maintenantMs: number;
}): CoutFuite {
  const m3ParHeure = params.excesLph / 1000;
  const heures = Math.max(0, (params.maintenantMs - params.depuisMs) / 3_600_000);
  const m3ParJour = m3ParHeure * 24;
  const m3Cumules = m3ParHeure * heures;
  const prix = params.prixM3;
  return {
    m3ParJour: arrondi(m3ParJour, 3),
    coutParJour: prix === null ? null : arrondi(m3ParJour * prix, 2),
    m3Cumules: arrondi(m3Cumules, 3),
    coutCumule: prix === null ? null : arrondi(m3Cumules * prix, 2),
    coutMensuelProjete: prix === null ? null : arrondi(m3ParJour * 30 * prix, 2),
    coutAnnuel: prix === null ? null : arrondi(m3ParJour * 365 * prix, 2),
  };
}

export interface Economies {
  m3: number;
  montant: number | null;
  methode: string;
}

function nombreFr(n: number, decimales: number): string {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(n);
}

export function symboleMonnaie(monnaie: Monnaie): string {
  return monnaie === "EUR" ? "€" : "MAD";
}

/**
 * Économies prudentes d'une fuite réparée : excès de débit × 24 h × délai
 * de découverte évité (défaut 30 jours) × prix du m³ du site.
 */
export function economiesPrudentes(params: {
  excesLph: number;
  delaiJours: number;
  prixM3: number | null;
  monnaie: Monnaie;
}): Economies {
  const m3 = arrondi((params.excesLph / 1000) * 24 * params.delaiJours, 3);
  const montant = params.prixM3 === null ? null : arrondi(m3 * params.prixM3, 2);
  const unite = symboleMonnaie(params.monnaie);
  const methode =
    montant === null
      ? `Méthode prudente : ${nombreFr(params.excesLph, 1)} L/h d'excès × 24 h × ${params.delaiJours} jours de découverte évités = ${nombreFr(m3, 3)} m³ (prix de l'eau du site à renseigner).`
      : `Méthode prudente : ${nombreFr(params.excesLph, 1)} L/h d'excès × 24 h × ${params.delaiJours} jours de découverte évités × ${nombreFr(params.prixM3 as number, 2)} ${unite}/m³ = ${nombreFr(montant, 2)} ${unite}.`;
  return { m3, montant, methode };
}

/** Texte affiché avec le compteur de pertes d'une fuite ouverte. */
export function methodePertes(excesLph: number, prixM3: number | null, monnaie: Monnaie): string {
  const unite = symboleMonnaie(monnaie);
  return prixM3 === null
    ? `Méthode prudente : ${nombreFr(excesLph, 1)} L/h d'excès mesuré, depuis le début de la fuite (prix de l'eau du site à renseigner).`
    : `Méthode prudente : ${nombreFr(excesLph, 1)} L/h d'excès mesuré × ${nombreFr(prixM3, 2)} ${unite}/m³, depuis le début de la fuite.`;
}
