"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function TelechargerRapport({ fichierPath }: { fichierPath: string | null }) {
  const [enCours, setEnCours] = useState(false);

  async function telecharger() {
    if (!fichierPath) return;
    setEnCours(true);
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("rapports")
      .createSignedUrl(fichierPath, 60);
    setEnCours(false);
    if (!error && data) window.open(data.signedUrl, "_blank");
  }

  if (!fichierPath) return <span className="text-muted-foreground text-xs">—</span>;

  return (
    <Button type="button" variant="outline" size="sm" onClick={telecharger} disabled={enCours}>
      {enCours ? "…" : "Télécharger"}
    </Button>
  );
}
