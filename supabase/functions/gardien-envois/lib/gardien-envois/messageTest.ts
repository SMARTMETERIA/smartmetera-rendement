// Message de test du superadmin (plan, phase G10 : test de fumée « alerte
// de test vers le téléphone de Rayan ») : un e-mail et un SMS, un appel ou
// un WhatsApp vers sa propre adresse et son propre numéro, par la même
// chaîne que les vraies alertes (notify()). En mode « journal », rien ne
// part : le résultat le dit.

import type { Marque } from "../marque.ts";
import type { Canal, Message, ModeEnvois, ResultatEnvoi } from "./notify.ts";
import { NUMERO_INTERNATIONAL } from "./telephone.ts";

export const CANAUX_TEST: Canal[] = ["email", "sms", "appel", "whatsapp"];

export const LIBELLES_CANAUX: Record<Canal, string> = {
  email: "E-mail",
  sms: "SMS",
  appel: "Appel vocal",
  whatsapp: "WhatsApp",
};

export interface DemandeTest {
  email: string;
  telephone: string | null;
  canaux: Canal[];
}

export function validerMessageTest(
  entree: Record<string, unknown>,
): { ok: true; demande: DemandeTest } | { ok: false; erreur: string } {
  const canaux = Array.isArray(entree.canaux)
    ? CANAUX_TEST.filter((c) => (entree.canaux as unknown[]).includes(c))
    : [];
  if (!canaux.length) return { ok: false, erreur: "Choisissez au moins un canal." };
  const email = typeof entree.email === "string" ? entree.email.trim() : "";
  if (canaux.includes("email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, erreur: "Adresse e-mail introuvable pour votre compte." };
  }
  const telephone = typeof entree.telephone === "string" ? entree.telephone.replace(/[\s.-]/g, "") : "";
  const parTelephone = canaux.some((c) => c !== "email");
  if (parTelephone && !NUMERO_INTERNATIONAL.test(telephone)) {
    return { ok: false, erreur: "Numéro au format international attendu, par exemple +33 6 12 34 56 78." };
  }
  return { ok: true, demande: { email, telephone: parTelephone ? telephone : null, canaux } };
}

export function messagesTest(marque: Marque, demande: DemandeTest, urlApp: string): Message[] {
  const court = `${marque.nom} : message de test. Si vous le recevez, les alertes par ce canal fonctionnent.`;
  return demande.canaux.map((canal) =>
    canal === "email"
      ? {
          canal,
          destinataire: demande.email,
          sujet: `${marque.nom} : message de test`,
          texte: `Bonjour,\n\nCeci est un message de test envoyé depuis l'espace superadmin (${urlApp}/admin).\nSi vous le recevez, les alertes par e-mail fonctionnent.\n\n${marque.nom}`,
          html: `<p>Bonjour,</p><p>Ceci est un message de test envoyé depuis l'espace superadmin.</p><p>Si vous le recevez, les alertes par e-mail fonctionnent.</p><p>${marque.nom}</p>`,
          expediteur: marque.expediteur,
          repondreA: null,
        }
      : {
          canal,
          destinataire: demande.telephone as string,
          sujet: null,
          texte:
            canal === "appel"
              ? `Bonjour, ici ${marque.nom}. Ceci est un appel de test. Si vous l'entendez, les alertes par appel fonctionnent. Au revoir.`
              : court,
          html: null,
          expediteur: marque.expediteur,
          repondreA: null,
        },
  );
}

export type ResultatTest = Pick<ResultatEnvoi, "statut" | "mode" | "fournisseur" | "erreur"> & { canal: Canal };

/** Phrase simple affichée au superadmin pour chaque canal. */
export function libelleResultat(r: ResultatTest): string {
  if (r.statut === "envoye") {
    return `Parti${r.mode === "redirection" ? " vers l'adresse ou le numéro de test" : ""}. Vérifiez la réception.`;
  }
  if (r.statut === "echec") return `Échec : ${r.erreur ?? "erreur inconnue"}`;
  return r.erreur
    ? `Rien n'est parti : ${r.erreur}`
    : "Rien n'est parti : envois en mode « journal » (normal en développement).";
}

export const LIBELLES_MODE: Record<ModeEnvois, string> = {
  journal: "journal (rien ne part)",
  redirection: "redirection (tout part vers l'adresse et le numéro de test)",
  reel: "réel",
};
