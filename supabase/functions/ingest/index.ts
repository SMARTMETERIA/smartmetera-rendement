// Point d'entrée unique de la réception des capteurs, routé par chemin :
// /ingest/<plateforme>/<jeton> avec plateforme parmi liveobjects, ttn,
// chirpstack, generic et mqtt (Supabase déploie un répertoire de fonction =
// une fonction, qui reçoit toutes les sous-routes /functions/v1/ingest/* :
// le routage se fait donc ici sur req.url).
//
// Deux sortes de jetons :
// - jeton d'une source d'organisation (offre Réseau, sources.webhook_token) :
//   l'appareil est cherché dans cette organisation ;
// - jeton de la plateforme (platform_settings.reception : jeton_mqtt pour le
//   broker MQTT du kit A, jeton_lorawan pour le serveur LoRaWAN commun) :
//   l'appareil, retrouvé par sa référence (IMEI ou DevEUI), désigne
//   l'organisation ; une source « reception_plateforme » par organisation
//   porte ses relevés.
//
// Pipeline : jeton -> enveloppe (référence + payload) -> idempotence
// (raw_frames, clé source + trame) -> registre d'appareils (référence
// [+ voie] -> compteur ou point de température, décodeur, poids
// d'impulsion) -> décodeur -> delta par rapport au dernier index (rollover)
// -> relevés, températures, niveaux des réserves, état de l'appareil (pile, radio, dernier
// message), niveau de surveillance du point. Chaque appel est journalisé,
// y compris les échecs (jamais de perte silencieuse). Les trames d'un
// appareil inconnu reçues par la plateforme vont dans unknown_frames.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { PARSEURS_ENVELOPPE, estErreurEnveloppe, type Plateforme } from "./lib/envelopes/index.ts";
import { evenementChirpstack, parseStatutChirpstack } from "./lib/envelopes/chirpstack.ts";
import { DECODEURS, MAX_IMPULSIONS } from "./lib/decoders/index.ts";
import { lireReglageNiveau } from "./lib/decoders/niveauObjet.ts";
import { construireCleIdempotence } from "./lib/idempotency.ts";
import { appliquerPointReleve, type EtatDevice } from "./lib/computeDelta.ts";
import { niveauSurveillance } from "./lib/surveillance.ts";
import { normaliserReference } from "./lib/reference.ts";
import type { CodeDecodeur, EnveloppeUplink, PointReleve } from "./lib/types.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PLATEFORMES_VALIDES: Plateforme[] = ["ttn", "chirpstack", "liveobjects", "generic", "mqtt"];

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

/** Comparaison en temps constant (jetons secrets). */
function egauxConstant(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface Source {
  id: string;
  organization_id: string;
}

interface Appareil {
  id: string;
  organization_id: string;
  canal: string | null;
  meter_id: string | null;
  decodeur: CodeDecodeur | null;
  litres_par_impulsion: number;
  dernier_index_impulsions: number | null;
  dernier_horodatage: string | null;
  provisioning_status: string;
  first_data_at: string | null;
}

const COLONNES_APPAREIL =
  "id, organization_id, canal, meter_id, decodeur, litres_par_impulsion, dernier_index_impulsions, dernier_horodatage, provisioning_status, first_data_at";

async function sourcePlateforme(
  admin: SupabaseClient,
  organizationId: string,
  plateforme: Plateforme,
): Promise<Source> {
  const canal = plateforme === "mqtt" ? "mqtt" : plateforme;
  const { data: existante } = await admin
    .from("sources")
    .select("id, organization_id")
    .eq("organization_id", organizationId)
    .eq("type", "reception_plateforme")
    .eq("plateforme", canal)
    .maybeSingle();
  if (existante) return existante as Source;
  const { data, error } = await admin
    .from("sources")
    .insert({
      organization_id: organizationId,
      type: "reception_plateforme",
      plateforme: canal,
      nom: plateforme === "mqtt" ? "Réception cellulaire (plateforme)" : "Réception LoRaWAN (plateforme)",
    })
    .select("id, organization_id")
    .single();
  if (error) {
    // Création concurrente : relire.
    const { data: relue } = await admin
      .from("sources")
      .select("id, organization_id")
      .eq("organization_id", organizationId)
      .eq("type", "reception_plateforme")
      .eq("plateforme", canal)
      .single();
    return relue as Source;
  }
  return data as Source;
}

async function mettreAJourEtat(
  admin: SupabaseClient,
  appareils: Appareil[],
  enveloppe: EnveloppeUplink,
  brut: Record<string, unknown> | undefined,
) {
  const maintenant = new Date().toISOString();
  const maj: Record<string, unknown> = { last_seen_at: maintenant };
  if (enveloppe.rssi !== undefined) maj.rssi = enveloppe.rssi;
  if (enveloppe.snr !== undefined) maj.snr = enveloppe.snr;
  if (typeof brut?.batterie === "number") {
    maj.battery_pct = Math.max(0, Math.min(100, brut.batterie));
  }
  if (typeof brut?.batterieFaible === "boolean") maj.battery_low = brut.batterieFaible;
  await admin.from("devices").update(maj).in("id", appareils.map((a) => a.id));
  const sansPremiere = appareils.filter((a) => !a.first_data_at).map((a) => a.id);
  if (sansPremiere.length > 0) {
    await admin.from("devices").update({ first_data_at: maintenant }).in("id", sansPremiere);
  }
}

async function traiterStatutChirpstack(
  admin: SupabaseClient,
  body: unknown,
  organizationId: string | null,
) {
  const statut = parseStatutChirpstack(body);
  if ("erreur" in statut) return json({ ok: false, statut: "erreur_decodage", erreur: statut.erreur });
  let requete = admin
    .from("devices")
    .update({
      ...(statut.batteriePct !== undefined ? { battery_pct: statut.batteriePct } : {}),
      last_seen_at: new Date().toISOString(),
    })
    .eq("device_ref", statut.devEui)
    .neq("provisioning_status", "retire");
  if (organizationId) requete = requete.eq("organization_id", organizationId);
  await requete;
  return json({ ok: true, statut: "etat_appareil" });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const route = extraireRoute(req.url);
  if (!route || !PLATEFORMES_VALIDES.includes(route.plateforme as Plateforme)) {
    return json({ erreur: "Route inconnue, attendu /ingest/<plateforme>/<jeton>" }, 404);
  }
  const plateforme = route.plateforme as Plateforme;
  if (req.method !== "POST") {
    return json({ erreur: "Méthode non autorisée, POST attendu" }, 405);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // 1) Jeton : plateforme ou source d'organisation.
  const { data: reglages } = await admin
    .from("platform_settings")
    .select("key, value")
    .in("key", ["reception", "capteur_niveau"]);
  const reglage = (cle: string) => (reglages ?? []).find((r) => r.key === cle)?.value ?? null;
  const jetons = (reglage("reception") ?? {}) as { jeton_mqtt?: string; jeton_lorawan?: string };
  const jetonAttendu = plateforme === "mqtt" ? jetons.jeton_mqtt : jetons.jeton_lorawan;
  const modePlateforme =
    plateforme !== "liveobjects" && !!jetonAttendu && egauxConstant(route.jeton, jetonAttendu);

  let sourceOrganisation: Source | null = null;
  if (!modePlateforme) {
    if (plateforme === "mqtt") {
      return json({ erreur: "Jeton invalide" }, 401);
    }
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
    sourceOrganisation = source as Source;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ erreur: "Corps de requête JSON invalide" }, 400);
  }

  // 2) Événements ChirpStack autres que les données.
  if (plateforme === "chirpstack") {
    const evenement = evenementChirpstack(req.url);
    if (evenement === "status") {
      return traiterStatutChirpstack(admin, body, sourceOrganisation?.organization_id ?? null);
    }
    if (evenement === "autre") return json({ ok: true, statut: "ignore" });
  }

  const enveloppe = PARSEURS_ENVELOPPE[plateforme](body);
  if (estErreurEnveloppe(enveloppe)) {
    return json({ ok: false, statut: "erreur_decodage", erreur: enveloppe.erreur }, 200);
  }
  const reference = normaliserReference(enveloppe.devEui);
  if (!reference) {
    return json(
      { ok: false, statut: "erreur_decodage", erreur: "Référence d'appareil invalide (DevEUI ou IMEI attendu)" },
      200,
    );
  }

  // 3) Appareils de cette référence (une ligne par voie).
  let requeteAppareils = admin
    .from("devices")
    .select(COLONNES_APPAREIL)
    .eq("device_ref", reference)
    .neq("provisioning_status", "retire");
  if (sourceOrganisation) {
    requeteAppareils = requeteAppareils
      .eq("organization_id", sourceOrganisation.organization_id)
      .eq("actif", true);
  }
  const { data: lignesAppareils } = await requeteAppareils;
  const appareils = (lignesAppareils ?? []) as Appareil[];

  if (modePlateforme && appareils.length === 0) {
    await admin.from("unknown_frames").insert({
      channel: plateforme === "mqtt" ? "mqtt" : "lorawan",
      device_ref: reference,
      payload: body,
    });
    return json({ ok: false, statut: "appareil_inconnu" }, 200);
  }

  const source =
    sourceOrganisation ?? (await sourcePlateforme(admin, appareils[0].organization_id, plateforme));

  // 4) Idempotence et journal.
  const idempotencyKey = construireCleIdempotence({
    devEui: reference,
    canal: null,
    fCnt: enveloppe.fCnt,
    horodatage: enveloppe.recuLe,
  });
  const { data: reserved, error: reserveError } = await admin
    .from("raw_frames")
    .insert({
      organization_id: source.organization_id,
      source_id: source.id,
      dev_eui: reference,
      idempotency_key: idempotencyKey,
      charge_utile: body,
      statut: "ok",
    })
    .select("id")
    .single();
  if (reserveError) {
    if (reserveError.code === "23505") return json({ ok: true, statut: "doublon" }, 200);
    return json({ erreur: `Journalisation impossible : ${reserveError.message}` }, 500);
  }
  const rawFrameId = reserved.id as number;

  if (appareils.length === 0) {
    await admin.from("raw_frames").update({ statut: "appareil_inconnu" }).eq("id", rawFrameId);
    return json({ ok: false, statut: "appareil_inconnu" }, 200);
  }

  // 5) Appareil en stock ou attribué mais pas encore posé : on garde la
  //    trame (l'assistant de pose affiche « données reçues »).
  const decodeur = appareils.find((a) => a.decodeur)?.decodeur ?? null;
  if (!decodeur) {
    await mettreAJourEtat(admin, appareils, enveloppe, undefined);
    await admin
      .from("raw_frames")
      .update({ statut: "non_pose", device_id: appareils[0].id })
      .eq("id", rawFrameId);
    return json({ ok: true, statut: "non_pose" }, 200);
  }

  let decode;
  try {
    decode = DECODEURS[decodeur](enveloppe.payload, {
      recuLe: enveloppe.recuLe,
      fPort: enveloppe.fPort,
      objet: enveloppe.objet,
      niveau: lireReglageNiveau(reglage("capteur_niveau")),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await mettreAJourEtat(admin, appareils, enveloppe, undefined);
    await admin
      .from("raw_frames")
      .update({ statut: "erreur_decodage", erreur: message, device_id: appareils[0].id })
      .eq("id", rawFrameId);
    return json({ ok: false, statut: "erreur_decodage", erreur: message }, 200);
  }

  await mettreAJourEtat(admin, appareils, enveloppe, decode.brut);
  const resultatsPoints: Record<string, unknown>[] = [];
  let dernierPointApplique: { ts: string; volumeM3: number } | null = null;
  const activer: string[] = [];

  // 6a) Sonde de température : relevé du registre sanitaire.
  if (typeof decode.brut?.temperatureC === "number") {
    const { data: points } = await admin
      .from("temperature_points")
      .select("id, organization_id")
      .in("device_id", appareils.map((a) => a.id))
      .eq("active", true);
    for (const point of points ?? []) {
      const { error } = await admin.from("temperature_readings").upsert(
        {
          organization_id: point.organization_id,
          point_id: point.id,
          ts: enveloppe.recuLe,
          value_c: decode.brut.temperatureC,
        },
        { onConflict: "point_id,ts", ignoreDuplicates: true },
      );
      resultatsPoints.push({
        pointTemperature: point.id,
        temperatureC: decode.brut.temperatureC,
        applique: !error,
        erreur: error?.message,
      });
    }
    activer.push(...appareils.filter((a) => a.provisioning_status === "pose").map((a) => a.id));
  }

  // 6b) Capteur de niveau : relevé de la réserve d'eau (autonomie, G11).
  if (typeof decode.brut?.niveauM === "number") {
    const { data: reserves } = await admin
      .from("water_reserves")
      .select("id, organization_id")
      .in("device_id", appareils.map((a) => a.id))
      .eq("active", true);
    for (const reserve of reserves ?? []) {
      const { error } = await admin.from("reserve_levels").upsert(
        {
          organization_id: reserve.organization_id,
          reserve_id: reserve.id,
          ts: enveloppe.recuLe,
          measure_m: decode.brut.niveauM,
        },
        { onConflict: "reserve_id,ts", ignoreDuplicates: true },
      );
      resultatsPoints.push({
        reserve: reserve.id,
        niveauM: decode.brut.niveauM,
        applique: !error,
        erreur: error?.message,
      });
    }
    activer.push(...appareils.filter((a) => a.provisioning_status === "pose").map((a) => a.id));
  }

  // 6c) Impulsions : relevés d'eau, voie par voie.
  const horodatagesParCompteur = new Map<string, string[]>();
  for (const point of decode.points as PointReleve[]) {
    const appareil = appareils.find((a) => (a.canal ?? null) === point.canal);
    if (!appareil || !appareil.meter_id) {
      resultatsPoints.push({
        canal: point.canal,
        impulsions: point.impulsions,
        applique: false,
        note: `Aucun compteur posé sur la voie ${point.canal ?? "unique"}`,
      });
      continue;
    }
    const etat: EtatDevice = {
      dernierIndexImpulsions: appareil.dernier_index_impulsions,
      dernierHorodatage: appareil.dernier_horodatage,
    };
    const liste = horodatagesParCompteur.get(appareil.meter_id) ??
      (appareil.dernier_horodatage ? [appareil.dernier_horodatage] : []);
    liste.push(point.horodatage);
    horodatagesParCompteur.set(appareil.meter_id, liste);

    const resultat = appliquerPointReleve(
      etat,
      point,
      Number(appareil.litres_par_impulsion),
      MAX_IMPULSIONS[decodeur],
    );
    appareil.dernier_index_impulsions = resultat.nouvelEtat.dernierIndexImpulsions;
    appareil.dernier_horodatage = resultat.nouvelEtat.dernierHorodatage;
    await admin
      .from("devices")
      .update({
        dernier_index_impulsions: resultat.nouvelEtat.dernierIndexImpulsions,
        dernier_horodatage: resultat.nouvelEtat.dernierHorodatage,
      })
      .eq("id", appareil.id);
    if (appareil.provisioning_status === "pose") activer.push(appareil.id);

    if (resultat.ignorer) {
      resultatsPoints.push({ canal: point.canal, meterId: appareil.meter_id, applique: false, note: resultat.note });
      continue;
    }
    const { error: readingError } = await admin.from("readings").upsert(
      {
        organization_id: source.organization_id,
        meter_id: appareil.meter_id,
        source_id: source.id,
        ts: point.horodatage,
        volume_m3: resultat.volumeM3,
        quality_flag: resultat.qualityFlag,
      },
      { onConflict: "meter_id,ts,source_id" },
    );
    if (!readingError) dernierPointApplique = { ts: point.horodatage, volumeM3: resultat.volumeM3 };
    resultatsPoints.push({
      canal: point.canal,
      meterId: appareil.meter_id,
      ts: point.horodatage,
      volumeM3: resultat.volumeM3,
      qualityFlag: resultat.qualityFlag,
      note: resultat.note,
      applique: !readingError,
      erreur: readingError?.message,
    });
  }

  // 7) Posé -> actif à la première donnée ; niveau de surveillance.
  if (activer.length > 0) {
    await admin
      .from("devices")
      .update({ provisioning_status: "actif" })
      .in("id", [...new Set(activer)])
      .eq("provisioning_status", "pose");
  }
  for (const [meterId, horodatages] of horodatagesParCompteur) {
    const niveau = niveauSurveillance(horodatages);
    if (niveau) await admin.from("meters").update({ surveillance: niveau }).eq("id", meterId);
  }

  await admin
    .from("raw_frames")
    .update({
      statut: "ok",
      device_id: appareils[0].id,
      trame_decodee: { decodeur, brut: decode.brut, points: resultatsPoints },
      releve_ts: dernierPointApplique?.ts ?? null,
      releve_volume_m3: dernierPointApplique?.volumeM3 ?? null,
    })
    .eq("id", rawFrameId);

  return json({ ok: true, statut: "ok", points: resultatsPoints });
});
