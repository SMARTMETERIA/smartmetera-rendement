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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BoutonImprimer } from "@/components/BoutonImprimer";

const LABEL_TYPE: Record<string, string> = {
  rpqs: "RPQS",
  sispea: "SISPEA",
  rapport_mensuel: "Rapport mensuel",
  rapport_fuites: "Rapport fuites",
  autre: "Autre",
};

export default async function RapportsPage() {
  const org = await getCurrentOrganization();
  const supabase = await createClient();

  const { data: rapports } = await supabase
    .from("reports")
    .select("id, type, annee, statut, genere_le")
    .eq("organization_id", org.organizationId)
    .order("genere_le", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rapports</h1>
          <p className="text-muted-foreground text-sm">
            RPQS, SISPEA et exports
          </p>
        </div>
        <BoutonImprimer label="Exporter la vue d'ensemble en PDF" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rapports générés</CardTitle>
          <CardDescription>
            Le bouton ci-dessus imprime la page « Vue d&apos;ensemble » au
            format PDF via votre navigateur (Enregistrer au format PDF dans la
            boîte de dialogue d&apos;impression).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Exercice</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Généré le</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rapports ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{LABEL_TYPE[r.type] ?? r.type}</TableCell>
                    <TableCell>{r.annee ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.statut === "genere"
                            ? "secondary"
                            : r.statut === "echec"
                              ? "destructive"
                              : "outline"
                        }
                      >
                        {r.statut}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(r.genere_le).toLocaleDateString("fr-FR")}
                    </TableCell>
                  </TableRow>
                ))}
                {(rapports ?? []).length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-muted-foreground text-center"
                    >
                      Aucun rapport généré pour l&apos;instant.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
