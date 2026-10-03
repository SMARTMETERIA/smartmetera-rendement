// SMS, appel vocal et WhatsApp derrière notify() (plan, section 3 et phase
// G10). Fournisseur branché : Twilio (un seul compte pour les trois canaux,
// API publique : ressources Messages et Calls de l'API REST 2010-04-01).
// Twilio est le fournisseur retenu par Rayan (docs/A_FAIRE_RAYAN.md, D2) ; un
// autre fournisseur se brancherait en ajoutant une fonction d'envoi ici.
//
// Désactivé tant que les clés manquent : sans GARDIEN_TELEPHONE_FOURNISSEUR
// et sans les variables du canal, le message est seulement journalisé.
// Les clés ne vivent que dans les secrets de la fonction gardien-envois.

export type CanalTelephone = "sms" | "appel" | "whatsapp";

export interface ConfigTwilio {
  fournisseur: "twilio";
  accountSid: string;
  authToken: string;
  /** https://api.twilio.com par défaut ; région Irlande possible (TWILIO_API_BASE). */
  apiBase: string;
  smsFrom: string | null;
  messagingServiceSid: string | null;
  appelFrom: string | null;
  whatsappFrom: string | null;
  /** Modèle WhatsApp validé par Meta (obligatoire pour écrire en premier). */
  whatsappContentSid: string | null;
}

export type ConfigTelephone = ConfigTwilio;

type Env = Record<string, string | undefined>;

const lire = (env: Env, cle: string) => env[cle]?.trim() || null;

/** Numéro international : + puis 8 à 15 chiffres. */
export const NUMERO_INTERNATIONAL = /^\+[1-9]\d{7,14}$/;

export function configTelephone(env: Env): ConfigTelephone | null {
  if (lire(env, "GARDIEN_TELEPHONE_FOURNISSEUR") !== "twilio") return null;
  const accountSid = lire(env, "TWILIO_ACCOUNT_SID");
  const authToken = lire(env, "TWILIO_AUTH_TOKEN");
  if (!accountSid || !/^AC[0-9a-f]{32}$/i.test(accountSid) || !authToken) return null;
  const base = lire(env, "TWILIO_API_BASE") ?? "https://api.twilio.com";
  return {
    fournisseur: "twilio",
    accountSid,
    authToken,
    apiBase: /^https:\/\/[a-z0-9.-]+\.twilio\.com$/i.test(base) ? base : "https://api.twilio.com",
    smsFrom: lire(env, "TWILIO_SMS_FROM"),
    messagingServiceSid: lire(env, "TWILIO_MESSAGING_SERVICE_SID"),
    appelFrom: lire(env, "TWILIO_APPEL_FROM"),
    whatsappFrom: lire(env, "TWILIO_WHATSAPP_FROM"),
    whatsappContentSid: lire(env, "TWILIO_WHATSAPP_CONTENT_SID"),
  };
}

/** Canaux réellement utilisables avec la configuration donnée. */
export function canauxDisponibles(config: ConfigTelephone | null): Record<CanalTelephone, boolean> {
  return {
    sms: Boolean(config && (config.smsFrom || config.messagingServiceSid)),
    appel: Boolean(config?.appelFrom),
    whatsapp: Boolean(config?.whatsappFrom && config.whatsappContentSid),
  };
}

const xml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Message lu deux fois, en français, puis l'appel se termine. */
export function twimlAppel(texte: string): string {
  const dit = `<Say language="fr-FR">${xml(texte)}</Say>`;
  return `<Response>${dit}<Pause length="1"/>${dit}</Response>`;
}

/**
 * Variables du modèle WhatsApp : {{1}} reçoit le texte court. Meta refuse
 * les retours à la ligne et plus de quatre espaces consécutifs dans une
 * variable ; la longueur est bornée par prudence.
 */
export function variablesWhatsapp(texte: string): string {
  const ligne = texte.replace(/\s*\n+\s*/g, " · ").replace(/\s{2,}/g, " ").trim().slice(0, 900);
  return JSON.stringify({ "1": ligne });
}

export interface ResultatTelephone {
  statut: "envoye" | "echec";
  fournisseurId: string | null;
  erreur: string | null;
}

type Recuperer = (url: string, init: RequestInit) => Promise<Response>;

function base64(texte: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(texte)));
}

/** Corps de la requête Twilio pour un canal (null si le canal n'est pas configuré). */
export function requeteTwilio(
  config: ConfigTwilio,
  canal: CanalTelephone,
  numero: string,
  texte: string,
): { chemin: "Messages.json" | "Calls.json"; parametres: URLSearchParams } | null {
  if (!canauxDisponibles(config)[canal]) return null;
  if (canal === "appel") {
    return {
      chemin: "Calls.json",
      parametres: new URLSearchParams({ To: numero, From: config.appelFrom as string, Twiml: twimlAppel(texte) }),
    };
  }
  if (canal === "whatsapp") {
    return {
      chemin: "Messages.json",
      parametres: new URLSearchParams({
        To: `whatsapp:${numero}`,
        From: `whatsapp:${(config.whatsappFrom as string).replace(/^whatsapp:/, "")}`,
        ContentSid: config.whatsappContentSid as string,
        ContentVariables: variablesWhatsapp(texte),
      }),
    };
  }
  const parametres = new URLSearchParams({ To: numero, Body: texte });
  if (config.messagingServiceSid) parametres.set("MessagingServiceSid", config.messagingServiceSid);
  else parametres.set("From", config.smsFrom as string);
  return { chemin: "Messages.json", parametres };
}

export async function envoyerTelephone(
  config: ConfigTelephone,
  canal: CanalTelephone,
  numero: string,
  texte: string,
  recuperer: Recuperer,
): Promise<ResultatTelephone> {
  if (!NUMERO_INTERNATIONAL.test(numero)) {
    return { statut: "echec", fournisseurId: null, erreur: "Numéro invalide (format international attendu, +33…)." };
  }
  const requete = requeteTwilio(config, canal, numero, texte);
  if (!requete) return { statut: "echec", fournisseurId: null, erreur: "Canal non configuré." };
  try {
    const reponse = await recuperer(
      `${config.apiBase}/2010-04-01/Accounts/${config.accountSid}/${requete.chemin}`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${base64(`${config.accountSid}:${config.authToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: requete.parametres.toString(),
      },
    );
    const corps = (await reponse.json().catch(() => ({}))) as {
      sid?: string;
      code?: number;
      message?: string;
    };
    if (!reponse.ok) {
      const detail = [corps.code, corps.message].filter(Boolean).join(" ");
      return {
        statut: "echec",
        fournisseurId: null,
        erreur: `Twilio a répondu ${reponse.status}${detail ? ` (${detail.slice(0, 200)})` : ""}.`,
      };
    }
    return { statut: "envoye", fournisseurId: corps.sid ?? null, erreur: null };
  } catch (e) {
    return { statut: "echec", fournisseurId: null, erreur: e instanceof Error ? e.message : String(e) };
  }
}
