"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  importerStock,
  type ResultatImport,
} from "@/app/(espace)/sites/appareils/actions";

const EXEMPLE =
  "reference;modele;kit;sim\n351358816993213;Adeunis PULSE NB-IoT/LTE-M;A;8933150000000000000";

export function ImportStock() {
  const [texte, setTexte] = useState("");
  const [resultat, setResultat] = useState<ResultatImport | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function lireFichier(fichier: File | undefined) {
    if (fichier) setTexte(await fichier.text());
  }

  async function importer(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setResultat(await importerStock(texte));
    setEnCours(false);
  }

  return (
    <form onSubmit={importer} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="fichier-stock">Fichier CSV des appareils</Label>
        <input
          id="fichier-stock"
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={(e) => lireFichier(e.target.files?.[0])}
          className="block text-sm"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="texte-stock">Ou collez les lignes</Label>
        <Textarea
          id="texte-stock"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder={EXEMPLE}
          rows={5}
          className="font-mono text-sm"
        />
        <p className="text-muted-foreground text-sm">
          Colonnes : « reference » (IMEI du kit A, DevEUI du kit C ou de la
          sonde), « modele », et si vous les avez « kit » et « sim ».
        </p>
      </div>
      <Button type="submit" disabled={enCours || !texte.trim()}>
        {enCours ? "Import…" : "Importer dans le stock"}
      </Button>
      {resultat && "erreurs" in resultat && (
        <Alert variant="destructive">
          <AlertDescription>
            <p className="font-medium">
              Rien n&apos;a été importé. Corrigez le fichier :
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {resultat.erreurs.slice(0, 20).map((e) => (
                <li key={`${e.ligne}-${e.message}`}>
                  {e.ligne > 0 ? `Ligne ${e.ligne} : ` : ""}
                  {e.message}
                </li>
              ))}
            </ul>
            {resultat.erreurs.length > 20 && (
              <p className="mt-2">
                … et {resultat.erreurs.length - 20} autres erreurs.
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}
      {resultat && "ok" in resultat && (
        <Alert>
          <AlertDescription>
            {resultat.importes} appareil{resultat.importes > 1 ? "s" : ""}{" "}
            ajouté
            {resultat.importes > 1 ? "s" : ""} au stock.
            {resultat.dejaEnregistres.length > 0 &&
              ` Déjà enregistrés, donc ignorés : ${resultat.dejaEnregistres.join(", ")}.`}
          </AlertDescription>
        </Alert>
      )}
    </form>
  );
}
