// Envoi d'e-mails côté serveur Next.js (Server Actions, Route Handlers).
//
// - Production : Resend (RESEND_API_KEY + RESEND_FROM_EMAIL obligatoires).
// - Développement : jamais d'envoi réel à un destinataire. Soit tout part
//   vers une adresse de test (EMAIL_DEV_REDIRECT + clés Resend), soit
//   l'e-mail est écrit dans le journal local .emails-dev/, consultable sur
//   /dev/emails (liens cliquables compris).
//
// À n'importer que depuis du code serveur.
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface MessageEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Nom d'expéditeur affiché (partenaire en marque blanche). */
  fromName?: string;
  replyTo?: string | null;
}

export type ModeEnvoi = "resend" | "redirection" | "journal" | "indisponible";

export interface ResultatEnvoi {
  mode: ModeEnvoi;
  providerMessageId?: string;
}

type Env = Record<string, string | undefined>;

export function choisirModeEnvoi(env: Env): ModeEnvoi {
  const resendConfigure = Boolean(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL);
  if (env.NODE_ENV === "production") {
    return resendConfigure ? "resend" : "indisponible";
  }
  return resendConfigure && env.EMAIL_DEV_REDIRECT ? "redirection" : "journal";
}

/**
 * En-tête From : le nom du partenaire devant l'adresse d'envoi vérifiée de
 * la plateforme. RESEND_FROM_EMAIL peut déjà contenir un nom
 * (« SmartMetera <releves@…> ») : on n'en garde que l'adresse.
 */
export function formaterExpediteur(
  fromName: string | undefined,
  resendFrom: string,
): string {
  const adresse = resendFrom.match(/<([^>]+)>/)?.[1] ?? resendFrom.trim();
  if (!fromName) return resendFrom.trim();
  const nomPropre = fromName.replace(/["<>\r\n]/g, "").trim();
  return nomPropre ? `"${nomPropre}" <${adresse}>` : adresse;
}

export const DOSSIER_JOURNAL = path.join(process.cwd(), ".emails-dev");

export interface EmailJournalise extends MessageEmail {
  id: string;
  date: string;
}

async function journaliser(message: MessageEmail): Promise<string> {
  await mkdir(DOSSIER_JOURNAL, { recursive: true });
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entree: EmailJournalise = {
    ...message,
    id,
    date: new Date().toISOString(),
  };
  await writeFile(
    path.join(DOSSIER_JOURNAL, `${id}.json`),
    JSON.stringify(entree, null, 2),
    "utf8",
  );
  console.info(
    `[e-mail de développement] À : ${message.to} — ${message.subject} — à lire sur /dev/emails`,
  );
  return id;
}

export async function lireJournal(limite = 30): Promise<EmailJournalise[]> {
  let fichiers: string[];
  try {
    fichiers = await readdir(DOSSIER_JOURNAL);
  } catch {
    return [];
  }
  const recents = fichiers
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, limite);
  return Promise.all(
    recents.map(async (f) =>
      JSON.parse(await readFile(path.join(DOSSIER_JOURNAL, f), "utf8")),
    ),
  );
}

async function envoyerParResend(
  message: MessageEmail,
  destinataire: string,
  sujet: string,
): Promise<string | undefined> {
  const reponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: formaterExpediteur(message.fromName, process.env.RESEND_FROM_EMAIL!),
      to: [destinataire],
      subject: sujet,
      html: message.html,
      text: message.text,
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
    }),
  });
  if (!reponse.ok) {
    throw new Error(
      `Envoi de l'e-mail impossible (Resend ${reponse.status}) : ${await reponse.text()}`,
    );
  }
  const corps = (await reponse.json()) as { id?: string };
  return corps.id;
}

export async function envoyerEmail(
  message: MessageEmail,
): Promise<ResultatEnvoi> {
  const mode = choisirModeEnvoi(process.env);
  switch (mode) {
    case "resend":
      return {
        mode,
        providerMessageId: await envoyerParResend(
          message,
          message.to,
          message.subject,
        ),
      };
    case "redirection":
      return {
        mode,
        providerMessageId: await envoyerParResend(
          message,
          process.env.EMAIL_DEV_REDIRECT!,
          `[test → ${message.to}] ${message.subject}`,
        ),
      };
    case "journal":
      return { mode, providerMessageId: await journaliser(message) };
    case "indisponible":
      throw new Error(
        "Envoi d'e-mails non configuré : RESEND_API_KEY et RESEND_FROM_EMAIL sont requis en production.",
      );
  }
}
