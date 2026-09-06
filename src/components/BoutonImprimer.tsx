"use client";

import { Button } from "@/components/ui/button";

/** "Rapport PDF" via l'impression navigateur (Enregistrer au format PDF) — pas de dépendance PDF supplémentaire. */
export function BoutonImprimer({ label = "Rapport PDF" }: { label?: string }) {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      {label}
    </Button>
  );
}
