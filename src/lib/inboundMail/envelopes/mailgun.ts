// Mailgun Route "Forward" — multipart/form-data dès qu'il y a une pièce
// jointe (jamais de JSON). Champs confirmés par la doc officielle :
// https://documentation.mailgun.com/docs/mailgun/user-manual/receive-forward-store/receive-http
// Route catch-all recommandée : match_recipient(".*@votredomaine.com") ->
// forward(webhook) — la local-part de `recipient` sert de jeton (voir
// extraireToken).
import type { EmailEntrant, ErreurEnveloppe, PieceJointe } from "../types";
import { extraireToken } from "../token";

export async function parseEmailMailgun(
  form: FormData,
): Promise<EmailEntrant | ErreurEnveloppe> {
  const recipient = form.get("recipient");
  if (typeof recipient !== "string" || !recipient) {
    return { erreur: "recipient manquant dans la requête Mailgun" };
  }

  const expediteur =
    (form.get("sender") as string | null) ?? (form.get("from") as string | null) ?? "";
  const objet = (form.get("subject") as string | null) ?? "(sans objet)";

  const nbBrut = form.get("attachment-count");
  const nb = typeof nbBrut === "string" ? parseInt(nbBrut, 10) : 0;

  const piecesJointes: PieceJointe[] = [];
  for (let i = 1; i <= nb && Number.isFinite(nb); i++) {
    const fichier = form.get(`attachment-${i}`);
    if (fichier instanceof File) {
      piecesJointes.push({
        nomFichier: fichier.name,
        typeMime: fichier.type || "application/octet-stream",
        contenu: new Uint8Array(await fichier.arrayBuffer()),
      });
    }
  }

  return {
    destinataireBrut: recipient,
    token: extraireToken(recipient),
    expediteur,
    objet,
    piecesJointes,
  };
}

/** Vérifie la signature HMAC-SHA256 Mailgun (timestamp+token, clé = HTTP
 * webhook signing key), en temps constant. Les 3 champs voyagent dans le
 * corps du formulaire, pas en header. */
export async function verifierSignatureMailgun(
  timestamp: string,
  token: string,
  signature: string,
  signingKey: string,
): Promise<boolean> {
  const enc = new TextEncoder();
  const cle = await crypto.subtle.importKey(
    "raw",
    enc.encode(signingKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cle, enc.encode(timestamp + token));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return comparaisonConstante(hex, signature.toLowerCase());
}

function comparaisonConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
