// Réglages de facturation d'une organisation, modifiables par le superadmin
// seulement (plan, phases G1 et G6) : statut, fin d'essai, remise
// fondateur, retenue à la source, prix partenaire par point. Pur, testable.
import { decalerJour, instantLocal } from "@/lib/moteur-gardien/temps";

export const STATUTS_ORGANISATION = ["essai", "actif", "suspendu"] as const;
export type StatutOrganisation = (typeof STATUTS_ORGANISATION)[number];

export const LIBELLES_STATUT_ORGANISATION: Record<StatutOrganisation, string> = {
  essai: "Essai",
  actif: "Actif (abonnement)",
  suspendu: "Suspendu (envois arrêtés)",
};

export interface SaisieFacturation {
  statut: string;
  finEssai: string;
  remisePct: string;
  retenuePct: string;
  prixPartenaire: string;
}

export interface Facturation {
  status: StatutOrganisation;
  /** Seulement pour un essai : la date de fin déjà connue reste sinon intacte. */
  trial_ends_at: string | null;
  founder_discount_pct: number;
  withholding_tax_pct: number;
  partner_price_per_point: number | null;
}

/** Nombre au format français (virgule acceptée) ; vide → null. */
function lireNombre(texte: string): number | null | "invalide" {
  const t = texte.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  if (!/^\d+(\.\d+)?$/.test(t)) return "invalide";
  return Number(t);
}

export function validerFacturation(
  s: SaisieFacturation,
  fuseau = "Europe/Paris",
): { ok: true; valeurs: Facturation } | { ok: false; erreur: string } {
  if (!(STATUTS_ORGANISATION as readonly string[]).includes(s.statut)) {
    return { ok: false, erreur: "Choisissez un statut." };
  }
  const statut = s.statut as StatutOrganisation;
  let trial: string | null = null;
  if (statut === "essai") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.finEssai)) return { ok: false, erreur: "Indiquez la date de fin d'essai." };
    // Fin de la journée choisie, à l'heure locale de l'organisation (changements d'heure compris).
    trial = new Date(instantLocal(decalerJour(s.finEssai, 1), 0, fuseau) - 60_000).toISOString();
  }
  const pourcentage = (texte: string, nom: string) => {
    const n = lireNombre(texte);
    if (n === "invalide" || (n !== null && n > 100)) return `${nom} : un nombre entre 0 et 100.`;
    return n ?? 0;
  };
  const remise = pourcentage(s.remisePct, "Remise fondateur");
  if (typeof remise === "string") return { ok: false, erreur: remise };
  const retenue = pourcentage(s.retenuePct, "Retenue à la source");
  if (typeof retenue === "string") return { ok: false, erreur: retenue };
  const prix = lireNombre(s.prixPartenaire);
  if (prix === "invalide" || (prix !== null && prix > 1000)) {
    return { ok: false, erreur: "Prix partenaire : un montant par point, par exemple 7,50." };
  }
  return {
    ok: true,
    valeurs: {
      status: statut,
      trial_ends_at: trial,
      founder_discount_pct: Math.round(remise * 100) / 100,
      withholding_tax_pct: Math.round(retenue * 100) / 100,
      partner_price_per_point: prix === null ? null : Math.round(prix * 100) / 100,
    },
  };
}
