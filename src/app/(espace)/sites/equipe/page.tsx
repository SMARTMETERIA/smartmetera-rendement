import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  estAdminSites,
  getEspaceSites,
  organisationEspaceSites,
} from "@/lib/auth/espaces";
import { LIBELLES_ROLE } from "@/lib/auth/destination";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InviterMembreSites } from "@/components/sites/InviterMembreSites";
import { RetirerMembreSites } from "@/components/sites/RetirerMembreSites";

interface Membre {
  membership_id: string;
  user_id: string;
  email: string;
  role: string;
  scope_type: string;
  site_name: string | null;
}

export default async function EquipeSitesPage() {
  const ctx = await getEspaceSites();
  if (!estAdminSites(ctx)) redirect("/sites");
  const { organizationId } = organisationEspaceSites(ctx);
  const supabase = await createClient();

  const [{ data: sites }, { data: membres }] = await Promise.all([
    supabase
      .from("sites")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name"),
    supabase.rpc("membres_organisation", { p_organization_id: organizationId }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Équipe</h1>
        <p className="text-muted-foreground text-sm">
          Invitez vos directeurs de site, vos techniciens et vos collègues.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Accès</CardTitle>
          <CardDescription>
            Un directeur de site ne voit que son site. Un technicien reçoit les
            alertes et pose les capteurs, sur un site ou sur tous.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ul className="divide-y rounded-lg border">
            {((membres ?? []) as Membre[]).map((m) => (
              <li
                key={m.membership_id}
                className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0 space-y-0.5">
                  <span className="block font-medium break-all">{m.email}</span>
                  <span className="text-muted-foreground block">
                    {LIBELLES_ROLE[m.role] ?? m.role} ·{" "}
                    {m.scope_type === "site" ? m.site_name : "tous les sites"}
                    {m.user_id === ctx.userId ? " (vous)" : ""}
                  </span>
                </span>
                {m.user_id !== ctx.userId && (
                  <RetirerMembreSites membershipId={m.membership_id} email={m.email} />
                )}
              </li>
            ))}
          </ul>
          <div className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-semibold">Inviter une personne</h3>
            <InviterMembreSites sites={sites ?? []} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
