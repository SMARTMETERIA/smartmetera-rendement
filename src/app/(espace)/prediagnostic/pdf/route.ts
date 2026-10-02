import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getContexteUtilisateur } from "@/lib/auth/contexte";
import { peutPrediagnostic, reglagesPrediagnostic } from "@/lib/gardien/prediagnosticServeur";
import { prediagnostic, validerPrediagnostic, vuePrediagnostic } from "@/lib/gardien/prediagnostic";
import { construirePdfVue } from "@/lib/gardien/rapportPdf";
import { marqueOrganisation } from "@/lib/gardien/marqueOrganisation";
import { MARQUE_PLATEFORME } from "@/lib/marque";
import { limiterDebit } from "@/lib/securite/protection";

/** PDF du pré-diagnostic, à la marque du partenaire (SmartMeteria pour le superadmin). */
export async function GET(request: Request) {
  const ctx = await getContexteUtilisateur();
  if (!peutPrediagnostic(ctx)) return NextResponse.json({ erreur: "Accès réservé." }, { status: 403 });
  const limite = await limiterDebit(`pdf:user:${ctx.userId}`);
  if (limite) return limite;
  const parametres = Object.fromEntries(new URL(request.url).searchParams.entries());
  const validation = validerPrediagnostic(parametres);
  if (!validation.ok) return NextResponse.json({ erreur: validation.erreur }, { status: 400 });
  const { tarifs, debits } = await reglagesPrediagnostic();
  const e = validation.entree;
  const vue = vuePrediagnostic(e, prediagnostic(e, tarifs[e.monnaie] ?? null, debits));
  const marque =
    ctx.adhesion?.kind === "sites"
      ? await marqueOrganisation(await createClient(), ctx.adhesion.organizationId)
      : MARQUE_PLATEFORME;
  const pdf = await construirePdfVue(vue, marque);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="pre-diagnostic.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
