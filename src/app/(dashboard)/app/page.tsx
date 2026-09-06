import Link from "next/link";
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
import { Button } from "@/components/ui/button";
import { BoutonImprimer } from "@/components/BoutonImprimer";
import {
  TendanceRendementChart,
  type PointTendance,
} from "@/components/charts/TendanceRendementChart";

function estFinDeMois(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00Z`);
  const lendemain = new Date(d);
  lendemain.setUTCDate(d.getUTCDate() + 1);
  return lendemain.getUTCDate() === 1;
}

function formatMois(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function formatEuros(valeur: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(valeur);
}

export default async function VueEnsemblePage() {
  const org = await getCurrentOrganization();
  const supabase = await createClient();

  const [
    { data: bilanRows },
    { data: orgRow },
    { data: secteurs },
    { data: nightlinesRecentes },
    { data: alertesOuvertes, count: nbAlertesOuvertes },
  ] = await Promise.all([
    supabase
      .from("bilans_calcules")
      .select(
        "periode_fin, rendement, ilp, ilc, seuil_reglementaire, distance_seuil, conforme_decret, pertes, v_produit",
      )
      .eq("organization_id", org.organizationId)
      .eq("type_periode", "glissant_12m")
      .order("periode_fin", { ascending: false })
      .limit(60),
    supabase
      .from("organizations")
      .select("prix_m3_eur")
      .eq("id", org.organizationId)
      .single(),
    supabase
      .from("sectors")
      .select("id, nom, nb_abonnes")
      .eq("organization_id", org.organizationId),
    supabase
      .from("nightlines")
      .select(
        "sector_id, nuit_date, debit_min_nocturne_m3h, baseline_m3h, volume_fuite_estime_m3j",
      )
      .eq("organization_id", org.organizationId)
      .order("nuit_date", { ascending: false }),
    supabase
      .from("alerts")
      .select("id, type, severite, titre, declenchee_le, sector_id", {
        count: "exact",
      })
      .eq("organization_id", org.organizationId)
      .eq("statut", "ouverte")
      .order("declenchee_le", { ascending: false })
      .limit(6),
  ]);

  const pointsMensuels = (bilanRows ?? [])
    .filter((r) => estFinDeMois(r.periode_fin))
    .slice(0, 12)
    .reverse();
  const dernierBilan = pointsMensuels.at(-1) ?? bilanRows?.[0] ?? null;

  const donneesGraphique: PointTendance[] = pointsMensuels.map((r) => ({
    mois: formatMois(r.periode_fin),
    rendementPct: Math.round((r.rendement ?? 0) * 1000) / 10,
    seuilPct: Math.round((r.seuil_reglementaire ?? 0) * 1000) / 10,
  }));

  // Dernière nightline connue par secteur -> classement par fuite estimée.
  const derniereParSecteur = new Map<
    string,
    NonNullable<typeof nightlinesRecentes>[number]
  >();
  for (const n of nightlinesRecentes ?? []) {
    if (!derniereParSecteur.has(n.sector_id))
      derniereParSecteur.set(n.sector_id, n);
  }
  const secteursAvecFuite = (secteurs ?? [])
    .map((s) => ({
      secteur: s,
      nightline: derniereParSecteur.get(s.id) ?? null,
    }))
    .sort(
      (a, b) =>
        (b.nightline?.volume_fuite_estime_m3j ?? 0) -
        (a.nightline?.volume_fuite_estime_m3j ?? 0),
    )
    .slice(0, 3);

  const prixM3 = orgRow?.prix_m3_eur ?? 2;
  const fuiteAnnuelleTotaleM3 = [...derniereParSecteur.values()].reduce(
    (somme, n) => somme + (n?.volume_fuite_estime_m3j ?? 0) * 365,
    0,
  );
  const economiesEstimees = fuiteAnnuelleTotaleM3 * prixM3;

  const rendementPct = dernierBilan
    ? (dernierBilan.rendement ?? 0) * 100
    : null;
  const seuilPct = dernierBilan
    ? (dernierBilan.seuil_reglementaire ?? 0) * 100
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Vue d&apos;ensemble
          </h1>
          <p className="text-muted-foreground text-sm">
            {org.organizationName}
          </p>
        </div>
        <div className="no-print flex items-center gap-2">
          <BoutonImprimer />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Rendement de réseau</CardDescription>
            <CardTitle className="text-3xl">
              {rendementPct !== null ? `${rendementPct.toFixed(1)} %` : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dernierBilan && (
              <Badge
                variant={
                  dernierBilan.conforme_decret ? "secondary" : "destructive"
                }
              >
                {dernierBilan.conforme_decret ? "Conforme" : "Non conforme"}
              </Badge>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Seuil décret 2012-97</CardDescription>
            <CardTitle className="text-3xl">
              {seuilPct !== null ? `${seuilPct.toFixed(1)} %` : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-muted-foreground text-sm">
              {dernierBilan
                ? `Distance : ${((dernierBilan.distance_seuil ?? 0) * 100).toFixed(1)} pt`
                : "Aucun bilan calculé"}
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>ILP (indice linéaire de pertes)</CardDescription>
            <CardTitle className="text-3xl">
              {dernierBilan ? dernierBilan.ilp?.toFixed(2) : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-muted-foreground text-sm">m³/km/j</span>
          </CardContent>
        </Card>

        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardDescription>
              Économies estimées grâce à la détection
            </CardDescription>
            <CardTitle className="text-3xl">
              {formatEuros(economiesEstimees)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-muted-foreground text-xs">
              Valeur annualisée des fuites détectées par secteur, à{" "}
              {prixM3.toFixed(2).replace(".", ",")} €/m³
            </span>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Tendance du rendement (glissant 12 mois)</CardTitle>
            <CardDescription>
              Rendement mesuré vs seuil réglementaire, mois par mois
            </CardDescription>
          </CardHeader>
          <CardContent>
            {donneesGraphique.length > 0 ? (
              <TendanceRendementChart donnees={donneesGraphique} />
            ) : (
              <p className="text-muted-foreground text-sm">
                Pas encore assez de données pour tracer une tendance.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top 3 secteurs à pertes</CardTitle>
            <CardDescription>
              D&apos;après la dernière nuit calculée
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {secteursAvecFuite.length === 0 && (
              <p className="text-muted-foreground text-sm">Aucun secteur.</p>
            )}
            {secteursAvecFuite.map(({ secteur, nightline }) => (
              <Link
                key={secteur.id}
                href={`/secteurs/${secteur.id}`}
                className="hover:bg-muted flex items-center justify-between rounded-lg border p-2.5 text-sm transition-colors"
              >
                <span className="font-medium">{secteur.nom}</span>
                <span className="text-muted-foreground">
                  {nightline
                    ? `${nightline.volume_fuite_estime_m3j.toFixed(0)} m³/j estimés`
                    : "pas de donnée"}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                Alertes ouvertes{" "}
                {nbAlertesOuvertes ? `(${nbAlertesOuvertes})` : ""}
              </CardTitle>
              <CardDescription>À traiter en priorité</CardDescription>
            </div>
            <Button
              className="no-print"
              variant="outline"
              size="sm"
              render={<Link href="/alertes">Voir toutes les alertes</Link>}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {(alertesOuvertes ?? []).length === 0 && (
            <p className="text-muted-foreground text-sm">
              Aucune alerte ouverte.
            </p>
          )}
          {(alertesOuvertes ?? []).map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm"
            >
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    a.severite === "haute" || a.severite === "critique"
                      ? "destructive"
                      : "outline"
                  }
                >
                  {a.severite}
                </Badge>
                <span>{a.titre}</span>
              </div>
              <span className="text-muted-foreground text-xs">
                {new Date(a.declenchee_le).toLocaleDateString("fr-FR")}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
