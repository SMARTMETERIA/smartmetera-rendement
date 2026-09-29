// Vue d'un rapport ou d'une page preuve : la même structure alimente la
// page web et le PDF (pur, testable). Un grand chiffre, une phrase, une
// courbe, puis le détail ; méthodes et mention de surveillance à la fin.
import { LIBELLES_FUITE } from "../gardien-envois/messages.ts";
import {
  dateHeure,
  dateLongue,
  moisLong,
  montant,
  montantRond,
  nombre,
  pourcentage,
  volume,
} from "../gardien-envois/format.ts";
import {
  TITRES_RAPPORT,
  resumeRapport,
  type ContenuFinPilote,
  type ContenuMensuel,
  type ContenuPagePreuve,
  type ContenuPremiereNuit,
  type ContenuPremiereSemaine,
  type FuiteRapport,
} from "./contenus.ts";
import { decalerJour } from "../moteur-gardien/temps.ts";
import type { Monnaie } from "../moteur-gardien/economies.ts";

export type ContenuRapport =
  | ContenuPremiereNuit
  | ContenuPremiereSemaine
  | ContenuMensuel
  | ContenuFinPilote;

export interface VueGraphique {
  titre: string;
  forme: "courbe" | "barres";
  unite: string;
  points: { etiquette: string; valeur: number | null }[];
}

export interface VueBloc {
  titre: string;
  lignes?: [string, string][];
  paragraphes?: string[];
}

export interface VueRapport {
  titre: string;
  sousTitre: string;
  chiffre: { valeur: string; libelle: string } | null;
  phrase: string;
  graphique: VueGraphique | null;
  blocs: VueBloc[];
  notes: string[];
}

const STATUTS: Record<string, string> = {
  ouverte: "en cours",
  prise_en_compte: "prise en charge",
  reparee: "réparée",
  fausse_alerte: "fausse alerte",
};

function jourCourt(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function blocFuites(fuites: FuiteRapport[], monnaie: Monnaie, fuseau: string, titre = "Fuites"): VueBloc | null {
  if (!fuites.length) return null;
  return {
    titre,
    lignes: fuites.map((f) => {
      const cout = f.perteMontant !== null ? montant(f.perteMontant, monnaie) : volume(f.perteM3);
      const economie =
        f.statut === "reparee" && f.economieMontant !== null
          ? `, ${montant(f.economieMontant, monnaie)} économisés`
          : "";
      return [
        `${LIBELLES_FUITE[f.type]}${f.zone ? ` — ${f.zone}` : ""}`,
        `${nombre(f.excesLph)} L/h, détectée le ${dateHeure(Date.parse(f.detecteeLe), fuseau)}, ${STATUTS[f.statut] ?? f.statut} ; pertes ${cout}${economie}`,
      ];
    }),
  };
}

function vuePremiereNuit(c: ContenuPremiereNuit): VueRapport {
  return {
    titre: TITRES_RAPPORT.premiere_nuit,
    sousTitre: `${c.site.nom} — nuit du ${dateLongue(decalerJour(c.nuit, -1))} au ${dateLongue(c.nuit)}`,
    chiffre:
      c.debitMinLph !== null
        ? { valeur: `${nombre(c.debitMinLph)} L/h`, libelle: "débit le plus bas de la nuit" }
        : null,
    phrase: c.phrase,
    graphique: {
      titre: "Débit heure par heure pendant la nuit",
      forme: "courbe",
      unite: "L/h",
      points: c.courbe.map((p) => ({ etiquette: p.heure.replace(":00", " h"), valeur: p.lph })),
    },
    blocs: [blocFuites(c.fuites, c.site.monnaie, c.site.fuseau)].filter((b): b is VueBloc => b !== null),
    notes: [c.mention],
  };
}

function vuePremiereSemaine(c: ContenuPremiereSemaine): VueRapport {
  return {
    titre: TITRES_RAPPORT.premiere_semaine,
    sousTitre: `${c.site.nom} — du ${dateLongue(c.debut)} au ${dateLongue(c.fin)}`,
    chiffre: { valeur: volume(c.volumeTotalM3), libelle: "consommés en 7 jours" },
    phrase: c.phrase,
    graphique: {
      titre: "Consommation par jour",
      forme: "barres",
      unite: "m³",
      points: c.jours.map((j) => ({ etiquette: jourCourt(j.date), valeur: j.volumeM3 })),
    },
    blocs: [
      {
        titre: "Débit le plus bas de chaque nuit",
        lignes: c.jours.map((j) => [
          dateLongue(j.date),
          j.nuitLph === null ? "pas assez de données" : `${nombre(j.nuitLph)} L/h`,
        ]),
      },
      ...[blocFuites(c.fuites, c.site.monnaie, c.site.fuseau)].filter((b): b is VueBloc => b !== null),
    ],
    notes: [c.mention],
  };
}

function vueMensuel(c: ContenuMensuel): VueRapport {
  const m = c.site.monnaie;
  const blocs: VueBloc[] = [];
  const consommation: [string, string][] = [["Ce mois", volume(c.volumeM3)]];
  if (c.volumeMoisPrecedentM3 !== null) {
    consommation.push([
      "Mois précédent",
      `${volume(c.volumeMoisPrecedentM3)}${c.variationMoisPct !== null ? ` (${pourcentage(c.variationMoisPct)} ce mois)` : ""}`,
    ]);
  }
  if (c.volumeAnDernierM3 !== null) {
    consommation.push([
      "Même mois l'an dernier",
      `${volume(c.volumeAnDernierM3)}${c.variationAnPct !== null ? ` (${pourcentage(c.variationAnPct)} cette année)` : ""}`,
    ]);
  }
  blocs.push({ titre: "Consommation", lignes: consommation });
  const fuites = blocFuites(c.fuites, m, c.site.fuseau, "Fuites du mois");
  blocs.push(fuites ?? { titre: "Fuites du mois", paragraphes: [c.phraseSansFuite ?? "Aucune fuite ce mois."] });
  if (c.activite) {
    blocs.push({
      titre: "Consommation par activité",
      lignes: [
        [
          `Litres par ${c.activite.libelleUnite}`,
          `${nombre(c.activite.litresParUnite, 0)} L${c.activite.estimation ? " (estimation à partir de la capacité et du taux d'occupation)" : ""}`,
        ],
      ],
    });
  }
  if (c.comparaison) {
    blocs.push({
      titre: "Comparaison",
      paragraphes: [
        `Médiane de ${c.comparaison.nbSites} sites comparables (même type, même pays, anonymes) : ${nombre(c.comparaison.medianeLitresParUnite, 0)} L par ${c.activite?.libelleUnite ?? "unité"}. Votre site : ${pourcentage(c.comparaison.ecartPct)}.`,
      ],
    });
  }
  if (c.temperatures.length) {
    blocs.push({
      titre: "Registre des températures d'eau chaude",
      lignes: c.temperatures.map((t) => [
        t.label,
        `premier relevé ${nombre(t.premiereValeurC)} °C le ${dateHeure(Date.parse(t.premierReleve), c.site.fuseau)} ; minimum ${nombre(t.minC)} °C ; maximum ${nombre(t.maxC)} °C ; ${t.nbReleves} relevés${t.seuilC !== null ? `, ${t.nbSousSeuil} sous ${nombre(t.seuilC)} °C` : ""}`,
      ]),
    });
  }
  if (c.clefVerte) {
    blocs.push({
      titre: "Section Clef Verte",
      lignes: [
        [
          "Litres par nuitée",
          `${nombre(c.clefVerte.litresParNuitee, 0)} L${c.clefVerte.estimation ? " (estimation)" : ""}`,
        ],
      ],
    });
  }
  blocs.push({ titre: "Conseil", paragraphes: [c.conseil] });
  return {
    titre: `Rapport de ${moisLong(c.mois)}`,
    sousTitre: c.site.nom,
    chiffre:
      c.economiesCumulees.montant !== null
        ? {
            valeur: montantRond(c.economiesCumulees.montant, m),
            libelle: "économisés depuis le début (méthode prudente)",
          }
        : { valeur: volume(c.volumeM3), libelle: "consommés ce mois" },
    phrase: resumeRapport(c),
    graphique: {
      titre: "Consommation par jour",
      forme: "barres",
      unite: "m³",
      points: c.jours.map((j) => ({ etiquette: String(Number(j.date.slice(8))), valeur: j.volumeM3 })),
    },
    blocs,
    notes: [c.methodeEconomies, c.mention],
  };
}

function vueFinPilote(c: ContenuFinPilote, urlPreuve: string | null): VueRapport {
  const m = c.site.monnaie;
  const blocs: VueBloc[] = [];
  const fuites = blocFuites(c.fuites, m, c.site.fuseau, "Anomalies trouvées");
  if (fuites) blocs.push(fuites);
  if (urlPreuve) {
    blocs.push({
      titre: "À transférer à votre direction",
      paragraphes: [`Page de synthèse, une minute de lecture : ${urlPreuve}`],
    });
  }
  return {
    titre: c.titre,
    sousTitre: `${c.site.nom} — du ${dateLongue(c.debut)} au ${dateLongue(c.fin)}`,
    chiffre:
      c.economies.montant !== null
        ? { valeur: montantRond(c.economies.montant, m), libelle: "économisés (méthode prudente)" }
        : { valeur: String(c.anomalies), libelle: c.anomalies === 1 ? "anomalie trouvée" : "anomalies trouvées" },
    phrase: c.phrase,
    graphique: null,
    blocs,
    notes: [c.methodeEconomies, c.mention],
  };
}

export function vueRapport(c: ContenuRapport, urlPreuve: string | null = null): VueRapport {
  switch (c.type) {
    case "premiere_nuit":
      return vuePremiereNuit(c);
    case "premiere_semaine":
      return vuePremiereSemaine(c);
    case "mensuel":
      return vueMensuel(c);
    case "fin_pilote":
      return vueFinPilote(c, urlPreuve);
  }
}

export function vuePreuve(c: ContenuPagePreuve): VueRapport {
  const m = c.site.monnaie;
  const blocs: VueBloc[] = [];
  if (c.fuites.length) {
    blocs.push({
      titre: "Fuites trouvées",
      lignes: c.fuites.map((f) => [
        `${LIBELLES_FUITE[f.type]}${f.zone ? ` — ${f.zone}` : ""}`,
        `${nombre(f.excesLph)} L/h, ${STATUTS[f.statut] ?? f.statut}${f.economieMontant !== null ? `, ${montant(f.economieMontant, m)} économisés` : ""}`,
      ]),
    });
  }
  if (c.coutService) {
    const lignes: [string, string][] = [
      ["Par jour", montant(c.coutService.parJour, m)],
      ["Par mois (hors taxes)", montant(c.coutService.mensuel, m)],
    ];
    if (c.coutService.parNuitee !== null) lignes.push(["Par nuitée", montant(c.coutService.parNuitee, m)]);
    blocs.push({ titre: "Coût du service", lignes });
  }
  if (c.retour.jours !== null) {
    blocs.push({
      titre: "Retour sur investissement",
      lignes: [
        ["Remboursé en", `${nombre(c.retour.jours, 0)} jours d'économies`],
        ["Coût engagé", montant(c.retour.coutEngage as number, m)],
      ],
    });
  }
  return {
    titre: "Ce que la surveillance a trouvé",
    sousTitre: `${c.site.nom}${c.site.ville ? `, ${c.site.ville}` : ""} — du ${dateLongue(c.periode.debut)} au ${dateLongue(c.periode.fin)}`,
    chiffre:
      c.economies.montant !== null
        ? { valeur: montantRond(c.economies.montant, m), libelle: `évités en ${c.joursSurveillance} jours (méthode prudente)` }
        : { valeur: String(c.fuitesTrouvees), libelle: c.fuitesTrouvees === 1 ? "fuite trouvée" : "fuites trouvées" },
    phrase: c.phrase,
    graphique: c.courbe.length
      ? {
          titre: "Consommation par jour",
          forme: "barres",
          unite: "m³",
          points: c.courbe.map((j) => ({ etiquette: String(Number(j.date.slice(8))), valeur: j.volumeM3 })),
        }
      : null,
    blocs,
    notes: [c.methodeEconomies, ...(c.retour.jours !== null ? [c.methodeRetour] : []), c.mention],
  };
}
