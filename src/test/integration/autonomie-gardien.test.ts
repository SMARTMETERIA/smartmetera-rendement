import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chargerAutonomie } from "@/lib/gardien/autonomieServeur";
import { HEURE_MS, partiesLocales } from "@/lib/moteur-gardien/temps";

/**
 * Autonomie en eau de bout en bout (phase G11) contre les fonctions
 * « ingest », « gardien-moteur » et « gardien-envois » déployées sur le
 * projet de développement : réserve réglée par un technicien, trame du
 * capteur de niveau, coupure du réseau détectée (heure imposée), alertes à
 * la coupure et avant le niveau bas, envois journalisés, retour de l'eau.
 * Organisation, site, relevés et compte jetables, supprimés à la fin.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(supabaseUrl, serviceKey);
const password = `Test-${crypto.randomUUID()}!`;
const email = `autonomie-${crypto.randomUUID().slice(0, 8)}@example.com`;
const FUSEAU = "Europe/Paris";
const DEVEUI = Array.from(crypto.getRandomValues(new Uint8Array(8)), (o) => o.toString(16).padStart(2, "0"))
  .join("")
  .toUpperCase();

// Citerne de 25 m³ (2,5 m d'eau), capteur à 2,70 m du fond. Hôtel : 1 m³/h
// de 5 h à minuit, 3 L/h la nuit ; le robinet à flotteur garde la citerne
// pleine. Coupure du réseau du 19 septembre 12 h UTC au 20 septembre 11 h.
const H = Date.UTC(2026, 8, 20, 10);
const COUPURE = H - 22 * HEURE_MS;
const RETOUR = H + HEURE_MS;
const conso = (t: number) => (partiesLocales(t, FUSEAU).heure < 5 ? 0.003 : 1);
const distance = (volume: number) => Math.round((2.7 - volume / 10) * 10000) / 10000;

let orgId: string;
let siteId: string;
let meterId: string;
let deviceId: string;
let reserveId: string;
let userId: string;
let sourceId: string;
let technicien: SupabaseClient;
let jetonLorawan: string;

/** Volumes de la citerne et arrivées, heure par heure, de debut à fin. */
function simuler(debut: number, fin: number, volumeDepart: number) {
  const niveaux: { ts: string; measure_m: number }[] = [];
  const arrivees: { ts: string; volume_m3: number }[] = [];
  let v = volumeDepart;
  for (let t = debut; t < fin; t += HEURE_MS) {
    niveaux.push({ ts: new Date(t).toISOString(), measure_m: distance(v) });
    const coupe = t >= COUPURE && t < RETOUR;
    const apres = coupe ? Math.max(0, v - conso(t)) : Math.min(25, v + 6);
    const arrivee = coupe ? 0 : apres - v + conso(t);
    v = apres;
    arrivees.push({ ts: new Date(t + HEURE_MS).toISOString(), volume_m3: Math.round(arrivee * 1000) / 1000 });
  }
  return { niveaux, arrivees, volumeFin: v };
}

async function fonction(nom: string, corps: Record<string, unknown>) {
  const r = await fetch(`${supabaseUrl}/functions/v1/${nom}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
  const bilan = (await r.json()) as Record<string, unknown>;
  expect(bilan.erreurs, JSON.stringify(bilan)).toEqual([]);
  expect(r.status).toBe(200);
  return bilan;
}

async function inserer(table: string, lignes: Record<string, unknown>[]) {
  for (let i = 0; i < lignes.length; i += 500) {
    const { error } = await admin.from(table).insert(lignes.slice(i, i + 500));
    if (error) throw error;
  }
}

let simulation: ReturnType<typeof simuler>;

beforeAll(async () => {
  const { data: reglage } = await admin.from("platform_settings").select("value").eq("key", "reception").single();
  jetonLorawan = (reglage!.value as { jeton_lorawan: string }).jeton_lorawan;

  const { data: org, error: e1 } = await admin
    .from("organizations")
    .insert({ nom: `Autonomie test ${crypto.randomUUID().slice(0, 8)}`, kind: "sites", status: "essai" })
    .select("id")
    .single();
  if (e1) throw e1;
  orgId = org.id;
  const { data: site, error: e2 } = await admin
    .from("sites")
    .insert({ organization_id: orgId, name: "Hôtel autonomie", type: "hotel", timezone: FUSEAU })
    .select("id")
    .single();
  if (e2) throw e2;
  siteId = site.id;
  const { data: source } = await admin
    .from("sources")
    .insert({ organization_id: orgId, type: "saisie_manuelle", nom: "Relevés de test" })
    .select("id")
    .single();
  sourceId = source!.id;
  const { data: compteur, error: e3 } = await admin
    .from("meters")
    .insert({
      organization_id: orgId,
      site_id: siteId,
      type: "point_comptage",
      numero_serie: `AUT-${crypto.randomUUID().slice(0, 8)}`,
      nom: "Arrivée réseau",
      zone: "Arrivée réseau",
      transmission: "lorawan",
      installed_at: new Date(H - 9 * 24 * HEURE_MS).toISOString(),
    })
    .select("id")
    .single();
  if (e3) throw e3;
  meterId = compteur.id;
  const { data: appareil, error: e4 } = await admin
    .from("devices")
    .insert({
      organization_id: orgId,
      site_id: siteId,
      device_ref: DEVEUI,
      model: "Capteur de niveau LoRaWAN",
      kit: "niveau",
      transmission: "lorawan",
      provisioning_status: "attribue",
    })
    .select("id")
    .single();
  if (e4) throw e4;
  deviceId = appareil.id;

  const { data: u } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  userId = u.user!.id;
  await admin.from("memberships").insert({
    user_id: userId,
    organization_id: orgId,
    role: "technicien",
    scope_type: "organisation",
    alert_phone: "+33600000099",
  });
  const anon = createClient(supabaseUrl, anonKey);
  const { data: session } = await anon.auth.signInWithPassword({ email, password });
  technicien = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${session.session!.access_token}` } },
  });

  // Huit jours d'historique jusqu'à H (exclue : la mesure de H arrive par le capteur).
  simulation = simuler(H - 8 * 24 * HEURE_MS, H, 25);
}, 120000);

afterAll(async () => {
  if (orgId) await admin.from("organizations").delete().eq("id", orgId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}, 60000);

describe("autonomie en eau de bout en bout", () => {
  it("le technicien règle la citerne et le compteur d'arrivée", async () => {
    const { data, error } = await technicien.rpc("reserve_enregistrer", {
      p_site_id: siteId,
      p_reserve_id: null,
      p_champs: {
        label: "Citerne du toit",
        kind: "citerne",
        capacity_m3: 25,
        shape: "verticale",
        full_height_m: 2.5,
        outlet_height_m: 0,
        sensor_mounting: "distance",
        sensor_height_m: 2.7,
        low_threshold_pct: null,
        device_id: deviceId,
      },
    });
    expect(error).toBeNull();
    reserveId = data as string;
    const { data: appareil } = await admin.from("devices").select("decodeur, provisioning_status").eq("id", deviceId).single();
    expect(appareil).toEqual({ decodeur: "niveau_objet", provisioning_status: "pose" });

    const { data: n, error: e2 } = await technicien.rpc("site_arrivees_reseau", { p_site_id: siteId, p_meter_ids: [meterId] });
    expect(e2).toBeNull();
    expect(n).toBe(1);

    // Les relevés de niveau ne s'écrivent pas depuis l'application.
    const { error: e3 } = await technicien
      .from("reserve_levels")
      .insert({ organization_id: orgId, reserve_id: reserveId, ts: new Date(H).toISOString(), measure_m: 1 });
    expect(e3).not.toBeNull();
    // Sans connexion, rien n'est lisible (refus ou liste vide).
    const { data: vues } = await createClient(supabaseUrl, anonKey).from("water_reserves").select("id").eq("id", reserveId);
    expect(vues ?? []).toEqual([]);

    await inserer(
      "reserve_levels",
      simulation.niveaux.map((n) => ({ organization_id: orgId, reserve_id: reserveId, ...n })),
    );
    await inserer(
      "readings",
      simulation.arrivees.map((a) => ({ organization_id: orgId, meter_id: meterId, source_id: sourceId, ...a })),
    );
  });

  it("le capteur de niveau transmet par le serveur LoRaWAN (champ « distance » en mm)", async () => {
    const r = await fetch(`${supabaseUrl}/functions/v1/ingest/chirpstack/${jetonLorawan}?event=up`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceInfo: { devEui: DEVEUI.toLowerCase() },
        time: new Date(H).toISOString(),
        fCnt: 7,
        fPort: 2,
        data: "AA==",
        object: { distance: distance(simulation.volumeFin) * 1000 },
        rxInfo: [{ gatewayId: "gw", rssi: -101, snr: 4 }],
      }),
    });
    const corps = (await r.json()) as Record<string, unknown>;
    expect(corps.statut).toBe("ok");
    const { data: mesure } = await admin.from("reserve_levels").select("measure_m").eq("reserve_id", reserveId).eq("ts", new Date(H).toISOString()).single();
    expect(Number(mesure!.measure_m)).toBeCloseTo(distance(simulation.volumeFin), 4);
    const { data: appareil } = await admin.from("devices").select("provisioning_status").eq("id", deviceId).single();
    expect(appareil!.provisioning_status).toBe("actif");
  });

  it("le moteur détecte la coupure et prévient avant le niveau bas", async () => {
    const bilan = await fonction("gardien-moteur", { site_id: siteId, maintenant: new Date(H + 10 * 60_000).toISOString(), jours: 2 });
    expect(bilan.coupures).toBe(1);

    const { data: coupures } = await admin.from("supply_cuts").select("*").eq("site_id", siteId);
    expect(coupures).toHaveLength(1);
    expect(coupures![0]).toMatchObject({ status: "en_cours", started_at: new Date(COUPURE).toISOString().replace(".000Z", "+00:00") });
    expect(Number(coupures![0].min_volume_m3)).toBeCloseTo(simulation.volumeFin, 1);

    const { data: alertes } = await admin.from("alerts").select("id, type, titre, description, donnees").eq("site_id", siteId).order("type");
    expect(alertes!.map((a) => a.type)).toEqual(["coupure_reseau", "reserve_basse"]);
    expect(alertes![0].donnees.cut_id).toBe(coupures![0].id);
    expect(alertes![1].titre).toBe("Niveau bas des réserves bientôt atteint");

    // L'écran calcule la même chose avec les droits du technicien.
    const autonomie = await chargerAutonomie(technicien, [{ id: siteId, timezone: FUSEAU, reglagesOrganisation: null }], H + 10 * 60_000);
    const etat = autonomie.get(siteId)!.etat;
    expect(etat.arrivee).toBe("coupe");
    expect(etat.volumeUtileM3).toBeCloseTo(simulation.volumeFin, 1);
    expect(etat.heureSeuilBasMs! - H).toBeLessThan(6 * HEURE_MS);
    expect(etat.autonomieH).toBeGreaterThan(5);
    expect(etat.autonomieH).toBeLessThan(10);
  });

  it("les alertes partent par e-mail et SMS (journal, rien d'envoyé)", async () => {
    await fonction("gardien-envois", { organization_id: orgId, maintenant: new Date(H + 15 * 60_000).toISOString(), sections: ["alertes"] });
    const { data: envois } = await admin.from("envois").select("canal, destinataire, mode, sujet, corps").eq("site_id", siteId).eq("objet", "alerte");
    expect(envois!.every((e) => e.mode === "journal")).toBe(true);
    expect(envois!.map((e) => e.canal).sort()).toEqual(["email", "email", "sms", "sms"]);
    expect(envois!.some((e) => e.sujet === "Coupure du réseau public — Hôtel autonomie")).toBe(true);
    expect(envois!.find((e) => e.canal === "sms" && e.corps.includes("coupure"))!.corps).toContain("Autonomie estimée");
  });

  it("au retour de l'eau : coupure terminée, alertes résolues, message de fin", async () => {
    const suite = simuler(H, RETOUR + 3 * HEURE_MS, simulation.volumeFin);
    await inserer(
      "reserve_levels",
      suite.niveaux.slice(1).map((n) => ({ organization_id: orgId, reserve_id: reserveId, ...n })),
    );
    await inserer(
      "readings",
      suite.arrivees.map((a) => ({ organization_id: orgId, meter_id: meterId, source_id: sourceId, ...a })),
    );
    const maintenant = RETOUR + 2 * HEURE_MS + 10 * 60_000;
    const bilan = await fonction("gardien-moteur", { site_id: siteId, maintenant: new Date(maintenant).toISOString(), jours: 2 });
    expect(bilan.coupures).toBe(0);

    const { data: coupure } = await admin.from("supply_cuts").select("status, ended_at").eq("site_id", siteId).single();
    expect(coupure).toEqual({ status: "terminee", ended_at: new Date(RETOUR).toISOString().replace(".000Z", "+00:00") });
    const { data: alertes } = await admin.from("alerts").select("type, statut").eq("site_id", siteId);
    expect(alertes!.every((a) => a.statut === "resolue")).toBe(true);
    // Le remplissage des réserves (7 m³/h) n'est pas pris pour une rupture.
    const { count } = await admin.from("leak_events").select("id", { count: "exact", head: true }).eq("site_id", siteId);
    expect(count).toBe(0);

    await fonction("gardien-envois", { organization_id: orgId, maintenant: new Date(maintenant + 5 * 60_000).toISOString(), sections: ["alertes"] });
    const { data: fin } = await admin.from("envois").select("canal, sujet").eq("site_id", siteId).eq("etape", "fin");
    expect(fin!.map((e) => e.canal).sort()).toEqual(["email", "sms"]);
    expect(fin!.find((e) => e.canal === "email")!.sujet).toBe("L'eau du réseau public est revenue — Hôtel autonomie");
  });
});
