"use client";

import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { calculerUsageMensuel } from "@/app/(dashboard)/admin/actions";

export interface LigneUsageAdmin {
  id: string;
  organisation: string;
  monnaie: string;
  pointsActifs: number;
  misesEnService: number;
  sondes: number;
  ht: number;
  retenue: number;
  net: number;
  incomplet: boolean;
}

const montant = (n: number, monnaie: string) =>
  `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} ${monnaie === "EUR" ? "€" : "MAD"}`;

/** Usage mensuel et export CSV de facturation (EUR et MAD). */
export function UsagePanel({ mois, lignes }: { mois: string; lignes: LigneUsageAdmin[] }) {
  const [choix, setChoix] = useState(mois);
  const [enCours, setEnCours] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);

  async function calculer() {
    setEnCours(true);
    const r = await calculerUsageMensuel({ mois: choix });
    setEnCours(false);
    setRetour("erreur" in r ? { ok: false, texte: r.erreur } : { ok: true, texte: `${r.lignes} ligne(s) calculée(s).` });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="usage-mois">Mois</Label>
          <Input id="usage-mois" type="month" value={choix} onChange={(e) => setChoix(e.target.value)} />
        </div>
        <Button onClick={calculer} disabled={enCours}>
          {enCours ? "Calcul…" : "Calculer l'usage"}
        </Button>
        <a href={`/api/admin/usage?mois=${choix}`} className={cn(buttonVariants({ variant: "outline" }))}>
          Export CSV
        </a>
      </div>
      {retour && (
        <Alert variant={retour.ok ? "default" : "destructive"}>
          <AlertDescription>{retour.texte}</AlertDescription>
        </Alert>
      )}
      {lignes.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucun usage calculé pour ce mois.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organisation</TableHead>
              <TableHead>Points actifs</TableHead>
              <TableHead>Mises en service</TableHead>
              <TableHead>Sondes</TableHead>
              <TableHead>Total HT</TableHead>
              <TableHead>Retenue</TableHead>
              <TableHead>Net</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lignes.map((l) => (
              <TableRow key={l.id}>
                <TableCell>
                  {l.organisation} {l.incomplet && <Badge variant="destructive">Tarif à paramétrer</Badge>}
                </TableCell>
                <TableCell className="tabular-nums">{l.pointsActifs}</TableCell>
                <TableCell className="tabular-nums">{l.misesEnService}</TableCell>
                <TableCell className="tabular-nums">{l.sondes}</TableCell>
                <TableCell className="tabular-nums">{montant(l.ht, l.monnaie)}</TableCell>
                <TableCell className="tabular-nums">{montant(l.retenue, l.monnaie)}</TableCell>
                <TableCell className="tabular-nums">{montant(l.net, l.monnaie)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
