"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { retirerMembreSites } from "@/app/(espace)/sites/equipe/actions";

export function RetirerMembreSites({
  membershipId,
  email,
}: {
  membershipId: string;
  email: string;
}) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function retirer() {
    if (!window.confirm(`Retirer l'accès de ${email} ?`)) return;
    setEnCours(true);
    const resultat = await retirerMembreSites(membershipId);
    setEnCours(false);
    if ("erreur" in resultat) setErreur(resultat.erreur);
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button variant="outline" size="sm" onClick={retirer} disabled={enCours} aria-label={`Retirer l'accès de ${email}`}>
        Retirer
      </Button>
      {erreur && <span className="text-destructive text-xs">{erreur}</span>}
    </div>
  );
}
