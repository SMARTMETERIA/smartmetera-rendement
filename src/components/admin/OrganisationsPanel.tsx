"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Organisation {
  id: string;
  nom: string;
  lineaire_reseau_km: number | null;
  nb_abonnes: number | null;
  zone_repartition_eaux: boolean;
  prix_m3_eur: number;
  created_at: string;
}

export function OrganisationsPanel({ organisations }: { organisations: Organisation[] }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState("");
  const [lineaire, setLineaire] = useState("");
  const [abonnes, setAbonnes] = useState("");
  const [zre, setZre] = useState(false);
  const [prixM3, setPrixM3] = useState("2");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    const supabase = createClient();
    const { error } = await supabase.from("organizations").insert({
      nom,
      lineaire_reseau_km: lineaire ? Number(lineaire) : null,
      nb_abonnes: abonnes ? Number(abonnes) : null,
      zone_repartition_eaux: zre,
      prix_m3_eur: Number(prixM3),
    });
    setEnCours(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    setNom("");
    setLineaire("");
    setAbonnes("");
    setZre(false);
    setOuvert(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
            <TableHead>Linéaire</TableHead>
            <TableHead>Abonnés</TableHead>
            <TableHead>ZRE</TableHead>
            <TableHead>Prix m³</TableHead>
            <TableHead>Créée le</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {organisations.map((o) => (
            <TableRow key={o.id}>
              <TableCell className="font-medium">{o.nom}</TableCell>
              <TableCell>{o.lineaire_reseau_km ? `${o.lineaire_reseau_km} km` : "—"}</TableCell>
              <TableCell>{o.nb_abonnes ?? "—"}</TableCell>
              <TableCell>{o.zone_repartition_eaux ? "Oui" : "Non"}</TableCell>
              <TableCell>{o.prix_m3_eur} €</TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {new Date(o.created_at).toLocaleDateString("fr-FR")}
              </TableCell>
            </TableRow>
          ))}
          {organisations.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground text-center">
                Aucune organisation.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogTrigger render={<Button type="button" variant="outline" />}>
          + Créer une organisation
        </DialogTrigger>
        <DialogContent>
          <form onSubmit={creer} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Nouvelle organisation</DialogTitle>
            </DialogHeader>
            {erreur && (
              <Alert variant="destructive">
                <AlertDescription>{erreur}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="org-nom">Nom</Label>
              <Input id="org-nom" value={nom} onChange={(e) => setNom(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="org-lineaire">Linéaire de réseau (km)</Label>
                <Input
                  id="org-lineaire"
                  type="number"
                  step="0.1"
                  value={lineaire}
                  onChange={(e) => setLineaire(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-abonnes">Nombre d&apos;abonnés</Label>
                <Input
                  id="org-abonnes"
                  type="number"
                  value={abonnes}
                  onChange={(e) => setAbonnes(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-prix">Prix moyen de l&apos;eau (€/m³)</Label>
              <Input
                id="org-prix"
                type="number"
                step="0.01"
                value={prixM3}
                onChange={(e) => setPrixM3(e.target.value)}
              />
            </div>
            <Label className="flex items-center gap-2">
              <input type="checkbox" checked={zre} onChange={(e) => setZre(e.target.checked)} />
              Zone de répartition des eaux (ZRE)
            </Label>
            <DialogFooter>
              <Button type="submit" disabled={enCours}>
                {enCours ? "Création…" : "Créer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
