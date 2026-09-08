import { createClient } from "@/lib/supabase/server";
import { getCurrentOrganization } from "@/lib/organization";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PlanActionsManager } from "@/components/plan-actions/PlanActionsManager";

export default async function PlanActionsPage() {
  const org = await getCurrentOrganization();
  const supabase = await createClient();
  const peutGerer = org.role === "admin_client" || org.role === "superadmin";
  const peutSuivre = peutGerer || org.role === "agent";

  const [{ data: plans }, { data: catalogue }] = await Promise.all([
    supabase
      .from("action_plans")
      .select("id, nom, description, annee_debut, annee_fin, statut")
      .eq("organization_id", org.organizationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("catalogue_actions_types")
      .select("id, categorie, titre, description, is_system")
      .or(`is_system.eq.true,organization_id.eq.${org.organizationId}`)
      .order("categorie"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Plan d&apos;actions</h1>
        <p className="text-muted-foreground text-sm">
          Décret 2012-97 : catalogue d&apos;actions types, génération d&apos;un
          plan daté, suivi, export PDF.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Plans et actions</CardTitle>
          <CardDescription>
            Un plan regroupe des actions issues du catalogue (ou créées
            librement), datées et suivies jusqu&apos;à leur réalisation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PlanActionsManager
            organizationId={org.organizationId}
            plans={plans ?? []}
            catalogue={catalogue ?? []}
            peutGererPlans={peutGerer}
            peutSuivreActions={peutSuivre}
            supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
          />
        </CardContent>
      </Card>
    </div>
  );
}
