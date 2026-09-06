/**
 * Formules métier du bilan d'eau (décret 2012-97).
 * Volumes en m³, linéaire de réseau en km. Source de vérité : CLAUDE.md.
 */

export interface BilanEau {
  vProduit: number;
  vImporte: number;
  vExporte: number;
  vComptabilise: number;
  vSansComptage: number;
  vService: number;
  lineaireKm: number;
  zoneDeRepartitionDesEaux?: boolean;
}

export function volumeMisEnDistribution({
  vProduit,
  vImporte,
  vExporte,
}: BilanEau) {
  return vProduit + vImporte - vExporte;
}

export function volumeConsommeAutorise({
  vComptabilise,
  vSansComptage,
  vService,
}: BilanEau) {
  return vComptabilise + vSansComptage + vService;
}

export function pertes(bilan: BilanEau) {
  return volumeMisEnDistribution(bilan) - volumeConsommeAutorise(bilan);
}

export function rendementReseau(bilan: BilanEau) {
  const { vExporte, vProduit, vImporte } = bilan;
  return (volumeConsommeAutorise(bilan) + vExporte) / (vProduit + vImporte);
}

export function indiceLineairePertes(bilan: BilanEau) {
  return pertes(bilan) / (365 * bilan.lineaireKm);
}

export function indiceLineaireConsommation(bilan: BilanEau) {
  const { vExporte } = bilan;
  return (volumeConsommeAutorise(bilan) + vExporte) / (365 * bilan.lineaireKm);
}

/** Seuil réglementaire (décret 2012-97) : 85 % ou seuil ILC, terme fixe majoré en ZRE. */
export function seuilReglementaire(bilan: BilanEau) {
  const termeFixe = bilan.zoneDeRepartitionDesEaux ? 70 : 65;
  return (termeFixe + 0.2 * indiceLineaireConsommation(bilan)) / 100;
}

/** Rendement conforme au décret 2012-97 (seuil à 85 % ou seuil ILC, majoré en ZRE). */
export function estConformeDecret(bilan: BilanEau) {
  const rendement = rendementReseau(bilan);
  return rendement >= 0.85 || rendement >= seuilReglementaire(bilan);
}
