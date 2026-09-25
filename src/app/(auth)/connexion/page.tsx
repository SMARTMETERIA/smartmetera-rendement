import Link from "next/link";
import { FormulaireConnexion } from "@/components/auth/FormulaireConnexion";
import { journalDevActif } from "@/components/auth/AvisJournalDev";

const MESSAGES_ERREUR: Record<string, string> = {
  lien_invalide:
    "Ce lien n'est plus valable (déjà utilisé ou expiré). Demandez-en un nouveau ci-dessous.",
  google: "La connexion avec Google n'a pas abouti. Réessayez ou utilisez votre adresse e-mail.",
};

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; compte?: string }>;
}) {
  const { erreur, compte } = await searchParams;
  const message =
    compte === "supprime"
      ? "Votre compte a été supprimé."
      : erreur
        ? (MESSAGES_ERREUR[erreur] ?? MESSAGES_ERREUR.lien_invalide)
        : null;

  return (
    <>
      <FormulaireConnexion message={message} journalDev={journalDevActif()} />
      <div className="text-muted-foreground max-w-sm space-y-2 text-center text-sm">
        <p>
          Installateur, plombier ou prestataire de comptage ?{" "}
          <Link href="/inscription" className="text-foreground underline underline-offset-4">
            Créer un compte partenaire
          </Link>
        </p>
        <p>
          <Link href="/roi" className="underline underline-offset-4">
            Calculateur de rendement et de retour sur investissement
          </Link>{" "}
          (sans compte)
        </p>
      </div>
    </>
  );
}
