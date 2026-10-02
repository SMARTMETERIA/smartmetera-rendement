// Pages légales en modèles « à faire valider » (plan, phase G10).
// TODO(RAYAN) : chaque texte doit être relu et validé par un juriste avant
// la mise en ligne, et l'entité juridique renseignée (docs/BLOCKERS.md).
// Aucun texte n'est présenté comme définitif : le bandeau « Modèle à faire
// valider » reste affiché tant que STATUT_DOCUMENTS vaut « modele ».
// Les passages entre crochets « [à compléter : …] » sont surlignés à
// l'écran et doivent tous disparaître avant validation.

import { NOM_PLATEFORME } from "@/lib/marque";

export const STATUT_DOCUMENTS: "modele" | "valide" = "modele";
export const VERSION_DOCUMENTS = "Modèle du 1er octobre 2026";

/** TODO(RAYAN) : informations de l'entité qui exploite le service. */
export const INFORMATIONS_LEGALES = {
  raisonSociale: null as string | null,
  formeEtCapital: null as string | null,
  siege: null as string | null,
  immatriculation: null as string | null,
  tva: null as string | null,
  directeurPublication: null as string | null,
  contact: null as string | null,
  contactDonnees: null as string | null,
};

const a = (v: string | null, quoi: string) => v ?? `[à compléter : ${quoi}]`;
const entite = () => a(INFORMATIONS_LEGALES.raisonSociale, "raison sociale de l'exploitant");
const contactDonnees = () =>
  a(INFORMATIONS_LEGALES.contactDonnees ?? INFORMATIONS_LEGALES.contact, "adresse de contact pour les données personnelles");

export const MENTION_SURVEILLANCE = "Surveillance fondée sur les données transmises par les capteurs.";

/** Sous-traitants techniques (noms des services réellement utilisés). */
export const SOUS_TRAITANTS: { nom: string; role: string; lieu: string }[] = [
  {
    nom: "Supabase",
    role: "base de données, comptes et connexion, stockage des fichiers (logos, photos de compteurs), fonctions planifiées",
    lieu: "région Paris (Union européenne)",
  },
  { nom: "Vercel", role: "hébergement de l'application web", lieu: "région Paris (cdg1)" },
  { nom: "Resend", role: "envoi des e-mails (connexion, alertes, rapports)", lieu: "[à compléter : région d'envoi]" },
  {
    nom: "Twilio",
    role: "SMS, appels vocaux et messages WhatsApp d'alerte (une fois activés)",
    lieu: "[à compléter : région choisie]",
  },
  {
    nom: "Sentry",
    role: "suivi des erreurs techniques, sans données personnelles (adresses, téléphones et jetons masqués avant l'envoi)",
    lieu: "[à compléter : région du projet]",
  },
  { nom: "Cloudflare Turnstile", role: "case anti-robot de l'inscription", lieu: "[à compléter]" },
  { nom: "Google", role: "connexion avec un compte Google, si la personne la choisit", lieu: "[à compléter]" },
  {
    nom: "[à compléter : broker MQTT et serveur LoRaWAN]",
    role: "réception des données des capteurs",
    lieu: "Union européenne (exigence du service)",
  },
];

export interface Section {
  titre: string;
  paragraphes: string[];
}

export interface DocumentLegal {
  slug: string;
  titre: string;
  resume: string;
  sections: () => Section[];
}

export const DOCUMENTS: DocumentLegal[] = [
  {
    slug: "mentions-legales",
    titre: "Mentions légales",
    resume: "Qui édite le service et qui l'héberge.",
    sections: () => [
      {
        titre: "Éditeur du service",
        paragraphes: [
          `Le service ${NOM_PLATEFORME} est édité par ${entite()}, ${a(INFORMATIONS_LEGALES.formeEtCapital, "forme juridique et capital")}, dont le siège est situé ${a(INFORMATIONS_LEGALES.siege, "adresse du siège")}.`,
          `Immatriculation : ${a(INFORMATIONS_LEGALES.immatriculation, "numéro d'immatriculation")}. TVA intracommunautaire : ${a(INFORMATIONS_LEGALES.tva, "numéro de TVA")}.`,
          `Directeur ou directrice de la publication : ${a(INFORMATIONS_LEGALES.directeurPublication, "nom")}. Contact : ${a(INFORMATIONS_LEGALES.contact, "adresse e-mail et téléphone")}.`,
        ],
      },
      {
        titre: "Hébergement",
        paragraphes: [
          "Application web : Vercel (région Paris). Données : Supabase (région Paris).",
          "[à compléter : raison sociale, adresse et téléphone de chaque hébergeur, tels qu'ils figurent dans leurs conditions]",
        ],
      },
      {
        titre: "Propriété intellectuelle",
        paragraphes: [
          `La marque ${NOM_PLATEFORME}, le logiciel et les contenus du service sont protégés. Les logos et marques des partenaires restent la propriété de leurs titulaires.`,
        ],
      },
    ],
  },
  {
    slug: "cgu",
    titre: "Conditions générales d'utilisation",
    resume: "Les règles d'usage du service pour toute personne qui a un compte.",
    sections: () => [
      {
        titre: "Objet",
        paragraphes: [
          `Ces conditions encadrent l'usage du service ${NOM_PLATEFORME} « Gardien de l'eau » par les personnes invitées ou inscrites (administrateurs, directeurs de site, techniciens, lecteurs). Les conditions commerciales figurent dans les conditions générales de vente.`,
        ],
      },
      {
        titre: "Compte et accès",
        paragraphes: [
          "Chaque compte est personnel. Vous gardez votre mot de passe secret et prévenez l'administrateur de votre établissement en cas de doute.",
          "L'administrateur de l'établissement invite et retire les autres utilisateurs, et choisit leur rôle. Chaque rôle ne voit que les sites qui lui sont attribués.",
        ],
      },
      {
        titre: "Alertes",
        paragraphes: [
          MENTION_SURVEILLANCE,
          "Les alertes partent vers les adresses e-mail et numéros de téléphone enregistrés dans le service. Chaque utilisateur garde son numéro à jour dans « Mon compte ». Une alerte peut être retardée ou ne pas arriver (capteur sans réseau, pile vide, téléphone éteint, opérateur en panne).",
        ],
      },
      {
        titre: "Usage acceptable",
        paragraphes: [
          "Il est interdit de tenter d'accéder aux données d'un autre établissement, de perturber le service, d'en extraire le contenu de façon automatisée ou de le revendre sans accord écrit.",
        ],
      },
      {
        titre: "Disponibilité",
        paragraphes: [
          "Le service est accessible en continu, sauf maintenance ou incident. [à compléter : engagement de disponibilité éventuel]",
        ],
      },
      {
        titre: "Suspension",
        paragraphes: [
          "Un accès peut être suspendu en cas d'usage contraire à ces conditions, après information de l'administrateur de l'établissement, sauf urgence de sécurité.",
        ],
      },
      {
        titre: "Données personnelles",
        paragraphes: ["Voir la politique de confidentialité."],
      },
      {
        titre: "Modification",
        paragraphes: [
          "Ces conditions peuvent évoluer. Les utilisateurs en sont informés avant l'entrée en vigueur de la nouvelle version.",
        ],
      },
    ],
  },
  {
    slug: "cgv",
    titre: "Conditions générales de vente (professionnels)",
    resume: "Le contrat entre l'établissement ou le partenaire et l'exploitant du service.",
    sections: () => [
      {
        titre: "Champ d'application",
        paragraphes: [
          `Ces conditions s'appliquent aux contrats conclus entre ${entite()} et des clients professionnels (établissements, chaînes, partenaires revendeurs). Elles ne s'appliquent pas aux consommateurs.`,
        ],
      },
      {
        titre: "Description du service",
        paragraphes: [
          "Le service surveille la consommation d'eau à partir de capteurs posés sur les compteurs : repérage des fuites probables, alertes, rapports, registre des températures d'eau chaude et exports.",
          "Le matériel (capteurs, passerelles) provient de fabricants tiers. [à compléter : vente ou mise à disposition du matériel, garantie et remplacement]",
        ],
      },
      {
        titre: "Obligation de moyens",
        paragraphes: [
          `L'exploitant s'engage à mettre en œuvre les moyens raisonnables pour surveiller les données reçues et prévenir le client. Il s'agit d'une obligation de moyens et non de résultat : aucune détection de fuite n'est garantie. ${MENTION_SURVEILLANCE}`,
          "Les montants de pertes et d'économies affichés sont calculés selon une méthode prudente, indiquée à côté de chaque montant. Ce sont des estimations, pas un engagement financier.",
        ],
      },
      {
        titre: "Obligations du client",
        paragraphes: [
          "Le client donne accès aux compteurs pour la pose, signale tout changement de compteur, tient à jour les contacts d'alerte, les périodes de fermeture et les plages où une consommation de nuit est normale (arrosage, piscine), et intervient lui-même ou fait intervenir un professionnel en cas de fuite.",
        ],
      },
      {
        titre: "Prix et facturation",
        paragraphes: [
          "Les prix (mise en service par point, abonnement mensuel, options) figurent sur le bon de commande ou le devis accepté. Pas de paiement en ligne : facture mensuelle. [à compléter : délai de paiement, pénalités de retard et indemnité forfaitaire de recouvrement]",
          "Pour un client établi au Maroc facturé depuis l'étranger, une retenue à la source peut s'appliquer. [à compléter : modalités validées par un conseil fiscal]",
          "Pour un client établi en République démocratique du Congo : [à compléter : fiscalité applicable, validée par un conseil fiscal]",
        ],
      },
      {
        titre: "Durée",
        paragraphes: [
          "Engagement de 24 mois à compter de la mise en service, ou formule annuelle selon le bon de commande. [à compléter : reconduction, préavis et conditions de résiliation]",
        ],
      },
      {
        titre: "Responsabilité",
        paragraphes: [
          "L'exploitant n'est pas responsable des dommages causés par une fuite, des coupures de réseau mobile ou LoRaWAN, ni des données erronées transmises par un compteur ou un capteur. [à compléter : plafond de responsabilité]",
        ],
      },
      {
        titre: "Données",
        paragraphes: [
          "Le client reste propriétaire des données de consommation de ses sites et peut en demander l'export. Les données personnelles sont traitées selon l'accord de sous-traitance.",
        ],
      },
      {
        titre: "Droit applicable et litiges",
        paragraphes: ["[à compléter : droit applicable et tribunal compétent, pour la France, le Maroc et la République démocratique du Congo]"],
      },
    ],
  },
  {
    slug: "conditions-pilote",
    titre: "Conditions du pilote de 30 jours",
    resume: "Le fonctionnement de l'essai sur site et de la suite éventuelle en abonnement.",
    sections: () => [
      {
        titre: "Durée et contenu",
        paragraphes: [
          "Le pilote dure 30 jours à partir de la pose des capteurs, sauf autre durée écrite. Il comprend la surveillance, les alertes, un rapport après la première nuit, un rapport après la première semaine et un résumé de fin de pilote avec une page preuve partageable.",
        ],
      },
      {
        titre: "Mise en service",
        paragraphes: [
          "La mise en service est facturée selon le devis. Si l'option « remboursement si rien n'est trouvé » a été retenue et qu'aucune anomalie n'est détectée pendant le pilote, la mise en service est remboursée et le capteur retiré. [à compléter : délai et modalités du remboursement]",
        ],
      },
      {
        titre: "Suite du pilote : accord écrit obligatoire",
        paragraphes: [
          "La surveillance continue en abonnement à la fin du pilote uniquement si le client l'a accepté par écrit : case cochée sur la page de son site, avec son nom, la date et l'heure enregistrées.",
          "Cet accord peut être retiré à tout moment avant la fin du pilote, depuis la même page. Sans accord, l'exploitant appelle le client avant toute suite ; aucun abonnement ne démarre sans réponse.",
        ],
      },
      {
        titre: "Sans suite",
        paragraphes: ["[à compléter : retrait ou rachat du matériel, délai de récupération des données]"],
      },
      { titre: "Mention", paragraphes: [MENTION_SURVEILLANCE] },
    ],
  },
  {
    slug: "confidentialite",
    titre: "Politique de confidentialité",
    resume: "Les données personnelles traitées, pourquoi, combien de temps, et vos droits.",
    sections: () => [
      {
        titre: "Responsable du traitement",
        paragraphes: [
          `Pour les comptes et la gestion du service : ${entite()}. Pour les données des établissements clients, l'exploitant agit en sous-traitant de l'établissement (voir l'accord de sous-traitance).`,
        ],
      },
      {
        titre: "Données traitées",
        paragraphes: [
          "Comptes : nom, adresse e-mail, rôle, numéro de téléphone d'alerte s'il est renseigné, dates de connexion.",
          "Service : journal des messages envoyés (destinataire, date, canal), accord de suite d'un pilote (nom, date et heure), photos des compteurs prises pendant la pose, actions sur les alertes (qui, quand).",
          "Les relevés de consommation et de température concernent des établissements et des compteurs, pas des personnes.",
        ],
      },
      {
        titre: "Finalités et bases légales",
        paragraphes: [
          "Fournir le service et envoyer les alertes : exécution du contrat. Sécurité du service, limitation des abus et suivi des erreurs : intérêt légitime. Facturation : obligation légale. [à compléter : validation des bases légales]",
        ],
      },
      {
        titre: "Durées de conservation",
        paragraphes: [
          "Comptes : pendant la durée du contrat. Journal des messages : le contenu et le destinataire sont effacés après une durée paramétrable. [à compléter : durées validées, puis réglage « conservation » de la plateforme]",
        ],
      },
      {
        titre: "Sous-traitants",
        paragraphes: SOUS_TRAITANTS.map((s) => `${s.nom} : ${s.role} (${s.lieu}).`).concat([
          "[à compléter : garanties de transfert hors Union européenne pour chaque sous-traitant concerné]",
        ]),
      },
      {
        titre: "Vos droits",
        paragraphes: [
          `Vous pouvez demander l'accès, la rectification, l'effacement, la limitation ou la portabilité de vos données, et vous opposer à certains traitements, en écrivant à ${contactDonnees()}. Vous pouvez aussi saisir l'autorité de protection des données de votre pays (CNIL en France, CNDP au Maroc ; en République démocratique du Congo : [à compléter : autorité compétente]).`,
        ],
      },
      {
        titre: "Traceurs",
        paragraphes: [
          "Le service n'utilise que des cookies nécessaires à la connexion. Aucune mesure d'audience ni publicité.",
        ],
      },
    ],
  },
  {
    slug: "sous-traitance",
    titre: "Accord de sous-traitance des données (article 28 du RGPD)",
    resume: "Le cadre des données personnelles traitées pour le compte d'un établissement ou d'un partenaire.",
    sections: () => [
      {
        titre: "Parties et objet",
        paragraphes: [
          `Le client (établissement ou partenaire revendeur) est responsable du traitement ; ${entite()} est sous-traitant. Objet : surveillance de l'eau des sites du client, alertes, rapports et registre des températures.`,
        ],
      },
      {
        titre: "Données et personnes concernées",
        paragraphes: [
          "Personnes : utilisateurs désignés par le client (personnel, techniciens, directeurs de site), contacts d'alerte. Données : identité, adresse e-mail, téléphone, rôle, actions dans le service, journal des messages.",
        ],
      },
      {
        titre: "Engagements du sous-traitant",
        paragraphes: [
          "Traiter les données uniquement sur instruction documentée du client ; garantir la confidentialité des personnes autorisées ; mettre en œuvre des mesures de sécurité adaptées (accès cloisonné par établissement, chiffrement des échanges, journal d'audit, sauvegardes) ; aider le client à répondre aux demandes d'exercice des droits ; notifier toute violation de données dans les meilleurs délais [à compléter : délai] ; supprimer ou restituer les données en fin de contrat.",
        ],
      },
      {
        titre: "Sous-traitants ultérieurs",
        paragraphes: [
          "Le client autorise les sous-traitants listés dans la politique de confidentialité. Tout changement lui est notifié à l'avance et il peut s'y opposer. [à compléter : délai de préavis]",
        ],
      },
      {
        titre: "Audits",
        paragraphes: ["[à compléter : modalités d'audit et de documentation fournie au client]"],
      },
      {
        titre: "Marque blanche",
        paragraphes: [
          "Lorsqu'un partenaire revend le service sous sa marque, le partenaire est sous-traitant de ses propres clients et l'exploitant est sous-traitant ultérieur. [à compléter : chaîne contractuelle validée]",
        ],
      },
    ],
  },
];

export function documentLegal(slug: string): DocumentLegal | null {
  return DOCUMENTS.find((d) => d.slug === slug) ?? null;
}

/** Morceaux d'un paragraphe, les « [à compléter : …] » à part pour être surlignés. */
export function morceaux(texte: string): { texte: string; aCompleter: boolean }[] {
  return texte
    .split(/(\[à compléter[^\]]*\])/)
    .filter(Boolean)
    .map((t) => ({ texte: t, aCompleter: t.startsWith("[à compléter") }));
}

export function nombreACompleter(): number {
  return DOCUMENTS.flatMap((d) => d.sections())
    .flatMap((s) => [s.titre, ...s.paragraphes])
    .reduce((n, t) => n + morceaux(t).filter((m) => m.aCompleter).length, 0);
}
