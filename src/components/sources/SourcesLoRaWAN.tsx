"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { urlWebhookIngestion, LABEL_PLATEFORME } from "@/lib/ingest/webhookUrl";
import type { Plateforme } from "@/lib/ingest/envelopes";

interface Source {
  id: string;
  nom: string;
  type: string;
  plateforme: Plateforme | null;
  webhook_token: string | null;
  actif: boolean;
}

function genererJetonNavigateur(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function ChampUrlWebhook({ url }: { url: string }) {
  const [copie, setCopie] = useState(false);

  async function copier() {
    await navigator.clipboard.writeText(url);
    setCopie(true);
    setTimeout(() => setCopie(false), 2000);
  }

  return (
    <div className="flex items-center gap-2">
      <Input readOnly value={url} className="font-mono text-xs" />
      <Button type="button" variant="outline" size="sm" onClick={copier}>
        {copie ? "Copié !" : "Copier"}
      </Button>
    </div>
  );
}

export function SourcesLoRaWAN({
  organizationId,
  sources,
  peutGerer,
  supabaseUrl,
}: {
  organizationId: string;
  sources: Source[];
  peutGerer: boolean;
  supabaseUrl: string;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState("");
  const [plateforme, setPlateforme] = useState<Plateforme>("generic");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [regenerationEnCours, setRegenerationEnCours] = useState<string | null>(null);

  async function creerSource(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    const supabase = createClient();
    const { error } = await supabase.from("sources").insert({
      organization_id: organizationId,
      type: "webhook_lorawan",
      nom,
      plateforme,
      webhook_token: genererJetonNavigateur(),
    });
    setEnCours(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    setNom("");
    setOuvert(false);
    router.refresh();
  }

  async function regenererJeton(sourceId: string) {
    setRegenerationEnCours(sourceId);
    const supabase = createClient();
    await supabase
      .from("sources")
      .update({ webhook_token: genererJetonNavigateur() })
      .eq("id", sourceId);
    setRegenerationEnCours(null);
    router.refresh();
  }

  async function basculerActif(source: Source) {
    const supabase = createClient();
    await supabase
      .from("sources")
      .update({ actif: !source.actif })
      .eq("id", source.id);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {sources.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Aucune source webhook pour l&apos;instant.
        </p>
      )}
      <div className="space-y-4">
        {sources.map((s) => (
          <div key={s.id} className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{s.nom}</span>
                <Badge variant="secondary">
                  {s.plateforme ? LABEL_PLATEFORME[s.plateforme] : s.type}
                </Badge>
                <Badge variant={s.actif ? "secondary" : "outline"}>
                  {s.actif ? "Active" : "Inactive"}
                </Badge>
              </div>
              {peutGerer && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => basculerActif(s)}
                  >
                    {s.actif ? "Désactiver" : "Activer"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={regenerationEnCours === s.id}
                    onClick={() => regenererJeton(s.id)}
                  >
                    Régénérer le jeton
                  </Button>
                </div>
              )}
            </div>
            {s.webhook_token && s.plateforme && (
              <ChampUrlWebhook
                url={urlWebhookIngestion(supabaseUrl, s.plateforme, s.webhook_token)}
              />
            )}
            <p className="text-muted-foreground text-xs">
              Régénérer le jeton invalide immédiatement l&apos;ancienne URL : il
              faudra reconfigurer le webhook côté plateforme réseau.
            </p>
          </div>
        ))}
      </div>

      {peutGerer && (
        <Dialog open={ouvert} onOpenChange={setOuvert}>
          <DialogTrigger render={<Button type="button" variant="outline" />}>
            + Nouvelle source webhook
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={creerSource} className="space-y-4">
              <DialogHeader>
                <DialogTitle>Nouvelle source webhook LoRaWAN</DialogTitle>
              </DialogHeader>
              {erreur && (
                <Alert variant="destructive">
                  <AlertDescription>{erreur}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="nom-source">Nom</Label>
                <Input
                  id="nom-source"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder="Ex : Réseau TTN régie"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Plateforme réseau</Label>
                <Select
                  value={plateforme}
                  onValueChange={(v) => v && setPlateforme(v as Plateforme)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(LABEL_PLATEFORME) as Plateforme[]).map((p) => (
                      <SelectItem key={p} value={p}>
                        {LABEL_PLATEFORME[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={enCours}>
                  {enCours ? "Création…" : "Créer"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
