import { createClient } from "@/lib/supabase/server";
import { getEspaceSites, organisationEspaceSites } from "@/lib/auth/espaces";
import { LIBELLES_TYPE_SITE, type TypeSite } from "@/lib/gardien/libelles";
import { REGLAGES_PAYS } from "@/lib/gardien/pays";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NouveauSite } from "@/components/sites/NouveauSite";

/**
 * Espace Gardien de l'eau : les sites accessibles. Version minimale
 * (phase G2) ; le tableau de bord de chaque site arrive en phase G6.
 */
export default async function SitesPage() {
  const ctx = await getEspaceSites();
  const supabase = await createClient();
  const { organizationId, organizationName } = organisationEspaceSites(ctx);
  const adhesion = ctx.adhesion?.kind === "sites" ? ctx.adhesion : null;
  const peutAjouter =
    adhesion !== null && ["admin_client", "agent"].includes(adhesion.role);

  let requeteSites = supabase
    .from("sites")
    .select("id, name, type, city, country, active")
    .order("name");
  requeteSites = adhesion
    ? requeteSites.eq("organization_id", organizationId)
    : requeteSites.in(
        "id",
        ctx.adhesionsSite.map((a) => a.siteId),
      );

  const [{ data: sites }, { data: org }] = await Promise.all([
    requeteSites,
    supabase
      .from("organizations")
      .select("country, status, trial_ends_at")
      .eq("id", organizationId)
      .maybeSingle(),
  ]);
  const pays = org?.country === "MA" ? "MA" : "FR";
  const finEssai =
    org?.status === "essai" && org.trial_ends_at
      ? new Intl.DateTimeFormat("fr-FR", {
          dateStyle: "long",
          timeZone: REGLAGES_PAYS[pays].fuseau,
        }).format(new Date(org.trial_ends_at))
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mes sites</h1>
        <p className="text-muted-foreground text-sm">
          {organizationName}
          {finEssai && ` — essai gratuit jusqu'au ${finEssai}`}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sites</CardTitle>
          <CardDescription>
            Chaque site a son fuseau horaire et sa monnaie : la nuit, les
            alertes et les rapports suivent l&apos;heure locale.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {peutAjouter && <NouveauSite paysParDefaut={pays} />}
          {(sites ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {peutAjouter
                ? "Aucun site pour l'instant. Ajoutez votre premier site ci-dessus."
                : "Aucun site ne vous est encore attribué."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Ville</TableHead>
                  <TableHead>Pays</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(sites ?? []).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      {s.name}
                      {!s.active && (
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          (désactivé)
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {LIBELLES_TYPE_SITE[s.type as TypeSite] ?? s.type}
                    </TableCell>
                    <TableCell>{s.city ?? "—"}</TableCell>
                    <TableCell>
                      {REGLAGES_PAYS[s.country as "FR" | "MA"]?.libelle ??
                        s.country}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
