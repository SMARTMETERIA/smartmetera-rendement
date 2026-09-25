import { createClient } from "@/lib/supabase/server";
import { estAdminPartenaire, getEspacePartenaire } from "@/lib/auth/espaces";
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
import { InviterMembre } from "@/components/immeuble/InviterMembre";
import { NouveauClient } from "@/components/immeuble/NouveauClient";
import { RetirerMembre } from "@/components/immeuble/RetirerMembre";
import { LIBELLES_TYPE_CLIENT } from "@/lib/immeuble/libelles";

interface Membre {
  membership_id: string;
  user_id: string;
  email: string;
  role: string;
  created_at: string;
  scope_type: string;
  client_name: string | null;
}

export default async function EquipePage() {
  const ctx = await getEspacePartenaire();
  const admin = estAdminPartenaire(ctx);
  const supabase = await createClient();
  const orgId = ctx.adhesion.organizationId;

  const [{ data: clients }, { data: membres }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, type")
      .eq("organization_id", orgId)
      .order("name"),
    admin
      ? supabase.rpc("membres_organisation", { p_organization_id: orgId })
      : Promise.resolve({ data: null }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Équipe et clients</h1>
        <p className="text-muted-foreground text-sm">
          Vos collègues, les gestionnaires de vos clients, et vos clients
          (syndics, bailleurs, gestionnaires).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Équipe</CardTitle>
          <CardDescription>
            Un gestionnaire ne voit que les immeubles de son client : bilans,
            alertes et attestations d&apos;envoi, jamais les adresses des
            occupants.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {admin ? (
            <>
              <InviterMembre clients={clients ?? []} />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Adresse</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead>Client suivi</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {((membres ?? []) as Membre[]).map((m) => (
                    <TableRow key={m.membership_id}>
                      <TableCell>{m.email}</TableCell>
                      <TableCell>{LIBELLES_ROLE[m.role] ?? m.role}</TableCell>
                      <TableCell>{m.client_name ?? "—"}</TableCell>
                      <TableCell>
                        {m.user_id !== ctx.userId && (
                          <RetirerMembre membershipId={m.membership_id} email={m.email} />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              Seuls les administrateurs gèrent l&apos;équipe.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clients</CardTitle>
          <CardDescription>
            Les immeubles sont rattachés à un client ; ses gestionnaires voient
            ces immeubles.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {ctx.adhesion.role !== "lecteur" && <NouveauClient />}
          {(clients ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucun client pour l&apos;instant. Ajoutez votre premier syndic ou
              bailleur ci-dessus.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(clients ?? []).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.name}</TableCell>
                    <TableCell>{LIBELLES_TYPE_CLIENT[c.type] ?? c.type}</TableCell>
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
