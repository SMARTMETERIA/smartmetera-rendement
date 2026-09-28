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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
          <InviterMembreSites sites={sites ?? []} />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Adresse</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Site</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {((membres ?? []) as Membre[]).map((m) => (
                <TableRow key={m.membership_id}>
                  <TableCell>{m.email}</TableCell>
                  <TableCell>{LIBELLES_ROLE[m.role] ?? m.role}</TableCell>
                  <TableCell>
                    {m.scope_type === "site" ? m.site_name : "Tous les sites"}
                  </TableCell>
                  <TableCell>
                    {m.user_id !== ctx.userId && (
                      <RetirerMembreSites
                        membershipId={m.membership_id}
                        email={m.email}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
