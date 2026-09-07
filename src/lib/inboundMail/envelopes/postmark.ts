// Postmark Inbound Webhook — JSON. Champs confirmés par la doc officielle :
// https://postmarkapp.com/developer/webhooks/inbound-webhook
// MailboxHash porte le suffixe "+jeton" de l'adressage natif Postmark
// ("hash+jeton@inbound.postmarkapp.com") sans qu'on ait besoin de le
// reparser depuis To/OriginalRecipient.
import type { EmailEntrant, ErreurEnveloppe, PieceJointe } from "../types";
import { extraireToken } from "../token";
import { base64ToBytes } from "../../ingest/bytes";

export function parseEmailPostmark(body: unknown): EmailEntrant | ErreurEnveloppe {
  if (typeof body !== "object" || body === null) {
    return { erreur: "Corps de requête Postmark invalide (JSON attendu)" };
  }
  const b = body as Record<string, unknown>;

  const destinataireBrut =
    (typeof b.OriginalRecipient === "string" && b.OriginalRecipient) ||
    (typeof b.To === "string" && b.To) ||
    "";
  if (!destinataireBrut) {
    return { erreur: "To/OriginalRecipient manquant dans la trame Postmark" };
  }

  const mailboxHash = typeof b.MailboxHash === "string" ? b.MailboxHash : "";
  const token = mailboxHash ? mailboxHash.toLowerCase() : extraireToken(destinataireBrut);

  const piecesJointes: PieceJointe[] = [];
  const attachments = Array.isArray(b.Attachments) ? b.Attachments : [];
  for (const brut of attachments) {
    if (typeof brut !== "object" || brut === null) continue;
    const a = brut as Record<string, unknown>;
    if (typeof a.Name === "string" && typeof a.Content === "string") {
      piecesJointes.push({
        nomFichier: a.Name,
        typeMime: typeof a.ContentType === "string" ? a.ContentType : "application/octet-stream",
        contenu: base64ToBytes(a.Content),
      });
    }
  }

  return {
    destinataireBrut,
    token,
    expediteur: typeof b.From === "string" ? b.From : "",
    objet: typeof b.Subject === "string" ? b.Subject : "(sans objet)",
    piecesJointes,
  };
}
