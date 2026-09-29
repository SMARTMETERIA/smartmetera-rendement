import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getEspaceSites,
  organisationEspaceSites,
  peutGererAppareils,
} from "@/lib/auth/espaces";
import { formaterDateHeure } from "@/lib/gardien/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ImportStock } from "@/components/sites/ImportStock";
import {
  TableAppareils,
  type LigneAppareil,
} from "@/components/sites/TableAppareils";

const LIBELLES_ETAT: Record<string, string> = {
  en_stock: "En stock",
  attribue: "Attribué",
  pose: "Posé, en attente",
  actif: "Actif",
  retire: "Retiré",
};

interface Appareil {
  id: string;
  device_ref: string;
  canal: string | null;
  model: string | null;
  provisioning_status: string;
  battery_pct: number | null;
  battery_low: boolean | null;
  last_seen_at: string | null;
  qr_code: string | null;
  sites: { name: string; timezone: string } | null;
}

/**
 * Appareils de l'organisation : import du stock, attribution d'un lot à un
 * site, planche d'étiquettes QR. La vue flotte complète arrive en G6.
 */
export default async function AppareilsPage() {
  const ctx = await getEspaceSites();
  if (!peutGererAppareils(ctx)) redirect("/sites");
  const { organizationId } = organisationEspaceSites(ctx);
  const supabase = await createClient();

  const [{ data: appareils }, { data: sites }] = await Promise.all([
    supabase
      .from("devices")
      .select(
        "id, device_ref, canal, model, provisioning_status, battery_pct, battery_low, last_seen_at, qr_code, sites(name, timezone)",
      )
      .eq("organization_id", organizationId)
      .neq("provisioning_status", "retire")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("sites")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name"),
  ]);

  const lignes: LigneAppareil[] = (
    (appareils ?? []) as unknown as Appareil[]
  ).map((a) => ({
    id: a.id,
    reference: a.canal ? `${a.device_ref} (entrée ${a.canal})` : a.device_ref,
    modele: a.model ?? "—",
    etat: LIBELLES_ETAT[a.provisioning_status] ?? a.provisioning_status,
    site: a.sites?.name ?? null,
    pile: a.battery_low
      ? "Faible"
      : a.battery_pct !== null
        ? `${new Intl.NumberFormat("fr-FR").format(Number(a.battery_pct))} %`
        : "—",
    dernierMessage: formaterDateHeure(
      a.last_seen_at,
      a.sites?.timezone ?? "Europe/Paris",
    ),
    qr: Boolean(a.qr_code),
    attribuable: ["en_stock", "attribue"].includes(a.provisioning_status),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Appareils</h1>
        <p className="text-muted-foreground text-sm">
          Ajoutez les capteurs reçus au stock, attribuez-les à un site, puis
          imprimez les étiquettes à coller sur chaque capteur.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Ajouter au stock</CardTitle>
          <CardDescription>
            Un fichier fourni par le fabricant ou saisi à la main. Chaque
            capteur reçoit un code d&apos;étiquette unique.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ImportStock />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Stock et capteurs posés</CardTitle>
          <CardDescription>
            Cochez des capteurs pour les attribuer à un site ou imprimer leurs
            étiquettes (planche A4 de 24 étiquettes 70 × 37 mm).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {lignes.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucun appareil pour l&apos;instant : importez votre premier lot
              ci-dessus.
            </p>
          ) : (
            <TableAppareils appareils={lignes} sites={sites ?? []} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
