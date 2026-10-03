import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { FormulaireConnexion } from "@/components/auth/FormulaireConnexion";
import { journalDevActif } from "@/components/auth/AvisJournalDev";
import { EnteteMarque, EnveloppeMarque } from "@/components/marque/EnveloppeMarque";
import { marqueDepuisPreuve } from "@/lib/gardien/marqueOrganisation";
import { NOM_PLATEFORME } from "@/lib/marque";
import { PiedLegal } from "@/components/legal/PiedLegal";

async function marqueDuSlug(slug: string) {
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return null;
  const anonyme = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data } = await anonyme.rpc("marque_publique", { p_slug: slug });
  return data ? marqueDepuisPreuve(data as Record<string, unknown>) : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const marque = await marqueDuSlug((await params).slug);
  return { title: marque ? { absolute: `Connexion — ${marque.nom}` } : "Connexion" };
}

/** Connexion à la marque d'un partenaire (logo, couleurs, nom). */
export default async function ConnexionPartenaire({ params }: { params: Promise<{ slug: string }> }) {
  const marque = await marqueDuSlug((await params).slug);
  if (!marque) notFound();
  return (
    <EnveloppeMarque marque={marque}>
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
        <EnteteMarque marque={marque} taille="grande" />
        <FormulaireConnexion message={null} journalDev={journalDevActif()} />
        {marque.afficherPropulse && (
          <p className="text-muted-foreground text-xs">Propulsé par {NOM_PLATEFORME}</p>
        )}
        <PiedLegal />
      </main>
    </EnveloppeMarque>
  );
}
