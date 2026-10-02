"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { creerSite } from "@/app/(espace)/sites/actions";
import { LIBELLES_TYPE_SITE, TYPES_SITE } from "@/lib/gardien/libelles";
import { LIBELLES_FUSEAU, LIBELLES_MONNAIE, REGLAGES_PAYS } from "@/lib/gardien/pays";
import { PAYS, type Pays } from "@/lib/auth/validation";

export function NouveauSite({ paysParDefaut }: { paysParDefaut: Pays }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("hotel");
  const [pays, setPays] = useState<Pays>(paysParDefaut);
  const [fuseau, setFuseau] = useState<string>(REGLAGES_PAYS[paysParDefaut].fuseau);
  const [monnaie, setMonnaie] = useState<string>(REGLAGES_PAYS[paysParDefaut].monnaie);
  const [ville, setVille] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [retour, setRetour] = useState<{
    type: "ok" | "erreur";
    texte: string;
  } | null>(null);
  const reglages = REGLAGES_PAYS[pays];
  const choix = reglages.fuseaux.length > 1 || reglages.monnaies.length > 1;

  function changerPays(p: Pays) {
    setPays(p);
    setFuseau(REGLAGES_PAYS[p].fuseau);
    setMonnaie(REGLAGES_PAYS[p].monnaie);
  }

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setRetour(null);
    const resultat = await creerSite({ name, type, pays, ville, fuseau, monnaie });
    setEnCours(false);
    if ("erreur" in resultat) {
      setRetour({ type: "erreur", texte: resultat.erreur });
      return;
    }
    setRetour({ type: "ok", texte: `Site « ${name.trim()} » ajouté.` });
    setName("");
    setVille("");
  }

  return (
    <form
      onSubmit={ajouter}
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_1fr_auto] lg:items-end"
    >
      <div className="space-y-2">
        <Label htmlFor="site-nom">Nom du site</Label>
        <Input
          id="site-nom"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="site-type">Type</Label>
        <Select
          items={LIBELLES_TYPE_SITE}
          value={type}
          onValueChange={(v) => v && setType(v)}
        >
          <SelectTrigger id="site-type" className="w-full lg:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPES_SITE.map((t) => (
              <SelectItem key={t} value={t}>
                {LIBELLES_TYPE_SITE[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="site-pays">Pays</Label>
        <Select
          items={Object.fromEntries(PAYS.map((p) => [p, REGLAGES_PAYS[p].libelle]))}
          value={pays}
          onValueChange={(v) => v && changerPays(v as Pays)}
        >
          <SelectTrigger id="site-pays" className="w-full lg:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYS.map((p) => (
              <SelectItem key={p} value={p}>
                {REGLAGES_PAYS[p].libelle}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="site-ville">Ville</Label>
        <Input
          id="site-ville"
          value={ville}
          onChange={(e) => setVille(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={enCours}>
        {enCours ? "Ajout…" : "Ajouter le site"}
      </Button>
      {choix && (
        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2 lg:col-span-5">
          <div className="space-y-2">
            <Label htmlFor="site-fuseau">Fuseau horaire</Label>
            <Select
              items={Object.fromEntries(reglages.fuseaux.map((f) => [f, LIBELLES_FUSEAU[f]]))}
              value={fuseau}
              onValueChange={(v) => v && setFuseau(v)}
            >
              <SelectTrigger id="site-fuseau" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {reglages.fuseaux.map((f) => (
                  <SelectItem key={f} value={f}>
                    {LIBELLES_FUSEAU[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="site-monnaie">Monnaie</Label>
            <Select
              items={Object.fromEntries(reglages.monnaies.map((m) => [m, `${LIBELLES_MONNAIE[m]} (${m})`]))}
              value={monnaie}
              onValueChange={(v) => v && setMonnaie(v)}
            >
              <SelectTrigger id="site-monnaie" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {reglages.monnaies.map((m) => (
                  <SelectItem key={m} value={m}>
                    {`${LIBELLES_MONNAIE[m]} (${m})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
      {retour && (
        <Alert
          variant={retour.type === "erreur" ? "destructive" : "default"}
          className="sm:col-span-2 lg:col-span-5"
        >
          <AlertDescription>{retour.texte}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
