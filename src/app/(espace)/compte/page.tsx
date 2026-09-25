import { getContexteUtilisateur } from "@/lib/auth/contexte";
import { journalDevActif } from "@/components/auth/AvisJournalDev";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ChangerAdresse,
  ChangerMotDePasse,
  SupprimerCompte,
} from "@/components/auth/FormulairesCompte";

export default async function ComptePage({
  searchParams,
}: {
  searchParams: Promise<{ adresse?: string }>;
}) {
  const ctx = await getContexteUtilisateur();
  const { adresse } = await searchParams;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mon compte</h1>
        <p className="text-muted-foreground text-sm">Connecté avec {ctx.email}.</p>
      </div>

      {adresse === "modifiee" && (
        <Alert>
          <AlertDescription>
            Confirmation enregistrée. Si vous avez cliqué sur les deux liens,
            votre nouvelle adresse est active.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Adresse e-mail</CardTitle>
          <CardDescription>
            L&apos;adresse qui sert à vous connecter et à recevoir les liens.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangerAdresse journalDev={journalDevActif()} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mot de passe</CardTitle>
          <CardDescription>
            Facultatif si vous vous connectez par lien : choisissez-en un pour
            vous connecter sans attendre d&apos;e-mail.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangerMotDePasse />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Supprimer mon compte</CardTitle>
          <CardDescription>
            Définitif. Vos accès disparaissent ; les données de votre
            organisation restent en place pour vos collègues.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SupprimerCompte />
        </CardContent>
      </Card>
    </div>
  );
}
