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
import { creerPagePreuve } from "@/app/(espace)/sites/actions";

/** Crée une page preuve des 30 derniers jours, à transférer à la direction. */
export function PagePreuveBouton({ sites }: { sites: { id: string; name: string }[] }) {
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [enCours, setEnCours] = useState(false);
  const [retour, setRetour] = useState<{ url?: string; erreur?: string } | null>(null);

  async function creer() {
    setEnCours(true);
    setRetour(null);
    const r = await creerPagePreuve(siteId);
    setEnCours(false);
    setRetour("erreur" in r ? { erreur: r.erreur } : { url: r.url });
  }

  if (sites.length === 0) return null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {sites.length > 1 && (
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
        )}
        <Button variant="outline" disabled={enCours || !siteId} onClick={creer}>
          {enCours ? "Création…" : "Créer une page preuve (30 derniers jours)"}
        </Button>
      </div>
      {retour?.erreur && (
        <Alert variant="destructive">
          <AlertDescription>{retour.erreur}</AlertDescription>
        </Alert>
      )}
      {retour?.url && (
        <Alert>
          <AlertDescription>
            Lien à transférer (valable 90 jours, lisible sans compte) :{" "}
            <a href={retour.url} className="font-medium break-all underline" target="_blank" rel="noreferrer">
              {retour.url}
            </a>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
