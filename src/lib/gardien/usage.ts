// Usage mensuel d'une organisation Gardien, par monnaie (facturation
// manuelle, pas de paiement en ligne) : mises en service du mois,
// abonnements, sondes, remise fondateur, retenue à la source. Tarifs de
// platform_settings.tarifs, surchargés par site (price_overrides). Un tarif
// absent n'est jamais inventé : la ligne reste « à paramétrer ».
import type { Tarifs } from "@/lib/gardien-rapports/contenus";

export type MonnaieUsage = "EUR" | "MAD";

export interface SiteUsage {
  id: string;
  nom: string;
  monnaie: MonnaieUsage;
  surcharges: Tarifs | null;
  /** Site équipé d'une passerelle LoRaWAN (kit C). */
  avecPasserelle: boolean;
  /** Dates de pose des points de comptage actifs (ISO). */
  poses: string[];
  sondes: number;
  pilote: boolean;
}

export interface LigneUsage {
  libelle: string;
  quantite: number;
  prixUnitaire: number | null;
  montant: number | null;
}

export interface UsageMonnaie {
  monnaie: MonnaieUsage;
  pointsActifs: number;
  misesEnService: number;
  sondes: number;
  lignes: LigneUsage[];
  brut: number;
  remise: number;
  ht: number;
  retenuePct: number;
  retenue: number;
  net: number;
  /** Un tarif utile manque : le total ne compte pas la ligne. */
  incomplet: boolean;
  sitesEnPilote: string[];
}

const arrondi = (n: number) => Math.round(n * 100) / 100;
const val = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function usageMensuel(p: {
  debutMois: string;
  finMois: string;
  tarifs: Record<string, Tarifs>;
  sites: SiteUsage[];
  remiseFondateurPct: number;
  retenuePct: number;
}): UsageMonnaie[] {
  const parMonnaie = new Map<MonnaieUsage, SiteUsage[]>();
  for (const s of p.sites) parMonnaie.set(s.monnaie, [...(parMonnaie.get(s.monnaie) ?? []), s]);

  return [...parMonnaie.entries()].map(([monnaie, sites]) => {
    const lignes: LigneUsage[] = [];
    let incomplet = false;
    let miseEnServiceTotal = 0;
    let recurrent = 0;
    let pointsActifs = 0;
    let misesEnService = 0;
    let sondes = 0;
    const ajouter = (libelle: string, quantite: number, prix: number | null, recurrente: boolean) => {
      if (quantite <= 0) return;
      const montant = prix === null ? null : arrondi(quantite * prix);
      if (montant === null) incomplet = true;
      else if (recurrente) recurrent += montant;
      else miseEnServiceTotal += montant;
      lignes.push({ libelle, quantite, prixUnitaire: prix, montant });
    };

    for (const s of sites) {
      const t = { ...(p.tarifs[monnaie] ?? {}), ...(s.surcharges ?? {}) };
      const poses = [...s.poses].sort();
      const actifs = poses.filter((d) => d < p.finMois);
      const duMois = actifs.filter((d) => d >= p.debutMois);
      pointsActifs += actifs.length;
      misesEnService += duMois.length;
      sondes += s.sondes;
      if (duMois.length) {
        const premierDuSite = poses[0] >= p.debutMois;
        if (premierDuSite && s.avecPasserelle) {
          ajouter(`${s.nom} : mise en service du premier point avec passerelle`, 1, val(t.mise_en_service_premier_point_passerelle), false);
          ajouter(`${s.nom} : mise en service, point`, duMois.length - 1, val(t.mise_en_service_point), false);
        } else {
          ajouter(`${s.nom} : mise en service, point`, duMois.length, val(t.mise_en_service_point), false);
        }
      }
      if (actifs.length) {
        ajouter(`${s.nom} : abonnement, premier point`, 1, val(t.abonnement_premier_point), true);
        ajouter(`${s.nom} : abonnement, point supplémentaire`, actifs.length - 1, val(t.abonnement_point_supplementaire), true);
      }
      ajouter(`${s.nom} : sonde de température`, s.sondes, val(t.sonde_temperature_mois), true);
    }

    const remise = arrondi((recurrent * (p.remiseFondateurPct || 0)) / 100);
    const brut = arrondi(miseEnServiceTotal + recurrent);
    const ht = arrondi(brut - remise);
    const retenue = arrondi((ht * (p.retenuePct || 0)) / 100);
    return {
      monnaie,
      pointsActifs,
      misesEnService,
      sondes,
      lignes,
      brut,
      remise,
      ht,
      retenuePct: p.retenuePct || 0,
      retenue,
      net: arrondi(ht - retenue),
      incomplet,
      sitesEnPilote: sites.filter((s) => s.pilote).map((s) => s.nom),
    };
  });
}

const csv = (v: string | number | null) => {
  const t = v === null ? "" : String(v);
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const nombreCsv = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));

export const ENTETE_CSV_USAGE = [
  "Organisation",
  "Mois",
  "Monnaie",
  "Points actifs",
  "Mises en service",
  "Sondes",
  "Brut HT",
  "Remise fondateur",
  "Total HT",
  "Retenue à la source (%)",
  "Retenue à la source",
  "Net à encaisser",
  "Tarif manquant",
  "Sites en pilote",
];

/** Export CSV (séparateur « ; », virgule décimale : ouvre dans Excel en français). */
export function lignesCsvUsage(organisation: string, mois: string, usages: UsageMonnaie[]): string[] {
  return usages.map((u) =>
    [
      csv(organisation),
      csv(mois),
      csv(u.monnaie),
      csv(u.pointsActifs),
      csv(u.misesEnService),
      csv(u.sondes),
      nombreCsv(u.brut),
      nombreCsv(u.remise),
      nombreCsv(u.ht),
      nombreCsv(u.retenuePct),
      nombreCsv(u.retenue),
      nombreCsv(u.net),
      u.incomplet ? "oui" : "non",
      csv(u.sitesEnPilote.join(", ")),
    ].join(";"),
  );
}
