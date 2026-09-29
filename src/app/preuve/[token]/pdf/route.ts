import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { vuePreuve } from "@/lib/gardien-rapports/affichage";
import type { ContenuPagePreuve } from "@/lib/gardien-rapports/contenus";
import { construirePdfVue } from "@/lib/gardien/rapportPdf";
import { marqueDepuisPreuve } from "@/lib/gardien/marqueOrganisation";

/** PDF de la page preuve, sans connexion, par son lien signé non expiré. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{48}$/.test(token)) {
    return NextResponse.json({ erreur: "Lien expiré ou invalide." }, { status: 404 });
  }
  const anonyme = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data } = await anonyme.rpc("page_preuve_publique", { p_token: token });
  if (!data) return NextResponse.json({ erreur: "Lien expiré ou invalide." }, { status: 404 });
  const pdf = await construirePdfVue(
    vuePreuve(data.content as ContenuPagePreuve),
    marqueDepuisPreuve(data.marque as Record<string, unknown> | null),
  );
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="page-preuve.pdf"',
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
