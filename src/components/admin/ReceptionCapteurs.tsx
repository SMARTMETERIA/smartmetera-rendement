import { urlWebhookIngestion } from "@/lib/ingest/webhookUrl";
import { formaterDateHeure } from "@/lib/gardien/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Adresses de réception de la plateforme (Gardien de l'eau), à saisir dans
 * le broker MQTT (kit A) et dans le serveur LoRaWAN (kit C, sondes), et
 * dernières trames d'appareils absents du stock.
 */
export function ReceptionCapteurs({
  supabaseUrl,
  jetons,
  inconnues,
}: {
  supabaseUrl: string;
  jetons: { jeton_mqtt?: string; jeton_lorawan?: string } | null;
  inconnues: {
    id: number;
    received_at: string;
    channel: string;
    device_ref: string | null;
  }[];
}) {
  const adresses =
    jetons?.jeton_mqtt && jetons.jeton_lorawan
      ? [
          {
            libelle: "MQTT (broker du kit A)",
            url: urlWebhookIngestion(supabaseUrl, "mqtt", jetons.jeton_mqtt),
          },
          {
            libelle: "LoRaWAN — ChirpStack",
            url: urlWebhookIngestion(
              supabaseUrl,
              "chirpstack",
              jetons.jeton_lorawan,
            ),
          },
          {
            libelle: "LoRaWAN — The Things Stack",
            url: urlWebhookIngestion(supabaseUrl, "ttn", jetons.jeton_lorawan),
          },
          {
            libelle: "Essais (format générique)",
            url: urlWebhookIngestion(
              supabaseUrl,
              "generic",
              jetons.jeton_lorawan,
            ),
          },
        ]
      : [];

  return (
    <div className="space-y-6">
      {adresses.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Jetons de réception absents des réglages de plateforme.
        </p>
      ) : (
        <dl className="space-y-3">
          {adresses.map((a) => (
            <div key={a.libelle}>
              <dt className="text-sm font-medium">{a.libelle}</dt>
              <dd className="bg-muted rounded-md p-2 font-mono text-xs break-all select-all">
                {a.url}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="text-muted-foreground text-sm">
        Ces adresses contiennent un secret : ne les donnez qu&apos;au broker et
        au serveur LoRaWAN. Guides : docs/reception-mqtt.md et
        infra/chirpstack/README.md.
      </p>
      <div className="space-y-2">
        <h3 className="font-medium">
          Trames d&apos;appareils absents du stock (30 derniers jours)
        </h3>
        {inconnues.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucune.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reçue le</TableHead>
                <TableHead>Réseau</TableHead>
                <TableHead>Référence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inconnues.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    {formaterDateHeure(t.received_at, "Europe/Paris")}
                  </TableCell>
                  <TableCell>
                    {t.channel === "mqtt" ? "Cellulaire" : "LoRaWAN"}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {t.device_ref ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
