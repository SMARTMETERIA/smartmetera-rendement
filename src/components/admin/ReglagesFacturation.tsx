"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { majFacturationOrganisation } from "@/app/(dashboard)/admin/actions";
import {
  LIBELLES_STATUT_ORGANISATION,
  STATUTS_ORGANISATION,
  type SaisieFacturation,
} from "@/lib/gardien/facturationOrganisation";

/** Statut et facturation d'une organisation (superadmin). */
export function ReglagesFacturation({
  organizationId,
  initial,
  monnaie,
}: {
  organizationId: string;
  initial: SaisieFacturation;
  monnaie: string;
}) {
  const [saisie, setSaisie] = useState(initial);
  const [enCours, setEnCours] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const champ = (cle: keyof SaisieFacturation) => ({
    value: saisie[cle],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setSaisie((s) => ({ ...s, [cle]: e.target.value })),
  });

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setRetour(null);
    const r = await majFacturationOrganisation({ organizationId, ...saisie });
    setEnCours(false);
    setRetour("erreur" in r ? { ok: false, texte: r.erreur } : { ok: true, texte: "Réglages enregistrés." });
  }

  return (
    <form onSubmit={enregistrer} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1">
        <Label htmlFor="facturation-statut">Statut</Label>
        <select
          id="facturation-statut"
          className="border-input h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm pointer-coarse:min-h-10"
          {...champ("statut")}
        >
          {STATUTS_ORGANISATION.map((s) => (
            <option key={s} value={s}>
              {LIBELLES_STATUT_ORGANISATION[s]}
            </option>
          ))}
        </select>
      </div>
      {saisie.statut === "essai" && (
        <div className="space-y-1">
          <Label htmlFor="facturation-fin-essai">Fin de l&apos;essai</Label>
          <Input id="facturation-fin-essai" type="date" {...champ("finEssai")} />
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="facturation-remise">Remise fondateur (%)</Label>
        <Input id="facturation-remise" inputMode="decimal" placeholder="0" {...champ("remisePct")} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="facturation-retenue">Retenue à la source (%)</Label>
        <Input id="facturation-retenue" inputMode="decimal" placeholder="0" {...champ("retenuePct")} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="facturation-prix">Prix partenaire par point ({monnaie} HT par mois)</Label>
        <Input
          id="facturation-prix"
          inputMode="decimal"
          placeholder="vide : tarif standard"
          {...champ("prixPartenaire")}
        />
      </div>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Button type="submit" disabled={enCours} className="w-full sm:w-auto sm:self-start">
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </Button>
        {retour && (
          <Alert variant={retour.ok ? "default" : "destructive"}>
            <AlertDescription>{retour.texte}</AlertDescription>
          </Alert>
        )}
      </div>
    </form>
  );
}
