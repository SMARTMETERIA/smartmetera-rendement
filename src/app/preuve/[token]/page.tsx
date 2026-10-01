import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { vuePreuve } from "@/lib/gardien-rapports/affichage";
import type { ContenuPagePreuve } from "@/lib/gardien-rapports/contenus";
import { marqueDepuisPreuve } from "@/lib/gardien/marqueOrganisation";
import { NOM_PLATEFORME } from "@/lib/marque";
import { VueRapportEcran } from "@/components/rapports/VueRapportEcran";
import {
  EnteteMarque,
  EnveloppeMarque,
} from "@/components/marque/EnveloppeMarque";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PiedLegal } from "@/components/legal/PiedLegal";
import {
  adresseIpAppelant,
  consommerQuota,
  MESSAGE_TROP_DE_DEMANDES,
} from "@/lib/securite/protection";

export const metadata: Metadata = {
  title: "Ce que la surveillance a trouvé",
  robots: { index: false, follow: false },
};

/**
 * Page preuve : lisible sans connexion par son lien signé, tant qu'il n'a
 * pas expiré. Aucune donnée personnelle. Pensée pour être transférée.
 */
export default async function PagePreuve({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!(await consommerQuota(`preuve:ip:${await adresseIpAppelant()}`, 60, 10 * 60))) {
    return (
      <main className="mx-auto max-w-xl space-y-3 px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Page momentanément indisponible</h1>
        <p className="text-muted-foreground">{MESSAGE_TROP_DE_DEMANDES}</p>
      </main>
    );
  }
  const anonyme = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false },
    },
  );
  const { data } = /^[0-9a-f]{48}$/.test(token)
    ? await anonyme.rpc("page_preuve_publique", { p_token: token })
    : { data: null };

  if (!data) {
    return (
      <main className="mx-auto max-w-xl space-y-3 px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Lien expiré ou invalide</h1>
        <p className="text-muted-foreground">
          Demandez un nouveau lien à la personne qui vous l&apos;a transmis.
        </p>
      </main>
    );
  }
  const marque = marqueDepuisPreuve(
    data.marque as Record<string, unknown> | null,
  );
  return (
    <EnveloppeMarque marque={marque}>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <EnteteMarque marque={marque} />
        </div>
        <VueRapportEcran
          vue={vuePreuve(data.content as ContenuPagePreuve)}
          actions={
            <a
              href={`/preuve/${token}/pdf`}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Télécharger en PDF
            </a>
          }
        />
        {marque.afficherPropulse && (
          <p className="text-muted-foreground mt-8 text-xs">
            Propulsé par {NOM_PLATEFORME}
          </p>
        )}
        <PiedLegal className="mt-8" />
      </main>
    </EnveloppeMarque>
  );
}
