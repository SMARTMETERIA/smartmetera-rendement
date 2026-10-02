import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteUtilisateur } from "@/lib/auth/contexte";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReglagesFacturation } from "@/components/admin/ReglagesFacturation";
import { LIBELLES_STATUT_ORGANISATION, type StatutOrganisation } from "@/lib/gardien/facturationOrganisation";
import { dateLocale } from "@/lib/moteur-gardien/temps";
import { quantite } from "@/lib/gardien-envois/format";
import { fuseauPays, monnaiePays } from "@/lib/gardien/pays";
import { symboleMonnaie } from "@/lib/moteur-gardien/economies";

const decimal = (v: number | string | null) => (v == null ? "" : String(Number(v)).replace(".", ","));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Consultation d'une organisation Gardien par le superadmin, chaque
 * ouverture écrite dans le journal d'audit ; seuls le statut et la
 * facturation y sont modifiables (journalisés aussi).
 */
export default async function ConsultationOrganisation({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContexteUtilisateur();
  if (!ctx.isPlatformAdmin) redirect("/accueil");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, nom, status, country, trial_ends_at, founder_discount_pct, withholding_tax_pct, partner_price_per_point")
    .eq("id", id)
    .eq("kind", "sites")
    .maybeSingle();
  if (!org) notFound();
  await supabase.rpc("journaliser_consultation", { p_organization_id: id, p_page: `/admin/organisations/${id}` });

  const [{ data: sites }, { data: fuites }, { data: rapports }] = await Promise.all([
    supabase.from("sites").select("id, name, city, type").eq("organization_id", id).order("name"),
    supabase.from("leak_events").select("site_id").eq("organization_id", id).in("status", ["ouverte", "prise_en_compte"]),
    supabase
      .from("site_reports")
      .select("id, sent_at, opened_at")
      .eq("organization_id", id)
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(50),
  ]);
  const ouverts = (rapports ?? []).filter((r) => r.opened_at).length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-muted-foreground text-sm hover:underline">
          ← Espace superadmin
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{org.nom}</h1>
        <p className="text-muted-foreground text-sm">
          Consultation écrite dans le journal d&apos;audit. Statut :{" "}
          {LIBELLES_STATUT_ORGANISATION[org.status as StatutOrganisation] ?? org.status}.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Statut et facturation</CardTitle>
          <CardDescription>
            Repris dans l&apos;usage mensuel et l&apos;export de facturation. Chaque modification est
            écrite dans le journal d&apos;audit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReglagesFacturation
            organizationId={org.id}
            monnaie={symboleMonnaie(monnaiePays(org.country))}
            initial={{
              statut: org.status,
              finEssai: org.trial_ends_at
                ? dateLocale(Date.parse(org.trial_ends_at), fuseauPays(org.country))
                : "",
              remisePct: decimal(org.founder_discount_pct),
              retenuePct: decimal(org.withholding_tax_pct),
              prixPartenaire: org.partner_price_per_point == null ? "" : decimal(org.partner_price_per_point),
            }}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Sites</CardTitle>
          <CardDescription>
            {quantite((rapports ?? []).length, "rapport envoyé", "rapports envoyés")} récemment, {quantite(ouverts, "ouvert", "ouverts")}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(sites ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucun site.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {(sites ?? []).map((s) => {
                const n = (fuites ?? []).filter((f) => f.site_id === s.id).length;
                return (
                  <li key={s.id}>
                    <Link href={`/sites/${s.id}`} className="hover:bg-muted flex justify-between gap-2 p-3 text-sm">
                      <span className="font-medium">
                        {s.name}
                        {s.city ? ` — ${s.city}` : ""}
                      </span>
                      {n > 0 ? <Badge variant="destructive">{quantite(n, "fuite en cours", "fuites en cours")}</Badge> : <span className="text-muted-foreground">Aucune fuite en cours</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
