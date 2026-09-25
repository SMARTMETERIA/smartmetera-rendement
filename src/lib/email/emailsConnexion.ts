// E-mails de connexion et de compte, à la marque du partenaire (ou de la
// plateforme pour l'inscription d'un partenaire). Liens générés côté
// serveur par l'API Admin de Supabase (generateLink), jamais par le
// service e-mail intégré de Supabase.
import {
  boutonHtml,
  envelopperHtmlMarque,
  noteHtml,
  paragrapheHtml,
  type EmailRendu,
} from "./gabarit";
import type { Marque } from "@/lib/marque";

function rendu(
  marque: Marque,
  subject: string,
  paragraphes: string[],
  bouton: { libelle: string; lien: string },
  note: string,
): EmailRendu {
  const corpsHtml = [
    ...paragraphes.map(paragrapheHtml),
    `<p style="margin:8px 0 0;">${boutonHtml(marque, bouton.libelle, bouton.lien)}</p>`,
    noteHtml(note),
  ].join("\n");
  const text = [
    ...paragraphes,
    "",
    `${bouton.libelle} : ${bouton.lien}`,
    "",
    note,
    "",
    marque.nom,
  ].join("\n");
  return {
    subject,
    html: envelopperHtmlMarque(marque, subject, corpsHtml),
    text,
  };
}

export function emailLienConnexion(marque: Marque, lien: string): EmailRendu {
  return rendu(
    marque,
    `Votre lien de connexion — ${marque.nom}`,
    ["Bonjour,", "Cliquez sur le bouton ci-dessous pour vous connecter."],
    { libelle: "Me connecter", lien },
    "Ce lien fonctionne une seule fois et expire au bout d'une heure. Si vous n'avez rien demandé, ignorez ce message.",
  );
}

export function emailConfirmationInscription(
  marque: Marque,
  lien: string,
  raisonSociale: string,
): EmailRendu {
  return rendu(
    marque,
    `Activez votre compte ${marque.nom}`,
    [
      "Bonjour,",
      `Le compte de ${raisonSociale} est créé. Confirmez votre adresse pour démarrer votre essai gratuit de 30 jours.`,
    ],
    { libelle: "Confirmer mon adresse", lien },
    "Ce lien expire au bout d'une heure (vous pourrez en redemander un depuis la page de connexion). Si vous n'êtes pas à l'origine de cette inscription, ignorez ce message.",
  );
}

export function emailReinitialisation(marque: Marque, lien: string): EmailRendu {
  return rendu(
    marque,
    `Choisir un nouveau mot de passe — ${marque.nom}`,
    [
      "Bonjour,",
      "Vous avez demandé à changer de mot de passe. Cliquez sur le bouton pour en choisir un nouveau.",
    ],
    { libelle: "Choisir un mot de passe", lien },
    "Ce lien fonctionne une seule fois et expire au bout d'une heure. Si vous n'avez rien demandé, votre mot de passe actuel reste valable.",
  );
}

export function emailChangementAdresse(
  marque: Marque,
  lien: string,
  cible: "actuelle" | "nouvelle",
  nouvelleAdresse: string,
): EmailRendu {
  const paragraphes =
    cible === "nouvelle"
      ? [
          "Bonjour,",
          "Confirmez que cette adresse remplace l'ancienne pour vous connecter.",
        ]
      : [
          "Bonjour,",
          `Une demande remplace votre adresse de connexion par ${nouvelleAdresse}. Confirmez le changement.`,
        ];
  return rendu(
    marque,
    `Confirmer le changement d'adresse — ${marque.nom}`,
    paragraphes,
    { libelle: "Confirmer le changement", lien },
    "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : rien ne change.",
  );
}

export function emailInvitationMembre(
  marque: Marque,
  lien: string,
  roleLibelle: string,
): EmailRendu {
  return rendu(
    marque,
    `Invitation — ${marque.nom}`,
    [
      "Bonjour,",
      `${marque.nom} vous invite à rejoindre son espace en tant que ${roleLibelle}.`,
    ],
    { libelle: "Accepter l'invitation", lien },
    "Ce lien vous connecte directement et expire au bout d'une heure. Vous pourrez ensuite choisir un mot de passe dans « Mon compte ».",
  );
}
