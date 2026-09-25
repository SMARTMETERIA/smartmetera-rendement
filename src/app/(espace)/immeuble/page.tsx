import { createClient } from "@/lib/supabase/server";
import { getEspacePartenaire } from "@/lib/auth/espaces";
import { LIBELLES_ROLE } from "@/lib/auth/destination";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const FORMAT_DATE = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeZone: "Europe/Paris",
});

/**
 * Accueil de l'espace partenaire. Version minimale (phase 2) : le tableau
 * de bord complet et le parcours de démarrage arrivent en phase 7.
 */
export default async function ImmeublePage() {
  const ctx = await getEspacePartenaire();
  const supabase = await createClient();
  const orgId = ctx.adhesion.organizationId;

  const [{ count: nbImmeubles }, { count: nbLogements }, { count: nbClients }] =
    await Promise.all([
      supabase
        .from("buildings")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId),
      supabase
        .from("units")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId),
      supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId),
    ]);

  const essai = ctx.adhesion.status === "essai";
  const finEssai = ctx.adhesion.trialEndsAt
    ? FORMAT_DATE.format(new Date(ctx.adhesion.trialEndsAt))
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {ctx.adhesion.organizationName}
        </h1>
        <p className="text-muted-foreground text-sm">
          Connecté en tant que {LIBELLES_ROLE[ctx.adhesion.role] ?? ctx.adhesion.role}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {essai
              ? "Période d'essai"
              : ctx.adhesion.status === "actif"
                ? "Compte actif"
                : "Compte suspendu"}
          </CardTitle>
          <CardDescription>
            {essai
              ? `Essai gratuit jusqu'au ${finEssai ?? "—"}. Les relevés ne seront envoyés aux occupants qu'après activation de votre compte par SmartMetera.`
              : ctx.adhesion.status === "actif"
                ? "Votre compte est activé."
                : "Contactez SmartMetera pour réactiver votre compte."}
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { libelle: "Clients", valeur: nbClients ?? 0 },
          { libelle: "Immeubles", valeur: nbImmeubles ?? 0 },
          { libelle: "Logements", valeur: nbLogements ?? 0 },
        ].map((indicateur) => (
          <Card key={indicateur.libelle}>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-sm">{indicateur.libelle}</p>
              <p className="text-3xl font-semibold tabular-nums">
                {indicateur.valeur.toLocaleString("fr-FR")}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
