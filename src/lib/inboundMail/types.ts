// Types partagés par les enveloppes Postmark/Mailgun et le pipeline
// d'import par e-mail. Dupliqué dans supabase/functions/inbound-email/lib
// (voir README de ce dossier) — même convention que src/lib/ingest.
export interface PieceJointe {
  nomFichier: string;
  typeMime: string;
  contenu: Uint8Array;
}

export interface EmailEntrant {
  /** Adresse destinataire brute telle que fournie par la plateforme (pour diagnostic). */
  destinataireBrut: string;
  /** Jeton extrait de l'adresse (local-part, ou suffixe "+jeton" pour Postmark), identifie la source. */
  token: string | null;
  expediteur: string;
  objet: string;
  piecesJointes: PieceJointe[];
}

export type ErreurEnveloppe = { erreur: string };
