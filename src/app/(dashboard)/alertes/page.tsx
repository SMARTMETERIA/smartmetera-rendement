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
import { AlerteActions } from "@/components/AlerteActions";

const LABEL_TYPE: Record<string, string> = {
  fuite_suspectee: "Fuite suspectée",
  depassement_dmn: "Dépassement DMN",
  anomalie_comptage: "Anomalie de comptage",
  import_echec: "Échec d'import",
  compteur_muet: "Compteur muet",
  debit_inverse: "Débit inversé",
  index_anormal: "Index anormal",
};

export default async function AlertesPage() {
  const org = await getCurrentOrganization();
  const supabase = await createClient();

  const { data: alertes } = await supabase
    .from("alerts")
    .select(
      "id, type, severite, statut, titre, description, declenchee_le, sectors(nom)",
    )
    .eq("organization_id", org.organizationId)
    .order("declenchee_le", { ascending: false })
    .limit(200);

  const nbOuvertes = (alertes ?? []).filter(
    (a) => a.statut === "ouverte",
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Alertes</h1>
        <p className="text-muted-foreground text-sm">
          {nbOuvertes} ouverte(s) sur {alertes?.length ?? 0}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>File des alertes</CardTitle>
          <CardDescription>Les plus récentes en premier</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Alerte</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Secteur</TableHead>
                  <TableHead>Sévérité</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Déclenchée le</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(alertes ?? []).map((a) => {
                  const secteur = a.sectors as unknown as {
                    nom: string;
                  } | null;
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="max-w-64">
                        <span className="font-medium">{a.titre}</span>
                        {a.description && (
                          <p className="text-muted-foreground text-xs">
                            {a.description}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>{LABEL_TYPE[a.type] ?? a.type}</TableCell>
                      <TableCell>{secteur?.nom ?? "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            a.severite === "haute" || a.severite === "critique"
                              ? "destructive"
                              : "outline"
                          }
                        >
                          {a.severite}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            a.statut === "ouverte"
                              ? "destructive"
                              : a.statut === "acquittee"
                                ? "outline"
                                : "secondary"
                          }
                        >
                          {a.statut}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {new Date(a.declenchee_le).toLocaleString("fr-FR")}
                      </TableCell>
                      <TableCell>
                        <AlerteActions
                          alerteId={a.id}
                          statut={a.statut}
                          userId={org.userId}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(alertes ?? []).length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-muted-foreground text-center"
                    >
                      Aucune alerte.
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
