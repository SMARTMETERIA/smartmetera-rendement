// Miroir Deno de src/lib/inboundMail/types.ts (Next.js).
export interface PieceJointe {
  nomFichier: string;
  typeMime: string;
  contenu: Uint8Array;
}

export interface EmailEntrant {
  destinataireBrut: string;
  token: string | null;
  expediteur: string;
  objet: string;
  piecesJointes: PieceJointe[];
}

export type ErreurEnveloppe = { erreur: string };
