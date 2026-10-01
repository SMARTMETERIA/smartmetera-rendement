"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { envoyerMessageTest } from "@/app/(dashboard)/admin/actions";
import {
  CANAUX_TEST,
  LIBELLES_CANAUX,
  LIBELLES_MODE,
  libelleResultat,
  type ResultatTest,
} from "@/lib/gardien-envois/messageTest";
import type { Canal, ModeEnvois } from "@/lib/gardien-envois/notify";

/**
 * Message de test vers soi-même (e-mail, SMS, appel, WhatsApp) : vérifie
 * que les vrais envois fonctionnent, sans simuler de fuite.
 */
export function MessageTestPanel({ telephone }: { telephone: string | null }) {
  const [numero, setNumero] = useState(telephone ?? "");
  const [canaux, setCanaux] = useState<Canal[]>(["email", "sms"]);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{ mode: ModeEnvois; resultats: ResultatTest[] } | null>(null);

  const basculer = (c: Canal) =>
    setCanaux((avant) => (avant.includes(c) ? avant.filter((x) => x !== c) : [...avant, c]));

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    setResultat(null);
    const r = await envoyerMessageTest({ telephone: numero, canaux });
    setEnCours(false);
    if ("erreur" in r) setErreur(r.erreur);
    else setResultat(r);
  }

  return (
    <form onSubmit={envoyer} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Canaux à essayer</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {CANAUX_TEST.map((c) => (
            <label key={c} className="flex min-h-11 items-center gap-2 text-sm sm:min-h-0">
              <input type="checkbox" checked={canaux.includes(c)} onChange={() => basculer(c)} />
              {LIBELLES_CANAUX[c]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-1">
        <Label htmlFor="message-test-numero">Votre numéro de portable (SMS, appel, WhatsApp)</Label>
        <Input
          id="message-test-numero"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+33 6 12 34 56 78"
          className="max-w-xs"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
        />
        <p className="text-muted-foreground text-xs">L&apos;e-mail part vers l&apos;adresse de votre compte.</p>
      </div>
      <Button type="submit" disabled={enCours || canaux.length === 0} className="h-11 w-full sm:w-auto">
        {enCours ? "Envoi…" : "Envoyer le message de test"}
      </Button>
      {erreur && (
        <Alert variant="destructive">
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}
      {resultat && (
        <div className="space-y-2 text-sm" aria-live="polite">
          <p className="text-muted-foreground">Mode des envois : {LIBELLES_MODE[resultat.mode]}.</p>
          <ul className="divide-y rounded-lg border">
            {resultat.resultats.map((r) => (
              <li key={r.canal} className="p-3">
                <span className="font-medium">{LIBELLES_CANAUX[r.canal]} : </span>
                <span className={r.statut === "echec" ? "text-destructive" : undefined}>{libelleResultat(r)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
