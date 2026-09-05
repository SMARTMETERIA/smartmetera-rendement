// Exécute une tâche d'import (import_jobs) en tâche de fond : télécharge le
// fichier depuis le bucket "imports", parse selon le mapping résolu au
// lancement (job.mapping — indépendant d'une modification ultérieure du
// modèle), transforme, résout les compteurs, upsert idempotent dans
// readings (ou agrège dans balance_inputs pour l'export facturation JVS),
// génère un rapport d'erreurs téléchargeable, et met à jour le statut.
//
// Invoquée par le client juste après upload (supabase.functions.invoke),
// sans attente de fin : la page d'import suit ensuite l'avancement en
// interrogeant import_jobs.statut.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { parseCsv } from "./lib/parseCsv.ts";
import { decodeBytes } from "./lib/decode.ts";
import { transformReadings } from "./lib/transformReadings.ts";
import { transformBalanceInputs } from "./lib/transformBalanceInputs.ts";
import { resolveMeterIds, buildMeterIndex } from "./lib/resolveMeters.ts";
import { buildErrorReportCsv } from "./lib/errorReport.ts";
import type {
  BalanceInputsMappingConfig,
  RawTable,
  ReadingsMappingConfig,
  RowError,
} from "./lib/types.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BATCH_SIZE = 500;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  let jobId: string | undefined;
  try {
    const body = await req.json();
    jobId = body.jobId;
  } catch {
    return json({ error: "Corps de requête invalide, jobId attendu" }, 400);
  }
  if (!jobId) return json({ error: "jobId manquant" }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: job, error: jobError } = await admin
    .from("import_jobs")
    .select("*, import_templates(cible)")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return json({ error: "Tâche d'import introuvable" }, 404);
  }
  if (job.statut !== "en_attente") {
    return json({ error: `Tâche déjà au statut "${job.statut}"` }, 409);
  }

  await admin
    .from("import_jobs")
    .update({ statut: "en_cours", demarre_le: new Date().toISOString() })
    .eq("id", jobId);

  try {
    const cible = job.import_templates?.cible ?? "readings";

    const { data: fileBlob, error: downloadError } = await admin.storage
      .from("imports")
      .download(job.file_path);
    if (downloadError || !fileBlob) {
      throw new Error(
        `Téléchargement du fichier impossible : ${downloadError?.message ?? "fichier introuvable"}`,
      );
    }

    // Les fichiers Excel sont convertis en CSV côté client avant l'upload
    // (voir src/lib/import/toCsv.ts) : cette fonction ne traite que du CSV.
    const bytes = new Uint8Array(await fileBlob.arrayBuffer());
    const table: RawTable = parseCsv(
      decodeBytes(bytes, job.mapping.encoding),
      job.mapping.delimiter,
      job.mapping.header_row,
    );

    if (cible === "balance_inputs") {
      await processBalanceInputs(
        admin,
        job,
        table,
        job.mapping as BalanceInputsMappingConfig,
      );
    } else {
      await processReadings(
        admin,
        job,
        table,
        job.mapping as ReadingsMappingConfig,
      );
    }

    return json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from("import_jobs")
      .update({
        statut: "echec",
        termine_le: new Date().toISOString(),
        erreurs: [{ reason: message }],
      })
      .eq("id", jobId);
    return json({ error: message }, 500);
  }
});

// deno-lint-ignore no-explicit-any
async function processReadings(
  admin: SupabaseClient,
  job: any,
  table: RawTable,
  config: ReadingsMappingConfig,
) {
  const result = transformReadings(table, config);

  const { data: meters } = await admin
    .from("meters")
    .select("id, numero_serie")
    .eq("organization_id", job.organization_id);
  const meterIndex = buildMeterIndex(meters ?? []);
  const { resolved, unresolvedMeterRefs } = resolveMeterIds(
    result.readings,
    meterIndex,
  );

  const unresolvedErrors: RowError[] = result.readings
    .filter((r) => unresolvedMeterRefs.includes(r.meterRef))
    .map((r) => ({
      rowNumber: r.rowNumber,
      raw: [],
      reason: `Compteur inconnu dans l'organisation : "${r.meterRef}"`,
    }));

  const rowsToInsert = resolved.map((r) => ({
    organization_id: job.organization_id,
    meter_id: r.meterId,
    source_id: job.source_id,
    ts: r.ts.toISOString(),
    volume_m3: r.volumeM3,
    quality_flag: r.qualityFlag,
  }));

  for (let i = 0; i < rowsToInsert.length; i += BATCH_SIZE) {
    const batch = rowsToInsert.slice(i, i + BATCH_SIZE);
    if (batch.length === 0) continue;
    const { error } = await admin
      .from("readings")
      .upsert(batch, { onConflict: "meter_id,ts,source_id" });
    if (error)
      throw new Error(`Insertion des relevés impossible : ${error.message}`);
  }

  const allErrors = [...result.errorRows, ...unresolvedErrors];
  await finalizeJob(admin, job, table, {
    nbImportees: rowsToInsert.length,
    nbRejetees: allErrors.length,
    nbIgnorees: result.ignoredRows.length,
    erreurs: [...allErrors, ...result.ignoredRows],
  });
}

// deno-lint-ignore no-explicit-any
async function processBalanceInputs(
  admin: SupabaseClient,
  job: any,
  table: RawTable,
  config: BalanceInputsMappingConfig,
) {
  const result = transformBalanceInputs(table, config);

  const { data: org } = await admin
    .from("organizations")
    .select("lineaire_reseau_km, nb_abonnes, zone_repartition_eaux")
    .eq("id", job.organization_id)
    .single();

  let nbImportees = 0;
  for (const [annee, agg] of result.byYear) {
    const { data: existing } = await admin
      .from("balance_inputs")
      .select("id")
      .eq("organization_id", job.organization_id)
      .eq("annee", annee)
      .maybeSingle();

    if (existing) {
      const update: Record<string, unknown> = {
        v_comptabilise: agg.volumeComptabilise,
      };
      if (agg.nbAbonnes !== null) update.nb_abonnes = agg.nbAbonnes;
      const { error } = await admin
        .from("balance_inputs")
        .update(update)
        .eq("id", existing.id);
      if (error)
        throw new Error(
          `Mise à jour du bilan ${annee} impossible : ${error.message}`,
        );
    } else {
      const { error } = await admin.from("balance_inputs").insert({
        organization_id: job.organization_id,
        annee,
        v_comptabilise: agg.volumeComptabilise,
        nb_abonnes: agg.nbAbonnes ?? org?.nb_abonnes ?? 0,
        lineaire_reseau_km: org?.lineaire_reseau_km ?? 0,
        zone_repartition_eaux: org?.zone_repartition_eaux ?? false,
      });
      if (error)
        throw new Error(
          `Création du bilan ${annee} impossible : ${error.message}`,
        );
    }
    nbImportees += 1;
  }

  await finalizeJob(admin, job, table, {
    nbImportees,
    nbRejetees: result.errorRows.length,
    nbIgnorees: 0,
    erreurs: result.errorRows,
  });
}

async function finalizeJob(
  admin: SupabaseClient,
  // deno-lint-ignore no-explicit-any
  job: any,
  table: RawTable,
  stats: {
    nbImportees: number;
    nbRejetees: number;
    nbIgnorees: number;
    erreurs: RowError[];
  },
) {
  const reportCsv = buildErrorReportCsv(stats.erreurs);
  const reportPath = `${job.organization_id}/${job.id}/rapport-erreurs.csv`;
  await admin.storage
    .from("imports")
    .upload(reportPath, new Blob([reportCsv], { type: "text/csv" }), {
      upsert: true,
      contentType: "text/csv",
    });

  await admin
    .from("import_jobs")
    .update({
      statut: "termine",
      termine_le: new Date().toISOString(),
      nb_lignes_total: table.rows.length,
      nb_lignes_importees: stats.nbImportees,
      nb_lignes_rejetees: stats.nbRejetees,
      nb_lignes_ignorees: stats.nbIgnorees,
      rapport_erreurs_path: reportPath,
      erreurs: stats.erreurs.slice(0, 50),
    })
    .eq("id", job.id);
}
