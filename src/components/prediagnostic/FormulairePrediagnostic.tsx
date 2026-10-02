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

/** Pays et monnaie de l'établissement (RDC : dollar ou franc congolais). */
const PAYS_MONNAIES: Record<string, string> = {
  "FR|EUR": "France (euros)",
  "MA|MAD": "Maroc (dirhams)",
  "CD|USD": "RD Congo (dollars américains)",
  "CD|CDF": "RD Congo (francs congolais)",
};

/** Saisie et résultat en direct ; le PDF reprend exactement la même vue. */
export function FormulairePrediagnostic({
  tarifs,
  debits,
}: {
  tarifs: Record<string, Tarifs>;
  debits: { chasseLph: number; fuiteEnterreeLph: number };
}) {
  const [valeurs, setValeurs] = useState<Record<string, string>>({ pays: "FR", monnaie: "EUR", nbPoints: "1", prixM3: "4,89" });
  const validation = useMemo(() => validerPrediagnostic(valeurs), [valeurs]);
  const vue = validation.ok
    ? vuePrediagnostic(
        validation.entree,
        prediagnostic(validation.entree, tarifs[validation.entree.monnaie] ?? null, debits),
      )
    : null;
  const lienPdf = `/prediagnostic/pdf?${new URLSearchParams(valeurs).toString()}`;

  return (
    <div className="space-y-6">
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <div className="space-y-1">
          <Label htmlFor="prediagnostic-pays">Pays</Label>
          <Select
            items={PAYS_MONNAIES}
            value={`${valeurs.pays}|${valeurs.monnaie}`}
            onValueChange={(v) => {
              if (!v) return;
              const [pays, monnaie] = v.split("|");
              // Aucun prix de l'eau par défaut hors de France : à saisir.
              setValeurs((x) => ({ ...x, pays, monnaie, prixM3: pays === "FR" ? x.prixM3 : "" }));
            }}
          >
            <SelectTrigger id="prediagnostic-pays" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PAYS_MONNAIES).map(([valeur, libelle]) => (
                <SelectItem key={valeur} value={valeur}>
                  {libelle}
                </SelectItem>
              ))}
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
