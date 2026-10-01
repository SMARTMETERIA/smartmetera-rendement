import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { economiesPrudentes } from "@/lib/moteur-gardien/economies";
import { HEURE_MS, instantLocal, partiesLocales } from "@/lib/moteur-gardien/temps";

/**
 * Moteur du Gardien de bout en bout (phase G4) contre la fonction
 * « gardien-moteur » déployée sur le projet de développement : une fuite
 * simulée est détectée, chiffrée, prise en charge puis réparée, avec ses
 * économies prudentes. L'heure du moteur est imposée (appel service_role).
 * Organisation, site, relevés et compte jetables, supprimés à la fin.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(supabaseUrl, serviceKey);
const password = `Test-${crypto.randomUUID()}!`;
const email = `moteur-${crypto.randomUUID().slice(0, 8)}@example.com`;
const FUSEAU = "Europe/Paris";

const devEuiFictif = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (o) => o.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

let orgId: string;
let siteId: string;
let meterId: string;
let deviceId: string;
let pointId: string;
let userId: string;
let technicien: SupabaseClient;

// Nuits à 3 L/h (0 h – 6 h), journées à 40 L/h ; fuite de 25 L/h du
// 20 septembre 22 h au 22 septembre 18 h (heure de Paris).
const DEBUT_FUITE = instantLocal("2026-09-20", 22, FUSEAU);
const FIN_FUITE = instantLocal("2026-09-22", 18, FUSEAU);
const debit = (instant: number) => {
  const { heure } = partiesLocales(instant, FUSEAU);
  return (heure < 6 ? 3 : 40) + (instant >= DEBUT_FUITE && instant < FIN_FUITE ? 25 : 0);
};
const a6h10 = (date: string) => new Date(instantLocal(date, 6, FUSEAU) + 10 * 60_000).toISOString();

async function moteur(corps: Record<string, unknown>) {
  const r = await fetch(`${supabaseUrl}/functions/v1/gardien-moteur`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ site_id: siteId, ...corps }),
  });
  const bilan = (await r.json()) as Record<string, unknown>;
  expect(bilan.erreurs, JSON.stringify(bilan)).toEqual([]);
  expect(r.status).toBe(200);
  return bilan;
}

async function fuites() {
  const { data, error } = await admin
    .from("leak_events")
    .select("*")
    .eq("site_id", siteId)
    .order("detected_at");
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  const { data: org, error: e1 } = await admin
    .from("organizations")
    .insert({ nom: `Moteur test ${crypto.randomUUID().slice(0, 8)}`, kind: "sites", status: "essai" })
    .select("id")
    .single();
  if (e1) throw e1;
  orgId = org.id;
  const { data: site, error: e2 } = await admin
    .from("sites")
    .insert({ organization_id: orgId, name: "Hôtel moteur", type: "hotel", water_price_per_m3: 4.5 })
    .select("id")
    .single();
  if (e2) throw e2;
  siteId = site.id;

  const { data: source } = await admin
    .from("sources")
    .insert({ organization_id: orgId, type: "saisie_manuelle", nom: "Relevés de test" })
    .select("id")
    .single();
  const { data: compteur, error: e3 } = await admin
    .from("meters")
    .insert({
      organization_id: orgId,
      site_id: siteId,
      type: "point_comptage",
      numero_serie: `T-${crypto.randomUUID().slice(0, 8)}`,
      nom: "Général",
      zone: "Général",
      transmission: "lorawan",
      installed_at: "2026-08-31T22:00:00Z",
    })
    .select("id")
    .single();
  if (e3) throw e3;
  meterId = compteur.id;

  const releves = [];
  const fin = instantLocal("2026-09-25", 7, FUSEAU);
  for (let h = instantLocal("2026-09-01", 0, FUSEAU); h < fin; h += HEURE_MS) {
    releves.push({
      organization_id: orgId,
      meter_id: meterId,
      source_id: source!.id,
      ts: new Date(h + HEURE_MS).toISOString(),
      volume_m3: debit(h) / 1000,
    });
  }
  const { error: e4 } = await admin.from("readings").insert(releves);
  if (e4) throw e4;

  // Capteur LoRaWAN : dernier message le 23 septembre à 22 h (Paris).
  const { data: appareil, error: e5 } = await admin
    .from("devices")
    .insert({
      organization_id: orgId,
      site_id: siteId,
      meter_id: meterId,
      device_ref: devEuiFictif(),
      model: "Milesight EM300-DI",
      kit: "C",
      transmission: "lorawan",
      provisioning_status: "actif",
      last_seen_at: "2026-09-23T20:00:00Z",
    })
    .select("id")
    .single();
  if (e5) throw e5;
  deviceId = appareil.id;

  const { data: point, error: e6 } = await admin
    .from("temperature_points")
    .insert({ organization_id: orgId, site_id: siteId, label: "Retour de boucle", type: "retour_boucle" })
    .select("id")
    .single();
  if (e6) throw e6;
  pointId = point.id;
  await admin.from("temperature_readings").insert([
    { organization_id: orgId, point_id: pointId, ts: "2026-09-10T08:00:00Z", value_c: 57 },
    { organization_id: orgId, point_id: pointId, ts: "2026-09-24T03:30:00Z", value_c: 48 },
  ]);

  await admin.from("pilots").insert({
    organization_id: orgId,
    site_id: siteId,
    started_at: "2026-09-01T08:00:00Z",
    ends_at: "2026-10-01T08:00:00Z",
  });

  const { data: u } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  userId = u.user!.id;
  await admin
    .from("memberships")
    .insert({ user_id: userId, organization_id: orgId, role: "technicien", scope_type: "organisation" });
  const anon = createClient(supabaseUrl, anonKey);
  const { data: session } = await anon.auth.signInWithPassword({ email, password });
  technicien = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${session.session!.access_token}` } },
  });
}, 120000);

afterAll(async () => {
  if (orgId) await admin.from("organizations").delete().eq("id", orgId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}, 60000);

describe("moteur du Gardien de bout en bout", () => {
  it("détecte la fuite de nuit et la chiffre (22 septembre, 6 h 10)", async () => {
    const bilan = await moteur({ maintenant: a6h10("2026-09-22"), jours: 22 });
    expect(bilan).toMatchObject({ sites: 1, jours: 22, fuites: 1, reparations: 0, alertes: 0 });

    const [fuite] = await fuites();
    expect(fuite).toMatchObject({
      type: "fuite_nuit",
      status: "ouverte",
      currency: "EUR",
      started_at: "2026-09-21T00:00:00+00:00",
    });
    expect(Number(fuite.excess_flow_lph)).toBe(25);
    expect(fuite.details.explication).toContain("2 nuits de suite");

    const { data: jours } = await admin
      .from("meter_days")
      .select("day, night_min_lph, baseline_lph, threshold_lph, leak_night, volume_m3")
      .eq("meter_id", meterId)
      .order("day");
    expect(jours).toHaveLength(22);
    expect(jours!.find((j) => j.day === "2026-09-21")).toMatchObject({ leak_night: true });
    expect(Number(jours!.find((j) => j.day === "2026-09-21")!.night_min_lph)).toBe(28);
    expect(Number(jours!.find((j) => j.day === "2026-09-10")!.volume_m3)).toBe(0.738);

    const { data: pilote } = await admin.from("pilots").select("anomalies_found").eq("site_id", siteId).single();
    expect(pilote!.anomalies_found).toBe(1);
  });

  it("ne crée pas de doublon à l'heure suivante", async () => {
    const bilan = await moteur({ maintenant: a6h10("2026-09-22").replace("T04", "T05") });
    expect(bilan).toMatchObject({ fuites: 0, reparations: 0 });
    expect(await fuites()).toHaveLength(1);
  });

  it("« Je m'en occupe » par le technicien", async () => {
    const [fuite] = await fuites();
    const { data, error } = await technicien.rpc("fuite_prendre_en_charge", { p_leak_id: fuite.id });
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: "prise_en_compte", acknowledged_by: userId });
    // Le technicien lit les bilans quotidiens de son organisation.
    const { count } = await technicien
      .from("meter_days")
      .select("day", { count: "exact", head: true })
      .eq("meter_id", meterId);
    expect(count).toBe(22);
  });

  it("constate la réparation après deux nuits normales, avec les économies prudentes", async () => {
    const bilan = await moteur({ maintenant: a6h10("2026-09-24") });
    expect(bilan).toMatchObject({ fuites: 0, reparations: 1 });

    const [fuite] = await fuites();
    const attendu = economiesPrudentes({ excesLph: 25, delaiJours: 30, prixM3: 4.5, monnaie: "EUR" });
    expect(fuite).toMatchObject({
      status: "reparee",
      repair_source: "automatique",
      repaired_at: "2026-09-24T04:10:00+00:00",
      method: attendu.methode,
    });
    expect(Number(fuite.saved_m3)).toBe(18);
    expect(Number(fuite.saved_amount)).toBe(81);
  });

  it("signale le capteur muet (au partenaire ou à SmartMeteria) et la température basse", async () => {
    const { data: alertes } = await admin
      .from("alerts")
      .select("type, statut, titre, donnees")
      .eq("site_id", siteId)
      .order("type");
    expect(alertes).toHaveLength(2);
    expect(alertes![0]).toMatchObject({
      type: "compteur_muet",
      statut: "ouverte",
      titre: "Capteur muet : Général",
      donnees: { device_id: deviceId, cle: `muet:${deviceId}`, destinataire: "smartmeteria" },
    });
    expect(alertes![1]).toMatchObject({
      type: "temperature_basse",
      donnees: { point_id: pointId, valeur_c: 48, seuil_c: 50 },
    });

    // Le capteur transmet de nouveau : l'alerte se résout, sans doublon.
    await admin.from("devices").update({ last_seen_at: "2026-09-24T05:00:00Z" }).eq("id", deviceId);
    const bilan = await moteur({ maintenant: a6h10("2026-09-24").replace("T04", "T05") });
    expect(bilan).toMatchObject({ alertes: 0, resolues: 1 });
  });

  it("tient le registre des températures du mois", async () => {
    const { data, error } = await technicien.rpc("registre_temperatures", {
      p_site_id: siteId,
      p_debut: "2026-09-01",
      p_fin: "2026-09-30",
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ label: "Retour de boucle", mois: "2026-09-01", nb_releves: 2, nb_sous_seuil: 1 });
    expect(Number(data[0].premiere_valeur_c)).toBe(57);
    expect(Number(data[0].min_c)).toBe(48);
  });

  it("une fausse alerte retire les économies et l'anomalie du pilote", async () => {
    const [fuite] = await fuites();
    const { data, error } = await technicien.rpc("fuite_declarer_fausse_alerte", {
      p_leak_id: fuite.id,
      p_motif: "Remplissage de la piscine",
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: "fausse_alerte", saved_m3: null, saved_amount: null });
    const { data: pilote } = await admin.from("pilots").select("anomalies_found").eq("site_id", siteId).single();
    expect(pilote!.anomalies_found).toBe(0);
  });

  it("refuse les actions à un utilisateur d'une autre organisation", async () => {
    const [fuite] = await fuites();
    const anon = createClient(supabaseUrl, anonKey);
    const { error } = await anon.rpc("fuite_prendre_en_charge", { p_leak_id: fuite.id });
    expect(error).not.toBeNull();
  });

  it("même calcul d'économies en SQL et dans l'application (euros et dirhams)", async () => {
    for (const [prix, monnaie] of [
      [4.5, "EUR"],
      [11.5, "MAD"],
      [null, "MAD"],
    ] as const) {
      const { data } = await admin.rpc("economies_prudentes", {
        p_exces_lph: 1234.5,
        p_prix_m3: prix,
        p_monnaie: monnaie,
        p_delai_jours: 30,
      });
      const attendu = economiesPrudentes({ excesLph: 1234.5, delaiJours: 30, prixM3: prix, monnaie });
      expect(data[0].methode).toBe(attendu.methode);
      expect(Number(data[0].m3)).toBe(attendu.m3);
    }
  });
});
