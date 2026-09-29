"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/client";
import { enregistrerMarque } from "@/app/(espace)/sites/actions";
import { avisContraste, type SaisieMarque } from "@/lib/gardien/marqueSaisie";
import { MARQUE_PLATEFORME, type Marque } from "@/lib/marque";
import { EnteteMarque, EnveloppeMarque } from "@/components/marque/EnveloppeMarque";

const TYPES_LOGO = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];

/** Réglage de la marque, avec aperçu et contrôle de lisibilité en direct. */
export function FormulaireMarque({
  organisationId,
  initiale,
  propulse,
}: {
  organisationId: string;
  initiale: SaisieMarque;
  propulse: boolean;
}) {
  const [s, setS] = useState<SaisieMarque>(initiale);
  const [enCours, setEnCours] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const maj = (cle: keyof SaisieMarque) => (e: { target: { value: string } }) =>
    setS((x) => ({ ...x, [cle]: e.target.value }));
  const avis = avisContraste(s.couleur || MARQUE_PLATEFORME.couleur);
  const apercu: Marque = {
    ...MARQUE_PLATEFORME,
    nom: s.nomAffiche || "Votre marque",
    couleur: avis.appliquee,
    accent: s.accent || MARQUE_PLATEFORME.accent,
    logoUrl: s.logo,
    afficherPropulse: propulse,
  };

  async function envoyerLogo(fichier: File) {
    if (!TYPES_LOGO.includes(fichier.type) || fichier.size > 512 * 1024) {
      setRetour({ ok: false, texte: "Logo : PNG, JPEG, SVG ou WebP de 500 ko au plus." });
      return;
    }
    const supabase = createClient();
    const extension = fichier.name.split(".").pop()?.toLowerCase() ?? "png";
    const chemin = `${organisationId}/logo-${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from("marques").upload(chemin, fichier, { upsert: false });
    if (error) {
      setRetour({ ok: false, texte: "Envoi du logo impossible. Réessayez." });
      return;
    }
    const { data } = supabase.storage.from("marques").getPublicUrl(chemin);
    setS((x) => ({ ...x, logo: data.publicUrl }));
    setRetour(null);
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    const r = await enregistrerMarque(s);
    setEnCours(false);
    setRetour("erreur" in r ? { ok: false, texte: r.erreur } : { ok: true, texte: r.message ?? "Enregistré." });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={enregistrer} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="m-nom">Nom affiché</Label>
          <Input id="m-nom" value={s.nomAffiche} onChange={maj("nomAffiche")} maxLength={80} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="m-logo">Logo (PNG, JPEG, SVG ou WebP, 500 ko au plus)</Label>
          <Input
            id="m-logo"
            type="file"
            accept={TYPES_LOGO.join(",")}
            onChange={(e) => e.target.files?.[0] && void envoyerLogo(e.target.files[0])}
          />
          {s.logo && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setS((x) => ({ ...x, logo: null }))}>
              Retirer le logo
            </Button>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="m-couleur">Couleur principale</Label>
            <div className="flex gap-2">
              <input
                type="color"
                aria-label="Choisir la couleur principale"
                value={s.couleur || MARQUE_PLATEFORME.couleur}
                onChange={maj("couleur")}
                className="h-9 w-12 rounded border"
              />
              <Input id="m-couleur" value={s.couleur} onChange={maj("couleur")} placeholder="#1B4F8A" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="m-accent">Couleur d&apos;accent</Label>
            <div className="flex gap-2">
              <input
                type="color"
                aria-label="Choisir la couleur d'accent"
                value={s.accent || MARQUE_PLATEFORME.accent}
                onChange={maj("accent")}
                className="h-9 w-12 rounded border"
              />
              <Input id="m-accent" value={s.accent} onChange={maj("accent")} placeholder="#0FA3A3" />
            </div>
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          {avis.ok
            ? `Lisibilité du texte sur les boutons : ${avis.contraste.toString().replace(".", ",")}:1, conforme.`
            : `Couleur trop claire pour un texte lisible : elle sera foncée automatiquement (${avis.appliquee}).`}
        </p>
        <div className="space-y-1">
          <Label htmlFor="m-exp">Nom d&apos;expéditeur des e-mails</Label>
          <Input id="m-exp" value={s.expediteur} onChange={maj("expediteur")} maxLength={60} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="m-rep">Adresse de réponse</Label>
          <Input id="m-rep" type="email" value={s.repondreA} onChange={maj("repondreA")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="m-pied">Pied de page (mentions de votre société)</Label>
          <Textarea id="m-pied" value={s.piedDePage} onChange={maj("piedDePage")} maxLength={300} />
        </div>
        <p className="text-muted-foreground text-xs">
          La mention « Propulsé par SmartMeteria » {propulse ? "est affichée" : "est masquée"} ; seul SmartMeteria
          peut la modifier.
        </p>
        <Button type="submit" disabled={enCours}>
          {enCours ? "Enregistrement…" : "Enregistrer la marque"}
        </Button>
        {retour && (
          <Alert variant={retour.ok ? "default" : "destructive"}>
            <AlertDescription>{retour.texte}</AlertDescription>
          </Alert>
        )}
      </form>
      <div className="space-y-2">
        <p className="text-sm font-medium">Aperçu</p>
        <EnveloppeMarque marque={apercu} className="space-y-4 rounded-lg border p-4">
          <EnteteMarque marque={apercu} />
          <p className="text-sm">Fuite de nuit détectée : Hôtel du Lac, Cuisine.</p>
          <span className="bg-primary text-primary-foreground inline-block rounded-md px-4 py-2 text-sm font-medium">
            Je m&apos;en occupe
          </span>
          {apercu.afficherPropulse && <p className="text-muted-foreground text-xs">Propulsé par SmartMeteria</p>}
        </EnveloppeMarque>
      </div>
    </div>
  );
}
