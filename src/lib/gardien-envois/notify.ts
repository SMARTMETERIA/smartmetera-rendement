// Interface d'envoi unique du Gardien : e-mail, SMS, appel vocal, WhatsApp
// (plan, section 3). Sans dépendance : utilisée par la fonction
// gardien-envois (copie Deno) et testée avec Vitest.
//
// Mode (variable GARDIEN_ENVOIS_MODE) :
// - « journal » (défaut) : rien ne part, tout est écrit dans le journal
//   des envois. Obligatoire en développement ;
// - « redirection » : les e-mails partent tous vers GARDIEN_EMAIL_REDIRECT
//   (adresse de test) ;
// - « reel » : production.
// SMS, appel et WhatsApp : fournisseur Twilio (./telephone), désactivé tant
// que ses clés manquent (seulement journalisés). En « redirection », ils
// partent vers GARDIEN_TELEPHONE_REDIRECT (numéro de test) s'il est donné.
// TODO(RAYAN) : choix définitif du fournisseur (docs/A_FAIRE_RAYAN.md).
import { formaterExpediteur } from "../email/expediteur";
import {
  canauxDisponibles,
  configTelephone,
  envoyerTelephone,
  NUMERO_INTERNATIONAL,
  type CanalTelephone,
  type ConfigTelephone,
} from "./telephone";

export type Canal = "email" | "sms" | "appel" | "whatsapp";
export type ModeEnvois = "journal" | "redirection" | "reel";

export interface ConfigEnvois {
  mode: ModeEnvois;
  resendKey: string | null;
  resendFrom: string | null;
  redirection: string | null;
  /** Fournisseur de SMS, d'appel et de WhatsApp (null : aucun). */
  telephone: ConfigTelephone | null;
  /** Numéro de test du mode « redirection ». */
  redirectionTelephone: string | null;
}

export interface Message {
  canal: Canal;
  /** Adresse e-mail ou numéro au format international. */
  destinataire: string;
  sujet: string | null;
  texte: string;
  html: string | null;
  /** Nom d'expéditeur (marque du partenaire). */
  expediteur: string | null;
  repondreA: string | null;
}

export interface ResultatEnvoi {
  mode: ModeEnvois;
  statut: "journalise" | "envoye" | "echec";
  fournisseur: string | null;
  fournisseurId: string | null;
  erreur: string | null;
}

type Env = Record<string, string | undefined>;

export function configEnvois(env: Env): ConfigEnvois {
  const resendKey = env.RESEND_API_KEY?.trim() || null;
  const resendFrom = env.RESEND_FROM_EMAIL?.trim() || null;
  const redirection = env.GARDIEN_EMAIL_REDIRECT?.trim() || null;
  const demande = env.GARDIEN_ENVOIS_MODE?.trim();
  const resend = Boolean(resendKey && resendFrom);
  let mode: ModeEnvois = "journal";
  if (demande === "reel" && resend) mode = "reel";
  if (demande === "redirection" && resend && redirection) mode = "redirection";
  const numeroTest = env.GARDIEN_TELEPHONE_REDIRECT?.replace(/[\s.-]/g, "") || null;
  return {
    mode,
    resendKey,
    resendFrom,
    redirection,
    telephone: configTelephone(env),
    redirectionTelephone: numeroTest && NUMERO_INTERNATIONAL.test(numeroTest) ? numeroTest : null,
  };
}

type Recuperer = (url: string, init: RequestInit) => Promise<Response>;

const journalise = (erreur: string | null = null): ResultatEnvoi => ({
  mode: "journal",
  statut: "journalise",
  fournisseur: null,
  fournisseurId: null,
  erreur,
});

async function notifyTelephone(
  message: Message & { canal: CanalTelephone },
  config: ConfigEnvois,
  recuperer: Recuperer,
): Promise<ResultatEnvoi> {
  if (config.mode === "journal") return journalise();
  if (!config.telephone || !canauxDisponibles(config.telephone)[message.canal]) {
    return journalise("Aucun fournisseur configuré pour ce canal (TODO(RAYAN)).");
  }
  const redirige = config.mode === "redirection";
  if (redirige && !config.redirectionTelephone) {
    return journalise("Mode redirection sans numéro de test (GARDIEN_TELEPHONE_REDIRECT).");
  }
  const numero = redirige ? (config.redirectionTelephone as string) : message.destinataire;
  const texte = redirige ? `[Test, pour ${message.destinataire}] ${message.texte}` : message.texte;
  const r = await envoyerTelephone(config.telephone, message.canal, numero, texte, recuperer);
  return { mode: config.mode, fournisseur: config.telephone.fournisseur, ...r };
}

export async function notify(
  message: Message,
  config: ConfigEnvois,
  recuperer: Recuperer = fetch,
): Promise<ResultatEnvoi> {
  if (message.canal !== "email") {
    return notifyTelephone({ ...message, canal: message.canal }, config, recuperer);
  }
  if (config.mode === "journal" || !config.resendKey || !config.resendFrom) return journalise();

  const redirige = config.mode === "redirection";
  const destinataire = redirige ? (config.redirection as string) : message.destinataire;
  const sujet = redirige
    ? `[Test, pour ${message.destinataire}] ${message.sujet ?? ""}`
    : (message.sujet ?? "");
  try {
    const reponse = await recuperer("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: formaterExpediteur(message.expediteur ?? undefined, config.resendFrom),
        to: [destinataire],
        subject: sujet,
        html: message.html ?? undefined,
        text: message.texte,
        reply_to: message.repondreA ?? undefined,
      }),
    });
    if (!reponse.ok) {
      return {
        mode: config.mode,
        statut: "echec",
        fournisseur: "resend",
        fournisseurId: null,
        erreur: `Resend a répondu ${reponse.status}.`,
      };
    }
    const corps = (await reponse.json().catch(() => ({}))) as { id?: string };
    return {
      mode: config.mode,
      statut: "envoye",
      fournisseur: "resend",
      fournisseurId: corps.id ?? null,
      erreur: null,
    };
  } catch (e) {
    return {
      mode: config.mode,
      statut: "echec",
      fournisseur: "resend",
      fournisseurId: null,
      erreur: e instanceof Error ? e.message : String(e),
    };
  }
}
