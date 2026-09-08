"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { construireCsvRpqs, nomFichierRpqs, type DonneesBilanAnnuel } from "@/lib/reports/rpqsExport";

export function RpqsExport({ bilans }: { bilans: DonneesBilanAnnuel[] }) {
  const [annee, setAnnee] = useState<string>(bilans[0]?.annee.toString() ?? "");

  function exporter() {
    const bilan = bilans.find((b) => b.annee.toString() === annee);
    if (!bilan) return;
    const csv = construireCsvRpqs(bilan);
    // BOM UTF-8 explicite (U+FEFF, ecrit en \u pour eviter toute ambiguite
    // de caractere invisible dans la source) : sans lui, Excel ouvre le CSV
    // en interpretant mal les caracteres accentues.
    const BOM = String.fromCharCode(0xfeff);
    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomFichierRpqs(bilan.annee);
    a.click();
    URL.revokeObjectURL(url);
  }

  if (bilans.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Aucun bilan annuel calculé pour l&apos;instant.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={annee} onValueChange={(v) => v && setAnnee(v)}>
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {bilans.map((b) => (
            <SelectItem key={b.annee} value={b.annee.toString()}>
              {b.annee}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" variant="outline" onClick={exporter}>
        Exporter CSV RPQS/SISPEA
      </Button>
    </div>
  );
}
