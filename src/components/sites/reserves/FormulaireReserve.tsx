"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { enregistrerReserve, retirerReserve } from "@/app/(espace)/sites/reserves/actions";
import {
  LIBELLES_FORME,
  LIBELLES_MONTAGE,
  LIBELLES_TYPE_RESERVE,
  TYPES_RESERVE,
  type SaisieReserve,
} from "@/lib/gardien/reserves";

const SANS_CAPTEUR = "aucun";
const enTexte = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

/**
 * Ajout ou modification d'une réserve : dimensions (volume utile), pose du
 * capteur de niveau, niveau bas. Une question claire par champ.
 */
export function FormulaireReserve({
  siteId,
  reserve,
  capteurs,
  seuilDefautPct,
}: {
  siteId: string;
  reserve: {
    id: string;
    nom: string;
    kind: string;
    capaciteM3: number;
    forme: string;
    hauteurPleineM: number;
    hauteurPriseM: number;
    montage: string;
    hauteurCapteurM: number | null;
    seuilBasPct: number | null;
    deviceId: string | null;
  } | null;
  capteurs: { id: string; libelle: string }[];
  seuilDefautPct: number;
}) {
  const [s, setS] = useState<SaisieReserve>({
    label: reserve?.nom ?? "",
    kind: reserve?.kind ?? "citerne",
    capacite: enTexte(reserve?.capaciteM3),
    forme: reserve?.forme ?? "verticale",
    hauteurPleine: enTexte(reserve?.hauteurPleineM),
    hauteurPrise: enTexte(reserve?.hauteurPriseM ?? 0),
    montage: reserve?.montage ?? "distance",
    hauteurCapteur: enTexte(reserve?.hauteurCapteurM),
    seuilBas: enTexte(reserve?.seuilBasPct),
    deviceId: reserve?.deviceId ?? "",
  });
  const [enCours, setEnCours] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const champ = (cle: keyof SaisieReserve) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setS((x) => ({ ...x, [cle]: e.target.value }));
  const id = (nom: string) => `reserve-${reserve?.id ?? `nouvelle-${siteId}`}-${nom}`;

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setRetour(null);
    const r = await enregistrerReserve(siteId, reserve?.id ?? null, s);
    setEnCours(false);
    if ("erreur" in r) return setRetour({ ok: false, texte: r.erreur });
    setRetour({ ok: true, texte: reserve ? "Réserve enregistrée." : `Réserve « ${s.label.trim()} » ajoutée.` });
    if (!reserve) setS((x) => ({ ...x, label: "", capacite: "", hauteurPleine: "", hauteurCapteur: "", deviceId: "" }));
  }

  async function retirer() {
    if (!reserve || !window.confirm(`Ne plus suivre « ${reserve.nom} » ? Ses mesures passées sont conservées.`)) return;
    setEnCours(true);
    const r = await retirerReserve(reserve.id);
    setEnCours(false);
    if ("erreur" in r) setRetour({ ok: false, texte: r.erreur });
  }

  const itemsCapteurs: Record<string, string> = Object.fromEntries([
    [SANS_CAPTEUR, "Pas encore de capteur"],
    ...capteurs.map((c) => [c.id, c.libelle]),
  ]);

  return (
    <form onSubmit={enregistrer} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={id("nom")}>Nom de la réserve</Label>
        <Input id={id("nom")} required placeholder="Citerne du toit" value={s.label} onChange={champ("label")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={id("type")}>Type</Label>
        <Select items={LIBELLES_TYPE_RESERVE} value={s.kind} onValueChange={(v) => v && setS((x) => ({ ...x, kind: v }))}>
          <SelectTrigger id={id("type")} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPES_RESERVE.map((t) => (
              <SelectItem key={t} value={t}>
                {LIBELLES_TYPE_RESERVE[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={id("capacite")}>Volume quand elle est pleine (m³)</Label>
        <Input id={id("capacite")} inputMode="decimal" required value={s.capacite} onChange={champ("capacite")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={id("forme")}>Forme</Label>
        <Select items={LIBELLES_FORME} value={s.forme} onValueChange={(v) => v && setS((x) => ({ ...x, forme: v }))}>
          <SelectTrigger id={id("forme")} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["verticale", "cylindre_horizontal"] as const).map((f) => (
              <SelectItem key={f} value={f}>
                {LIBELLES_FORME[f]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={id("pleine")}>
          {s.forme === "cylindre_horizontal" ? "Diamètre intérieur (m)" : "Hauteur d'eau quand elle est pleine (m)"}
        </Label>
        <Input id={id("pleine")} inputMode="decimal" required value={s.hauteurPleine} onChange={champ("hauteurPleine")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={id("prise")}>Hauteur de la prise d&apos;eau au-dessus du fond (m)</Label>
        <Input id={id("prise")} inputMode="decimal" value={s.hauteurPrise} onChange={champ("hauteurPrise")} />
        <p className="text-muted-foreground text-xs">Sous ce niveau, l&apos;eau ne peut pas être pompée. 0 si elle est au fond.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor={id("capteur")}>Capteur de niveau</Label>
        <Select
          items={itemsCapteurs}
          value={s.deviceId || SANS_CAPTEUR}
          onValueChange={(v) => v && setS((x) => ({ ...x, deviceId: v === SANS_CAPTEUR ? "" : v }))}
        >
          <SelectTrigger id={id("capteur")} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(itemsCapteurs).map(([valeur, libelle]) => (
              <SelectItem key={valeur} value={valeur}>
                {libelle}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={id("montage")}>Où le capteur est-il posé ?</Label>
        <Select items={LIBELLES_MONTAGE} value={s.montage} onValueChange={(v) => v && setS((x) => ({ ...x, montage: v }))}>
          <SelectTrigger id={id("montage")} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["distance", "hauteur"] as const).map((m) => (
              <SelectItem key={m} value={m}>
                {LIBELLES_MONTAGE[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {s.montage === "distance" && (
        <div className="space-y-2">
          <Label htmlFor={id("hauteur-capteur")}>Hauteur du capteur au-dessus du fond (m)</Label>
          <Input id={id("hauteur-capteur")} inputMode="decimal" required value={s.hauteurCapteur} onChange={champ("hauteurCapteur")} />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor={id("seuil")}>Niveau bas (% de l&apos;eau utilisable)</Label>
        <Input id={id("seuil")} inputMode="decimal" placeholder={`${seuilDefautPct} (par défaut)`} value={s.seuilBas} onChange={champ("seuilBas")} />
      </div>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" disabled={enCours} className="w-full sm:w-auto">
          {enCours ? "Enregistrement…" : reserve ? "Enregistrer la réserve" : "Ajouter la réserve"}
        </Button>
        {reserve && (
          <Button type="button" variant="outline" disabled={enCours} onClick={retirer} className="w-full sm:w-auto">
            Ne plus suivre cette réserve
          </Button>
        )}
      </div>
      {retour && (
        <Alert variant={retour.ok ? "default" : "destructive"} className="sm:col-span-2">
          <AlertDescription>{retour.texte}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
