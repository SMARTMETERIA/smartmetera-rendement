import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrganization } from "@/lib/organization";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DebitNocturneChart,
  type PointNightline,
} from "@/components/charts/DebitNocturneChart";
import { InterventionForm } from "@/components/InterventionForm";

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
}

const LABEL_TYPE_INTERVENTION: Record<string, string> = {
  recherche_fuite: "Recherche de fuite",
  reparation: "Réparation",
  releve_manuel: "Relevé manuel",
  maintenance_compteur: "Maintenance compteur",
  autre: "Autre",
};

const LABEL_STATUT_INTERVENTION: Record<string, string> = {
  planifiee: "Planifiée",
  en_cours: "En cours",
  terminee: "Terminée",
  annulee: "Annulée",
};

export default async function SecteurDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const org = await getCurrentOrganization();
  const supabase = await createClient();

  const { data: secteur } = await supabase
    .from("sectors")
    .select("id, code, nom, nb_abonnes, lineaire_km, actif")
    .eq("id", id)
    .eq("organization_id", org.organizationId)
    .maybeSingle();

  if (!secteur) notFound();

  const [{ data: nightlines }, { data: alertes }, { data: interventions }] =
    await Promise.all([
      supabase
        .from("nightlines")
        .select(
          "nuit_date, debit_min_nocturne_m3h, baseline_m3h, volume_fuite_estime_m3j",
        )
        .eq("sector_id", id)
        .order("nuit_date", { ascending: false })
        .limit(60),
      supabase
        .from("alerts")
        .select("id, type, severite, statut, titre, description, declenchee_le")
        .eq("sector_id", id)
        .order("declenchee_le", { ascending: false }),
      supabase
        .from("interventions")
        .select(
          "id, type, statut, planifiee_le, terminee_le, resultat, volume_recupere_m3j, created_at",
        )
        .eq("sector_id", id)
        .order("created_at", { ascending: false }),
    ]);

  const donneesGraphique: PointNightline[] = [...(nightlines ?? [])]
    .reverse()
    .map((n) => ({
      date: formatDate(n.nuit_date),
      dmn: n.debit_min_nocturne_m3h,
      baseline: n.baseline_m3h,
    }));

  const derniere = nightlines?.[0] ?? null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/secteurs"
          className="text-muted-foreground text-sm hover:underline"
        >
          ← Secteurs
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{secteur.nom}</h1>
        <p className="text-muted-foreground text-sm">
          {secteur.code} · {secteur.nb_abonnes ?? "—"} abonnés ·{" "}
          {secteur.lineaire_km ?? "—"} km
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>
              Débit min. nocturne (dernière nuit)
            </CardDescription>
            <CardTitle className="text-2xl">
              {derniere
                ? `${derniere.debit_min_nocturne_m3h.toFixed(1)} m³/h`
                : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Baseline (médiane 14 nuits)</CardDescription>
            <CardTitle className="text-2xl">
              {derniere?.baseline_m3h
                ? `${derniere.baseline_m3h.toFixed(1)} m³/h`
                : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Fuite estimée</CardDescription>
            <CardTitle className="text-2xl">
              {derniere
                ? `${derniere.volume_fuite_estime_m3j.toFixed(0)} m³/j`
                : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Débit de nuit — 60 derniers jours</CardTitle>
          <CardDescription>
            Débit minimum nocturne (2h-4h) et baseline
          </CardDescription>
        </CardHeader>
        <CardContent>
          {donneesGraphique.length > 0 ? (
            <DebitNocturneChart donnees={donneesGraphique} />
          ) : (
            <p className="text-muted-foreground text-sm">
              Pas encore de données de débit de nuit pour ce secteur.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Alertes du secteur</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(alertes ?? []).length === 0 && (
              <p className="text-muted-foreground text-sm">Aucune alerte.</p>
            )}
            {(alertes ?? []).map((a) => (
              <div key={a.id} className="rounded-lg border p-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{a.titre}</span>
                  <Badge
                    variant={a.statut === "ouverte" ? "destructive" : "outline"}
                  >
                    {a.statut}
                  </Badge>
                </div>
                {a.description && (
                  <p className="text-muted-foreground mt-1 text-xs">
                    {a.description}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Interventions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(interventions ?? []).length === 0 && (
              <p className="text-muted-foreground text-sm">
                Aucune intervention enregistrée.
              </p>
            )}
            {(interventions ?? []).map((i) => (
              <div key={i.id} className="rounded-lg border p-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {LABEL_TYPE_INTERVENTION[i.type] ?? i.type}
                  </span>
                  <Badge variant="outline">
                    {LABEL_STATUT_INTERVENTION[i.statut] ?? i.statut}
                  </Badge>
                </div>
                {i.resultat && (
                  <p className="text-muted-foreground mt-1 text-xs">
                    {i.resultat}
                  </p>
                )}
                {i.volume_recupere_m3j !== null && (
                  <p className="text-muted-foreground mt-1 text-xs">
                    Volume récupéré : {i.volume_recupere_m3j} m³/j
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nouvelle intervention</CardTitle>
          <CardDescription>
            Planifier ou enregistrer une intervention sur ce secteur
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InterventionForm
            organizationId={org.organizationId}
            sectorId={secteur.id}
          />
        </CardContent>
      </Card>
    </div>
  );
}
