import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getEspaceSites, peutGererAppareils } from "@/lib/auth/espaces";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const CANAUX: Record<string, string> = { email: "E-mail", sms: "SMS", appel: "Appel", whatsapp: "WhatsApp" };
const ETAPES: Record<string, string> = {
  initial: "Alerte",
  appel: "Relance (2 h)",
  directeur: "Escalade (12 h)",
  rapport: "Rapport",
  premiere_donnee: "Première donnée",
  confirmation: "Confirmation",
};

/**
 * Journal des envois (administrateur, agent) : qui a été prévenu, quand, par
 * quel canal. En développement, rien ne part : tout est « journalisé ».
 */
export default async function EnvoisPage() {
  const ctx = await getEspaceSites();
  if (!peutGererAppareils(ctx) || ctx.adhesion?.kind !== "sites") redirect("/sites");
  const supabase = await createClient();
  const { data: envois } = await supabase
    .from("envois")
    .select("id, created_at, etape, canal, destinataire, sujet, corps, mode, statut, erreur")
    .eq("organization_id", ctx.adhesion.organizationId)
    .order("created_at", { ascending: false })
    .limit(200);
  const date = (iso: string) =>
    new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(
      new Date(iso),
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Journal des envois</h1>
        <p className="text-muted-foreground text-sm">
          Les 200 derniers messages : alertes, relances, rapports. Rien n&apos;est effacé.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
          <CardDescription>
            « Journalisé » : le message est écrit ici mais n&apos;est pas parti (mode essai, ou fournisseur SMS et
            appel pas encore choisi).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(envois ?? []).length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucun message pour l&apos;instant.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Destinataire</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>État</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(envois ?? []).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">{date(e.created_at)}</TableCell>
                    <TableCell>{ETAPES[e.etape] ?? (e.etape.startsWith("mensuel") ? "Synthèse du groupe" : e.etape)}</TableCell>
                    <TableCell>{CANAUX[e.canal] ?? e.canal}</TableCell>
                    <TableCell className="break-all">{e.destinataire}</TableCell>
                    <TableCell className="max-w-sm">
                      <span className="line-clamp-2 text-sm">{e.sujet ?? e.corps}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={e.statut === "echec" ? "destructive" : e.statut === "envoye" ? "default" : "secondary"}>
                        {e.statut === "envoye" ? "Envoyé" : e.statut === "echec" ? "Échec" : "Journalisé"}
                      </Badge>
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
