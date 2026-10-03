// Pays couverts par le Gardien de l'eau : fuseau horaire et monnaie d'un
// site, retenue à la source par défaut d'une organisation (pur, testable).
// La RDC a deux fuseaux (Kinshasa à l'ouest, Lubumbashi à l'est) et deux
// monnaies (dollar américain, franc congolais) : le site choisit.

import { paysDe, type Pays } from "@/lib/auth/validation";
import type { Monnaie } from "@/lib/moteur-gardien/economies";

export type { Monnaie };
export type Fuseau = "Europe/Paris" | "Africa/Casablanca" | "Africa/Kinshasa" | "Africa/Lubumbashi";

export const REGLAGES_PAYS: Record<
  Pays,
  {
    /** Valeurs par défaut d'un nouveau site. */
    fuseau: Fuseau;
    monnaie: Monnaie;
    libelle: string;
    /** Choix proposés pour un site de ce pays. */
    fuseaux: readonly Fuseau[];
    monnaies: readonly Monnaie[];
  }
> = {
  FR: { fuseau: "Europe/Paris", monnaie: "EUR", libelle: "France", fuseaux: ["Europe/Paris"], monnaies: ["EUR"] },
  MA: { fuseau: "Africa/Casablanca", monnaie: "MAD", libelle: "Maroc", fuseaux: ["Africa/Casablanca"], monnaies: ["MAD"] },
  CD: {
    fuseau: "Africa/Kinshasa",
    monnaie: "USD",
    libelle: "République démocratique du Congo",
    fuseaux: ["Africa/Kinshasa", "Africa/Lubumbashi"],
    monnaies: ["USD", "CDF"],
  },
};

export const LIBELLES_FUSEAU: Record<Fuseau, string> = {
  "Europe/Paris": "Heure de Paris",
  "Africa/Casablanca": "Heure de Casablanca",
  "Africa/Kinshasa": "Heure de Kinshasa (ouest)",
  "Africa/Lubumbashi": "Heure de Lubumbashi (est)",
};

export const LIBELLES_MONNAIE: Record<Monnaie, string> = {
  EUR: "euros",
  MAD: "dirhams",
  USD: "dollars américains",
  CDF: "francs congolais",
};

/** Fuseau horaire par défaut d'une organisation (dates d'essai, totaux). */
export function fuseauPays(country: unknown): Fuseau {
  return REGLAGES_PAYS[paysDe(country)].fuseau;
}

/** Monnaie par défaut d'une organisation (totaux affichés sans site). */
export function monnaiePays(country: unknown): Monnaie {
  return REGLAGES_PAYS[paysDe(country)].monnaie;
}

/**
 * Valeurs de repli si platform_settings.tarifs est illisible (décisions de
 * Rayan, D4 et D6 : Maroc 10 %, RDC 0 %). TODO(RAYAN) : à confirmer par un
 * conseil fiscal.
 */
const RETENUE_PAR_DEFAUT: Record<Pays, number> = { FR: 0, MA: 10, CD: 0 };

/**
 * Retenue à la source (%) d'une nouvelle organisation, lue dans
 * platform_settings.tarifs[monnaie].retenue_source_pct_defaut (Maroc :
 * 10 % pour une organisation facturée depuis l'étranger).
 */
export function retenueSourceParDefaut(tarifs: unknown, pays: Pays): number {
  const monnaie = REGLAGES_PAYS[pays].monnaie;
  const valeur = (
    tarifs as Record<string, { retenue_source_pct_defaut?: unknown }> | null
  )?.[monnaie]?.retenue_source_pct_defaut;
  return typeof valeur === "number" && valeur >= 0 && valeur <= 100
    ? valeur
    : RETENUE_PAR_DEFAUT[pays];
}
