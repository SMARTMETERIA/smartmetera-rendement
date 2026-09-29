"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CompteurPertes } from "@/components/sites/CompteurPertes";
import {
  declarerFausseAlerte,
  declarerReparee,
  prendreEnCharge,
} from "@/app/(espace)/sites/fuites/actions";
import { LIBELLES_STATUT_FUITE, LIBELLES_TYPE_FUITE } from "@/lib/gardien/fuites";
import { formaterDateHeure, formaterNombre } from "@/lib/gardien/format";
import type { StatutFuite, TypeFuite } from "@/lib/moteur-gardien/analyse";
import type { Monnaie } from "@/lib/moteur-gardien/economies";

export interface FuiteAffichee {
  id: string;
  site: string;
  zone: string | null;
  type: TypeFuite;
  status: StatutFuite;
  detectedAt: string;
  excesLph: number;
  prixM3: number | null;
  monnaie: Monnaie;
  fuseau: string;
  explication: string | null;
  simulation: boolean;
  peutAgir: boolean;
}

function Fuite({ fuite, rendueA }: { fuite: FuiteAffichee; rendueA: number }) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [motifOuvert, setMotifOuvert] = useState(false);
  const [motif, setMotif] = useState("");

  async function agir(action: () => Promise<{ ok: true } | { erreur: string }>) {
    setEnCours(true);
    setErreur(null);
    const resultat = await action();
    setEnCours(false);
    if ("erreur" in resultat) setErreur(resultat.erreur);
  }

  return (
    <li className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-semibold">
          {LIBELLES_TYPE_FUITE[fuite.type]} — {fuite.site}
          {fuite.zone ? `, ${fuite.zone}` : ""}
        </h3>
        <Badge variant={fuite.status === "ouverte" ? "destructive" : "secondary"}>
          {LIBELLES_STATUT_FUITE[fuite.status]}
        </Badge>
        {fuite.simulation && <Badge variant="outline">Essai</Badge>}
      </div>
      <p className="text-muted-foreground text-sm">
        Détectée le {formaterDateHeure(fuite.detectedAt, fuite.fuseau)} :{" "}
        {formaterNombre(fuite.excesLph)} L/h de plus que d&apos;habitude.
        {fuite.explication ? ` ${fuite.explication}` : ""}
      </p>
      <CompteurPertes
        excesLph={fuite.excesLph}
        prixM3={fuite.prixM3}
        monnaie={fuite.monnaie}
        depuis={fuite.detectedAt}
        rendueA={rendueA}
      />
      {fuite.peutAgir && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {fuite.status === "ouverte" && (
            <Button
              className="h-11 w-full text-base sm:w-auto"
              disabled={enCours}
              onClick={() => agir(() => prendreEnCharge(fuite.id))}
            >
              Je m&apos;en occupe
            </Button>
          )}
          <Button
            variant="outline"
            className="h-11 w-full sm:w-auto"
            disabled={enCours}
            onClick={() => agir(() => declarerReparee(fuite.id))}
          >
            C&apos;est réparé
          </Button>
          <Button
            variant="ghost"
            className="h-11 w-full sm:w-auto"
            disabled={enCours}
            onClick={() => setMotifOuvert((v) => !v)}
          >
            Fausse alerte
          </Button>
        </div>
      )}
      {motifOuvert && (
        <div className="space-y-2">
          <Label htmlFor={`motif-${fuite.id}`}>
            Pourquoi est-ce une fausse alerte ? (facultatif)
          </Label>
          <Textarea
            id={`motif-${fuite.id}`}
            maxLength={500}
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Exemple : remplissage de la piscine cette nuit-là."
          />
          <Button
            variant="outline"
            disabled={enCours}
            onClick={() => agir(() => declarerFausseAlerte(fuite.id, motif))}
          >
            Confirmer la fausse alerte
          </Button>
        </div>
      )}
      {erreur && (
        <Alert variant="destructive">
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}
    </li>
  );
}

export function FuitesEnCours({
  fuites,
  rendueA,
}: {
  fuites: FuiteAffichee[];
  rendueA: number;
}) {
  return (
    <ul className="space-y-4">
      {fuites.map((f) => (
        <Fuite key={f.id} fuite={f} rendueA={rendueA} />
      ))}
    </ul>
  );
}
