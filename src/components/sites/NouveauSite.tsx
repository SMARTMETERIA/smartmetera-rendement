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
import { REGLAGES_PAYS } from "@/lib/gardien/pays";

export function NouveauSite({ paysParDefaut }: { paysParDefaut: "FR" | "MA" }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("hotel");
  const [pays, setPays] = useState<string>(paysParDefaut);
  const [ville, setVille] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [retour, setRetour] = useState<{
    type: "ok" | "erreur";
    texte: string;
  } | null>(null);

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setRetour(null);
    const resultat = await creerSite({ name, type, pays, ville });
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
          items={{ FR: REGLAGES_PAYS.FR.libelle, MA: REGLAGES_PAYS.MA.libelle }}
          value={pays}
          onValueChange={(v) => v && setPays(v)}
        >
          <SelectTrigger id="site-pays" className="w-full lg:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["FR", "MA"] as const).map((p) => (
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
