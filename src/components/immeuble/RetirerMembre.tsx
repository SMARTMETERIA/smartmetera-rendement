"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { retirerMembre } from "@/app/(espace)/immeuble/equipe/actions";

export function RetirerMembre({
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
    const resultat = await retirerMembre(membershipId);
    setEnCours(false);
    if ("erreur" in resultat) setErreur(resultat.erreur);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="ghost" size="sm" onClick={retirer} disabled={enCours}>
        Retirer
      </Button>
      {erreur && <span className="text-destructive text-xs">{erreur}</span>}
    </div>
  );
}
