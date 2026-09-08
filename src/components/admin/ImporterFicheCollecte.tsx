"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  genererModeleFicheCollecte,
  parserFicheCollecte,
  type ResultatFicheCollecte,
} from "@/lib/admin/ficheCollecte";

interface Organisation {
  id: string;
  nom: string;
}

function telechargerModele() {
  const bytes = genererModeleFicheCollecte();
  // Uint8Array<ArrayBufferLike> n'est pas assignable a BlobPart tel que
  // type par une lib.dom.d.ts recente (generique ArrayBuffer strict) ;
  // Uint8Array reste un BlobPart valide a l'execution, simple ajustement
  // de type.
  const blob = new Blob([bytes as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "fiche-de-collecte-smartmeteria.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}

export function ImporterFicheCollecte({ organisations }: { organisations: Organisation[] }) {
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState(organisations[0]?.id ?? "");
  const [analyse, setAnalyse] = useState<ResultatFicheCollecte | null>(null);
  const [majService, setMajService] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<string[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function choisirFichier(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    const bytes = new Uint8Array(await fichier.arrayBuffer());
    setAnalyse(parserFicheCollecte(bytes));
    setResultat(null);
    setErreur(null);
  }

  async function importer() {
    if (!analyse || !organizationId) return;
    setEnCours(true);
    setErreur(null);
    const journal: string[] = [];
    const supabase = createClient();

    try {
      if (majService && analyse.service) {
        const s = analyse.service;
        const { error } = await supabase
          .from("organizations")
          .update({
            lineaire_reseau_km: s.lineaireReseauKm,
            nb_abonnes: s.nbAbonnes,
            zone_repartition_eaux: s.zoneRepartitionEaux,
            ...(s.prixM3Eur !== null ? { prix_m3_eur: s.prixM3Eur } : {}),
          })
          .eq("id", organizationId);
        journal.push(error ? `Service : erreur (${error.message})` : "Service : organisation mise à jour.");
      }

      const secteurIdParCode = new Map<string, string>();
      if (analyse.secteurs.length > 0) {
        const { data, error } = await supabase
          .from("sectors")
          .insert(
            analyse.secteurs.map((s) => ({
              organization_id: organizationId,
              code: s.code,
              nom: s.nom,
              nb_abonnes: s.nbAbonnes,
              lineaire_km: s.lineaireKm,
            })),
          )
          .select("id, code");
        if (error) journal.push(`Secteurs : erreur (${error.message})`);
        else {
          journal.push(`Secteurs : ${data.length} créé(s).`);
          for (const s of data) secteurIdParCode.set(s.code, s.id);
        }
      }

      if (analyse.compteurs.length > 0) {
        const { data, error } = await supabase
          .from("meters")
          .insert(
            analyse.compteurs.map((c) => ({
              organization_id: organizationId,
              sector_id: c.secteurCode ? (secteurIdParCode.get(c.secteurCode) ?? null) : null,
              type: c.type,
              numero_serie: c.numeroSerie,
              nom: c.nom,
              diametre_mm: c.diametreMm,
            })),
          )
          .select("id");
        journal.push(
          error ? `Compteurs : erreur (${error.message})` : `Compteurs : ${data.length} créé(s).`,
        );
      }

      if (analyse.sources.length > 0) {
        const { data, error } = await supabase
          .from("sources")
          .insert(
            analyse.sources.map((s) => ({
              organization_id: organizationId,
              type: s.type,
              nom: s.nom,
            })),
          )
          .select("id");
        journal.push(
          error ? `Sources : erreur (${error.message})` : `Sources : ${data.length} créée(s).`,
        );
      }

      setResultat(journal);
      router.refresh();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="space-y-4">
      <Button type="button" variant="outline" onClick={telechargerModele}>
        Télécharger le modèle (.xlsx)
      </Button>

      <div className="space-y-2">
        <Label>Organisation cible</Label>
        <Select value={organizationId} onValueChange={(v) => v && setOrganizationId(v)}>
          <SelectTrigger className="w-full sm:w-80">
            <SelectValue placeholder="Choisir une organisation" />
          </SelectTrigger>
          <SelectContent>
            {organisations.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.nom}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="fiche-fichier">Fiche de collecte remplie (.xlsx)</Label>
        <input
          id="fiche-fichier"
          type="file"
          accept=".xlsx"
          onChange={choisirFichier}
          className="block text-sm"
        />
      </div>

      {analyse && (
        <div className="space-y-3 rounded-lg border p-3">
          <p className="text-sm">
            {analyse.service ? "Service : 1 organisation. " : ""}
            Secteurs : {analyse.secteurs.length}. Compteurs : {analyse.compteurs.length}. Sources
            : {analyse.sources.length}.
          </p>
          {analyse.erreurs.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {analyse.erreurs.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          {analyse.service && (
            <Label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={majService}
                onChange={(e) => setMajService(e.target.checked)}
              />
              Mettre à jour l&apos;organisation avec les valeurs de l&apos;onglet Service
            </Label>
          )}
          <Button
            type="button"
            onClick={importer}
            disabled={enCours || !organizationId}
          >
            {enCours ? "Import…" : "Importer dans l'organisation choisie"}
          </Button>
        </div>
      )}

      {erreur && (
        <Alert variant="destructive">
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}

      {resultat && (
        <Alert>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {resultat.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
