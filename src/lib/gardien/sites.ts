// Création d'un site (pur, testable) : le pays fixe le fuseau horaire et
// la monnaie ; le type propose l'unité d'activité (nuitée, emplacement…).

import { PAYS, type Pays } from "@/lib/auth/validation";
import { REGLAGES_PAYS, type Fuseau, type Monnaie } from "./pays";
import { TYPES_SITE, UNITE_ACTIVITE_PAR_TYPE, type TypeSite } from "./libelles";

export interface NouveauSite {
  name: string;
  type: TypeSite;
  country: Pays;
  timezone: Fuseau;
  currency: Monnaie;
  city: string | null;
  activity_unit: string;
}

export function validerNouveauSite(brut: {
  name?: string;
  type?: string;
  pays?: string;
  ville?: string;
}): { ok: true; site: NouveauSite } | { ok: false; erreur: string } {
  const name = (brut.name ?? "").trim();
  if (name.length < 2 || name.length > 160) {
    return { ok: false, erreur: "Indiquez le nom du site." };
  }
  if (!(TYPES_SITE as readonly string[]).includes(brut.type ?? "")) {
    return { ok: false, erreur: "Choisissez le type de site." };
  }
  if (!(PAYS as readonly string[]).includes(brut.pays ?? "")) {
    return { ok: false, erreur: "Choisissez la France ou le Maroc." };
  }
  const type = brut.type as TypeSite;
  const country = brut.pays as Pays;
  const ville = (brut.ville ?? "").trim();
  return {
    ok: true,
    site: {
      name,
      type,
      country,
      timezone: REGLAGES_PAYS[country].fuseau,
      currency: REGLAGES_PAYS[country].monnaie,
      city: ville ? ville.slice(0, 120) : null,
      activity_unit: UNITE_ACTIVITE_PAR_TYPE[type],
    },
  };
}
