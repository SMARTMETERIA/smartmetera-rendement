"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { consentirConversion } from "@/app/(espace)/sites/actions";

/**
 * Accord écrit du client pour que la surveillance continue avec
 * l'abonnement à la fin du pilote : case cochée, nom, date enregistrée.
 * Sans cet accord, SmartMeteria appelle le client avant toute conversion.
 * TODO(RAYAN) : formulation à faire valider avec les conditions de pilote
 * (docs/BLOCKERS.md).
 */
export function ConsentementPilote({
  piloteId,
  siteId,
  accorde,
  accordeLe,
  accordePar,
  fin,
}: {
  piloteId: string;
  siteId: string;
  accorde: boolean;
  accordeLe: string | null;
  accordePar: string | null;
  fin: string;
}) {
  const [coche, setCoche] = useState(false);
  const [nom, setNom] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function envoyer(accepte: boolean) {
    setEnCours(true);
    setErreur(null);
    const r = await consentirConversion({ piloteId, siteId, nom, accepte });
    setEnCours(false);
    if ("erreur" in r) setErreur(r.erreur);
  }

  if (accorde) {
    return (
      <div className="space-y-2 text-sm">
        <p>
          Accord donné le {accordeLe} par {accordePar} : la surveillance continuera avec
          l&apos;abonnement après le {fin}.
        </p>
        <Button variant="ghost" size="sm" disabled={enCours} onClick={() => envoyer(false)}>
          Retirer mon accord
        </Button>
        {erreur && (
          <Alert variant="destructive">
            <AlertDescription>{erreur}</AlertDescription>
          </Alert>
        )}
      </div>
    );
  }
  return (
    <form
      className="space-y-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void envoyer(true);
      }}
    >
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-1" checked={coche} onChange={(e) => setCoche(e.target.checked)} />
        <span>
          J&apos;accepte que la surveillance continue avec l&apos;abonnement à la fin du pilote, le {fin}.
          Sans cet accord, nous vous appellerons avant.{" "}
          <Link href="/legal/conditions-pilote" target="_blank" className="underline underline-offset-4">
            Conditions du pilote
          </Link>
        </span>
      </label>
      <div className="space-y-1">
        <Label htmlFor="consentement-nom">Votre prénom et votre nom</Label>
        <Input id="consentement-nom" className="max-w-xs" value={nom} onChange={(e) => setNom(e.target.value)} />
      </div>
      <Button type="submit" disabled={enCours || !coche || nom.trim().length < 2}>
        Enregistrer mon accord
      </Button>
      {erreur && (
        <Alert variant="destructive">
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
