import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEspaceSites } from "@/lib/auth/espaces";
import { urlSite } from "@/lib/auth/liens";
import { vueRapport, type ContenuRapport } from "@/lib/gardien-rapports/affichage";
import { VueRapportEcran } from "@/components/rapports/VueRapportEcran";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Lecture d'un rapport de site ; la première ouverture est notée. */
export default async function RapportPage({ params }: { params: Promise<{ id: string }> }) {
  await getEspaceSites();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data: rapport } = await supabase
    .from("site_reports")
    .select("id, kind, period, content")
    .eq("id", id)
    .maybeSingle();
  if (!rapport) notFound();
  await supabase.rpc("marquer_rapport_ouvert", { p_report_id: id });

  const contenu = rapport.content as ContenuRapport;
  const jeton = contenu.type === "fin_pilote" ? contenu.pagePreuve?.token : null;
  const urlPreuve = jeton ? `${urlSite()}/preuve/${jeton}` : null;
  return (
    <VueRapportEcran
      vue={vueRapport(contenu, urlPreuve)}
      actions={
        <div className="flex flex-wrap gap-2">
          <a href={`/rapports/${id}/pdf`} className={cn(buttonVariants({ variant: "outline" }))}>
            Version à imprimer (PDF)
          </a>
          {jeton && (
            <Link href={`/preuve/${jeton}`} className={cn(buttonVariants())}>
              Page à transférer à la direction
            </Link>
          )}
        </div>
      }
    />
  );
}
