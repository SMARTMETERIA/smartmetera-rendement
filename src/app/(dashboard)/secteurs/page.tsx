import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrganization } from "@/lib/organization";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function SecteursPage() {
  const org = await getCurrentOrganization();
  const supabase = await createClient();

  const [{ data: secteurs }, { data: nightlines }] = await Promise.all([
    supabase
      .from("sectors")
      .select("id, code, nom, nb_abonnes, lineaire_km, actif")
      .eq("organization_id", org.organizationId)
      .order("nom"),
    supabase
      .from("nightlines")
      .select(
        "sector_id, nuit_date, debit_min_nocturne_m3h, baseline_m3h, volume_fuite_estime_m3j",
      )
      .eq("organization_id", org.organizationId)
      .order("nuit_date", { ascending: false }),
  ]);

  const derniereParSecteur = new Map<
    string,
    NonNullable<typeof nightlines>[number]
  >();
  for (const n of nightlines ?? []) {
    if (!derniereParSecteur.has(n.sector_id))
      derniereParSecteur.set(n.sector_id, n);
  }

  const lignes = (secteurs ?? [])
    .map((s) => ({
      secteur: s,
      nightline: derniereParSecteur.get(s.id) ?? null,
    }))
    .sort(
      (a, b) =>
        (b.nightline?.volume_fuite_estime_m3j ?? 0) -
        (a.nightline?.volume_fuite_estime_m3j ?? 0),
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Secteurs</h1>
        <p className="text-muted-foreground text-sm">
          Classement par fuite estimée, dernière nuit calculée
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Classement</CardTitle>
          <CardDescription>{lignes.length} secteur(s)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Secteur</TableHead>
                  <TableHead>Abonnés</TableHead>
                  <TableHead>Linéaire</TableHead>
                  <TableHead>Débit min. nocturne</TableHead>
                  <TableHead>Baseline</TableHead>
                  <TableHead>Fuite estimée</TableHead>
                  <TableHead>Dernière nuit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lignes.map(({ secteur, nightline }) => (
                  <TableRow key={secteur.id}>
                    <TableCell>
                      <Link
                        href={`/secteurs/${secteur.id}`}
                        className="text-primary font-medium hover:underline"
                      >
                        {secteur.nom}
                      </Link>
                      <div className="text-muted-foreground text-xs">
                        {secteur.code}
                      </div>
                    </TableCell>
                    <TableCell>{secteur.nb_abonnes ?? "—"}</TableCell>
                    <TableCell>
                      {secteur.lineaire_km ? `${secteur.lineaire_km} km` : "—"}
                    </TableCell>
                    <TableCell>
                      {nightline
                        ? `${nightline.debit_min_nocturne_m3h.toFixed(1)} m³/h`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {nightline?.baseline_m3h
                        ? `${nightline.baseline_m3h.toFixed(1)} m³/h`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {nightline ? (
                        <Badge
                          variant={
                            nightline.volume_fuite_estime_m3j > 400
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {nightline.volume_fuite_estime_m3j.toFixed(0)} m³/j
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {nightline
                        ? new Date(
                            `${nightline.nuit_date}T00:00:00Z`,
                          ).toLocaleDateString("fr-FR", { timeZone: "UTC" })
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
