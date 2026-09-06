"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Donnees {
  nom: string;
  lineaire_reseau_km: number | null;
  nb_abonnes: number | null;
  zone_repartition_eaux: boolean;
  prix_m3_eur: number;
}

export function OrganisationForm({
  organizationId,
  donneesInitiales,
}: {
  organizationId: string;
  donneesInitiales: Donnees;
}) {
  const router = useRouter();
  const [donnees, setDonnees] = useState(donneesInitiales);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    setSucces(false);

    const supabase = createClient();
    const { error } = await supabase
      .from("organizations")
      .update({
        nom: donnees.nom,
        lineaire_reseau_km: donnees.lineaire_reseau_km,
        nb_abonnes: donnees.nb_abonnes,
        zone_repartition_eaux: donnees.zone_repartition_eaux,
        prix_m3_eur: donnees.prix_m3_eur,
      })
      .eq("id", organizationId);

    setEnCours(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    setSucces(true);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="max-w-lg space-y-4">
      {erreur && (
        <Alert variant="destructive">
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}
      {succes && (
        <Alert>
          <AlertDescription>Organisation mise à jour.</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="nom">Nom de l&apos;organisation</Label>
        <Input
          id="nom"
          value={donnees.nom}
          onChange={(e) => setDonnees((d) => ({ ...d, nom: e.target.value }))}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="lineaire">Linéaire de réseau (km)</Label>
        <Input
          id="lineaire"
          type="number"
          step="0.1"
          value={donnees.lineaire_reseau_km ?? ""}
          onChange={(e) =>
            setDonnees((d) => ({
              ...d,
              lineaire_reseau_km: Number(e.target.value),
            }))
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="abonnes">Nombre d&apos;abonnés</Label>
        <Input
          id="abonnes"
          type="number"
          step="1"
          value={donnees.nb_abonnes ?? ""}
          onChange={(e) =>
            setDonnees((d) => ({ ...d, nb_abonnes: Number(e.target.value) }))
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="prix_m3">Prix moyen de l&apos;eau (€/m³)</Label>
        <Input
          id="prix_m3"
          type="number"
          step="0.01"
          value={donnees.prix_m3_eur}
          onChange={(e) =>
            setDonnees((d) => ({ ...d, prix_m3_eur: Number(e.target.value) }))
          }
        />
        <p className="text-muted-foreground text-xs">
          Utilisé pour le compteur d&apos;économies estimées de la vue
          d&apos;ensemble.
        </p>
      </div>
      <Label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={donnees.zone_repartition_eaux}
          onChange={(e) =>
            setDonnees((d) => ({
              ...d,
              zone_repartition_eaux: e.target.checked,
            }))
          }
        />
        Zone de répartition des eaux (ZRE)
      </Label>
      <Button type="submit" disabled={enCours}>
        {enCours ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}
