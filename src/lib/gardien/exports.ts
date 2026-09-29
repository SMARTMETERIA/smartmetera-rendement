// Exports du « registre eau » d'un site (plan, phase G6) : registre des
// températures (fichier sanitaire), Clef Verte (litres par nuitée par mois)
// et fiche BREEAM Wat 03 (système en place et journal des alertes). Même
// vue que les rapports : page, PDF (et CSV pour la Clef Verte). Aucun seuil
// ni critère réglementaire inventé.
import type { VueRapport } from "@/lib/gardien-rapports/affichage";
import { MENTION_SURVEILLANCE } from "@/lib/gardien-rapports/contenus";
import { LIBELLES_FUITE } from "@/lib/gardien-envois/messages";
import { dateHeure, dateLongue, moisLong, nombre, volume } from "@/lib/gardien-envois/format";
import type { ReglagesDetection } from "@/lib/moteur-gardien/reglages";
import type { TypeFuite } from "@/lib/moteur-gardien/analyse";

export interface LigneRegistre {
  label: string;
  type: string;
  seuil_c: number | null;
  mois: string;
  premier_releve: string;
  premiere_valeur_c: number;
  min_c: number;
  max_c: number;
  nb_releves: number;
  nb_sous_seuil: number;
}

const TYPES_POINT: Record<string, string> = {
  sortie_production: "sortie de production",
  retour_boucle: "retour de boucle",
  point_eloigne: "point éloigné",
};

export function vueRegistreTemperatures(
  site: { nom: string; fuseau: string },
  periode: { debut: string; fin: string },
  lignes: LigneRegistre[],
): VueRapport {
  const parPoint = new Map<string, LigneRegistre[]>();
  for (const l of lignes) parPoint.set(l.label, [...(parPoint.get(l.label) ?? []), l]);
  const sousSeuil = lignes.reduce((s, l) => s + Number(l.nb_sous_seuil), 0);
  return {
    titre: "Registre des températures d'eau chaude",
    sousTitre: `${site.nom} — du ${dateLongue(periode.debut)} au ${dateLongue(periode.fin)}`,
    chiffre: { valeur: String(parPoint.size), libelle: parPoint.size === 1 ? "point suivi" : "points suivis" },
    phrase:
      lignes.length === 0
        ? "Aucun relevé de température sur la période."
        : `Relevé de référence mensuel de chaque point (le premier du mois), avec le minimum et le maximum du mois.${sousSeuil ? ` ${sousSeuil} relevé(s) sous le seuil réglé.` : ""}`,
    graphique: null,
    blocs: [...parPoint.entries()].map(([label, liste]) => ({
      titre: `${label} (${TYPES_POINT[liste[0].type] ?? liste[0].type}${liste[0].seuil_c !== null ? `, seuil ${nombre(Number(liste[0].seuil_c))} °C` : ""})`,
      lignes: liste.map((l) => [
        moisLong(l.mois),
        `${nombre(Number(l.premiere_valeur_c))} °C le ${dateHeure(Date.parse(l.premier_releve), site.fuseau)} ; min. ${nombre(Number(l.min_c))} °C ; max. ${nombre(Number(l.max_c))} °C ; ${l.nb_releves} relevés${l.seuil_c !== null ? `, ${l.nb_sous_seuil} sous le seuil` : ""}`,
      ]),
    })),
    notes: [
      "Relevés horodatés conservés sans suppression ; seuils réglés par point dans l'application.",
      MENTION_SURVEILLANCE,
    ],
  };
}

export interface MoisClefVerte {
  mois: string;
  volumeM3: number;
  nuitees: number | null;
  estimation: boolean;
  litresParNuitee: number | null;
}

export function vueClefVerte(site: { nom: string }, mois: MoisClefVerte[]): VueRapport {
  const connus = mois.filter((m) => m.litresParNuitee !== null);
  return {
    titre: "Clef Verte : litres par nuitée",
    sousTitre: site.nom,
    chiffre: connus.length
      ? {
          valeur: `${nombre(connus[connus.length - 1].litresParNuitee as number, 0)} L`,
          libelle: `par nuitée en ${moisLong(connus[connus.length - 1].mois)}`,
        }
      : null,
    phrase: connus.length
      ? "Consommation d'eau rapportée au nombre de nuitées, mois par mois."
      : "Saisissez les nuitées du mois (ou la capacité et le taux d'occupation du site) pour obtenir les litres par nuitée.",
    graphique: connus.length
      ? {
          titre: "Litres par nuitée",
          forme: "barres",
          unite: "L",
          points: mois.map((m) => ({ etiquette: moisLong(m.mois).split(" ")[0], valeur: m.litresParNuitee })),
        }
      : null,
    blocs: [
      {
        titre: "Détail par mois",
        lignes: mois.map((m) => [
          moisLong(m.mois),
          `${volume(m.volumeM3)} ; ${m.nuitees === null ? "nuitées non renseignées" : `${nombre(m.nuitees, 0)} nuitées${m.estimation ? " (estimation)" : ""}`} ; ${m.litresParNuitee === null ? "—" : `${nombre(m.litresParNuitee, 0)} L par nuitée`}`,
        ]),
      },
    ],
    notes: [
      "Aucun seuil n'est appliqué dans ce document : les critères du label sont à confirmer auprès de l'organisme.",
      MENTION_SURVEILLANCE,
    ],
  };
}

export function csvClefVerte(site: { nom: string }, mois: MoisClefVerte[]): string {
  const echapper = (t: string) => (/[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
  const n = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));
  return [
    "Site;Mois;Volume (m3);Nuitées;Estimation;Litres par nuitée",
    ...mois.map((m) =>
      [echapper(site.nom), m.mois, n(m.volumeM3), n(m.nuitees), m.estimation ? "oui" : "non", n(m.litresParNuitee)].join(";"),
    ),
  ].join("\n");
}

export interface AlerteBreeam {
  type: TypeFuite;
  zone: string | null;
  detecteeLe: string;
  statut: string;
  excesLph: number;
}

export function vueBreeam(
  site: { nom: string; fuseau: string },
  p: {
    points: { zone: string | null; transmission: string | null }[];
    reglages: ReglagesDetection;
    alertes: AlerteBreeam[];
    appelH: number;
    directeurH: number;
  },
): VueRapport {
  const r = p.reglages;
  const statuts: Record<string, string> = {
    ouverte: "en cours",
    prise_en_compte: "prise en charge",
    reparee: "réparée",
    fausse_alerte: "fausse alerte",
  };
  return {
    titre: "Fiche BREEAM Wat 03 : détection des fuites",
    sousTitre: site.nom,
    chiffre: { valeur: String(p.points.length), libelle: p.points.length === 1 ? "point de comptage surveillé" : "points de comptage surveillés" },
    phrase: "Système de détection des fuites en place sur l'alimentation en eau du site, et journal de ses alertes.",
    graphique: null,
    blocs: [
      {
        titre: "Système en place",
        lignes: p.points.map((pt, i) => [
          `Point ${i + 1}`,
          `${pt.zone ?? "Général"} — relevés ${pt.transmission === "lorawan" ? "par radio LoRaWAN" : pt.transmission === "cellulaire" ? "par réseau mobile" : "importés"}, au moins toutes les heures`,
        ]),
      },
      {
        titre: "Règles de détection",
        lignes: [
          ["Fuite de nuit", `débit minimum entre ${r.fuiteNuit.debutH} h et ${r.fuiteNuit.finH} h au-dessus de la ligne de base + ${r.fuiteNuit.margePct} % (au moins ${r.fuiteNuit.margeMinLph} L/h), ${r.fuiteNuit.nuits} nuits de suite`],
          ["Débit continu", `jamais sous ${r.debitContinu.minLph} L/h pendant ${r.debitContinu.heures} heures`],
          ["Rupture", `plus de ${r.rupture.facteurMax30j} fois le débit horaire maximum sur 30 jours et plus de ${r.rupture.minLph} L/h`],
          ["Site fermé", `plus de ${r.fermeture.minLph} L/h pendant ${r.fermeture.heures} heures`],
        ],
      },
      {
        titre: "Alertes",
        lignes: [
          ["Première alerte", "SMS et e-mail au technicien"],
          ["Sans prise en charge", `appel ou WhatsApp après ${p.appelH} h, directeur prévenu après ${p.directeurH} h`],
        ],
      },
      {
        titre: "Journal des alertes",
        ...(p.alertes.length
          ? {
              lignes: p.alertes.map((a) => [
                dateHeure(Date.parse(a.detecteeLe), site.fuseau),
                `${LIBELLES_FUITE[a.type]}${a.zone ? ` — ${a.zone}` : ""}, ${nombre(a.excesLph)} L/h, ${statuts[a.statut] ?? a.statut}`,
              ]) as [string, string][],
            }
          : { paragraphes: ["Aucune alerte de fuite sur la période."] }),
      },
    ],
    notes: [
      "Document d'information pour le dossier BREEAM : la conformité au critère est appréciée par l'évaluateur.",
      MENTION_SURVEILLANCE,
    ],
  };
}
