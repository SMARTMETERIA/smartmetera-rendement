"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { calculerBilan } from "@/lib/engine/bilan";
import type { BilanEau } from "@/lib/rendement";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CHAMP_VIDE: BilanEau = {
  vProduit: 0,
  vImporte: 0,
  vExporte: 0,
  vComptabilise: 0,
  vSansComptage: 0,
  vService: 0,
  lineaireKm: 0,
  zoneDeRepartitionDesEaux: false,
};

function formatEuro(v: number): string {
  return `${v.toFixed(1)} %`;
}

export function BilanForm({
  organizationId,
  anneesExistantes,
}: {
  organizationId: string;
  anneesExistantes: number[];
}) {
  const router = useRouter();
  const anneeActuelle = new Date().getFullYear();
  const [annee, setAnnee] = useState<number>(
    anneesExistantes[0] ?? anneeActuelle,
  );
  const [nbAbonnes, setNbAbonnes] = useState<number>(0);
  const [bilan, setBilan] = useState<BilanEau>(CHAMP_VIDE);
  const [chargement, setChargement] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  useEffect(() => {
    let annule = false;
    void (async () => {
      setChargement(true);
      setSucces(false);
      const supabase = createClient();
      const { data } = await supabase
        .from("balance_inputs")
        .select(
          "v_produit, v_importe, v_exporte, v_comptabilise, v_sans_comptage, v_service, lineaire_reseau_km, nb_abonnes, zone_repartition_eaux",
        )
        .eq("organization_id", organizationId)
        .eq("annee", annee)
        .maybeSingle();
      if (annule) return;
      if (data) {
        setBilan({
          vProduit: data.v_produit,
          vImporte: data.v_importe,
          vExporte: data.v_exporte,
          vComptabilise: data.v_comptabilise,
          vSansComptage: data.v_sans_comptage,
          vService: data.v_service,
          lineaireKm: data.lineaire_reseau_km,
          zoneDeRepartitionDesEaux: data.zone_repartition_eaux,
        });
        setNbAbonnes(data.nb_abonnes);
      } else {
        setBilan(CHAMP_VIDE);
        setNbAbonnes(0);
      }
      setChargement(false);
    })();
    return () => {
      annule = true;
    };
  }, [annee, organizationId]);

  const resultat = useMemo(
    () =>
      calculerBilan(bilan, "annee_civile", `${annee}-01-01`, `${annee}-12-31`),
    [bilan, annee],
  );

  function champ(nom: Exclude<keyof BilanEau, "zoneDeRepartitionDesEaux">) {
    return {
      value: String(bilan[nom] ?? 0),
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setBilan((b) => ({ ...b, [nom]: Number(e.target.value) })),
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEnregistrement(true);
    setErreur(null);
    setSucces(false);

    const supabase = createClient();
    const { error } = await supabase.from("balance_inputs").upsert(
      {
        organization_id: organizationId,
        annee,
        v_produit: bilan.vProduit,
        v_importe: bilan.vImporte,
        v_exporte: bilan.vExporte,
        v_comptabilise: bilan.vComptabilise,
        v_sans_comptage: bilan.vSansComptage,
        v_service: bilan.vService,
        lineaire_reseau_km: bilan.lineaireKm,
        nb_abonnes: nbAbonnes,
        zone_repartition_eaux: bilan.zoneDeRepartitionDesEaux ?? false,
      },
      { onConflict: "organization_id,annee" },
    );

    setEnregistrement(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    setSucces(true);
    router.refresh();
  }

  const annees = Array.from(
    new Set([
      anneeActuelle,
      anneeActuelle - 1,
      anneeActuelle - 2,
      ...anneesExistantes,
    ]),
  ).sort((a, b) => b - a);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {erreur && (
        <Alert variant="destructive">
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}
      {succes && (
        <Alert>
          <AlertDescription>Bilan {annee} enregistré.</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label>Exercice</Label>
        <Select
          value={String(annee)}
          onValueChange={(v) => v && setAnnee(Number(v))}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {annees.map((a) => (
              <SelectItem key={a} value={String(a)}>
                {a} {anneesExistantes.includes(a) ? "· saisi" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="v_produit">Volume produit (m³)</Label>
          <Input
            id="v_produit"
            type="number"
            step="1"
            {...champ("vProduit")}
            disabled={chargement}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="v_importe">Volume importé (m³)</Label>
          <Input
            id="v_importe"
            type="number"
            step="1"
            {...champ("vImporte")}
            disabled={chargement}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="v_exporte">Volume exporté (m³)</Label>
          <Input
            id="v_exporte"
            type="number"
            step="1"
            {...champ("vExporte")}
            disabled={chargement}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="v_comptabilise">Volume comptabilisé (m³)</Label>
          <Input
            id="v_comptabilise"
            type="number"
            step="1"
            {...champ("vComptabilise")}
            disabled={chargement}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="v_sans_comptage">Volume sans comptage (m³)</Label>
          <Input
            id="v_sans_comptage"
            type="number"
            step="1"
            {...champ("vSansComptage")}
            disabled={chargement}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="v_service">Volume de service (m³)</Label>
          <Input
            id="v_service"
            type="number"
            step="1"
            {...champ("vService")}
            disabled={chargement}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lineaire_km">Linéaire de réseau (km)</Label>
          <Input
            id="lineaire_km"
            type="number"
            step="0.1"
            {...champ("lineaireKm")}
            disabled={chargement}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nb_abonnes">Nombre d&apos;abonnés</Label>
          <Input
            id="nb_abonnes"
            type="number"
            step="1"
            value={nbAbonnes}
            onChange={(e) => setNbAbonnes(Number(e.target.value))}
            disabled={chargement}
          />
        </div>
        <div className="flex items-end space-y-2 pb-2">
          <Label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={bilan.zoneDeRepartitionDesEaux ?? false}
              onChange={(e) =>
                setBilan((b) => ({
                  ...b,
                  zoneDeRepartitionDesEaux: e.target.checked,
                }))
              }
              disabled={chargement}
            />
            Zone de répartition des eaux (ZRE)
          </Label>
        </div>
      </div>

      <div className="bg-muted/40 grid gap-3 rounded-lg border p-4 sm:grid-cols-4">
        <div>
          <p className="text-muted-foreground text-xs">Rendement</p>
          <p className="text-xl font-semibold">
            {formatEuro(resultat.rendement * 100)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">ILP</p>
          <p className="text-xl font-semibold">
            {Number.isFinite(resultat.ilp) ? resultat.ilp.toFixed(2) : "—"}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">ILC</p>
          <p className="text-xl font-semibold">
            {Number.isFinite(resultat.ilc) ? resultat.ilc.toFixed(2) : "—"}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Seuil réglementaire</p>
          <p className="text-xl font-semibold">
            {formatEuro(resultat.seuilReglementaire * 100)}
          </p>
        </div>
        <div className="sm:col-span-4">
          <Badge
            variant={resultat.conformeDecret ? "secondary" : "destructive"}
          >
            {resultat.conformeDecret
              ? "Conforme au décret 2012-97"
              : "Non conforme au décret 2012-97"}
          </Badge>
        </div>
      </div>

      <Button type="submit" disabled={enregistrement || chargement}>
        {enregistrement ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}
