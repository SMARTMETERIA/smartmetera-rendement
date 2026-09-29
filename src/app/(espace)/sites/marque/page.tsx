import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEspaceSites } from "@/lib/auth/espaces";
import { urlSite } from "@/lib/auth/liens";
import { COLONNES_MARQUE } from "@/lib/gardien/marqueOrganisation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormulaireMarque } from "@/components/marque/FormulaireMarque";

/**
 * Marque de l'organisation (administrateur) : utilisée partout, écrans,
 * e-mails, SMS, PDF, pages preuve et pré-diagnostics.
 */
export default async function MarquePage() {
  const ctx = await getEspaceSites();
  if (ctx.adhesion?.kind !== "sites" || ctx.adhesion.role !== "admin_client") redirect("/sites");
  const supabase = await createClient();
  const orgId = ctx.adhesion.organizationId;
  const [{ data: b }, { data: org }] = await Promise.all([
    supabase.from("org_branding").select(COLONNES_MARQUE).eq("organization_id", orgId).maybeSingle(),
    supabase.from("organizations").select("slug").eq("id", orgId).maybeSingle(),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ma marque</h1>
        <p className="text-muted-foreground text-sm">
          Vos clients voient votre nom, votre logo et vos couleurs : écrans, e-mails, SMS, rapports, pages
          preuve et pré-diagnostics.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Identité</CardTitle>
          {org?.slug && (
            <CardDescription>
              Page de connexion à votre marque : {urlSite()}/p/{org.slug}/connexion
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <FormulaireMarque
            organisationId={orgId}
            propulse={b?.show_powered_by ?? true}
            initiale={{
              nomAffiche: b?.display_name ?? ctx.adhesion.organizationName,
              couleur: b?.primary_color ?? "",
              accent: b?.accent_color ?? "",
              logo: b?.logo_path ?? null,
              expediteur: b?.sender_name ?? "",
              repondreA: b?.reply_to_email ?? "",
              piedDePage: b?.legal_footer ?? "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
