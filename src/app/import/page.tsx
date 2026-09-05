"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  autoDetectMapping,
  parseCsv,
  parseExcel,
  rawTableToCsv,
  transformBalanceInputs,
  transformReadings,
  type BalanceInputsMappingConfig,
  type BalanceInputsImportResult,
  type ReadingsImportResult,
  type ReadingsMappingConfig,
  type RawTable,
} from "@/lib/import";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Cible = "readings" | "balance_inputs";
type MappingConfig = ReadingsMappingConfig | BalanceInputsMappingConfig;

interface TemplateRow {
  id: string;
  nom: string;
  description: string | null;
  source_type: string;
  cible: Cible;
  config: MappingConfig;
  is_system: boolean;
}

interface JobRow {
  id: string;
  statut: string;
  nb_lignes_total: number | null;
  nb_lignes_importees: number | null;
  nb_lignes_rejetees: number | null;
  nb_lignes_ignorees: number | null;
  rapport_erreurs_path: string | null;
}

type Step = "modele" | "fichier" | "mapping" | "apercu" | "suivi";

const READINGS_FIELDS = [
  { key: "meter_ref", label: "Identifiant compteur" },
  { key: "ts", label: "Date / horodatage" },
  { key: "value", label: "Index ou volume" },
] as const;

const BALANCE_FIELDS = [
  { key: "annee", label: "Exercice (année)" },
  { key: "volume_comptabilise", label: "Volume facturé" },
  { key: "nb_abonnes", label: "Nombre d'abonnés (optionnel)" },
  { key: "commune", label: "Commune (optionnel)" },
] as const;

export default function ImportPage() {
  const supabase = useMemo(() => createClient(), []);

  const [orgId, setOrgId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [step, setStep] = useState<Step>("modele");
  const [erreurGenerale, setErreurGenerale] = useState<string | null>(null);

  const [selected, setSelected] = useState<TemplateRow | null>(null);
  const [config, setConfig] = useState<MappingConfig | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [rawTable, setRawTable] = useState<RawTable | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [previewReadings, setPreviewReadings] =
    useState<ReadingsImportResult | null>(null);
  const [previewBalance, setPreviewBalance] =
    useState<BalanceInputsImportResult | null>(null);
  const [enregistrerModele, setEnregistrerModele] = useState(false);
  const [nomNouveauModele, setNomNouveauModele] = useState("");
  const [lancement, setLancement] = useState(false);
  const [job, setJob] = useState<JobRow | null>(null);
  const [rapportUrl, setRapportUrl] = useState<string | null>(null);

  // Organisation courante : simplification tant qu'il n'y a pas de sélecteur
  // d'organisation dans l'application (une seule adhésion attendue pour l'instant).
  useEffect(() => {
    void (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data: memberships } = await supabase
        .from("memberships")
        .select("organization_id")
        .eq("user_id", userData.user.id)
        .limit(1);
      const org = memberships?.[0]?.organization_id ?? null;
      setOrgId(org);

      const { data: tpl } = await supabase
        .from("import_templates")
        .select("id, nom, description, source_type, cible, config, is_system")
        .order("is_system", { ascending: false })
        .order("nom");
      setTemplates((tpl ?? []) as TemplateRow[]);
    })();
  }, [supabase]);

  function choisirModele(template: TemplateRow) {
    setSelected(template);
    setConfig(structuredClone(template.config));
    setStep("fichier");
  }

  async function onFileSelected(selectedFile: File) {
    if (!config) return;
    setErreurGenerale(null);
    setFile(selectedFile);

    try {
      let text: string;
      if (/\.xlsx?$/i.test(selectedFile.name)) {
        const buffer = await selectedFile.arrayBuffer();
        const table = parseExcel(buffer, config.header_row);
        text = rawTableToCsv(table, config.delimiter);
      } else {
        const buffer = await selectedFile.arrayBuffer();
        const label =
          config.encoding.toLowerCase() === "iso-8859-1"
            ? "iso-8859-1"
            : "utf-8";
        text = new TextDecoder(label).decode(buffer);
      }
      setCsvText(text);

      const table = parseCsv(text, config.delimiter, config.header_row);
      setRawTable(table);

      const hint =
        selected?.cible === "balance_inputs"
          ? (config as BalanceInputsMappingConfig).column_mapping
          : (config as ReadingsMappingConfig).column_mapping;
      const detected = autoDetectMapping(
        table.headers,
        hint as unknown as Record<string, string | undefined>,
      );
      const resolved: Record<string, string> = {};
      for (const [field, headerName] of Object.entries(detected)) {
        if (headerName) resolved[field] = headerName;
      }
      setMapping(resolved);
      setStep("mapping");
    } catch (err) {
      setErreurGenerale(
        err instanceof Error ? err.message : "Lecture du fichier impossible.",
      );
    }
  }

  function runPreview() {
    if (!rawTable || !config || !selected) return;
    setErreurGenerale(null);

    if (selected.cible === "balance_inputs") {
      const mergedConfig: BalanceInputsMappingConfig = {
        ...(config as BalanceInputsMappingConfig),
        column_mapping:
          mapping as unknown as BalanceInputsMappingConfig["column_mapping"],
      };
      setConfig(mergedConfig);
      setPreviewBalance(transformBalanceInputs(rawTable, mergedConfig));
      setPreviewReadings(null);
    } else {
      const mergedConfig: ReadingsMappingConfig = {
        ...(config as ReadingsMappingConfig),
        column_mapping:
          mapping as unknown as ReadingsMappingConfig["column_mapping"],
      };
      setConfig(mergedConfig);
      setPreviewReadings(transformReadings(rawTable, mergedConfig));
      setPreviewBalance(null);
    }
    setStep("apercu");
  }

  async function lancerImport() {
    if (!orgId || !selected || !config || !csvText || !file) return;
    setLancement(true);
    setErreurGenerale(null);

    try {
      let templateId = selected.id;
      if (enregistrerModele && nomNouveauModele.trim()) {
        const { data: newTemplate, error: templateError } = await supabase
          .from("import_templates")
          .insert({
            organization_id: orgId,
            is_system: false,
            source_type: selected.source_type,
            cible: selected.cible,
            nom: nomNouveauModele.trim(),
            description: `Dérivé de « ${selected.nom} »`,
            config,
          })
          .select("id")
          .single();
        if (templateError)
          throw new Error(
            `Enregistrement du modèle impossible : ${templateError.message}`,
          );
        templateId = newTemplate.id;
      }

      const { data: existingSource } = await supabase
        .from("sources")
        .select("id")
        .eq("organization_id", orgId)
        .eq("type", "export_csv")
        .eq("nom", selected.nom)
        .maybeSingle();

      let sourceId = existingSource?.id as string | undefined;
      if (!sourceId) {
        const { data: newSource, error: sourceError } = await supabase
          .from("sources")
          .insert({
            organization_id: orgId,
            type: "export_csv",
            nom: selected.nom,
          })
          .select("id")
          .single();
        if (sourceError)
          throw new Error(
            `Création de la source impossible : ${sourceError.message}`,
          );
        sourceId = newSource.id;
      }

      const { data: newJob, error: jobError } = await supabase
        .from("import_jobs")
        .insert({
          organization_id: orgId,
          source_id: sourceId,
          template_id: templateId,
          statut: "en_attente",
          fichier_nom: file.name,
          mapping: config,
        })
        .select("id")
        .single();
      if (jobError)
        throw new Error(
          `Création de la tâche d'import impossible : ${jobError.message}`,
        );

      const filePath = `${orgId}/${newJob.id}/donnees.csv`;
      const { error: uploadError } = await supabase.storage
        .from("imports")
        .upload(filePath, new Blob([csvText], { type: "text/csv" }), {
          contentType: "text/csv",
        });
      if (uploadError)
        throw new Error(`Envoi du fichier impossible : ${uploadError.message}`);

      const { error: updateError } = await supabase
        .from("import_jobs")
        .update({ file_path: filePath })
        .eq("id", newJob.id);
      if (updateError)
        throw new Error(
          `Mise à jour de la tâche impossible : ${updateError.message}`,
        );

      // Déclenchement en tâche de fond : on n'attend pas la fin, le statut est suivi via polling.
      void supabase.functions.invoke("process-import", {
        body: { jobId: newJob.id },
      });

      setJob({
        id: newJob.id,
        statut: "en_attente",
        nb_lignes_total: null,
        nb_lignes_importees: null,
        nb_lignes_rejetees: null,
        nb_lignes_ignorees: null,
        rapport_erreurs_path: null,
      });
      setStep("suivi");
    } catch (err) {
      setErreurGenerale(
        err instanceof Error
          ? err.message
          : "Le lancement de l'import a échoué.",
      );
    } finally {
      setLancement(false);
    }
  }

  // Suivi du job : interrogation périodique jusqu'à statut terminal.
  useEffect(() => {
    if (
      step !== "suivi" ||
      !job ||
      job.statut === "termine" ||
      job.statut === "echec"
    )
      return;
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("import_jobs")
        .select(
          "id, statut, nb_lignes_total, nb_lignes_importees, nb_lignes_rejetees, nb_lignes_ignorees, rapport_erreurs_path",
        )
        .eq("id", job.id)
        .single();
      if (data) setJob(data as JobRow);
    }, 2000);
    return () => clearInterval(interval);
  }, [step, job, supabase]);

  useEffect(() => {
    void (async () => {
      if (!job?.rapport_erreurs_path) {
        setRapportUrl(null);
        return;
      }
      const { data } = await supabase.storage
        .from("imports")
        .createSignedUrl(job.rapport_erreurs_path, 300);
      setRapportUrl(data?.signedUrl ?? null);
    })();
  }, [job?.rapport_erreurs_path, supabase]);

  const champs =
    selected?.cible === "balance_inputs" ? BALANCE_FIELDS : READINGS_FIELDS;
  const preview = previewReadings ?? previewBalance;

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Import de relevés
        </h1>
        <p className="text-muted-foreground text-sm">
          CSV ou Excel, avec assistant de mapping et idempotence stricte
          (rejouer un import ne duplique rien).
        </p>
      </div>

      {erreurGenerale && (
        <Alert variant="destructive">
          <AlertTitle>Erreur</AlertTitle>
          <AlertDescription>{erreurGenerale}</AlertDescription>
        </Alert>
      )}

      {!orgId && (
        <p className="text-muted-foreground text-sm">
          Chargement de votre organisation…
        </p>
      )}

      {orgId && step === "modele" && (
        <Card>
          <CardHeader>
            <CardTitle>1. Choisir un modèle de mapping</CardTitle>
            <CardDescription>
              Modèles préremplis par fournisseur, ou générique. Vous pourrez
              ajuster le mapping ensuite.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => choisirModele(t)}
                className="hover:bg-muted flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors"
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="font-medium">{t.nom}</span>
                  {t.is_system ? (
                    <Badge variant="secondary">Système</Badge>
                  ) : (
                    <Badge variant="outline">Organisation</Badge>
                  )}
                </div>
                <span className="text-muted-foreground text-xs">
                  {t.description}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {step === "fichier" && selected && (
        <Card>
          <CardHeader>
            <CardTitle>2. Charger le fichier — {selected.nom}</CardTitle>
            <CardDescription>Format CSV ou Excel (.xlsx).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFileSelected(f);
              }}
            />
            <Button variant="outline" onClick={() => setStep("modele")}>
              Changer de modèle
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "mapping" && rawTable && (
        <Card>
          <CardHeader>
            <CardTitle>3. Vérifier le mapping des colonnes</CardTitle>
            <CardDescription>
              Détecté automatiquement à partir de l&apos;en-tête du fichier —
              corrigez si besoin.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {champs.map((f) => (
              <div key={f.key} className="grid grid-cols-3 items-center gap-3">
                <Label className="col-span-1">{f.label}</Label>
                <div className="col-span-2">
                  <Select
                    value={mapping[f.key] ?? ""}
                    onValueChange={(v) => {
                      if (v) setMapping((m) => ({ ...m, [f.key]: v }));
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Colonne du fichier…" />
                    </SelectTrigger>
                    <SelectContent>
                      {rawTable.headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("fichier")}>
                Retour
              </Button>
              <Button onClick={runPreview}>Prévisualiser</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "apercu" && preview && (
        <Card>
          <CardHeader>
            <CardTitle>4. Prévisualisation</CardTitle>
            <CardDescription>
              Sur l&apos;échantillon chargé — le fichier complet sera traité au
              lancement.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {previewReadings && (
              <div className="flex flex-wrap gap-2">
                <Badge>{previewReadings.readings.length} relevés valides</Badge>
                <Badge variant="outline">
                  {previewReadings.ignoredRows.length} ignorés (premier point)
                </Badge>
                {previewReadings.errorRows.length > 0 && (
                  <Badge variant="destructive">
                    {previewReadings.errorRows.length} en erreur
                  </Badge>
                )}
              </div>
            )}
            {previewBalance && (
              <div className="flex flex-wrap gap-2">
                <Badge>
                  {previewBalance.byYear.size} exercice(s) agrégé(s)
                </Badge>
                {previewBalance.errorRows.length > 0 && (
                  <Badge variant="destructive">
                    {previewBalance.errorRows.length} en erreur
                  </Badge>
                )}
              </div>
            )}

            <div className="max-h-64 overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {previewReadings ? (
                      <>
                        <TableHead>Compteur</TableHead>
                        <TableHead>Horodatage</TableHead>
                        <TableHead>Volume (m³)</TableHead>
                        <TableHead>Qualité</TableHead>
                      </>
                    ) : (
                      <>
                        <TableHead>Exercice</TableHead>
                        <TableHead>Volume comptabilisé (m³)</TableHead>
                        <TableHead>Abonnés</TableHead>
                      </>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewReadings?.readings.slice(0, 20).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.meterRef}</TableCell>
                      <TableCell>{r.ts.toLocaleString("fr-FR")}</TableCell>
                      <TableCell>{r.volumeM3.toFixed(3)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            r.qualityFlag === "valide"
                              ? "secondary"
                              : "destructive"
                          }
                        >
                          {r.qualityFlag}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {previewBalance &&
                    [...previewBalance.byYear.entries()].map(([annee, agg]) => (
                      <TableRow key={annee}>
                        <TableCell>{annee}</TableCell>
                        <TableCell>
                          {agg.volumeComptabilise.toFixed(0)}
                        </TableCell>
                        <TableCell>{agg.nbAbonnes ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <Label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={enregistrerModele}
                  onChange={(e) => setEnregistrerModele(e.target.checked)}
                />
                Enregistrer ce mapping comme nouveau modèle pour cette
                organisation
              </Label>
              {enregistrerModele && (
                <Input
                  placeholder="Nom du modèle"
                  value={nomNouveauModele}
                  onChange={(e) => setNomNouveauModele(e.target.value)}
                />
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("mapping")}>
                Retour
              </Button>
              <Button onClick={lancerImport} disabled={lancement}>
                {lancement ? "Lancement…" : "Lancer l'import"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "suivi" && job && (
        <Card>
          <CardHeader>
            <CardTitle>5. Suivi de l&apos;import</CardTitle>
            <CardDescription>
              Traitement en tâche de fond — vous pouvez quitter cette page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Badge
              variant={
                job.statut === "termine"
                  ? "secondary"
                  : job.statut === "echec"
                    ? "destructive"
                    : "outline"
              }
            >
              {job.statut}
            </Badge>
            {job.statut === "termine" && (
              <ul className="text-sm">
                <li>Lignes totales : {job.nb_lignes_total}</li>
                <li>Importées : {job.nb_lignes_importees}</li>
                <li>
                  Ignorées (premier point compteur) : {job.nb_lignes_ignorees}
                </li>
                <li>Rejetées : {job.nb_lignes_rejetees}</li>
              </ul>
            )}
            {rapportUrl && (
              <a
                href={rapportUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary text-sm underline"
              >
                Télécharger le rapport d&apos;erreurs
              </a>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setStep("modele");
                setSelected(null);
                setConfig(null);
                setFile(null);
                setCsvText(null);
                setRawTable(null);
                setMapping({});
                setPreviewReadings(null);
                setPreviewBalance(null);
                setJob(null);
              }}
            >
              Nouvel import
            </Button>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
