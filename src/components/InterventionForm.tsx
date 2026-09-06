"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

const TYPES = [
  { value: "recherche_fuite", label: "Recherche de fuite" },
  { value: "reparation", label: "Réparation" },
  { value: "releve_manuel", label: "Relevé manuel" },
  { value: "maintenance_compteur", label: "Maintenance compteur" },
  { value: "autre", label: "Autre" },
] as const;

const STATUTS = [
  { value: "planifiee", label: "Planifiée" },
  { value: "en_cours", label: "En cours" },
  { value: "terminee", label: "Terminée" },
  { value: "annulee", label: "Annulée" },
] as const;

export function InterventionForm({
  organizationId,
  sectorId,
}: {
  organizationId: string;
  sectorId: string;
}) {
  const router = useRouter();
  const [type, setType] = useState<string>("recherche_fuite");
  const [statut, setStatut] = useState<string>("planifiee");
  const [planifieeLe, setPlanifieeLe] = useState("");
  const [resultat, setResultat] = useState("");
  const [volumeRecupere, setVolumeRecupere] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);

    const supabase = createClient();
    const { error } = await supabase.from("interventions").insert({
      organization_id: organizationId,
      sector_id: sectorId,
      type,
      statut,
      planifiee_le: planifieeLe ? new Date(planifieeLe).toISOString() : null,
      resultat: resultat || null,
      volume_recupere_m3j: volumeRecupere ? Number(volumeRecupere) : null,
    });

    setEnCours(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    setResultat("");
    setVolumeRecupere("");
    setPlanifieeLe("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {erreur && (
        <Alert variant="destructive">
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Type d&apos;intervention</Label>
          <Select value={type} onValueChange={(v) => v && setType(v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Statut</Label>
          <Select value={statut} onValueChange={(v) => v && setStatut(v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="planifiee_le">Date planifiée</Label>
          <Input
            id="planifiee_le"
            type="date"
            value={planifieeLe}
            onChange={(e) => setPlanifieeLe(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="volume_recupere">
            Volume récupéré (m³/j, si terminée)
          </Label>
          <Input
            id="volume_recupere"
            type="number"
            step="0.1"
            min="0"
            value={volumeRecupere}
            onChange={(e) => setVolumeRecupere(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="resultat">Résultat / observations</Label>
        <Textarea
          id="resultat"
          rows={3}
          value={resultat}
          onChange={(e) => setResultat(e.target.value)}
          placeholder="Fuite localisée sur le branchement rue..., réparée le..."
        />
      </div>
      <Button type="submit" disabled={enCours}>
        {enCours ? "Enregistrement…" : "Enregistrer l'intervention"}
      </Button>
    </form>
  );
}
