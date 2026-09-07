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
import { SourcesLoRaWAN } from "@/components/sources/SourcesLoRaWAN";
import { DevicesPanel } from "@/components/sources/DevicesPanel";
import { RawFramesTable } from "@/components/sources/RawFramesTable";
import { FrameTester } from "@/components/sources/FrameTester";

export default async function SourcesPage() {
  const org = await getCurrentOrganization();
  const supabase = await createClient();
  const peutGerer = org.role === "admin_client" || org.role === "superadmin";

  const [{ data: sources }, { data: devices }, { data: compteurs }, { data: trames }] =
    await Promise.all([
      supabase
        .from("sources")
        .select("id, nom, type, plateforme, webhook_token, actif")
        .eq("organization_id", org.organizationId)
        .order("created_at"),
      supabase
        .from("devices")
        .select(
          "id, source_id, meter_id, dev_eui, canal, decodeur, litres_par_impulsion, dernier_index_impulsions, dernier_horodatage, actif, meters(nom, numero_serie)",
        )
        .eq("organization_id", org.organizationId)
        .order("created_at"),
      supabase
        .from("meters")
        .select("id, nom, numero_serie")
        .eq("organization_id", org.organizationId)
        .eq("actif", true)
        .order("nom"),
      supabase
        .from("raw_frames")
        .select("id, recu_le, dev_eui, statut, erreur, releve_ts, releve_volume_m3, source_id")
        .eq("organization_id", org.organizationId)
        .order("recu_le", { ascending: false })
        .limit(30),
    ]);

  const sourcesWebhook = (sources ?? []).filter((s) => s.type === "webhook_lorawan");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Sources d&apos;ingestion LoRaWAN
        </h1>
        <p className="text-muted-foreground text-sm">
          Webhooks TTN / ChirpStack / Orange Live Objects / générique, registre
          d&apos;équipements DevEUI → compteur, journal des trames brutes.{" "}
          <Link href="/parametres" className="underline underline-offset-4">
            ← Retour aux paramètres
          </Link>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sources webhook</CardTitle>
          <CardDescription>
            Une source par plateforme réseau. L&apos;URL de webhook contient un
            jeton secret : à coller telle quelle dans la configuration
            &quot;intégration HTTP&quot; / &quot;webhook&quot; de la plateforme.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SourcesLoRaWAN
            organizationId={org.organizationId}
            sources={sourcesWebhook}
            peutGerer={peutGerer}
            supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registre d&apos;équipements</CardTitle>
          <CardDescription>
            Associe le DevEUI (et le canal éventuel) d&apos;un capteur à un
            compteur, un décodeur constructeur et le facteur d&apos;impulsion
            (litres représentés par une impulsion du compteur mécanique
            raccordé).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DevicesPanel
            organizationId={org.organizationId}
            devices={devices ?? []}
            sourcesWebhook={sourcesWebhook}
            compteurs={compteurs ?? []}
            peutGerer={peutGerer}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Testeur de trame</CardTitle>
          <CardDescription>
            Envoie une trame d&apos;exemple directement à l&apos;URL de webhook
            ci-dessus et affiche le résultat (relevé créé, doublon, équipement
            inconnu...).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FrameTester
            sourcesWebhook={sourcesWebhook}
            devices={devices ?? []}
            supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Journal des trames brutes</CardTitle>
          <CardDescription>
            30 dernières trames reçues, tous statuts confondus (traçabilité
            complète, jamais de suppression).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RawFramesTable trames={trames ?? []} sources={sources ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
