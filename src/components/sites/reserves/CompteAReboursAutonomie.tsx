"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Autonomie qui baisse en direct (phase G11) : temps restant jusqu'à
 * l'épuisement prévu des réserves, au rythme de consommation réel, mis à
 * jour chaque minute. Démarre à l'heure du rendu serveur.
 */
export function CompteAReboursAutonomie({
  videMs,
  rendueA,
  texteFixe,
  className,
}: {
  /** Épuisement prévu ; null : texte fixe (au-delà de l'horizon, inconnu). */
  videMs: number | null;
  rendueA: number;
  texteFixe: string;
  className?: string;
}) {
  const [maintenant, setMaintenant] = useState(rendueA);
  useEffect(() => {
    if (videMs === null) return;
    const minuteur = setInterval(() => setMaintenant(Date.now()), 30_000);
    return () => clearInterval(minuteur);
  }, [videMs]);

  let texte = texteFixe;
  if (videMs !== null) {
    const minutes = Math.max(0, Math.floor((videMs - maintenant) / 60_000));
    const heures = Math.floor(minutes / 60);
    if (minutes === 0) texte = "réserves vides";
    else if (heures >= 48) texte = `${Math.floor(heures / 24)} jours et ${heures % 24} h`;
    else texte = heures > 0 ? `${heures} h ${String(minutes % 60).padStart(2, "0")} min` : `${minutes} min`;
  }
  return (
    <p className={cn("font-heading text-5xl font-semibold tabular-nums", className)} aria-live="off">
      {texte}
    </p>
  );
}
