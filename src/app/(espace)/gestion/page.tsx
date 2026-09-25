import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContexteUtilisateur } from "@/lib/auth/contexte";
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

/**
 * Espace gestionnaire (syndic, bailleur) : ses immeubles uniquement (RLS
 * can_read_building). Version minimale : bilans, alertes et attestations
 * arrivent avec les phases 4, 5 et 7.
 */
export default async function GestionPage() {
  const ctx = await getContexteUtilisateur();
  if (ctx.adhesionsClient.length === 0 && !ctx.isPlatformAdmin) {
    redirect("/accueil");
  }
  const supabase = await createClient();
  const { data: immeubles } = await supabase
    .from("buildings")
    .select("id, name, address_line1, postal_code, city, clients(name)")
    .in(
      "client_id",
      ctx.adhesionsClient.map((a) => a.clientId),
    )
    .order("name");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mes immeubles</h1>
        <p className="text-muted-foreground text-sm">
          Les immeubles que {ctx.adhesionsClient[0]?.organizationName ?? "votre prestataire"}{" "}
          suit pour vous.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Immeubles</CardTitle>
          <CardDescription>
            Bilans, alertes et attestations d&apos;envoi seront affichés ici.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(immeubles ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucun immeuble rattaché pour l&apos;instant.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Immeuble</TableHead>
                  <TableHead>Adresse</TableHead>
                  <TableHead>Client</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(immeubles ?? []).map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell>
                      {[b.address_line1, [b.postal_code, b.city].filter(Boolean).join(" ")]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </TableCell>
                    <TableCell>
                      {(b.clients as unknown as { name: string } | null)?.name ?? "—"}
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
