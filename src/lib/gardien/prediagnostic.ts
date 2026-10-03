// Pré-diagnostic (superadmin et partenaire) : ce que coûte une chasse d'eau
// qui fuit et une fuite enterrée au prix de l'eau du client, et ce que coûte
// le service, par jour et par nuitée. Débits de référence : valeurs du plan,
// modifiables dans platform_settings.prediagnostic.
import { coutFuite, type Monnaie } from "@/lib/moteur-gardien/economies";
import { coutService, monnaieFacturation, type CoutService, type Tarifs } from "@/lib/gardien-rapports/contenus";
import { montant, montantRond, nombre } from "@/lib/gardien-envois/format";
import { paysDe, type Pays } from "@/lib/auth/validation";
import { REGLAGES_PAYS } from "./pays";
import type { VueRapport } from "@/lib/gardien-rapports/affichage";

export const DEBITS_REFERENCE = { chasseLph: 25, fuiteEnterreeLph: 500 };

/** Garde-fou contre une faute de frappe (le franc congolais compte en milliers). */
const PRIX_M3_MAX: Record<Monnaie, number> = { EUR: 100, MAD: 100, USD: 100, CDF: 100_000 };

export interface EntreePrediagnostic {
  etablissement: string;
  pays: Pays;
  /** Monnaie de l'établissement, parmi celles de son pays (RDC : USD ou CDF). */
  monnaie: Monnaie;
  prixM3: number;
  factureAnnuelle: number | null;
  capacite: number | null;
  tauxOccupation: number | null;
  nbPoints: number;
}

export interface ResultatPrediagnostic {
  monnaie: Monnaie;
  /** Monnaie du coût du service (dollars pour un établissement en francs congolais). */
  monnaieService: Monnaie;
  chasse: { lph: number; m3ParJour: number; parJour: number; parAn: number };
  enterree: { lph: number; m3ParJour: number; parJour: number; parAn: number };
  service: CoutService | null;
  nuiteesParMois: number | null;
  partFacturePct: number | null;
  phrase: string;
}

export function validerPrediagnostic(e: Partial<Record<keyof EntreePrediagnostic, unknown>>):
  | { ok: true; entree: EntreePrediagnostic }
  | { ok: false; erreur: string } {
  const nombreOuNull = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(",", ".").replace(/\s/g, ""));
    return Number.isFinite(n) ? n : NaN;
  };
  const prix = nombreOuNull(e.prixM3);
  const facture = nombreOuNull(e.factureAnnuelle);
  const capacite = nombreOuNull(e.capacite);
  const taux = nombreOuNull(e.tauxOccupation);
  const points = nombreOuNull(e.nbPoints);
  const etablissement = String(e.etablissement ?? "").trim();
  const pays = paysDe(e.pays);
  const monnaie: Monnaie = (REGLAGES_PAYS[pays].monnaies as readonly unknown[]).includes(e.monnaie)
    ? (e.monnaie as Monnaie)
    : REGLAGES_PAYS[pays].monnaie;
  if (!etablissement) return { ok: false, erreur: "Indiquez le nom de l'établissement." };
  if (prix === null || Number.isNaN(prix) || prix <= 0 || prix > PRIX_M3_MAX[monnaie]) {
    return { ok: false, erreur: "Indiquez le prix de l'eau au m³ (par exemple 4,89)." };
  }
  if ([facture, capacite, taux, points].some((v) => Number.isNaN(v))) {
    return { ok: false, erreur: "Vérifiez les nombres saisis." };
  }
  if (taux !== null && (taux < 0 || taux > 100)) {
    return { ok: false, erreur: "Le taux d'occupation est un pourcentage entre 0 et 100." };
  }
  return {
    ok: true,
    entree: {
      etablissement: etablissement.slice(0, 120),
      pays,
      monnaie,
      prixM3: prix,
      factureAnnuelle: facture,
      capacite: capacite === null ? null : Math.round(capacite),
      tauxOccupation: taux === null ? null : taux / 100,
      nbPoints: Math.max(1, Math.round(points ?? 1)),
    },
  };
}

/** Tarifs à appliquer : ceux de la monnaie de facturation de l'établissement. */
export function tarifsPrediagnostic(tarifs: Record<string, Tarifs>, monnaie: Monnaie): Tarifs | null {
  return tarifs[monnaieFacturation(monnaie)] ?? null;
}

export function prediagnostic(
  e: EntreePrediagnostic,
  tarifs: Tarifs | null,
  debits = DEBITS_REFERENCE,
): ResultatPrediagnostic {
  const monnaie: Monnaie = e.monnaie;
  const monnaieService = monnaieFacturation(monnaie);
  const cas = (lph: number) => {
    const c = coutFuite({ excesLph: lph, prixM3: e.prixM3, depuisMs: 0, maintenantMs: 0 });
    return { lph, m3ParJour: c.m3ParJour, parJour: c.coutParJour as number, parAn: c.coutAnnuel as number };
  };
  const chasse = cas(debits.chasseLph);
  const enterree = cas(debits.fuiteEnterreeLph);
  const nuiteesParMois =
    e.capacite && e.tauxOccupation ? Math.round(e.capacite * e.tauxOccupation * 30) : null;
  const service = coutService({
    tarifs,
    nbPoints: e.nbPoints,
    nbSondes: 0,
    avecPasserelle: false,
    remiseFondateurPct: 0,
    nuiteesMois: nuiteesParMois,
    monnaie: monnaieService,
  });
  const partFacturePct =
    e.factureAnnuelle && e.factureAnnuelle > 0 ? Math.round((chasse.parAn / e.factureAnnuelle) * 100) : null;
  const serviceTexte = service
    ? ` La surveillance coûte ${montant(service.parJour, monnaieService)} par jour${service.parNuitee !== null ? `, soit ${montant(service.parNuitee, monnaieService)} par nuitée` : ""}.`
    : "";
  const phrase = `Une seule chasse d'eau qui fuit coûte ${montantRond(chasse.parAn, monnaie)} par an à ${e.etablissement}${partFacturePct !== null ? ` (${nombre(partFacturePct, 0)} % de la facture d'eau)` : ""} ; une fuite enterrée, ${montantRond(enterree.parAn, monnaie)} par an.${serviceTexte}`;
  return { monnaie, monnaieService, chasse, enterree, service, nuiteesParMois, partFacturePct, phrase };
}

/** Vue du pré-diagnostic (page et PDF à la marque). */
export function vuePrediagnostic(e: EntreePrediagnostic, r: ResultatPrediagnostic): VueRapport {
  const m = r.monnaie;
  const blocs: VueRapport["blocs"] = [
    {
      titre: "Une chasse d'eau qui fuit",
      lignes: [
        ["Débit de référence", `${nombre(r.chasse.lph)} L/h`],
        ["Par jour", `${montant(r.chasse.parJour, m)} (${nombre(r.chasse.m3ParJour, 2)} m³)`],
        ["Par an", montant(r.chasse.parAn, m)],
      ],
    },
    {
      titre: "Une fuite enterrée",
      lignes: [
        ["Débit de référence", `${nombre(r.enterree.lph)} L/h`],
        ["Par jour", `${montant(r.enterree.parJour, m)} (${nombre(r.enterree.m3ParJour, 2)} m³)`],
        ["Par an", montant(r.enterree.parAn, m)],
      ],
    },
  ];
  if (r.service) {
    const ms = r.monnaieService;
    const lignes: [string, string][] = [
      ["Points de comptage", String(e.nbPoints)],
      ["Par mois (hors taxes)", montant(r.service.mensuel, ms)],
      ["Par jour", montant(r.service.parJour, ms)],
    ];
    if (r.service.parNuitee !== null) lignes.push(["Par nuitée", montant(r.service.parNuitee, ms)]);
    if (r.service.miseEnService !== null) lignes.push(["Mise en service (une fois)", montant(r.service.miseEnService, ms)]);
    blocs.push({ titre: "Le service de surveillance", lignes });
  }
  return {
    titre: "Pré-diagnostic eau",
    sousTitre: `${e.etablissement} — eau à ${montant(e.prixM3, m)} le m³`,
    chiffre: { valeur: montantRond(r.chasse.parAn, m), libelle: "par an pour une seule chasse d'eau qui fuit" },
    phrase: r.phrase,
    graphique: null,
    blocs,
    notes: [
      `Débits de référence : ${nombre(r.chasse.lph)} L/h pour une chasse d'eau qui fuit, ${nombre(r.enterree.lph)} L/h pour une fuite enterrée. Coût = débit × 24 h × prix du m³.`,
      "Aucune garantie de détection : surveillance fondée sur les données transmises par les capteurs.",
    ],
  };
}
