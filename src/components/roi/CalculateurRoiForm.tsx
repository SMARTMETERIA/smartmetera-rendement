"use client";

import { useMemo, useState } from "react";
import { calculerRoi } from "@/lib/roi/calculateurRoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface EntreesFormulaire {
  vProduit: number;
  vImporte: number;
  vExporte: number;
  vComptabilise: number;
  vSansComptage: number;
  vService: number;
  lineaireKm: number;
  zoneDeRepartitionDesEaux: boolean;
  coutMarginalEurM3: number;
  redevanceEurM3: number;
  prixPalierEurM3: number;
  coutTravauxEur: number;
  tauxSubventionPct: number;
}

const DEFAUTS: EntreesFormulaire = {
  vProduit: 500_000,
  vImporte: 0,
  vExporte: 0,
  vComptabilise: 320_000,
  vSansComptage: 5_000,
  vService: 5_000,
  lineaireKm: 200,
  zoneDeRepartitionDesEaux: false,
  coutMarginalEurM3: 0.5,
  redevanceEurM3: 0.1,
  prixPalierEurM3: 2,
  coutTravauxEur: 0,
  tauxSubventionPct: 30,
};

function ChampNombre({
  id,
  label,
  valeur,
  onChange,
  suffixe,
  pas = "1",
}: {
  id: string;
  label: string;
  valeur: number;
  onChange: (v: number) => void;
  suffixe?: string;
  pas?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {suffixe && <span className="text-muted-foreground"> ({suffixe})</span>}
      </Label>
      <Input
        id={id}
        type="number"
        step={pas}
        min="0"
        value={Number.isFinite(valeur) ? valeur : ""}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
      />
    </div>
  );
}

function formatEur(v: number): string {
  const abs = Math.abs(v);
  const arrondi = abs >= 1000 ? Math.round(v) : Math.round(v * 100) / 100;
  const chiffres = Math.abs(arrondi).toFixed(abs >= 1000 ? 0 : 2).split(".");
  const groupe = chiffres[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const signe = arrondi < 0 ? "-" : "";
  return `${signe}${groupe}${chiffres[1] ? "," + chiffres[1] : ""} €`;
}

function formatM3(v: number): string {
  const groupe = Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${groupe} m³`;
}

function formatPct(v: number): string {
  return `${(v * 100).toFixed(1)} %`;
}

export function CalculateurRoiForm({
  donneesInitiales,
}: {
  donneesInitiales: EntreesFormulaire | null;
}) {
  const [valeurs, setValeurs] = useState<EntreesFormulaire>(donneesInitiales ?? DEFAUTS);

  function champ<K extends keyof EntreesFormulaire>(cle: K, valeur: EntreesFormulaire[K]) {
    setValeurs((v) => ({ ...v, [cle]: valeur }));
  }

  const resultat = useMemo(() => {
    if (valeurs.vProduit + valeurs.vImporte <= 0 || valeurs.lineaireKm <= 0) return null;
    return calculerRoi({
      bilan: {
        vProduit: valeurs.vProduit,
        vImporte: valeurs.vImporte,
        vExporte: valeurs.vExporte,
        vComptabilise: valeurs.vComptabilise,
        vSansComptage: valeurs.vSansComptage,
        vService: valeurs.vService,
        lineaireKm: valeurs.lineaireKm,
        zoneDeRepartitionDesEaux: valeurs.zoneDeRepartitionDesEaux,
      },
      coutMarginalEurM3: valeurs.coutMarginalEurM3,
      redevanceEurM3: valeurs.redevanceEurM3,
      prixPalierEurM3: valeurs.prixPalierEurM3,
      coutTravauxEur: valeurs.coutTravauxEur,
      tauxSubventionPct: valeurs.tauxSubventionPct,
    });
  }, [valeurs]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Volumes annuels et réseau</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <ChampNombre id="v-produit" label="Volume produit" suffixe="m³/an" valeur={valeurs.vProduit} onChange={(v) => champ("vProduit", v)} />
          <ChampNombre id="v-importe" label="Volume importé" suffixe="m³/an" valeur={valeurs.vImporte} onChange={(v) => champ("vImporte", v)} />
          <ChampNombre id="v-exporte" label="Volume exporté" suffixe="m³/an" valeur={valeurs.vExporte} onChange={(v) => champ("vExporte", v)} />
          <ChampNombre id="v-comptabilise" label="Volume comptabilisé" suffixe="m³/an" valeur={valeurs.vComptabilise} onChange={(v) => champ("vComptabilise", v)} />
          <ChampNombre id="v-sans-comptage" label="Volume sans comptage" suffixe="m³/an" valeur={valeurs.vSansComptage} onChange={(v) => champ("vSansComptage", v)} />
          <ChampNombre id="v-service" label="Volume de service" suffixe="m³/an" valeur={valeurs.vService} onChange={(v) => champ("vService", v)} />
          <ChampNombre id="lineaire" label="Linéaire de réseau" suffixe="km" pas="0.1" valeur={valeurs.lineaireKm} onChange={(v) => champ("lineaireKm", v)} />
          <label className="flex items-center gap-2 self-end pb-2">
            <input
              type="checkbox"
              checked={valeurs.zoneDeRepartitionDesEaux}
              onChange={(e) => champ("zoneDeRepartitionDesEaux", e.target.checked)}
            />
            <span className="text-sm">Zone de répartition des eaux (ZRE)</span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Paramètres financiers</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <ChampNombre id="cout-marginal" label="Coût marginal de production" suffixe="€/m³" pas="0.01" valeur={valeurs.coutMarginalEurM3} onChange={(v) => champ("coutMarginalEurM3", v)} />
          <ChampNombre id="redevance" label="Redevance prélèvement" suffixe="€/m³" pas="0.01" valeur={valeurs.redevanceEurM3} onChange={(v) => champ("redevanceEurM3", v)} />
          <ChampNombre id="prix-palier" label="Prix du palier (vente)" suffixe="€/m³" pas="0.01" valeur={valeurs.prixPalierEurM3} onChange={(v) => champ("prixPalierEurM3", v)} />
          <ChampNombre id="cout-travaux" label="Coût estimé des travaux" suffixe="€" valeur={valeurs.coutTravauxEur} onChange={(v) => champ("coutTravauxEur", v)} />
          <ChampNombre id="taux-subvention" label="Taux de subvention" suffixe="%" pas="1" valeur={valeurs.tauxSubventionPct} onChange={(v) => champ("tauxSubventionPct", v)} />
        </CardContent>
      </Card>

      {resultat ? (
        <Card>
          <CardHeader>
            <CardTitle>Résultats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-xs">Rendement</p>
                <p className="text-2xl font-semibold">{formatPct(resultat.bilan.rendement)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-xs">Seuil réglementaire</p>
                <p className="text-2xl font-semibold">{formatPct(resultat.bilan.seuilReglementaire)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-xs">Conformité décret 2012-97</p>
                <Badge variant={resultat.bilan.conformeDecret ? "secondary" : "destructive"} className="mt-1">
                  {resultat.bilan.conformeDecret ? "Conforme" : "Non conforme"}
                </Badge>
              </div>
            </div>

            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between border-b py-1.5">
                <dt>Pertes</dt>
                <dd className="font-medium">{formatM3(resultat.bilan.pertes)}</dd>
              </div>
              <div className="flex justify-between border-b py-1.5">
                <dt>Pertes au coût marginal</dt>
                <dd className="font-medium">{formatEur(resultat.pertesEuroCoutMarginal)}</dd>
              </div>
              <div className="flex justify-between border-b py-1.5">
                <dt>Valeur commerciale des pertes</dt>
                <dd className="font-medium">{formatEur(resultat.pertesEuroCommercial)}</dd>
              </div>
              <div className="flex justify-between border-b py-1.5">
                <dt>Pénalité potentielle (redevance doublée)</dt>
                <dd className="font-medium">{formatEur(resultat.penalitePotentielleEur)}</dd>
              </div>
              <div className="flex justify-between border-b py-1.5">
                <dt>Gain à 10 % de récupération</dt>
                <dd className="font-medium">{formatEur(resultat.gain10PctEur)}</dd>
              </div>
              <div className="flex justify-between border-b py-1.5">
                <dt>Gain à 20 % de récupération</dt>
                <dd className="font-medium">{formatEur(resultat.gain20PctEur)}</dd>
              </div>
              <div className="flex justify-between border-b py-1.5">
                <dt>Coût net des travaux (après subvention)</dt>
                <dd className="font-medium">{formatEur(resultat.coutNetTravauxEur)}</dd>
              </div>
              <div className="flex justify-between border-b py-1.5">
                <dt>Net après subvention (à 10 % / 20 %)</dt>
                <dd className="font-medium">
                  {formatEur(resultat.netApres10PctEur)} / {formatEur(resultat.netApres20PctEur)}
                </dd>
              </div>
              {(resultat.dureeRetour10Annees !== null || resultat.dureeRetour20Annees !== null) && (
                <div className="flex justify-between py-1.5 sm:col-span-2">
                  <dt>Durée de retour estimée (à 10 % / 20 %)</dt>
                  <dd className="font-medium">
                    {resultat.dureeRetour10Annees !== null ? `${resultat.dureeRetour10Annees.toFixed(1)} ans` : "—"}
                    {" / "}
                    {resultat.dureeRetour20Annees !== null ? `${resultat.dureeRetour20Annees.toFixed(1)} ans` : "—"}
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      ) : (
        <p className="text-muted-foreground text-sm">
          Renseignez un volume produit (ou importé) et un linéaire de réseau
          supérieurs à zéro pour voir les résultats.
        </p>
      )}
    </div>
  );
}
