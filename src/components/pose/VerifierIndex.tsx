"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  corrigerPoids,
  verifierIndex,
  type ResultatVerification,
} from "@/app/(espace)/pose/actions";

/**
 * Quelques jours après la pose : l'index lu sur le compteur est comparé à
 * l'index reconstitué (index de pose + volumes mesurés) pour vérifier le
 * poids d'impulsion, et le corriger si besoin.
 */
export function VerifierIndex({ meterId }: { meterId: string }) {
  const [index, setIndex] = useState("");
  const [resultat, setResultat] = useState<ResultatVerification | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function verifier(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setMessage(null);
    const n = Number(index.replace(/\s/g, "").replace(",", "."));
    setResultat(await verifierIndex(meterId, n));
    setEnCours(false);
  }

  async function corriger(poids: number) {
    setEnCours(true);
    const r = await corrigerPoids(meterId, poids);
    setEnCours(false);
    setMessage(
      "erreur" in r
        ? r.erreur
        : `Poids d'impulsion corrigé : ${r.releves} relevé${r.releves > 1 ? "s" : ""} recalculé${r.releves > 1 ? "s" : ""}.`,
    );
    setResultat(null);
  }

  return (
    <form onSubmit={verifier} className="space-y-3">
      <Label htmlFor="index-lu">
        Index lu aujourd&apos;hui sur le compteur (m³)
      </Label>
      <Input
        id="index-lu"
        inputMode="decimal"
        value={index}
        onChange={(e) => setIndex(e.target.value)}
        className="h-14 text-2xl tabular-nums"
      />
      <Button
        type="submit"
        className="h-12 w-full"
        disabled={enCours || !index.trim()}
      >
        Vérifier le réglage
      </Button>
      {resultat && "erreur" in resultat && (
        <Alert variant="destructive">
          <AlertDescription>{resultat.erreur}</AlertDescription>
        </Alert>
      )}
      {resultat && "ok" in resultat && (
        <Alert>
          <AlertDescription className="space-y-3">
            <p>{resultat.verification.message}</p>
            {resultat.verification.statut === "a_corriger" && (
              <Button
                type="button"
                className="w-full"
                disabled={enCours}
                onClick={() =>
                  resultat.verification.statut === "a_corriger" &&
                  corriger(resultat.verification.poidsSuggere)
                }
              >
                Corriger à{" "}
                {new Intl.NumberFormat("fr-FR").format(
                  resultat.verification.poidsSuggere,
                )}{" "}
                L par impulsion
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {message && <p className="text-sm">{message}</p>}
    </form>
  );
}
