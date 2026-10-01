"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { quantite } from "@/lib/gardien-envois/format";
import { terminerTache } from "@/app/(dashboard)/admin/actions";

export interface Tache {
  id: string;
  kind: string;
  status: string;
  due_at: string | null;
  created_at: string;
  details: Record<string, unknown>;
  organisation: string;
}

const LIBELLES: Record<string, string> = {
  appel_conversion: "Appeler pour la conversion du pilote",
  remboursement_retrait: "Rembourser la mise en service et retirer le capteur",
  rapports_non_ouverts: "Aucun rapport ouvert depuis 2 mois",
};

const date = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" }).format(new Date(iso))
    : "—";

/** Tâches créées par les envois du Gardien (pilotes, suivi des rapports). */
export function TachesPanel({ taches }: { taches: Tache[] }) {
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function terminer(id: string, statut: "faite" | "annulee") {
    setEnCours(id);
    setErreur(null);
    const r = await terminerTache({ tacheId: id, statut });
    setEnCours(null);
    if ("erreur" in r) setErreur(r.erreur);
  }

  if (taches.length === 0) {
    return <p className="text-muted-foreground text-sm">Aucune tâche à faire.</p>;
  }
  return (
    <div className="space-y-3">
      {erreur && (
        <Alert variant="destructive">
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}
      <ul className="space-y-3">
        {taches.map((t) => (
          <li key={t.id} className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{LIBELLES[t.kind] ?? t.kind}</span>
              <Badge variant={t.status === "a_faire" ? "destructive" : "secondary"}>
                {t.status === "a_faire" ? "À faire" : t.status === "faite" ? "Faite" : "Annulée"}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm">
              {t.organisation}
              {typeof t.details.site === "string" ? ` — ${t.details.site}` : ""} · échéance {date(t.due_at ?? t.created_at)}
              {typeof t.details.anomalies === "number" ? ` · ${quantite(t.details.anomalies, "anomalie trouvée", "anomalies trouvées")}` : ""}
            </p>
            {t.status === "a_faire" && (
              <div className="flex gap-2">
                <Button size="sm" disabled={enCours === t.id} onClick={() => terminer(t.id, "faite")}>
                  Marquer comme faite
                </Button>
                <Button size="sm" variant="ghost" disabled={enCours === t.id} onClick={() => terminer(t.id, "annulee")}>
                  Annuler
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
