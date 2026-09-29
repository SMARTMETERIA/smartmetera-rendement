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
// SMS, appel et WhatsApp : TODO(RAYAN) — fournisseurs à choisir (voir
// docs/BLOCKERS.md) ; en attendant, ils sont seulement journalisés.
import { formaterExpediteur } from "../email/expediteur.ts";

export type Canal = "email" | "sms" | "appel" | "whatsapp";
export type ModeEnvois = "journal" | "redirection" | "reel";

export interface ConfigEnvois {
  mode: ModeEnvois;
  resendKey: string | null;
  resendFrom: string | null;
  redirection: string | null;
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
  return { mode, resendKey, resendFrom, redirection };
}

/** Fournisseurs de SMS, d'appel et de WhatsApp : aucun pour l'instant. */
export const FOURNISSEURS_TELEPHONE: Partial<Record<Exclude<Canal, "email">, string>> = {};

type Recuperer = (url: string, init: RequestInit) => Promise<Response>;

export async function notify(
  message: Message,
  config: ConfigEnvois,
  recuperer: Recuperer = fetch,
): Promise<ResultatEnvoi> {
  if (message.canal !== "email") {
    const fournisseur = FOURNISSEURS_TELEPHONE[message.canal] ?? null;
    return {
      mode: "journal",
      statut: "journalise",
      fournisseur,
      fournisseurId: null,
      erreur:
        config.mode === "reel" && !fournisseur
          ? "Aucun fournisseur choisi pour ce canal (TODO(RAYAN))."
          : null,
    };
  }
  if (config.mode === "journal" || !config.resendKey || !config.resendFrom) {
    return { mode: "journal", statut: "journalise", fournisseur: null, fournisseurId: null, erreur: null };
  }

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
