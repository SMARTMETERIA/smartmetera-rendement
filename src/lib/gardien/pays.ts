// Pays couverts par le Gardien de l'eau : fuseau horaire et monnaie d'un
// site, retenue à la source par défaut d'une organisation (pur, testable).

import type { Pays } from "@/lib/auth/validation";

export type Monnaie = "EUR" | "MAD";
export type Fuseau = "Europe/Paris" | "Africa/Casablanca";

export const REGLAGES_PAYS: Record<
  Pays,
  { fuseau: Fuseau; monnaie: Monnaie; libelle: string }
> = {
  FR: { fuseau: "Europe/Paris", monnaie: "EUR", libelle: "France" },
  MA: { fuseau: "Africa/Casablanca", monnaie: "MAD", libelle: "Maroc" },
};

/** Valeurs de repli si platform_settings.tarifs est illisible. */
const RETENUE_PAR_DEFAUT: Record<Pays, number> = { FR: 0, MA: 10 };

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
