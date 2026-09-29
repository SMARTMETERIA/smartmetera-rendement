// Fuites : libellés, montants au format français et économies cumulées
// (pur, testable). Les calculs viennent de src/lib/moteur-gardien.
import { symboleMonnaie, type Monnaie } from "@/lib/moteur-gardien/economies";
import type { StatutFuite, TypeFuite } from "@/lib/moteur-gardien/analyse";

export const MENTION_SURVEILLANCE =
  "Surveillance fondée sur les données transmises par les capteurs.";

export const LIBELLES_TYPE_FUITE: Record<TypeFuite, string> = {
  fuite_nuit: "Fuite de nuit",
  debit_continu: "Débit continu",
  rupture: "Rupture",
  fuite_fermeture: "Consommation pendant la fermeture",
};

export const LIBELLES_STATUT_FUITE: Record<StatutFuite, string> = {
  ouverte: "À prendre en charge",
  prise_en_compte: "Prise en charge",
  reparee: "Réparée",
  fausse_alerte: "Fausse alerte",
};

export function formaterMontant(montant: number, monnaie: Monnaie): string {
  const nombre = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(montant);
  return `${nombre} ${symboleMonnaie(monnaie)}`;
}

export function formaterVolume(m3: number): string {
  const nombre = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(m3);
  return `${nombre} m³`;
}

export interface LigneEconomie {
  saved_m3: number | string | null;
  saved_amount: number | string | null;
  currency: string;
}

/** Économies des fuites réparées, par monnaie (montant null si prix absent). */
export function totalEconomies(
  lignes: LigneEconomie[],
): { monnaie: Monnaie; m3: number; montant: number | null }[] {
  const parMonnaie = new Map<Monnaie, { m3: number; montant: number | null }>();
  for (const l of lignes) {
    const monnaie: Monnaie = l.currency === "MAD" ? "MAD" : "EUR";
    const total = parMonnaie.get(monnaie) ?? { m3: 0, montant: null };
    total.m3 += Number(l.saved_m3 ?? 0);
    if (l.saved_amount !== null) total.montant = (total.montant ?? 0) + Number(l.saved_amount);
    parMonnaie.set(monnaie, total);
  }
  return [...parMonnaie.entries()].map(([monnaie, t]) => ({
    monnaie,
    m3: Math.round(t.m3 * 1000) / 1000,
    montant: t.montant === null ? null : Math.round(t.montant * 100) / 100,
  }));
}
