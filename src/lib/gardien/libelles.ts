// Libellés français du Gardien de l'eau (partagés par les écrans).

export const TYPES_SITE = [
  "hotel",
  "camping",
  "village_vacances",
  "residence_tourisme",
  "centre_commercial",
  "salle_sport",
  "restaurant",
  "laverie",
  "autre",
] as const;

export type TypeSite = (typeof TYPES_SITE)[number];

export const LIBELLES_TYPE_SITE: Record<TypeSite, string> = {
  hotel: "Hôtel",
  camping: "Camping",
  village_vacances: "Village vacances",
  residence_tourisme: "Résidence de tourisme",
  centre_commercial: "Centre commercial",
  salle_sport: "Salle de sport",
  restaurant: "Restaurant",
  laverie: "Laverie",
  autre: "Autre",
};

/** Unité d'activité proposée par défaut selon le type de site. */
export const UNITE_ACTIVITE_PAR_TYPE: Record<TypeSite, string> = {
  hotel: "nuitee",
  camping: "emplacement",
  village_vacances: "nuitee",
  residence_tourisme: "nuitee",
  centre_commercial: "m2",
  salle_sport: "aucune",
  restaurant: "couvert",
  laverie: "aucune",
  autre: "aucune",
};

export const LIBELLES_UNITE_ACTIVITE: Record<string, string> = {
  nuitee: "nuitée",
  emplacement: "emplacement occupé",
  couvert: "couvert",
  m2: "m²",
  aucune: "aucune",
};
