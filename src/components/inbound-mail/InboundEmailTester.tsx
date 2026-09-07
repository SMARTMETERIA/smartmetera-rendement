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
import { adresseInbound } from "@/lib/inboundMail/adresse";

interface Source {
  id: string;
  nom: string;
  inbound_token: string | null;
}

const CSV_EXEMPLE = "compteur,date,volume_m3\nPROD-001,2026-09-01 10:00:00,12.5";

function corpsParDefaut(adresse: string): string {
  return JSON.stringify(
    {
      From: "test@example.com",
      To: adresse,
      Subject: "Export de test",
      Attachments: [
        {
          Name: "export.csv",
          Content: btoa(CSV_EXEMPLE),
          ContentType: "text/csv",
        },
      ],
    },
    null,
    2,
  );
}

export function InboundEmailTester({
  sources,
  domaine,
  supabaseUrl,
}: {
  sources: Source[];
  domaine: string | null;
  supabaseUrl: string;
}) {
  const router = useRouter();
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const source = sources.find((s) => s.id === sourceId);
  const [corps, setCorps] = useState(() =>
    source?.inbound_token ? corpsParDefaut(adresseInbound(domaine, source.inbound_token)) : "",
  );
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<{ status: number; body: string } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  function choisirSource(id: string) {
    setSourceId(id);
    const s = sources.find((x) => x.id === id);
    setCorps(s?.inbound_token ? corpsParDefaut(adresseInbound(domaine, s.inbound_token)) : "");
    setResultat(null);
  }

  async function envoyer() {
    setEnCours(true);
    setErreur(null);
    setResultat(null);
    try {
      const reponse = await fetch(`${supabaseUrl}/functions/v1/inbound-email/postmark`, {
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

  if (sources.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Créez d&apos;abord une adresse active pour utiliser le testeur.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Adresse à tester</Label>
        <Select value={sourceId} onValueChange={(v) => v && choisirSource(v)}>
          <SelectTrigger className="w-full sm:w-80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sources.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.nom}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">
          Le CSV d&apos;exemple utilise les colonnes du modèle « Générique »
          (compteur, date, volume_m3) : adaptez-le si l&apos;adresse choisie
          utilise un autre modèle.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="corps-email">Corps de la requête Postmark (JSON)</Label>
        <Textarea
          id="corps-email"
          value={corps}
          onChange={(e) => setCorps(e.target.value)}
          rows={10}
          className="font-mono text-xs"
        />
      </div>

      <Button type="button" onClick={envoyer} disabled={enCours}>
        {enCours ? "Envoi…" : "Envoyer l'e-mail de test"}
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
