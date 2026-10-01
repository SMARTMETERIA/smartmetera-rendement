"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
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
import {
  inscrireEtablissement,
  type EtatFormulaire,
} from "@/app/(auth)/actions";
import type { DonneesInscription, Pays } from "@/lib/auth/validation";
import { LONGUEUR_MIN_MOT_DE_PASSE } from "@/lib/auth/validation";
import { Turnstile } from "./Turnstile";
import { AvisJournalDev } from "./AvisJournalDev";

type Champ = keyof DonneesInscription;

const ETAT_INITIAL: EtatFormulaire<Champ> = { statut: "repos" };

function ChampTexte({
  nom,
  libelle,
  type = "text",
  autoComplete,
  aide,
  requis = true,
  erreur,
  valeur,
}: {
  nom: string;
  libelle: string;
  type?: string;
  autoComplete?: string;
  aide?: string;
  requis?: boolean;
  erreur?: string;
  valeur?: string;
}) {
  const idAide = aide || erreur ? `${nom}-aide` : undefined;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={nom}>
        {libelle}
        {!requis && (
          <span className="text-muted-foreground font-normal">
            {" "}
            (facultatif)
          </span>
        )}
      </Label>
      <Input
        id={nom}
        name={nom}
        type={type}
        autoComplete={autoComplete}
        required={requis}
        defaultValue={valeur}
        aria-invalid={Boolean(erreur)}
        aria-describedby={idAide}
      />
      {(erreur || aide) && (
        <p
          id={idAide}
          className={
            erreur
              ? "text-destructive text-sm"
              : "text-muted-foreground text-sm"
          }
        >
          {erreur ?? aide}
        </p>
      )}
    </div>
  );
}

function ChoixPays({
  pays,
  onChange,
  erreur,
}: {
  pays: Pays;
  onChange: (pays: Pays) => void;
  erreur?: string;
}) {
  const options: { valeur: Pays; libelle: string }[] = [
    { valeur: "FR", libelle: "France" },
    { valeur: "MA", libelle: "Maroc" },
  ];
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm leading-none font-medium">Pays</legend>
      <div className="flex gap-2 pt-1">
        {options.map((o) => (
          <label
            key={o.valeur}
            className="has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-ring/50 flex flex-1 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-[:focus-visible]:ring-[3px]"
          >
            <input
              type="radio"
              name="pays"
              value={o.valeur}
              checked={pays === o.valeur}
              onChange={() => onChange(o.valeur)}
              className="accent-primary"
            />
            {o.libelle}
          </label>
        ))}
      </div>
      {erreur && <p className="text-destructive text-sm">{erreur}</p>}
    </fieldset>
  );
}

export function FormulaireInscription() {
  const [etat, action, enCours] = useActionState(
    inscrireEtablissement,
    ETAT_INITIAL,
  );
  const [pays, setPays] = useState<Pays>("FR");

  if (etat.statut === "succes") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Vérifiez votre boîte mail</CardTitle>
          <CardDescription>
            Nous avons envoyé un lien à {etat.email}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Cliquez sur ce lien pour activer votre compte. Votre essai gratuit
            de 30 jours commence à ce moment-là.
          </p>
          <AvisJournalDev visible={etat.journalDev} />
        </CardContent>
      </Card>
    );
  }

  const champs = etat.statut === "erreur" ? (etat.champs ?? {}) : {};
  const valeurs = etat.statut === "erreur" ? (etat.valeurs ?? {}) : {};

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Créer un compte</CardTitle>
        <CardDescription>
          Pour les hôtels, campings, résidences, centres commerciaux et salles
          de sport qui paient leur eau. Essai gratuit de 30 jours, sans carte
          bancaire.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4" noValidate>
          {etat.statut === "erreur" && (
            <Alert variant="destructive">
              <AlertDescription>{etat.message}</AlertDescription>
            </Alert>
          )}
          <ChampTexte
            nom="raisonSociale"
            libelle="Nom de l'établissement ou du groupe"
            autoComplete="organization"
            erreur={champs.raisonSociale}
            valeur={valeurs.raisonSociale}
          />
          <ChoixPays pays={pays} onChange={setPays} erreur={champs.pays} />
          <ChampTexte
            nom="nom"
            libelle="Votre prénom et nom"
            autoComplete="name"
            erreur={champs.nom}
            valeur={valeurs.nom}
          />
          <ChampTexte
            nom="email"
            libelle="E-mail professionnel"
            type="email"
            autoComplete="email"
            erreur={champs.email}
            valeur={valeurs.email}
          />
          <ChampTexte
            nom="telephone"
            libelle="Téléphone"
            type="tel"
            autoComplete="tel"
            erreur={champs.telephone}
            valeur={valeurs.telephone}
          />
          {pays === "FR" && (
            <ChampTexte
              nom="siren"
              libelle="SIREN"
              requis={false}
              aide="9 chiffres, sur votre extrait Kbis ou avis de situation."
              erreur={champs.siren}
              valeur={valeurs.siren}
            />
          )}
          <ChampTexte
            nom="motDePasse"
            libelle="Mot de passe"
            type="password"
            autoComplete="new-password"
            aide={`Au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.`}
            erreur={champs.motDePasse}
          />
          <ChampTexte
            nom="confirmation"
            libelle="Confirmez le mot de passe"
            type="password"
            autoComplete="new-password"
          />
          <Turnstile />
          <p className="text-muted-foreground text-xs">
            En créant un compte, vous acceptez les{" "}
            <Link href="/legal/cgu" className="text-foreground underline underline-offset-4">
              conditions d&apos;utilisation
            </Link>{" "}
            et la{" "}
            <Link href="/legal/confidentialite" className="text-foreground underline underline-offset-4">
              politique de confidentialité
            </Link>
            .
          </p>
          <Button type="submit" className="w-full" disabled={enCours}>
            {enCours ? "Création du compte…" : "Créer mon compte"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
