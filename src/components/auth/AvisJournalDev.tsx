import Link from "next/link";

/**
 * En développement, les e-mails ne partent pas : ils sont lisibles sur
 * /dev/emails. Rappel affiché sous les formulaires qui envoient un e-mail.
 */
export function AvisJournalDev({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-sm">
      Mode test : aucun e-mail ne part vraiment. Ouvrez la{" "}
      <Link href="/dev/emails" className="text-foreground underline underline-offset-4">
        boîte de réception de test
      </Link>{" "}
      pour cliquer sur le lien.
    </p>
  );
}

export function journalDevActif(): boolean {
  return (
    process.env.NODE_ENV !== "production" && !process.env.EMAIL_DEV_REDIRECT
  );
}
