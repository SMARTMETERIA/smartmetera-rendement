"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function DeclencherRapportMensuel({ supabaseUrl }: { supabaseUrl: string }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<string | null>(null);

  async function declencher() {
    setEnCours(true);
    setResultat(null);
    try {
      const reponse = await fetch(`${supabaseUrl}/functions/v1/reports/mensuel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const texte = await reponse.text();
      setResultat(texte);
      router.refresh();
    } catch (e) {
      setResultat(e instanceof Error ? e.message : String(e));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" onClick={declencher} disabled={enCours}>
        {enCours ? "Génération…" : "Générer le rapport mensuel maintenant (test)"}
      </Button>
      <p className="text-muted-foreground text-xs">
        Génère le rapport du mois précédent pour les organisations ayant au
        moins un destinataire actif (idempotent : ne régénère pas s&apos;il
        existe déjà pour ce mois).
      </p>
      {resultat && (
        <Alert>
          <AlertDescription>
            <pre className="overflow-x-auto text-xs whitespace-pre-wrap">{resultat}</pre>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
