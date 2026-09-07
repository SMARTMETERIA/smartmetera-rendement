"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { urlWebhookIngestion, LABEL_PLATEFORME } from "@/lib/ingest/webhookUrl";
import { EXEMPLE_PAR_DECODEUR } from "@/lib/ingest/exemples";
import { hexToBytes, bytesToBase64 } from "@/lib/ingest/bytes";
import type { Plateforme } from "@/lib/ingest/envelopes";
import type { CodeDecodeur } from "@/lib/ingest/types";

interface SourceOption {
  id: string;
  nom: string;
  plateforme: Plateforme | null;
  webhook_token: string | null;
  actif: boolean;
}

interface DeviceOption {
  id: string;
  source_id: string;
  dev_eui: string;
  canal: string | null;
  decodeur: CodeDecodeur;
  dernier_index_impulsions: number | null;
}

function corpsParDefaut(source: SourceOption, device: DeviceOption | undefined): string {
  const devEui = device?.dev_eui ?? "0018B2000000ABCD";
  const canal = device?.canal ?? null;
  const decodeur = device?.decodeur ?? "milesight_em300_di";
  const impulsions = (device?.dernier_index_impulsions ?? 0) + 100;
  const payloadHex = EXEMPLE_PAR_DECODEUR[decodeur](impulsions, canal);
  const maintenant = new Date().toISOString();
  const fCnt = Date.now() % 100000;

  switch (source.plateforme) {
    case "ttn":
      return JSON.stringify(
        {
          end_device_ids: { dev_eui: devEui },
          received_at: maintenant,
          uplink_message: {
            f_port: 2,
            f_cnt: fCnt,
            frm_payload: bytesToBase64(hexToBytes(payloadHex)),
          },
        },
        null,
        2,
      );
    case "chirpstack":
      return JSON.stringify(
        {
          deviceInfo: { devEui },
          time: maintenant,
          fCnt,
          fPort: 2,
          data: bytesToBase64(hexToBytes(payloadHex)),
        },
        null,
        2,
      );
    case "liveobjects":
      return JSON.stringify(
        {
          timestamp: maintenant,
          value: payloadHex,
          metadata: { network: { lora: { devEUI: devEui, port: 2, fcnt: fCnt } } },
        },
        null,
        2,
      );
    default:
      return JSON.stringify(
        { dev_eui: devEui, payload_hex: payloadHex, horodatage: maintenant },
        null,
        2,
      );
  }
}

export function FrameTester({
  sourcesWebhook,
  devices,
  supabaseUrl,
}: {
  sourcesWebhook: SourceOption[];
  devices: DeviceOption[];
  supabaseUrl: string;
}) {
  const router = useRouter();
  const sourcesActives = sourcesWebhook.filter((s) => s.actif && s.webhook_token && s.plateforme);
  const [sourceId, setSourceId] = useState(sourcesActives[0]?.id ?? "");
  const source = sourcesActives.find((s) => s.id === sourceId);
  const device = devices.find((d) => d.source_id === sourceId);
  const [corps, setCorps] = useState(() => (source ? corpsParDefaut(source, device) : ""));
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<{ status: number; body: string } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  function choisirSource(id: string) {
    setSourceId(id);
    const s = sourcesActives.find((x) => x.id === id);
    const d = devices.find((x) => x.source_id === id);
    setCorps(s ? corpsParDefaut(s, d) : "");
    setResultat(null);
    setErreur(null);
  }

  function regenererExemple() {
    if (source) setCorps(corpsParDefaut(source, device));
  }

  async function envoyer() {
    if (!source?.webhook_token || !source.plateforme) return;
    setEnCours(true);
    setErreur(null);
    setResultat(null);
    try {
      const url = urlWebhookIngestion(supabaseUrl, source.plateforme, source.webhook_token);
      const reponse = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: corps,
      });
      const texte = await reponse.text();
      setResultat({ status: reponse.status, body: texte });
      router.refresh();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setEnCours(false);
    }
  }

  if (sourcesActives.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Créez d&apos;abord une source webhook active pour utiliser le testeur.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Source à tester</Label>
        <Select value={sourceId} onValueChange={(v) => v && choisirSource(v)}>
          <SelectTrigger className="w-full sm:w-80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sourcesActives.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.nom} — {s.plateforme ? LABEL_PLATEFORME[s.plateforme] : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!device && (
        <Alert>
          <AlertDescription>
            Aucun équipement actif n&apos;est associé à cette source : la trame
            sera reçue et journalisée, mais aucun relevé ne sera créé (statut
            « équipement inconnu »). Associez d&apos;abord un équipement
            ci-dessus pour un test complet.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="corps-trame">Corps de la requête (JSON)</Label>
          <Button type="button" variant="ghost" size="sm" onClick={regenererExemple}>
            Régénérer l&apos;exemple
          </Button>
        </div>
        <Textarea
          id="corps-trame"
          value={corps}
          onChange={(e) => setCorps(e.target.value)}
          rows={10}
          className="font-mono text-xs"
        />
      </div>

      <Button type="button" onClick={envoyer} disabled={enCours}>
        {enCours ? "Envoi…" : "Envoyer la trame de test"}
      </Button>

      {erreur && (
        <Alert variant="destructive">
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}

      {resultat && (
        <Alert variant={resultat.status < 300 ? "default" : "destructive"}>
          <AlertDescription>
            <p className="mb-1 font-medium">Réponse HTTP {resultat.status}</p>
            <pre className="overflow-x-auto text-xs whitespace-pre-wrap">{resultat.body}</pre>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
