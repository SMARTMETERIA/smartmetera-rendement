import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrganization } from "@/lib/organization";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SourcesEmailEntrant } from "@/components/inbound-mail/SourcesEmailEntrant";
import { InboundEmailsTable } from "@/components/inbound-mail/InboundEmailsTable";
import { InboundEmailTester } from "@/components/inbound-mail/InboundEmailTester";

export default async function BoiteMailPage() {
  const org = await getCurrentOrganization();
  const supabase = await createClient();
  const peutGerer = org.role === "admin_client" || org.role === "superadmin";

  const [{ data: sources }, { data: modeles }, { data: emails }] = await Promise.all([
    supabase
      .from("sources")
      .select("id, nom, actif, inbound_token, default_template_id, import_templates(nom)")
      .eq("organization_id", org.organizationId)
      .eq("type", "email_entrant")
      .order("created_at"),
    supabase
      .from("import_templates")
      .select("id, nom, cible")
      .or(`is_system.eq.true,organization_id.eq.${org.organizationId}`)
      .order("nom"),
    supabase
      .from("inbound_emails")
      .select("id, recu_le, expediteur, objet, piece_jointe_nom, statut, erreur, source_id")
      .eq("organization_id", org.organizationId)
      .order("recu_le", { ascending: false })
      .limit(30),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Boîte mail entrante</h1>
        <p className="text-muted-foreground text-sm">
          Une adresse dédiée par source : les pièces jointes CSV/XLSX sont
          importées automatiquement avec le modèle de mapping choisi.{" "}
          <Link href="/parametres" className="underline underline-offset-4">
            ← Retour aux paramètres
          </Link>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Adresses d&apos;import par e-mail</CardTitle>
          <CardDescription>
            Configurez cette adresse comme destinataire d&apos;une route
            Postmark (Inbound Domain Forwarding) ou Mailgun (Route
            catch-all) — un seul webhook chez le fournisseur suffit pour
            toutes les sources.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SourcesEmailEntrant
            organizationId={org.organizationId}
            sources={sources ?? []}
            modeles={modeles ?? []}
            peutGerer={peutGerer}
            domaine={process.env.NEXT_PUBLIC_INBOUND_EMAIL_DOMAIN ?? null}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Testeur</CardTitle>
          <CardDescription>
            Simule un e-mail Postmark avec une pièce jointe CSV d&apos;exemple,
            envoyé directement à la fonction d&apos;ingestion.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InboundEmailTester
            sources={(sources ?? []).filter((s) => s.actif && s.inbound_token)}
            domaine={process.env.NEXT_PUBLIC_INBOUND_EMAIL_DOMAIN ?? null}
            supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Journal des e-mails reçus</CardTitle>
          <CardDescription>30 derniers e-mails, tous statuts confondus.</CardDescription>
        </CardHeader>
        <CardContent>
          <InboundEmailsTable emails={emails ?? []} sources={sources ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
