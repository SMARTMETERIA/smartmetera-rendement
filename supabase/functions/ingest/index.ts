// Point d'entrée unique des 4 endpoints d'ingestion LoRaWAN, routés par
// chemin : /ingest/liveobjects/<jeton>, /ingest/ttn/<jeton>,
// /ingest/chirpstack/<jeton>, /ingest/generic/<jeton> (Supabase déploie un
// répertoire de fonction = une fonction, qui reçoit toutes les sous-routes
// /functions/v1/ingest/* : le routage se fait donc ici sur req.url).
//
// Pipeline : jeton -> source (organisation) -> enveloppe de plateforme
// (DevEUI + payload brut) -> idempotence (raw_frames, clé source+trame) ->
// registre d'équipements (DevEUI [+ canal] -> compteur, décodeur, facteur
// d'impulsion) -> décodeur constructeur -> delta par rapport au dernier
// index connu (avec gestion de rollover) -> upsert readings + mise à jour
// de l'état de l'équipement. Chaque appel est journalisé dans raw_frames,
// y compris les échecs (jamais de perte silencieuse — voir CLAUDE.md).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PARSEURS_ENVELOPPE, estErreurEnveloppe, type Plateforme } from "./lib/envelopes/index.ts";
import { DECODEURS, MAX_IMPULSIONS } from "./lib/decoders/index.ts";
import { construireCleIdempotence } from "./lib/idempotency.ts";
import { appliquerPointReleve, type EtatDevice } from "./lib/computeDelta.ts";
import type { CodeDecodeur, PointReleve } from "./lib/types.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PLATEFORMES_VALIDES: Plateforme[] = ["ttn", "chirpstack", "liveobjects", "generic"];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function extraireRoute(url: string): { plateforme: string; jeton: string } | null {
  const segments = new URL(url).pathname.split("/").filter(Boolean);
  const idx = segments.indexOf("ingest");
  if (idx === -1 || segments.length < idx + 3) return null;
  return { plateforme: segments[idx + 1], jeton: segments[idx + 2] };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const route = extraireRoute(req.url);
  if (!route || !PLATEFORMES_VALIDES.includes(route.plateforme as Plateforme)) {
    return json(
      { erreur: "Route inconnue, attendu /ingest/<plateforme>/<jeton>" },
      404,
    );
  }
  const plateforme = route.plateforme as Plateforme;

  if (req.method !== "POST") {
    return json({ erreur: "Méthode non autorisée, POST attendu" }, 405);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: source } = await admin
    .from("sources")
    .select("id, organization_id, actif")
    .eq("webhook_token", route.jeton)
    .eq("plateforme", plateforme)
    .eq("type", "webhook_lorawan")
    .maybeSingle();

  if (!source || !source.actif) {
    return json({ erreur: "Jeton de webhook invalide ou source inactive" }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ erreur: "Corps de requête JSON invalide" }, 400);
  }

  const enveloppe = PARSEURS_ENVELOPPE[plateforme](body);
  if (estErreurEnveloppe(enveloppe)) {
    return json({ ok: false, statut: "erreur_decodage", erreur: enveloppe.erreur }, 200);
  }

  const idempotencyKey = construireCleIdempotence({
    devEui: enveloppe.devEui,
    canal: null,
    fCnt: enveloppe.fCnt,
    horodatage: enveloppe.recuLe,
  });

  const { data: reserved, error: reserveError } = await admin
    .from("raw_frames")
    .insert({
      organization_id: source.organization_id,
      source_id: source.id,
      dev_eui: enveloppe.devEui,
      idempotency_key: idempotencyKey,
      charge_utile: body,
      statut: "ok",
    })
    .select("id")
    .single();

  if (reserveError) {
    if (reserveError.code === "23505") {
      return json({ ok: true, statut: "doublon" }, 200);
    }
    return json({ erreur: `Journalisation impossible : ${reserveError.message}` }, 500);
  }
  const rawFrameId = reserved.id as number;

  const { data: devices } = await admin
    .from("devices")
    .select("id, canal, meter_id, decodeur, litres_par_impulsion, dernier_index_impulsions, dernier_horodatage, meters(nom)")
    .eq("organization_id", source.organization_id)
    .eq("dev_eui", enveloppe.devEui)
    .eq("actif", true);

  if (!devices || devices.length === 0) {
    await admin
      .from("raw_frames")
      .update({ statut: "appareil_inconnu", device_id: null })
      .eq("id", rawFrameId);
    return json({ ok: false, statut: "appareil_inconnu" }, 200);
  }

  const decodeur = devices[0].decodeur as CodeDecodeur;
  let decode;
  try {
    decode = DECODEURS[decodeur](enveloppe.payload, {
      recuLe: enveloppe.recuLe,
      fPort: enveloppe.fPort,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from("raw_frames")
      .update({ statut: "erreur_decodage", erreur: message, device_id: devices[0].id })
      .eq("id", rawFrameId);
    return json({ ok: false, statut: "erreur_decodage", erreur: message }, 200);
  }

  const resultatsPoints: Record<string, unknown>[] = [];
  let dernierPointApplique: { ts: string; volumeM3: number } | null = null;
  let deviceIdPrincipal: string | null = null;

  for (const point of decode.points as PointReleve[]) {
    const device = devices.find((d) => (d.canal ?? null) === point.canal);
    if (!device) {
      resultatsPoints.push({
        canal: point.canal,
        impulsions: point.impulsions,
        applique: false,
        note: `Aucun équipement actif associé au canal ${point.canal ?? "unique"}`,
      });
      continue;
    }
    deviceIdPrincipal ??= device.id;

    const etat: EtatDevice = {
      dernierIndexImpulsions: device.dernier_index_impulsions,
      dernierHorodatage: device.dernier_horodatage,
    };
    const resultat = appliquerPointReleve(
      etat,
      point,
      Number(device.litres_par_impulsion),
      MAX_IMPULSIONS[decodeur],
    );

    await admin
      .from("devices")
      .update({
        dernier_index_impulsions: resultat.nouvelEtat.dernierIndexImpulsions,
        dernier_horodatage: resultat.nouvelEtat.dernierHorodatage,
      })
      .eq("id", device.id);

    if (!resultat.ignorer) {
      const { error: readingError } = await admin.from("readings").upsert(
        {
          organization_id: source.organization_id,
          meter_id: device.meter_id,
          source_id: source.id,
          ts: point.horodatage,
          volume_m3: resultat.volumeM3,
          quality_flag: resultat.qualityFlag,
        },
        { onConflict: "meter_id,ts,source_id" },
      );
      if (!readingError) {
        dernierPointApplique = { ts: point.horodatage, volumeM3: resultat.volumeM3 };
      }
      resultatsPoints.push({
        canal: point.canal,
        meterId: device.meter_id,
        meterNom: (device.meters as unknown as { nom: string } | null)?.nom,
        ts: point.horodatage,
        volumeM3: resultat.volumeM3,
        qualityFlag: resultat.qualityFlag,
        note: resultat.note,
        applique: !readingError,
        erreur: readingError?.message,
      });
    } else {
      resultatsPoints.push({
        canal: point.canal,
        meterId: device.meter_id,
        applique: false,
        note: resultat.note,
      });
    }
  }

  await admin
    .from("raw_frames")
    .update({
      statut: "ok",
      device_id: deviceIdPrincipal,
      trame_decodee: { decodeur, brut: decode.brut, points: resultatsPoints },
      releve_ts: dernierPointApplique?.ts ?? null,
      releve_volume_m3: dernierPointApplique?.volumeM3 ?? null,
    })
    .eq("id", rawFrameId);

  return json({ ok: true, statut: "ok", points: resultatsPoints });
});
