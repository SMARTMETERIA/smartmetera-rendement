"use client";

import { useEffect, useState } from "react";
import { coutFuite, methodePertes, type Monnaie } from "@/lib/moteur-gardien/economies";
import { formaterMontant, formaterVolume } from "@/lib/gardien/fuites";

/**
 * Compteur de pertes en direct d'une fuite ouverte : depuis la détection,
 * par jour et par mois si rien n'est fait, avec la méthode prudente.
 * Démarre à l'heure du rendu serveur (même affichage des deux côtés).
 */
export function CompteurPertes({
  excesLph,
  prixM3,
  monnaie,
  depuis,
  rendueA,
}: {
  excesLph: number;
  prixM3: number | null;
  monnaie: Monnaie;
  depuis: string;
  rendueA: number;
}) {
  const [maintenant, setMaintenant] = useState(rendueA);
  useEffect(() => {
    const minuteur = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(minuteur);
  }, []);

  const cout = coutFuite({
    excesLph,
    prixM3,
    depuisMs: Date.parse(depuis),
    maintenantMs: maintenant,
  });

  return (
    <div className="bg-destructive/5 space-y-1 rounded-lg p-3">
      <p className="text-sm">
        Perdu depuis la détection :{" "}
        <span className="text-destructive text-lg font-semibold tabular-nums">
          {cout.coutCumule !== null
            ? formaterMontant(cout.coutCumule, monnaie)
            : formaterVolume(cout.m3Cumules)}
        </span>
        {cout.coutCumule !== null && (
          <span className="text-muted-foreground tabular-nums">
            {" "}
            ({formaterVolume(cout.m3Cumules)})
          </span>
        )}
      </p>
      <p className="text-sm">
        Si rien n&apos;est fait :{" "}
        <span className="font-medium tabular-nums">
          {cout.coutMensuelProjete !== null
            ? `${formaterMontant(cout.coutMensuelProjete, monnaie)} par mois`
            : `${formaterVolume(cout.m3ParJour * 30)} par mois`}
        </span>
        <span className="text-muted-foreground tabular-nums">
          {" "}
          (
          {cout.coutParJour !== null
            ? `${formaterMontant(cout.coutParJour, monnaie)} par jour`
            : `${formaterVolume(cout.m3ParJour)} par jour`}
          )
        </span>
      </p>
      <p className="text-muted-foreground text-xs">{methodePertes(excesLph, prixM3, monnaie)}</p>
    </div>
  );
}
