"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { simulerFuite } from "@/app/(espace)/sites/fuites/actions";

/** Essai en développement : fait apparaître une fuite simulée sur un site. */
export function SimulerFuite({ sites }: { sites: { id: string; name: string }[] }) {
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function simuler() {
    setEnCours(true);
    setErreur(null);
    const resultat = await simulerFuite(siteId);
    setEnCours(false);
    if ("erreur" in resultat) setErreur(resultat.erreur);
  }

  if (sites.length === 0) return null;
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <p className="text-muted-foreground text-sm">
        Essai (développement seulement) : faire apparaître une fuite simulée
        de 25 L/h pour tester l&apos;affichage et les boutons.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          items={Object.fromEntries(sites.map((s) => [s.id, s.name]))}
          value={siteId}
          onValueChange={(v) => v && setSiteId(v)}
        >
          <SelectTrigger className="w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sites.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" disabled={enCours || !siteId} onClick={simuler}>
          {enCours ? "Simulation…" : "Simuler une fuite"}
        </Button>
      </div>
      {erreur && (
        <Alert variant="destructive">
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
