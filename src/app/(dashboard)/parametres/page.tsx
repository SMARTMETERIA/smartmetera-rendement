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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrganisationForm } from "@/components/OrganisationForm";
import { RoleSelect } from "@/components/RoleSelect";

const LABEL_TYPE_COMPTEUR: Record<string, string> = {
  production: "Production",
  import: "Import",
  export: "Export",
  sectorisation: "Sectorisation",
  comptage_abonne: "Comptage abonné",
  service: "Service",
};

const LABEL_TYPE_SOURCE: Record<string, string> = {
  export_csv: "Export CSV",
  webhook_lorawan: "Webhook LoRaWAN",
  saisie_manuelle: "Saisie manuelle",
  api: "API",
};

interface MembreOrganisation {
  membership_id: string;
  user_id: string;
  email: string;
  role: string;
  created_at: string;
}

export default async function ParametresPage() {
  const org = await getCurrentOrganization();
  const supabase = await createClient();

  const [
    { data: organisation },
    { data: secteurs },
    { data: compteurs },
    { data: sources },
    { data: membres },
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        "nom, lineaire_reseau_km, nb_abonnes, zone_repartition_eaux, prix_m3_eur",
      )
      .eq("id", org.organizationId)
      .single(),
    supabase
      .from("sectors")
      .select("id, code, nom, nb_abonnes, lineaire_km, actif")
      .eq("organization_id", org.organizationId)
      .order("nom"),
    supabase
      .from("meters")
      .select("id, nom, numero_serie, type, actif")
      .eq("organization_id", org.organizationId)
      .order("nom"),
    supabase
      .from("sources")
      .select("id, nom, type, actif")
      .eq("organization_id", org.organizationId)
      .order("nom"),
    supabase.rpc("membres_organisation", {
      p_organization_id: org.organizationId,
    }),
  ]);

  const peutGererUtilisateurs =
    org.role === "admin_client" || org.role === "superadmin";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>
        <p className="text-muted-foreground text-sm">
          Organisation, secteurs, compteurs, sources, utilisateurs
        </p>
      </div>

      <Tabs defaultValue="organisation">
        <TabsList>
          <TabsTrigger value="organisation">Organisation</TabsTrigger>
          <TabsTrigger value="secteurs">Secteurs</TabsTrigger>
          <TabsTrigger value="compteurs">Compteurs</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="utilisateurs">Utilisateurs</TabsTrigger>
        </TabsList>

        <TabsContent value="organisation" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Informations de l&apos;organisation</CardTitle>
            </CardHeader>
            <CardContent>
              {organisation && (
                <OrganisationForm
                  organizationId={org.organizationId}
                  donneesInitiales={organisation}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="secteurs" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Secteurs</CardTitle>
              <CardDescription>
                Gestion détaillée sur la page Secteurs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead>Abonnés</TableHead>
                    <TableHead>Linéaire</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(secteurs ?? []).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.code}</TableCell>
                      <TableCell>{s.nom}</TableCell>
                      <TableCell>{s.nb_abonnes ?? "—"}</TableCell>
                      <TableCell>
                        {s.lineaire_km ? `${s.lineaire_km} km` : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.actif ? "secondary" : "outline"}>
                          {s.actif ? "Actif" : "Inactif"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compteurs" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Compteurs</CardTitle>
              <CardDescription>
                Liste complète et statut de remontée sur la page Compteurs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>N° série</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(compteurs ?? []).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.nom}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.numero_serie}
                      </TableCell>
                      <TableCell>
                        {LABEL_TYPE_COMPTEUR[c.type] ?? c.type}
                      </TableCell>
                      <TableCell>
                        <Badge variant={c.actif ? "secondary" : "outline"}>
                          {c.actif ? "Actif" : "Inactif"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sources" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Sources de données</CardTitle>
              <CardDescription>
                Exports CSV, webhooks LoRaWAN, saisies manuelles
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(sources ?? []).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.nom}</TableCell>
                      <TableCell>
                        {LABEL_TYPE_SOURCE[s.type] ?? s.type}
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.actif ? "secondary" : "outline"}>
                          {s.actif ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(sources ?? []).length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="text-muted-foreground text-center"
                      >
                        Aucune source pour l&apos;instant.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="utilisateurs" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Utilisateurs</CardTitle>
              <CardDescription>
                Rôles : superadmin (toutes organisations), admin_client, agent,
                lecteur
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead>Membre depuis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {((membres.data ?? []) as MembreOrganisation[]).map((m) => (
                    <TableRow key={m.membership_id}>
                      <TableCell>{m.email}</TableCell>
                      <TableCell>
                        {peutGererUtilisateurs ? (
                          <RoleSelect
                            membershipId={m.membership_id}
                            roleActuel={m.role}
                          />
                        ) : (
                          <Badge variant="outline">{m.role}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {new Date(m.created_at).toLocaleDateString("fr-FR")}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(membres.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="text-muted-foreground text-center"
                      >
                        Aucun utilisateur.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
