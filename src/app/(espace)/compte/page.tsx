import { getContexteUtilisateur } from "@/lib/auth/contexte";
import { createClient } from "@/lib/supabase/server";
import { TelephoneAlerte } from "@/components/auth/TelephoneAlerte";
import { journalDevActif } from "@/components/auth/AvisJournalDev";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { paysDe } from "@/lib/auth/validation";
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
  const gardien = ctx.adhesion?.kind === "sites" || ctx.adhesionsSite.length > 0;
  let telephone: string | null = null;
  let pays = "FR";
  if (gardien && ctx.userId) {
    const supabase = await createClient();
    const orgId = ctx.adhesion?.kind === "sites" ? ctx.adhesion.organizationId : ctx.adhesionsSite[0]?.organizationId;
    const [{ data: adhesions }, { data: org }] = await Promise.all([
      supabase.from("memberships").select("alert_phone").eq("user_id", ctx.userId).not("alert_phone", "is", null).limit(1),
      supabase.from("organizations").select("country").eq("id", orgId ?? "").maybeSingle(),
    ]);
    telephone = (adhesions?.[0]?.alert_phone as string | undefined) ?? null;
    pays = paysDe(org?.country);
  }

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

      {gardien && (
        <Card>
          <CardHeader>
            <CardTitle>Téléphone d&apos;alerte</CardTitle>
            <CardDescription>
              Pour recevoir les alertes de fuite par SMS, puis un appel (ou un
              message WhatsApp au Maroc) si personne ne s&apos;en occupe.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TelephoneAlerte actuel={telephone} pays={pays} />
          </CardContent>
        </Card>
      )}

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
