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
import { BilanForm } from "@/components/BilanForm";

export default async function BilanPage() {
  const org = await getCurrentOrganization();
  const supabase = await createClient();

  const { data: balances } = await supabase
    .from("balances")
    .select(
      "annee, v_mise_en_distribution, v_consomme_autorise, pertes, rendement, ilp, ilc, seuil_reglementaire, conforme_decret",
    )
    .eq("organization_id", org.organizationId)
    .order("annee", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Bilan d&apos;eau
        </h1>
        <p className="text-muted-foreground text-sm">
          Saisie des volumes annuels — calcul immédiat du rendement
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Saisir / modifier un exercice</CardTitle>
          <CardDescription>
            Vmd = Vproduit + Vimporté − Vexporté · Vca = Vcomptabilisé + sans
            comptage + service
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BilanForm
            organizationId={org.organizationId}
            anneesExistantes={(balances ?? []).map((b) => b.annee)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historique</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exercice</TableHead>
                  <TableHead>Mis en distribution</TableHead>
                  <TableHead>Consommé autorisé</TableHead>
                  <TableHead>Pertes</TableHead>
                  <TableHead>Rendement</TableHead>
                  <TableHead>Seuil</TableHead>
                  <TableHead>Conformité</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(balances ?? []).map((b) => (
                  <TableRow key={b.annee}>
                    <TableCell className="font-medium">{b.annee}</TableCell>
                    <TableCell>
                      {Math.round(b.v_mise_en_distribution).toLocaleString(
                        "fr-FR",
                      )}{" "}
                      m³
                    </TableCell>
                    <TableCell>
                      {Math.round(b.v_consomme_autorise).toLocaleString(
                        "fr-FR",
                      )}{" "}
                      m³
                    </TableCell>
                    <TableCell>
                      {Math.round(b.pertes).toLocaleString("fr-FR")} m³
                    </TableCell>
                    <TableCell>
                      {b.rendement !== null
                        ? `${(b.rendement * 100).toFixed(1)} %`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {b.seuil_reglementaire !== null
                        ? `${(b.seuil_reglementaire * 100).toFixed(1)} %`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {b.conforme_decret !== null && (
                        <Badge
                          variant={
                            b.conforme_decret ? "secondary" : "destructive"
                          }
                        >
                          {b.conforme_decret ? "Conforme" : "Non conforme"}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {(balances ?? []).length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-muted-foreground text-center"
                    >
                      Aucun bilan saisi.
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
