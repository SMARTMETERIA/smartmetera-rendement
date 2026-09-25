import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteUtilisateur } from "@/lib/auth/contexte";
import { choisirDestination } from "@/lib/auth/destination";
import { LogoutButton } from "@/components/LogoutButton";

/**
 * Aiguillage après chaque connexion : rattache d'abord les fiches occupant
 * à l'adresse confirmée, puis envoie chacun vers son espace.
 */
export default async function AccueilPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/connexion");

  await supabase.rpc("lier_mes_occupations");
  const ctx = await getContexteUtilisateur();
  const destination = choisirDestination(ctx);
  if (destination) redirect(destination);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Aucun espace pour ce compte</h1>
      <p className="text-muted-foreground text-sm">
        Vous êtes connecté avec {ctx.email}, mais ce compte n&apos;est rattaché à
        aucun espace. Demandez à la personne qui vous a invité de vérifier
        l&apos;adresse utilisée, ou déconnectez-vous pour essayer une autre
        adresse.
      </p>
      <LogoutButton />
    </main>
  );
}
