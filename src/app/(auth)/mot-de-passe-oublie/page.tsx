"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { demanderReinitialisation, type EtatFormulaire } from "@/app/(auth)/actions";
import { AvisJournalDev } from "@/components/auth/AvisJournalDev";

const ETAT_INITIAL: EtatFormulaire<"email"> = { statut: "repos" };

export default function MotDePasseOubliePage() {
  const [etat, action, enCours] = useActionState(
    demanderReinitialisation,
    ETAT_INITIAL,
  );

  return (
    <>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Mot de passe oublié</CardTitle>
          <CardDescription>
            Recevez un lien pour choisir un nouveau mot de passe.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {etat.statut === "succes" ? (
            <div className="space-y-3 text-sm">
              <p>
                Si un compte existe pour {etat.email}, un lien vient de lui
                être envoyé. Il fonctionne une seule fois, pendant une heure.
              </p>
              <AvisJournalDev visible={etat.journalDev} />
            </div>
          ) : (
            <form action={action} className="space-y-4">
              {etat.statut === "erreur" && (
                <Alert variant="destructive">
                  <AlertDescription>{etat.message}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Adresse e-mail</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  defaultValue={etat.statut === "erreur" ? etat.valeurs?.email : undefined}
                />
              </div>
              <Button type="submit" className="w-full" disabled={enCours}>
                {enCours ? "Envoi…" : "Recevoir le lien"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
      <Link href="/connexion" className="text-muted-foreground text-sm underline underline-offset-4">
        Revenir à la connexion
      </Link>
    </>
  );
}
