"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { enregistrerActivite } from "@/app/(espace)/sites/actions";

/** Saisie simple des nuitées (ou emplacements, couverts) d'un mois. */
export function ActiviteMois({
  siteId,
  mois,
  libelleMois,
  unite,
  valeur,
}: {
  siteId: string;
  mois: string;
  libelleMois: string;
  unite: string;
  valeur: number | null;
}) {
  const [saisie, setSaisie] = useState(valeur === null ? "" : String(valeur));
  const [enCours, setEnCours] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    const r = await enregistrerActivite({ siteId, mois, quantite: saisie });
    setEnCours(false);
    setRetour("erreur" in r ? { ok: false, texte: r.erreur } : { ok: true, texte: r.message ?? "Enregistré." });
  }

  const id = `activite-${mois}`;
  return (
    <form onSubmit={enregistrer} className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor={id}>
          {unite} en {libelleMois}
        </Label>
        <Input
          id={id}
          inputMode="numeric"
          className="w-40"
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
        />
      </div>
      <Button type="submit" variant="outline" disabled={enCours}>
        {enCours ? "…" : "Enregistrer"}
      </Button>
      {retour && (
        <Alert variant={retour.ok ? "default" : "destructive"} className="w-full">
          <AlertDescription>{retour.texte}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
