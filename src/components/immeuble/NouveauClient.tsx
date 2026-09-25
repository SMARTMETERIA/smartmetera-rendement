"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { creerClient } from "@/app/(espace)/immeuble/equipe/actions";
import { LIBELLES_TYPE_CLIENT } from "@/lib/immeuble/libelles";

export function NouveauClient() {
  const [nom, setNom] = useState("");
  const [type, setType] = useState("syndic_pro");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    const resultat = await creerClient({ name: nom, type });
    setEnCours(false);
    if ("erreur" in resultat) {
      setErreur(resultat.erreur);
      return;
    }
    setNom("");
  }

  return (
    <form onSubmit={ajouter} className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
      <div className="space-y-2">
        <Label htmlFor="client-nom">Nouveau client</Label>
        <Input
          id="client-nom"
          required
          placeholder="Cabinet Martin Syndic"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Type</Label>
        <Select value={type} onValueChange={(v) => v && setType(v)}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(LIBELLES_TYPE_CLIENT).map(([valeur, libelle]) => (
              <SelectItem key={valeur} value={valeur}>
                {libelle}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" variant="outline" disabled={enCours}>
        {enCours ? "Ajout…" : "Ajouter le client"}
      </Button>
      {erreur && (
        <Alert variant="destructive" className="sm:col-span-3">
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
