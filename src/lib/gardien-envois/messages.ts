// Messages du Gardien (e-mail, SMS, texte lu par l'appel vocal ou envoyé
// par WhatsApp), à la marque du partenaire. Phrases courtes, montants
// avec leur méthode prudente, mention de surveillance systématique.
import type { Marque } from "../marque";
import { coutFuite, methodePertes, type Monnaie } from "../moteur-gardien/economies";
import type { TypeFuite } from "../moteur-gardien/analyse";
import { dureeLisible, instantLisible } from "../moteur-gardien/autonomie";
import {
  MENTION_SURVEILLANCE,
  TITRES_RAPPORT,
  type TypeRapport,
} from "../gardien-rapports/contenus";
import { emailHtml, emailTexte, type Bloc } from "./gabarit";
import { dateHeure, dateLongue, heure, montant, moisLong, nombre, volume } from "./format";
import type { EtapeFuite } from "./destinataires";

export interface Rendu {
  sujet: string;
  html: string;
  texte: string;
  /** SMS (et message WhatsApp). */
  court: string;
  /** Texte lu par l'appel vocal. */
  vocal: string;
}

export interface Contexte {
  marque: Marque;
  /** Adresse de l'application, sans « / » final. */
  urlApp: string;
}

export const LIBELLES_FUITE: Record<TypeFuite, string> = {
  fuite_nuit: "Fuite de nuit",
  debit_continu: "Débit continu",
  rupture: "Rupture",
  fuite_fermeture: "Consommation pendant la fermeture",
};

function rendu(ctx: Contexte, titre: string, blocs: Bloc[], court: string, vocal = court): Rendu {
  const complets: Bloc[] = [...blocs, { type: "note", texte: MENTION_SURVEILLANCE }];
  return {
    sujet: titre,
    html: emailHtml(ctx.marque, titre, complets),
    texte: emailTexte(ctx.marque, titre, complets),
    court: `${ctx.marque.nom} : ${court}`,
    vocal: `Bonjour, ici ${ctx.marque.nom}. ${vocal}`,
  };
}

export interface FuiteMessage {
  id: string;
  type: TypeFuite;
  site: string;
  zone: string | null;
  fuseau: string;
  detecteeMs: number;
  debutMs: number | null;
  excesLph: number;
  prixM3: number | null;
  monnaie: Monnaie;
  explication: string | null;
}

export function messageFuite(
  ctx: Contexte,
  f: FuiteMessage,
  etape: EtapeFuite,
  maintenantMs: number,
): Rendu {
  const lieu = `${f.site}${f.zone ? `, ${f.zone}` : ""}`;
  const cout = coutFuite({
    excesLph: f.excesLph,
    prixM3: f.prixM3,
    depuisMs: f.detecteeMs,
    maintenantMs,
  });
  const lien = `${ctx.urlApp}/fuites/${f.id}`;
  const parJour = cout.coutParJour !== null ? montant(cout.coutParJour, f.monnaie) : volume(cout.m3ParJour);
  const parMois =
    cout.coutMensuelProjete !== null ? montant(cout.coutMensuelProjete, f.monnaie) : volume(cout.m3ParJour * 30);
  const debut = heure(f.debutMs ?? f.detecteeMs, f.fuseau);
  const titre =
    etape === "directeur"
      ? `Fuite sans prise en charge depuis ${nombre((maintenantMs - f.detecteeMs) / 3_600_000, 0)} h : ${lieu}`
      : `${LIBELLES_FUITE[f.type]} détectée : ${lieu}`;
  const blocs: Bloc[] = [
    {
      type: "paragraphe",
      texte:
        etape === "directeur"
          ? `Personne n'a encore indiqué s'occuper de cette fuite. Merci de désigner quelqu'un.`
          : `Une consommation anormale a été détectée. Merci d'aller vérifier sur place.`,
    },
    {
      type: "liste",
      lignes: [
        ["Site", lieu],
        ["Début estimé", dateHeure(f.debutMs ?? f.detecteeMs, f.fuseau)],
        ["Débit en trop", `${nombre(f.excesLph)} L/h`],
        [
          "Coût depuis la détection",
          cout.coutCumule !== null ? montant(cout.coutCumule, f.monnaie) : volume(cout.m3Cumules),
        ],
        ["Si rien n'est fait", `${parMois} par mois (${parJour} par jour)`],
      ],
    },
    ...(f.explication ? [{ type: "paragraphe", texte: f.explication } as Bloc] : []),
    { type: "bouton", libelle: "Je m'en occupe", lien },
    { type: "note", texte: methodePertes(f.excesLph, f.prixM3, f.monnaie) },
  ];
  const court =
    etape === "directeur"
      ? `fuite à ${lieu} sans prise en charge. ${parJour} par jour. Voir : ${lien}`
      : `${LIBELLES_FUITE[f.type].toLowerCase()} à ${lieu}, ${nombre(f.excesLph)} L/h depuis ${debut}. ${parJour} par jour, ${parMois} par mois si rien n'est fait. Je m'en occupe : ${lien}`;
  const vocal = `Une fuite est détectée à ${lieu} depuis ${debut}. Elle coûte environ ${parJour} par jour. Personne ne l'a encore prise en charge. Ouvrez le lien reçu par SMS pour indiquer que vous vous en occupez.`;
  return rendu(ctx, titre, blocs, court, vocal);
}

export function messageCapteurMuet(
  ctx: Contexte,
  a: { titre: string; description: string; site: string; organisation: string },
): Rendu {
  const titre = `${a.titre} — ${a.site}`;
  return rendu(
    ctx,
    titre,
    [
      { type: "paragraphe", texte: `${a.description} Ce n'est pas une fuite : le capteur n'envoie plus de données.` },
      { type: "liste", lignes: [["Client", a.organisation], ["Site", a.site]] },
      {
        type: "paragraphe",
        texte: "À vérifier : la pile, la couverture radio, ou l'alimentation de la passerelle.",
      },
      { type: "bouton", libelle: "Voir les appareils", lien: `${ctx.urlApp}/sites/appareils` },
    ],
    `${a.titre.toLowerCase()} (${a.site}). ${a.description}`,
  );
}

export function messageTemperature(
  ctx: Contexte,
  a: { titre: string; description: string; site: string },
): Rendu {
  return rendu(
    ctx,
    `${a.titre} — ${a.site}`,
    [
      { type: "paragraphe", texte: a.description },
      { type: "paragraphe", texte: "Faites vérifier la production et la boucle d'eau chaude." },
      { type: "bouton", libelle: "Ouvrir mes sites", lien: `${ctx.urlApp}/sites` },
    ],
    `${a.titre.toLowerCase()} (${a.site}) : ${a.description}`,
  );
}

/** Coupure du réseau public ou niveau bas des réserves (phase G11). */
export function messageAutonomie(
  ctx: Contexte,
  a: {
    type: "coupure_reseau" | "reserve_basse";
    titre: string;
    description: string;
    site: string;
    autonomieH: number | null;
    niveauBasMs: number | null;
    fuseau: string;
    maintenantMs: number;
  },
): Rendu {
  const lien = `${ctx.urlApp}/sites/reserves`;
  const autonomie = a.autonomieH !== null ? `Autonomie estimée : ${dureeLisible(a.autonomieH)}.` : "";
  const niveauBas = a.niveauBasMs !== null ? ` Niveau bas prévu ${instantLisible(a.niveauBasMs, a.fuseau, a.maintenantMs)}.` : "";
  const court =
    a.type === "coupure_reseau"
      ? `coupure du réseau public à ${a.site}. ${autonomie}${niveauBas} Voir : ${lien}`
      : `${a.titre.toLowerCase()} à ${a.site}. ${autonomie}${niveauBas} Voir : ${lien}`;
  const vocal =
    a.type === "coupure_reseau"
      ? `L'eau du réseau public n'arrive plus à ${a.site}. ${autonomie}${niveauBas}`
      : `${a.titre} à ${a.site}. ${autonomie}${niveauBas}`;
  return rendu(
    ctx,
    `${a.titre} — ${a.site}`,
    [
      { type: "paragraphe", texte: a.description },
      {
        type: "paragraphe",
        texte:
          "Pendant une coupure : réduisez les usages non essentiels (arrosage, lavage, piscine) et, si besoin, prévoyez un camion-citerne.",
      },
      { type: "bouton", libelle: "Voir les réserves d'eau", lien },
    ],
    court.replace(/\s+/g, " ").trim(),
    vocal.replace(/\s+/g, " ").trim(),
  );
}

/** Retour de l'eau du réseau public après une coupure. */
export function messageRetourReseau(
  ctx: Contexte,
  a: { site: string; debutMs: number; finMs: number; autonomieMinH: number | null; fuseau: string },
): Rendu {
  const duree = dureeLisible((a.finMs - a.debutMs) / 3_600_000);
  const minimum = a.autonomieMinH !== null ? ` Autonomie la plus basse pendant la coupure : ${dureeLisible(a.autonomieMinH)}.` : "";
  return rendu(
    ctx,
    `L'eau du réseau public est revenue — ${a.site}`,
    [
      {
        type: "paragraphe",
        texte: `L'eau arrive de nouveau depuis le ${dateHeure(a.finMs, a.fuseau)}, après ${duree} de coupure.${minimum}`,
      },
      { type: "paragraphe", texte: "Les réserves se remplissent : vérifiez que le niveau remonte." },
      { type: "bouton", libelle: "Voir les réserves d'eau", lien: `${ctx.urlApp}/sites/reserves` },
    ],
    `l'eau du réseau public est revenue à ${a.site} après ${duree} de coupure.`,
  );
}

export function messageRappelAnalyses(
  ctx: Contexte,
  a: { titre: string; description: string; site: string },
): Rendu {
  return rendu(
    ctx,
    `${a.titre} — ${a.site}`,
    [{ type: "paragraphe", texte: a.description }],
    `${a.site} : ${a.description}`,
  );
}

export function messagePremiereDonnee(
  ctx: Contexte,
  a: { site: string; point: string; recuMs: number; fuseau: string },
): Rendu {
  return rendu(
    ctx,
    `Première donnée reçue : ${a.point} — ${a.site}`,
    [
      {
        type: "paragraphe",
        texte: `Le capteur « ${a.point} » transmet bien : première donnée reçue le ${dateHeure(a.recuMs, a.fuseau)}. La pose est terminée.`,
      },
    ],
    `première donnée reçue pour ${a.point} (${a.site}). La pose est terminée.`,
  );
}

export function messageRapport(
  ctx: Contexte,
  a: { rapportId: string; type: TypeRapport; site: string; periode: string; resume: string },
): Rendu {
  const titre =
    a.type === "mensuel"
      ? `Rapport de ${moisLong(a.periode)} — ${a.site}`
      : `${TITRES_RAPPORT[a.type]} — ${a.site}`;
  const lien = `${ctx.urlApp}/rapports/${a.rapportId}`;
  return rendu(
    ctx,
    titre,
    [
      { type: "paragraphe", texte: a.resume },
      { type: "bouton", libelle: "Lire le rapport", lien },
      { type: "paragraphe", texte: `Version à imprimer : ${lien}/pdf` },
    ],
    `${titre}. ${a.resume} ${lien}`,
  );
}

export function messageFinPilote(
  ctx: Contexte,
  a: { rapportId: string; site: string; titre: string; phrase: string; lienPreuve: string | null },
): Rendu {
  const blocs: Bloc[] = [
    { type: "paragraphe", texte: a.phrase },
    { type: "bouton", libelle: "Lire le résumé", lien: `${ctx.urlApp}/rapports/${a.rapportId}` },
  ];
  if (a.lienPreuve) {
    blocs.push({
      type: "paragraphe",
      texte: `Page à transférer à votre direction (une minute de lecture) : ${a.lienPreuve}`,
    });
  }
  return rendu(ctx, `${a.titre} — ${a.site}`, blocs, `${a.titre} (${a.site}). ${a.phrase}`);
}

export function messageConversion(
  ctx: Contexte,
  a: { site: string; consentementLe: string; consentementPar: string; fuseau: string },
): Rendu {
  return rendu(
    ctx,
    `La surveillance continue — ${a.site}`,
    [
      {
        type: "paragraphe",
        texte: `Le pilote est terminé. Comme accepté par écrit le ${dateHeure(Date.parse(a.consentementLe), a.fuseau)} par ${a.consentementPar}, la surveillance continue avec l'abonnement.`,
      },
      { type: "paragraphe", texte: "Vous n'avez rien à faire : les alertes et les rapports continuent." },
    ],
    `le pilote de ${a.site} est terminé, la surveillance continue avec l'abonnement.`,
  );
}

export function messageGroupe(
  ctx: Contexte,
  a: {
    organisation: string;
    mois: string;
    sites: { nom: string; volumeM3: number; fuites: number; economies: string | null; rapportId: string }[];
  },
): Rendu {
  const lignes: [string, string][] = a.sites.map((s) => [
    s.nom,
    `${volume(s.volumeM3)} · ${s.fuites === 0 ? "aucune fuite" : s.fuites === 1 ? "1 fuite" : `${s.fuites} fuites`}${s.economies ? ` · ${s.economies} économisés` : ""}`,
  ]);
  const titre = `Synthèse du groupe — ${moisLong(a.mois)}`;
  return rendu(
    ctx,
    titre,
    [
      { type: "paragraphe", texte: `${a.organisation} : les ${a.sites.length} sites en un coup d'œil.` },
      { type: "liste", lignes },
      { type: "bouton", libelle: "Ouvrir mes sites", lien: `${ctx.urlApp}/sites` },
    ],
    `${titre} : ${a.sites.length} sites.`,
  );
}

export function libellePeriode(type: TypeRapport, periode: string): string {
  return type === "mensuel" ? moisLong(periode) : dateLongue(periode);
}
