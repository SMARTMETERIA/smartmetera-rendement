"use client";

import { useEffect, useState } from "react";
import { coutFuite, methodePertes, type Monnaie } from "@/lib/moteur-gardien/economies";
import { formaterMontant, formaterVolume } from "@/lib/gardien/fuites";

/**
 * Compteur de pertes en direct d'une fuite ouverte (moment fort de
 * docs/DESIGN.md) : l'argent perdu depuis la détection en très grand, qui
 * augmente chaque seconde ; le coût par mois si rien n'est fait ; la
 * méthode prudente juste dessous. Démarre à l'heure du rendu serveur.
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
  const perdu = cout.coutCumule !== null ? formaterMontant(cout.coutCumule, monnaie) : formaterVolume(cout.m3Cumules);
  const parMois =
    cout.coutMensuelProjete !== null
      ? formaterMontant(cout.coutMensuelProjete, monnaie)
      : formaterVolume(cout.m3ParJour * 30);
  const parJour = cout.coutParJour !== null ? formaterMontant(cout.coutParJour, monnaie) : formaterVolume(cout.m3ParJour);

  return (
    <div className="bg-destructive/5 space-y-2 rounded-lg p-4">
      <p className="text-destructive font-heading text-4xl font-semibold tabular-nums sm:text-5xl" aria-live="off">
        {perdu}
      </p>
      <p className="text-sm">
        perdus depuis la détection
        {cout.coutCumule !== null && (
          <span className="text-muted-foreground tabular-nums"> ({formaterVolume(cout.m3Cumules)})</span>
        )}
      </p>
      <p className="text-sm">
        Si rien n&apos;est fait : <span className="font-semibold tabular-nums">{parMois} par mois</span>
        <span className="text-muted-foreground tabular-nums"> ({parJour} par jour)</span>
      </p>
      <p className="text-muted-foreground text-xs">{methodePertes(excesLph, prixM3, monnaie)}</p>
    </div>
  );
}
