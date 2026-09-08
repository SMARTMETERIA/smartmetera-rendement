// Export des indicateurs RPQS/SISPEA en CSV, à titre de synthèse pour la
// saisie (manuelle) dans l'observatoire SISPEA — il n'existe pas d'import
// en masse public côté SISPEA, ce fichier sert de pense-bête lors de la
// saisie du formulaire officiel.
export interface DonneesBilanAnnuel {
  annee: number;
  rendement: number | null;
  ilp: number | null;
  ilc: number | null;
  vProduit: number;
  vImporte: number;
  vExporte: number;
  vMiseEnDistribution: number;
  vComptabilise: number;
  vSansComptage: number;
  vService: number;
  vConsommeAutorise: number;
  pertes: number;
  lineaireReseauKm: number | null;
  nbAbonnes: number | null;
  conformeDecret: boolean | null;
}

interface Ligne {
  code: string;
  libelle: string;
  valeur: string;
  unite: string;
}

function formatNombre(v: number | null, decimales: number): string {
  return v === null ? "" : v.toFixed(decimales).replace(".", ",");
}

export function construireLignesRpqs(d: DonneesBilanAnnuel): Ligne[] {
  return [
    { code: "P104.3", libelle: "Rendement du réseau de distribution", valeur: formatNombre(d.rendement !== null ? d.rendement * 100 : null, 1), unite: "%" },
    { code: "P106.3", libelle: "Indice linéaire de pertes en réseau (ILP)", valeur: formatNombre(d.ilp, 3), unite: "m³/km/j" },
    { code: "ILC", libelle: "Indice linéaire de consommation (indicateur interne)", valeur: formatNombre(d.ilc, 3), unite: "m³/km/j" },
    { code: "—", libelle: "Volume produit", valeur: formatNombre(d.vProduit, 0), unite: "m³" },
    { code: "—", libelle: "Volume importé (acheté en gros)", valeur: formatNombre(d.vImporte, 0), unite: "m³" },
    { code: "—", libelle: "Volume exporté (vendu en gros)", valeur: formatNombre(d.vExporte, 0), unite: "m³" },
    { code: "—", libelle: "Volume mis en distribution (Vmd)", valeur: formatNombre(d.vMiseEnDistribution, 0), unite: "m³" },
    { code: "—", libelle: "Volume comptabilisé", valeur: formatNombre(d.vComptabilise, 0), unite: "m³" },
    { code: "—", libelle: "Volume consommé sans comptage", valeur: formatNombre(d.vSansComptage, 0), unite: "m³" },
    { code: "—", libelle: "Volume de service", valeur: formatNombre(d.vService, 0), unite: "m³" },
    { code: "—", libelle: "Volume consommé autorisé (Vca)", valeur: formatNombre(d.vConsommeAutorise, 0), unite: "m³" },
    { code: "—", libelle: "Pertes (Vmd − Vca)", valeur: formatNombre(d.pertes, 0), unite: "m³" },
    { code: "—", libelle: "Linéaire de réseau", valeur: formatNombre(d.lineaireReseauKm, 1), unite: "km" },
    { code: "—", libelle: "Nombre d'abonnés", valeur: d.nbAbonnes?.toString() ?? "", unite: "abonnés" },
    { code: "—", libelle: "Conforme au décret 2012-97", valeur: d.conformeDecret === null ? "" : d.conformeDecret ? "Oui" : "Non", unite: "" },
  ];
}

function champCsv(v: string): string {
  return v.includes(";") || v.includes('"') || v.includes("\n")
    ? `"${v.replace(/"/g, '""')}"`
    : v;
}

export function construireCsvRpqs(d: DonneesBilanAnnuel): string {
  const entetes = ["Code", "Indicateur", "Valeur", "Unité"];
  const lignes = construireLignesRpqs(d).map((l) => [l.code, l.libelle, l.valeur, l.unite]);
  return [entetes, ...lignes]
    .map((ligne) => ligne.map(champCsv).join(";"))
    .join("\r\n");
}

export function nomFichierRpqs(annee: number): string {
  return `indicateurs-rpqs-sispea-${annee}.csv`;
}
