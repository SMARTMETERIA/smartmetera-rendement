"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { enregistrerTelephoneAlerte } from "@/app/(espace)/compte/actions";

/** Numéro qui reçoit les SMS d'alerte, puis l'appel ou le message WhatsApp. */
export function TelephoneAlerte({ actuel, pays }: { actuel: string | null; pays: string }) {
  const [saisie, setSaisie] = useState(actuel ?? "");
  const [enCours, setEnCours] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    const r = await enregistrerTelephoneAlerte(saisie, pays);
    setEnCours(false);
    setRetour("erreur" in r ? { ok: false, texte: r.erreur } : { ok: true, texte: r.message });
  }

  return (
    <form onSubmit={enregistrer} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="telephone-alerte">Téléphone portable</Label>
        <Input
          id="telephone-alerte"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={pays === "MA" ? "06 12 34 56 78 ou +212 6…" : "06 12 34 56 78"}
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={enCours}>
        {enCours ? "Enregistrement…" : "Enregistrer le numéro"}
      </Button>
      {retour && (
        <Alert variant={retour.ok ? "default" : "destructive"}>
          <AlertDescription>{retour.texte}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
