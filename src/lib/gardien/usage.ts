// Usage mensuel d'une organisation Gardien, par monnaie de facturation
// (facturation manuelle, pas de paiement en ligne) : mises en service du
// mois, abonnements, sondes, capteurs de niveau, abonnement offert pendant
// un pilote, remise fondateur, retenue à la source. Tarifs de
// platform_settings.tarifs, surchargés par site (price_overrides). Un tarif
// absent n'est jamais inventé : la ligne reste « à paramétrer ».
// Décisions de Rayan (3 octobre 2026) : un site en francs congolais est
// facturé en dollars (D6) ; pendant un pilote, la mise en service est
// facturée et l'abonnement offert (D9).
import { monnaieFacturation, type Tarifs } from "@/lib/gardien-rapports/contenus";
import type { Monnaie } from "@/lib/moteur-gardien/economies";

export type MonnaieUsage = Monnaie;

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
  /** Dates de mise en service des capteurs de niveau actifs (ISO). */
  niveaux?: string[];
  pilote: boolean;
  /**
   * Périodes de pilote du site (ISO) : l'abonnement y est offert. fin null :
   * pilote pas encore converti (rien n'est facturé sans accord écrit).
   */
  periodesPilote?: { debut: string; fin: string | null }[];
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
  capteursNiveau: number;
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
  /**
   * Marque blanche : prix par point facturé au partenaire (en euros, de 6 à
   * 9 € selon le partenaire). Remplace les abonnements ; au Maroc, à
   * paramétrer (ligne « à paramétrer »).
   */
  prixPartenaireParPoint?: number | null;
  /** platform_settings.pilotes.abonnement_offert (défaut : oui). */
  abonnementOffertPilote?: boolean;
}): UsageMonnaie[] {
  const parMonnaie = new Map<MonnaieUsage, SiteUsage[]>();
  for (const s of p.sites) {
    const m = monnaieFacturation(s.monnaie);
    parMonnaie.set(m, [...(parMonnaie.get(m) ?? []), s]);
  }

  return [...parMonnaie.entries()].map(([monnaie, sites]) => {
    const lignes: LigneUsage[] = [];
    let incomplet = false;
    let miseEnServiceTotal = 0;
    let recurrent = 0;
    let pointsActifs = 0;
    let misesEnService = 0;
    let sondes = 0;
    let capteursNiveau = 0;
    let recurrentSite = 0;
    const ajouter = (libelle: string, quantite: number, prix: number | null, recurrente: boolean) => {
      if (quantite <= 0) return;
      const montant = prix === null ? null : arrondi(quantite * prix);
      if (montant === null) incomplet = true;
      else if (recurrente) recurrentSite += montant;
      else miseEnServiceTotal += montant;
      lignes.push({ libelle, quantite, prixUnitaire: prix, montant });
    };

    for (const s of sites) {
      recurrentSite = 0;
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
      if (actifs.length && p.prixPartenaireParPoint != null) {
        ajouter(
          `${s.nom} : prix partenaire, point`,
          actifs.length,
          monnaie === "EUR" ? val(p.prixPartenaireParPoint) : null,
          true,
        );
      } else if (actifs.length) {
        ajouter(`${s.nom} : abonnement, premier point`, 1, val(t.abonnement_premier_point), true);
        ajouter(`${s.nom} : abonnement, point supplémentaire`, actifs.length - 1, val(t.abonnement_point_supplementaire), true);
      }
      ajouter(`${s.nom} : sonde de température`, s.sondes, val(t.sonde_temperature_mois), true);

      const niveaux = [...(s.niveaux ?? [])].filter((d) => d < p.finMois);
      capteursNiveau += niveaux.length;
      ajouter(
        `${s.nom} : mise en service, capteur de niveau`,
        niveaux.filter((d) => d >= p.debutMois).length,
        val(t.capteur_niveau_mise_en_service),
        false,
      );
      ajouter(`${s.nom} : capteur de niveau`, niveaux.length, val(t.capteur_niveau_mois), true);

      // Pilote : abonnement offert au prorata des jours facturables du mois
      // (depuis la première pose du site) couverts par le pilote.
      const part =
        p.abonnementOffertPilote === false
          ? null
          : partOfferte(p.debutMois, p.finMois, [...poses, ...niveaux].sort()[0] ?? null, s.periodesPilote ?? []);
      if (part && recurrentSite > 0) {
        const offert = -arrondi((recurrentSite * part.jours) / part.sur);
        lignes.push({
          libelle: `${s.nom} : abonnement offert pendant le pilote${part.jours < part.sur ? ` (${part.jours} jours sur ${part.sur})` : ""}`,
          quantite: 1,
          prixUnitaire: offert,
          montant: offert,
        });
        recurrentSite += offert;
      }
      recurrent += recurrentSite;
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
      capteursNiveau,
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

const JOUR_MS = 86_400_000;

/**
 * Part de l'abonnement du mois offerte par un pilote : jours entiers
 * couverts par une période de pilote, sur les jours facturables (du début
 * du mois, ou de la première pose du site, à la fin du mois). null : rien
 * d'offert.
 */
export function partOfferte(
  debutMois: string,
  finMois: string,
  premierePose: string | null,
  periodes: { debut: string; fin: string | null }[],
): { jours: number; sur: number } | null {
  const debut = Math.max(Date.parse(`${debutMois}T00:00:00Z`), premierePose ? Date.parse(premierePose) : -Infinity);
  const fin = Date.parse(`${finMois}T00:00:00Z`);
  const sur = Math.round((fin - debut) / JOUR_MS);
  if (sur <= 0) return null;
  const jours = Math.min(sur, joursCouverts(debut, fin, periodes));
  return jours > 0 ? { jours, sur } : null;
}

/** Jours entiers entre d0 et d1 (millisecondes) couverts par au moins une période. */
export function joursCouverts(
  d0: number,
  d1: number,
  periodes: { debut: string; fin: string | null }[],
): number {
  const morceaux = periodes
    .map((pp) => [Math.max(d0, Date.parse(pp.debut)), Math.min(d1, pp.fin ? Date.parse(pp.fin) : d1)] as const)
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let fin = -Infinity;
  for (const [a, b] of morceaux) {
    const debut = Math.max(a, fin);
    if (b > debut) total += b - debut;
    fin = Math.max(fin, b);
  }
  return Math.round(total / JOUR_MS);
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
  "Capteurs de niveau",
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
      csv(u.capteursNiveau),
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
