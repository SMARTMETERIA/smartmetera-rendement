"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { VueRapportEcran } from "@/components/rapports/VueRapportEcran";
import { prediagnostic, validerPrediagnostic, vuePrediagnostic } from "@/lib/gardien/prediagnostic";
import type { Tarifs } from "@/lib/gardien-rapports/contenus";

const CHAMPS = [
  ["etablissement", "Établissement", "Hôtel du Lac"],
  ["prixM3", "Prix de l'eau au m³", "4,89"],
  ["factureAnnuelle", "Facture d'eau annuelle (facultatif)", "21 000"],
  ["capacite", "Capacité (chambres, emplacements…)", "60"],
  ["tauxOccupation", "Taux d'occupation (%)", "70"],
  ["nbPoints", "Nombre de points à surveiller", "1"],
] as const;

/** Saisie et résultat en direct ; le PDF reprend exactement la même vue. */
export function FormulairePrediagnostic({
  tarifs,
  debits,
}: {
  tarifs: Record<string, Tarifs>;
  debits: { chasseLph: number; fuiteEnterreeLph: number };
}) {
  const [valeurs, setValeurs] = useState<Record<string, string>>({ pays: "FR", nbPoints: "1", prixM3: "4,89" });
  const validation = useMemo(() => validerPrediagnostic(valeurs), [valeurs]);
  const vue = validation.ok
    ? vuePrediagnostic(
        validation.entree,
        prediagnostic(validation.entree, tarifs[validation.entree.pays === "MA" ? "MAD" : "EUR"] ?? null, debits),
      )
    : null;
  const lienPdf = `/prediagnostic/pdf?${new URLSearchParams(valeurs).toString()}`;

  return (
    <div className="space-y-6">
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <div className="space-y-1">
          <Label>Pays</Label>
          <Select
            items={{ FR: "France (euros)", MA: "Maroc (dirhams)" }}
            value={valeurs.pays}
            onValueChange={(v) => v && setValeurs((x) => ({ ...x, pays: v, prixM3: v === "MA" ? "" : x.prixM3 }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FR">France (euros)</SelectItem>
              <SelectItem value="MA">Maroc (dirhams)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {CHAMPS.map(([cle, libelle, exemple]) => (
          <div key={cle} className="space-y-1">
            <Label htmlFor={`pd-${cle}`}>{libelle}</Label>
            <Input
              id={`pd-${cle}`}
              placeholder={exemple}
              inputMode={cle === "etablissement" ? "text" : "decimal"}
              value={valeurs[cle] ?? ""}
              onChange={(e) => setValeurs((x) => ({ ...x, [cle]: e.target.value }))}
            />
          </div>
        ))}
      </form>
      {!validation.ok && (
        <Alert>
          <AlertDescription>{validation.erreur}</AlertDescription>
        </Alert>
      )}
      {vue && (
        <VueRapportEcran
          vue={vue}
          actions={
            <a href={lienPdf} className={cn(buttonVariants({ variant: "outline" }))}>
              Télécharger le PDF
            </a>
          }
        />
      )}
    </div>
  );
}
