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
import { adresseInbound } from "@/lib/inboundMail/adresse";

interface Source {
  id: string;
  nom: string;
  actif: boolean;
  inbound_token: string | null;
  default_template_id: string | null;
  import_templates: { nom: string }[] | null;
}

interface Modele {
  id: string;
  nom: string;
  cible: string;
}

function genererJetonNavigateur(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function ChampAdresse({ adresse }: { adresse: string }) {
  const [copie, setCopie] = useState(false);
  async function copier() {
    await navigator.clipboard.writeText(adresse);
    setCopie(true);
    setTimeout(() => setCopie(false), 2000);
  }
  return (
    <div className="flex items-center gap-2">
      <Input readOnly value={adresse} className="font-mono text-xs" />
      <Button type="button" variant="outline" size="sm" onClick={copier}>
        {copie ? "Copié !" : "Copier"}
      </Button>
    </div>
  );
}

export function SourcesEmailEntrant({
  organizationId,
  sources,
  modeles,
  peutGerer,
  domaine,
}: {
  organizationId: string;
  sources: Source[];
  modeles: Modele[];
  peutGerer: boolean;
  domaine: string | null;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState("");
  const [modeleId, setModeleId] = useState(modeles[0]?.id ?? "");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function creerSource(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    const supabase = createClient();
    const { error } = await supabase.from("sources").insert({
      organization_id: organizationId,
      type: "email_entrant",
      nom,
      default_template_id: modeleId,
      inbound_token: genererJetonNavigateur(),
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
    const supabase = createClient();
    await supabase
      .from("sources")
      .update({ inbound_token: genererJetonNavigateur() })
      .eq("id", sourceId);
    router.refresh();
  }

  async function basculerActif(source: Source) {
    const supabase = createClient();
    await supabase.from("sources").update({ actif: !source.actif }).eq("id", source.id);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {sources.length === 0 && (
        <p className="text-muted-foreground text-sm">Aucune adresse pour l&apos;instant.</p>
      )}
      <div className="space-y-4">
        {sources.map((s) => (
          <div key={s.id} className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{s.nom}</span>
                <Badge variant="secondary">{s.import_templates?.[0]?.nom ?? "—"}</Badge>
                <Badge variant={s.actif ? "secondary" : "outline"}>
                  {s.actif ? "Active" : "Inactive"}
                </Badge>
              </div>
              {peutGerer && (
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => basculerActif(s)}>
                    {s.actif ? "Désactiver" : "Activer"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => regenererJeton(s.id)}
                  >
                    Régénérer le jeton
                  </Button>
                </div>
              )}
            </div>
            {s.inbound_token && <ChampAdresse adresse={adresseInbound(domaine, s.inbound_token)} />}
          </div>
        ))}
      </div>

      {peutGerer && (
        <Dialog open={ouvert} onOpenChange={setOuvert}>
          <DialogTrigger
            render={<Button type="button" variant="outline" disabled={modeles.length === 0} />}
          >
            + Nouvelle adresse
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={creerSource} className="space-y-4">
              <DialogHeader>
                <DialogTitle>Nouvelle adresse d&apos;import par e-mail</DialogTitle>
              </DialogHeader>
              {erreur && (
                <Alert variant="destructive">
                  <AlertDescription>{erreur}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="nom-source-email">Nom</Label>
                <Input
                  id="nom-source-email"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder="Ex : Export mensuel facturation"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Modèle de mapping par défaut</Label>
                <Select value={modeleId} onValueChange={(v) => v && setModeleId(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {modeles.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  Appliqué automatiquement à chaque pièce jointe reçue sur
                  cette adresse (personne n&apos;est là pour choisir un
                  mapping au moment de la réception).
                </p>
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
