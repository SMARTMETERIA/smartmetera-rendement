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
import { RpqsExport } from "@/components/rapports/RpqsExport";
import { RapportDestinataires } from "@/components/rapports/RapportDestinataires";
import { TelechargerRapport } from "@/components/rapports/TelechargerRapport";
import { DeclencherRapportMensuel } from "@/components/rapports/DeclencherRapportMensuel";
import type { DonneesBilanAnnuel } from "@/lib/reports/rpqsExport";

const LABEL_TYPE: Record<string, string> = {
  rpqs: "RPQS",
  sispea: "SISPEA",
  rapport_mensuel: "Rapport mensuel",
  rapport_fuites: "Rapport fuites",
  plan_action: "Plan d'actions",
  autre: "Autre",
};

const MOIS_COURT = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Jun",
  "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc",
];

export default async function RapportsPage() {
  const org = await getCurrentOrganization();
  const supabase = await createClient();
  const peutGerer = org.role === "admin_client" || org.role === "superadmin";

  const [{ data: rapports }, { data: bilansAnnee }, { data: organisation }, { data: destinataires }] =
    await Promise.all([
      supabase
        .from("reports")
        .select("id, type, annee, mois, statut, genere_le, fichier_path")
        .eq("organization_id", org.organizationId)
        .order("genere_le", { ascending: false }),
      supabase
        .from("bilans_calcules")
        .select(
          "periode_fin, rendement, ilp, ilc, v_produit, v_importe, v_exporte, v_mise_en_distribution, v_comptabilise, v_sans_comptage, v_service, v_consomme_autorise, pertes, conforme_decret",
        )
        .eq("organization_id", org.organizationId)
        .eq("type_periode", "annee_civile")
        .order("periode_fin", { ascending: false }),
      supabase
        .from("organizations")
        .select("lineaire_reseau_km, nb_abonnes")
        .eq("id", org.organizationId)
        .single(),
      supabase
        .from("rapport_destinataires")
        .select("id, email, nom, actif")
        .eq("organization_id", org.organizationId)
        .order("created_at"),
    ]);

  const bilansRpqs: DonneesBilanAnnuel[] = (bilansAnnee ?? []).map((b) => ({
    annee: new Date(b.periode_fin).getFullYear(),
    rendement: b.rendement,
    ilp: b.ilp,
    ilc: b.ilc,
    vProduit: b.v_produit,
    vImporte: b.v_importe,
    vExporte: b.v_exporte,
    vMiseEnDistribution: b.v_mise_en_distribution,
    vComptabilise: b.v_comptabilise,
    vSansComptage: b.v_sans_comptage,
    vService: b.v_service,
    vConsommeAutorise: b.v_consomme_autorise,
    pertes: b.pertes,
    lineaireReseauKm: organisation?.lineaire_reseau_km ?? null,
    nbAbonnes: organisation?.nb_abonnes ?? null,
    conformeDecret: b.conforme_decret,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rapports</h1>
          <p className="text-muted-foreground text-sm">
            Rapport mensuel automatique, export RPQS/SISPEA, plan d&apos;actions
          </p>
        </div>
        <BoutonImprimer label="Imprimer la vue d'ensemble" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Export RPQS/SISPEA</CardTitle>
          <CardDescription>
            Indicateurs P104.3 (rendement), P106.3 (ILP), ILC et volumes du
            bilan annuel, en CSV — pense-bête pour la saisie dans
            l&apos;observatoire SISPEA (pas d&apos;import en masse public côté
            SISPEA).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RpqsExport bilans={bilansRpqs} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rapport mensuel automatique</CardTitle>
          <CardDescription>
            Envoyé le 1er de chaque mois aux destinataires actifs ci-dessous
            (page de garde, bilan et rendement vs seuil, secteurs, alertes du
            mois, interventions et m³ récupérés, plan d&apos;actions).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RapportDestinataires
            organizationId={org.organizationId}
            destinataires={destinataires ?? []}
            peutGerer={peutGerer}
          />
          {peutGerer && (
            <DeclencherRapportMensuel supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rapports générés</CardTitle>
          <CardDescription>Historique complet, téléchargeable.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Période</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Généré le</TableHead>
                  <TableHead>Fichier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rapports ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{LABEL_TYPE[r.type] ?? r.type}</TableCell>
                    <TableCell>
                      {r.mois ? `${MOIS_COURT[r.mois - 1]} ` : ""}
                      {r.annee ?? "—"}
                    </TableCell>
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
                    <TableCell>
                      <TelechargerRapport fichierPath={r.fichier_path} />
                    </TableCell>
                  </TableRow>
                ))}
                {(rapports ?? []).length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
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
