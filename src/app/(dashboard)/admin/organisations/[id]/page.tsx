import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteUtilisateur } from "@/lib/auth/contexte";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Consultation d'une organisation Gardien par le superadmin : lecture
 * seule, chaque ouverture est écrite dans le journal d'audit.
 */
export default async function ConsultationOrganisation({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContexteUtilisateur();
  if (!ctx.isPlatformAdmin) redirect("/accueil");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, nom, status, country, trial_ends_at")
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
          Consultation en lecture seule, écrite dans le journal d&apos;audit. Statut : {org.status}.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Sites</CardTitle>
          <CardDescription>
            {(rapports ?? []).length} rapport(s) envoyé(s) récemment, {ouverts} ouvert(s).
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
                      {n > 0 ? <Badge variant="destructive">{n} fuite(s) en cours</Badge> : <span className="text-muted-foreground">Sous surveillance</span>}
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
