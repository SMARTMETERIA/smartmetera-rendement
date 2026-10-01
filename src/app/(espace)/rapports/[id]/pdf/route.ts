import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { urlSite } from "@/lib/auth/liens";
import { vueRapport, type ContenuRapport } from "@/lib/gardien-rapports/affichage";
import { construirePdfVue } from "@/lib/gardien/rapportPdf";
import { marqueOrganisation } from "@/lib/gardien/marqueOrganisation";
import { limiterDebit } from "@/lib/securite/protection";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** PDF d'un rapport de site, à la marque de l'organisation (RLS). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: utilisateur } = await supabase.auth.getUser();
  if (!utilisateur.user) {
    return NextResponse.json({ erreur: "Connectez-vous pour lire ce rapport." }, { status: 401 });
  }
  if (!UUID.test(id)) return NextResponse.json({ erreur: "Rapport introuvable." }, { status: 404 });
  const limite = await limiterDebit(`pdf:user:${utilisateur.user.id}`);
  if (limite) return limite;
  const { data: rapport } = await supabase
    .from("site_reports")
    .select("id, organization_id, kind, period, content")
    .eq("id", id)
    .maybeSingle();
  if (!rapport) return NextResponse.json({ erreur: "Rapport introuvable." }, { status: 404 });

  const contenu = rapport.content as ContenuRapport;
  const jeton = contenu.type === "fin_pilote" ? contenu.pagePreuve?.token : null;
  const vue = vueRapport(contenu, jeton ? `${urlSite()}/preuve/${jeton}` : null);
  const pdf = await construirePdfVue(vue, await marqueOrganisation(supabase, rapport.organization_id));
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="rapport-${rapport.kind}-${rapport.period}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
