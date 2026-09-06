import { createClient } from "@/lib/supabase/server";
import { getCurrentOrganization } from "@/lib/organization";
import { estCompteurMuet } from "@/lib/engine/alertes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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

const LABEL_TYPE: Record<string, string> = {
  production: "Production",
  import: "Import",
  export: "Export",
  sectorisation: "Sectorisation",
  comptage_abonne: "Comptage abonné",
  service: "Service",
};

export default async function CompteursPage() {
  const org = await getCurrentOrganization();
  const supabase = await createClient();

  const [{ data: compteurs }, { data: volumes }] = await Promise.all([
    supabase
      .from("meters")
      .select("id, nom, numero_serie, type, actif, sector_id, sectors(nom)")
      .eq("organization_id", org.organizationId)
      .order("nom"),
    supabase
      .from("daily_meter_volumes")
      .select("meter_id, jour, volume_m3")
      .eq("organization_id", org.organizationId)
      .order("jour", { ascending: false }),
  ]);

  const dernierParCompteur = new Map<
    string,
    { jour: string; volume_m3: number }
  >();
  for (const v of volumes ?? []) {
    if (!dernierParCompteur.has(v.meter_id))
      dernierParCompteur.set(v.meter_id, v);
  }

  const maintenant = new Date();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Compteurs</h1>
        <p className="text-muted-foreground text-sm">
          {compteurs?.length ?? 0} compteur(s)
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Liste des compteurs</CardTitle>
          <CardDescription>
            Statut de remontée et dernier volume connu
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Compteur</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Secteur</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Dernier volume connu</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(compteurs ?? []).map((c) => {
                  const dernier = dernierParCompteur.get(c.id);
                  const dernierJour = dernier
                    ? new Date(`${dernier.jour}T23:59:59Z`)
                    : null;
                  const muet = estCompteurMuet(dernierJour, maintenant);
                  const secteur = c.sectors as unknown as {
                    nom: string;
                  } | null;
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <span className="font-medium">{c.nom}</span>
                        <div className="text-muted-foreground text-xs">
                          {c.numero_serie}
                        </div>
                      </TableCell>
                      <TableCell>{LABEL_TYPE[c.type] ?? c.type}</TableCell>
                      <TableCell>{secteur?.nom ?? "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            !c.actif
                              ? "outline"
                              : muet
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {!c.actif ? "Inactif" : muet ? "Muet" : "Actif"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {dernier ? `${dernier.volume_m3.toFixed(1)} m³` : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {dernier
                          ? new Date(
                              `${dernier.jour}T00:00:00Z`,
                            ).toLocaleDateString("fr-FR", { timeZone: "UTC" })
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
