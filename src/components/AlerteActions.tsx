"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function AlerteActions({
  alerteId,
  statut,
  userId,
}: {
  alerteId: string;
  statut: string;
  userId: string;
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState<string | null>(null);

  async function mettreAJour(champs: Record<string, unknown>, action: string) {
    setEnCours(action);
    const supabase = createClient();
    await supabase.from("alerts").update(champs).eq("id", alerteId);
    setEnCours(null);
    router.refresh();
  }

  if (statut === "resolue" || statut === "ignoree") {
    return <span className="text-muted-foreground text-xs">Traitée</span>;
  }

  return (
    <div className="flex gap-2">
      {statut === "ouverte" && (
        <Button
          size="sm"
          variant="outline"
          disabled={enCours !== null}
          onClick={() =>
            mettreAJour(
              {
                statut: "acquittee",
                acquittee_le: new Date().toISOString(),
                acquittee_par: userId,
              },
              "acquitter",
            )
          }
        >
          {enCours === "acquitter" ? "…" : "Acquitter"}
        </Button>
      )}
      <Button
        size="sm"
        disabled={enCours !== null}
        onClick={() =>
          mettreAJour(
            { statut: "resolue", resolue_le: new Date().toISOString() },
            "cloturer",
          )
        }
      >
        {enCours === "cloturer" ? "…" : "Clôturer"}
      </Button>
    </div>
  );
}
