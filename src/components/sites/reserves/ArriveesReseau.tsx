"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { definirArrivees } from "@/app/(espace)/sites/reserves/actions";

/**
 * Choix du compteur qui mesure l'eau arrivant du réseau public (compteur
 * général) : sans lui, une coupure ne peut pas être repérée.
 */
export function ArriveesReseau({
  siteId,
  compteurs,
}: {
  siteId: string;
  compteurs: { id: string; libelle: string; arrivee: boolean }[];
}) {
  const [choisis, setChoisis] = useState(new Set(compteurs.filter((c) => c.arrivee).map((c) => c.id)));
  const [enCours, setEnCours] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);

  if (!compteurs.length) {
    return (
      <p className="text-muted-foreground text-sm">
        Aucun compteur posé sur ce site : posez d&apos;abord un capteur sur le compteur général (« Poser un capteur »).
      </p>
    );
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    const r = await definirArrivees(siteId, [...choisis]);
    setEnCours(false);
    setRetour("erreur" in r ? { ok: false, texte: r.erreur } : { ok: true, texte: "Compteur d'arrivée enregistré." });
  }

  return (
    <form onSubmit={enregistrer} className="space-y-3">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Quel compteur mesure l&apos;eau qui arrive du réseau public ?</legend>
        {compteurs.map((c) => (
          <label key={c.id} className="flex min-h-10 items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-5 accent-[var(--primary)]"
              checked={choisis.has(c.id)}
              onChange={(e) =>
                setChoisis((x) => {
                  const suivant = new Set(x);
                  if (e.target.checked) suivant.add(c.id);
                  else suivant.delete(c.id);
                  return suivant;
                })
              }
            />
            {c.libelle}
          </label>
        ))}
      </fieldset>
      <Button type="submit" variant="outline" disabled={enCours} className="w-full sm:w-auto">
        {enCours ? "Enregistrement…" : "Enregistrer le compteur d'arrivée"}
      </Button>
      {retour && (
        <Alert variant={retour.ok ? "default" : "destructive"}>
          <AlertDescription>{retour.texte}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
