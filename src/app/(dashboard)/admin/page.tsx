import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrganization } from "@/lib/organization";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrganisationsPanel } from "@/components/admin/OrganisationsPanel";
import { ImporterFicheCollecte } from "@/components/admin/ImporterFicheCollecte";
import { InviterUtilisateur } from "@/components/admin/InviterUtilisateur";
import { ModelesSourcesPanel } from "@/components/admin/ModelesSourcesPanel";
import { ChecklistActivation } from "@/components/admin/ChecklistActivation";
import { JournalAudit } from "@/components/admin/JournalAudit";

export default async function AdminPage() {
  const org = await getCurrentOrganization();
  if (org.role !== "superadmin") {
    redirect("/app");
  }

  const supabase = await createClient();

  const [
    { data: organisations },
    { data: modeles },
    { data: sourcesEmail },
    { data: checklistItems },
    { data: checklistSuivi },
    { data: audit },
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, nom, lineaire_reseau_km, nb_abonnes, zone_repartition_eaux, prix_m3_eur, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("import_templates")
      .select("id, nom, is_system, organization_id")
      .order("nom"),
    supabase
      .from("sources")
      .select("id, nom, organization_id, default_template_id, organizations(nom)")
      .eq("type", "email_entrant")
      .order("nom"),
    supabase
      .from("checklist_activation_items")
      .select("id, jour, ordre, titre, description")
      .order("jour")
      .order("ordre"),
    supabase.from("checklist_activation_suivi").select("organization_id, item_id, fait, fait_le"),
    supabase
      .from("audit_log")
      .select("id, organization_id, user_id, action, entite, entite_id, created_at, organizations(nom)")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Espace superadmin</h1>
        <p className="text-muted-foreground text-sm">
          Onboarding client : organisations, fiche de collecte, invitations,
          modèles de sources, checklist d&apos;activation J0-J5, journal
          d&apos;audit.
        </p>
      </div>

      <Tabs defaultValue="organisations">
        <TabsList>
          <TabsTrigger value="organisations">Organisations</TabsTrigger>
          <TabsTrigger value="fiche">Fiche de collecte</TabsTrigger>
          <TabsTrigger value="utilisateurs">Utilisateurs</TabsTrigger>
          <TabsTrigger value="modeles">Modèles de sources</TabsTrigger>
          <TabsTrigger value="checklist">Checklist J0-J5</TabsTrigger>
          <TabsTrigger value="audit">Journal d&apos;audit</TabsTrigger>
        </TabsList>

        <TabsContent value="organisations" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Organisations</CardTitle>
              <CardDescription>Toutes les organisations SmartMeteria.</CardDescription>
            </CardHeader>
            <CardContent>
              <OrganisationsPanel organisations={organisations ?? []} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fiche" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Fiche de collecte</CardTitle>
              <CardDescription>
                Modèle Excel (Service, Secteurs, Compteurs, Sources) — import
                en un clic pour peupler une organisation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ImporterFicheCollecte organisations={organisations ?? []} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="utilisateurs" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Inviter un utilisateur</CardTitle>
              <CardDescription>
                Envoie un lien de connexion (Resend) et l&apos;ajoute à
                l&apos;organisation choisie.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InviterUtilisateur organisations={organisations ?? []} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="modeles" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Modèles assignés aux sources (boîte mail entrante)</CardTitle>
              <CardDescription>
                Chaque source email_entrant a besoin d&apos;un modèle de
                mapping par défaut pour importer automatiquement.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ModelesSourcesPanel sources={sourcesEmail ?? []} modeles={modeles ?? []} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="checklist" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Checklist d&apos;activation</CardTitle>
              <CardDescription>Parcours d&apos;onboarding standard, J0 à J5.</CardDescription>
            </CardHeader>
            <CardContent>
              <ChecklistActivation
                organisations={organisations ?? []}
                items={checklistItems ?? []}
                suivi={checklistSuivi ?? []}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Journal d&apos;audit</CardTitle>
              <CardDescription>
                50 dernières actions sur les organisations et adhésions
                (automatique, non modifiable).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <JournalAudit entrees={audit ?? []} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
