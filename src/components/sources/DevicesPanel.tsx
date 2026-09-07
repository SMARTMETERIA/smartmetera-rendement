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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { LABEL_DECODEUR } from "@/lib/ingest/decoders/index";
import type { CodeDecodeur } from "@/lib/ingest/types";

interface Device {
  id: string;
  source_id: string;
  meter_id: string;
  dev_eui: string;
  canal: string | null;
  decodeur: CodeDecodeur;
  litres_par_impulsion: number;
  dernier_index_impulsions: number | null;
  dernier_horodatage: string | null;
  actif: boolean;
  meters: { nom: string; numero_serie: string }[] | null;
}

interface SourceOption {
  id: string;
  nom: string;
  actif: boolean;
}

interface CompteurOption {
  id: string;
  nom: string;
  numero_serie: string;
}

export function DevicesPanel({
  organizationId,
  devices,
  sourcesWebhook,
  compteurs,
  peutGerer,
}: {
  organizationId: string;
  devices: Device[];
  sourcesWebhook: SourceOption[];
  compteurs: CompteurOption[];
  peutGerer: boolean;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [form, setForm] = useState({
    source_id: sourcesWebhook[0]?.id ?? "",
    meter_id: "",
    dev_eui: "",
    canal: "",
    decodeur: "adeunis_pulse_v4" as CodeDecodeur,
    litres_par_impulsion: "1",
  });

  async function creerDevice(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);

    const source = sourcesWebhook.find((s) => s.id === form.source_id);
    if (!source) {
      setErreur("Choisissez une source webhook");
      setEnCours(false);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.from("devices").insert({
      organization_id: organizationId,
      source_id: form.source_id,
      meter_id: form.meter_id,
      dev_eui: form.dev_eui.trim().toUpperCase().replace(/[^0-9A-F]/g, ""),
      canal: form.canal.trim() || null,
      decodeur: form.decodeur,
      litres_par_impulsion: Number(form.litres_par_impulsion),
    });
    setEnCours(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    setOuvert(false);
    setForm((f) => ({ ...f, dev_eui: "", canal: "" }));
    router.refresh();
  }

  async function basculerActif(device: Device) {
    const supabase = createClient();
    await supabase.from("devices").update({ actif: !device.actif }).eq("id", device.id);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>DevEUI</TableHead>
            <TableHead>Canal</TableHead>
            <TableHead>Compteur</TableHead>
            <TableHead>Décodeur</TableHead>
            <TableHead>L/impulsion</TableHead>
            <TableHead>Dernier index</TableHead>
            <TableHead>Dernier relevé</TableHead>
            <TableHead>Statut</TableHead>
            {peutGerer && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {devices.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-mono text-xs">{d.dev_eui}</TableCell>
              <TableCell>{d.canal ?? "—"}</TableCell>
              <TableCell>
                {d.meters?.[0]?.nom} ({d.meters?.[0]?.numero_serie})
              </TableCell>
              <TableCell>{LABEL_DECODEUR[d.decodeur]}</TableCell>
              <TableCell>{d.litres_par_impulsion}</TableCell>
              <TableCell>{d.dernier_index_impulsions ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {d.dernier_horodatage
                  ? new Date(d.dernier_horodatage).toLocaleString("fr-FR", {
                      timeZone: "Europe/Paris",
                    })
                  : "—"}
              </TableCell>
              <TableCell>
                <Badge variant={d.actif ? "secondary" : "outline"}>
                  {d.actif ? "Actif" : "Inactif"}
                </Badge>
              </TableCell>
              {peutGerer && (
                <TableCell>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => basculerActif(d)}
                  >
                    {d.actif ? "Désactiver" : "Activer"}
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
          {devices.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={peutGerer ? 9 : 8}
                className="text-muted-foreground text-center"
              >
                Aucun équipement enregistré.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {peutGerer && (
        <Dialog open={ouvert} onOpenChange={setOuvert}>
          <DialogTrigger
            render={<Button type="button" variant="outline" disabled={sourcesWebhook.length === 0} />}
          >
            + Nouvel équipement
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={creerDevice} className="space-y-4">
              <DialogHeader>
                <DialogTitle>Nouvel équipement (DevEUI → compteur)</DialogTitle>
              </DialogHeader>
              {erreur && (
                <Alert variant="destructive">
                  <AlertDescription>{erreur}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label>Source webhook</Label>
                <Select
                  value={form.source_id}
                  onValueChange={(v) => v && setForm((f) => ({ ...f, source_id: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sourcesWebhook.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dev-eui">DevEUI (16 caractères hexadécimaux)</Label>
                <Input
                  id="dev-eui"
                  value={form.dev_eui}
                  onChange={(e) => setForm((f) => ({ ...f, dev_eui: e.target.value }))}
                  placeholder="0018B2000000ABCD"
                  className="font-mono"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="canal">Canal (optionnel, capteur multi-voies)</Label>
                <Input
                  id="canal"
                  value={form.canal}
                  onChange={(e) => setForm((f) => ({ ...f, canal: e.target.value }))}
                  placeholder="A, B, 1, 2..."
                />
              </div>
              <div className="space-y-2">
                <Label>Compteur associé</Label>
                <Select
                  value={form.meter_id}
                  onValueChange={(v) => v && setForm((f) => ({ ...f, meter_id: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choisir un compteur" />
                  </SelectTrigger>
                  <SelectContent>
                    {compteurs.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nom} ({c.numero_serie})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Décodeur</Label>
                <Select
                  value={form.decodeur}
                  onValueChange={(v) => v && setForm((f) => ({ ...f, decodeur: v as CodeDecodeur }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(LABEL_DECODEUR) as CodeDecodeur[]).map((d) => (
                      <SelectItem key={d} value={d}>
                        {LABEL_DECODEUR[d]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="litres">Litres par impulsion</Label>
                <Input
                  id="litres"
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={form.litres_par_impulsion}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, litres_par_impulsion: e.target.value }))
                  }
                  required
                />
                <p className="text-muted-foreground text-xs">
                  Poids d&apos;impulsion du compteur mécanique raccordé (souvent
                  1, 10 ou 100 L/impulsion — voir la documentation du
                  compteur).
                </p>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={enCours || !form.meter_id}>
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
