import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { HEURE_MS, instantLocal, partiesLocales, decalerJour, dateLocale } from "@/lib/moteur-gardien/temps";

/**
 * Parcours complet du Gardien (phase G9), de bout en bout contre les
 * fonctions déployées : provisionnement QR, pose, robinet test,
 * réception, fuite simulée, alerte, prise en charge, réparation,
 * économies, rapports, fin de pilote, page preuve. Tout est jetable ;
 * les envois restent en mode « journal ».
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(supabaseUrl, serviceKey);
const suffixe = crypto.randomUUID().slice(0, 8);
const password = `Test-${crypto.randomUUID()}!`;
const FUSEAU = "Europe/Paris";
const TELEPHONE = "+33677777777";
const DEVEUI = Array.from(crypto.getRandomValues(new Uint8Array(8)), (o) => o.toString(16).padStart(2, "0"))
  .join("")
  .toUpperCase();
const QR = `PARC${suffixe.toUpperCase()}`;
const J = 24 * HEURE_MS;
const MAINTENANT = Date.now();
const POSE = MAINTENANT - 21 * J;

let orgId: string;
let siteId: string;
let deviceId: string;
let meterId: string;
let jetons: { jeton_lorawan: string };
const comptes: Record<string, { id: string; email: string; client: SupabaseClient }> = {};

async function fonction(nom: string, corps: Record<string, unknown>) {
  const r = await fetch(`${supabaseUrl}/functions/v1/${nom}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
  const bilan = (await r.json()) as Record<string, unknown>;
  expect(bilan.erreurs ?? [], JSON.stringify(bilan)).toEqual([]);
  return bilan;
}

async function laFuite() {
  const { data } = await admin.from("leak_events").select("*").eq("site_id", siteId).maybeSingle();
  return data;
}

beforeAll(async () => {
  const { data: reglage } = await admin.from("platform_settings").select("value").eq("key", "reception").single();
  jetons = reglage!.value;
  const { data: org, error } = await admin
    .from("organizations")
    .insert({ nom: `Parcours ${suffixe}`, kind: "sites", status: "essai" })
    .select("id")
    .single();
  if (error) throw error;
  orgId = org.id;
  const { data: site } = await admin
    .from("sites")
    .insert({ organization_id: orgId, name: "Hôtel du Parcours", type: "hotel", water_price_per_m3: 4.5 })
    .select("id")
    .single();
  siteId = site!.id;
  await admin.from("pilots").insert({
    organization_id: orgId,
    site_id: siteId,
    started_at: new Date(MAINTENANT - 26 * J).toISOString(),
    ends_at: new Date(MAINTENANT + 4 * J).toISOString(),
  });
  for (const [profil, role] of [
    ["admin", "admin_client"],
    ["tech", "technicien"],
  ] as const) {
    const email = `parcours-${profil}-${suffixe}@example.com`;
    const { data: u } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    await admin.from("memberships").insert({
      user_id: u.user!.id,
      organization_id: orgId,
      role,
      scope_type: "organisation",
      alert_phone: profil === "tech" ? TELEPHONE : null,
    });
    const anon = createClient(supabaseUrl, anonKey);
    const { data: session } = await anon.auth.signInWithPassword({ email, password });
    comptes[profil] = {
      id: u.user!.id,
      email,
      client: createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${session.session!.access_token}` } },
      }),
    };
  }
}, 120000);

afterAll(async () => {
  if (orgId) await admin.from("organizations").delete().eq("id", orgId);
  for (const c of Object.values(comptes)) await admin.auth.admin.deleteUser(c.id);
}, 60000);

describe("parcours complet du Gardien", () => {
  it("provisionnement : import du stock avec un QR code, attribution au site", async () => {
    const { data, error } = await comptes.admin.client.rpc("importer_stock", {
      p_organization_id: orgId,
      p_lignes: [{ device_ref: DEVEUI, model: "Milesight EM300-DI", kit: "C", transmission: "lorawan", sim_ref: null, qr_code: QR }],
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ importes: 1 });
    const { data: appareil } = await admin.from("devices").select("id, qr_code, provisioning_status").eq("device_ref", DEVEUI).single();
    expect(appareil).toMatchObject({ qr_code: QR, provisioning_status: "en_stock" });
    deviceId = appareil!.id;
    const attribution = await comptes.admin.client.rpc("attribuer_appareils", { p_device_ids: [deviceId], p_site_id: siteId });
    expect(attribution.data).toBe(1);
  });

  it("pose et robinet test : le technicien obtient le feu vert", async () => {
    const { data: session, error } = await comptes.tech.client.rpc("demarrer_pose", {
      p_device_id: deviceId,
      p_site_id: siteId,
      p_nature: "eau",
      p_canal: null,
      p_zone: "Général",
      p_photo_path: null,
      p_index_m3: 120,
      p_poids_l: 1,
      p_decodeur: "milesight_em300_di",
      p_intervalle_s: null,
      p_type_point: null,
    });
    expect(error).toBeNull();
    const trame = (impulsions: number) => {
      const o = new Uint8Array([0x01, 0x75, 0x5c, 0x05, 0xc8, 0, 0, 0, 0]);
      new DataView(o.buffer).setUint32(5, impulsions, true);
      return btoa(String.fromCharCode(...o));
    };
    for (const [fCnt, impulsions, secondes] of [
      [1, 500, 30],
      [2, 530, 90],
    ]) {
      const r = await fetch(`${supabaseUrl}/functions/v1/ingest/chirpstack/${jetons.jeton_lorawan}?event=up`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceInfo: { devEui: DEVEUI },
          time: new Date(MAINTENANT + (secondes as number) * 1000 + 180_000).toISOString(),
          fCnt,
          fPort: 85,
          data: trame(impulsions as number),
          rxInfo: [{ gatewayId: "gw", rssi: -90, snr: 7 }],
        }),
      });
      expect(((await r.json()) as { statut: string }).statut).toBe("ok");
    }
    const { data: etat } = await comptes.tech.client.rpc("etat_pose", { p_session_id: session });
    expect(etat.ecoulement_detecte_at).not.toBeNull();
    const { data: appareil } = await admin.from("devices").select("meter_id, provisioning_status").eq("id", deviceId).single();
    expect(appareil).toMatchObject({ provisioning_status: "actif" });
    meterId = appareil!.meter_id;
    expect(meterId).toBeTruthy();
  });

  it("fuite simulée : trois semaines de relevés, fuite de 25 L/h détectée par le moteur", async () => {
    // Le capteur a été posé il y a 21 jours ; une fuite de 25 L/h depuis 4 jours.
    await admin.from("meters").update({ installed_at: new Date(POSE).toISOString() }).eq("id", meterId);
    // Même source que les trames reçues par la plateforme.
    const { data: source } = await admin.from("readings").select("source_id").eq("meter_id", meterId).limit(1).single();
    const debutFuite = MAINTENANT - 4 * J;
    const releves = [];
    for (let h = Math.floor(POSE / HEURE_MS) * HEURE_MS; h + HEURE_MS <= MAINTENANT - HEURE_MS; h += HEURE_MS) {
      const { heure } = partiesLocales(h, FUSEAU);
      releves.push({
        organization_id: orgId,
        meter_id: meterId,
        source_id: source!.source_id,
        ts: new Date(h + HEURE_MS).toISOString(),
        volume_m3: ((heure < 6 ? 3 : 40) + (h >= debutFuite ? 25 : 0)) / 1000,
      });
    }
    for (let i = 0; i < releves.length; i += 1000) {
      const { error } = await admin.from("readings").insert(releves.slice(i, i + 1000));
      expect(error).toBeNull();
    }
    await fonction("gardien-moteur", { site_id: siteId, jours: 22 });
    const fuite = await laFuite();
    expect(fuite).toMatchObject({ type: "fuite_nuit", status: "ouverte", currency: "EUR" });
    expect(Number(fuite!.excess_flow_lph)).toBe(25);
  });

  it("alerte : e-mail et SMS au technicien, avec le coût en cours", async () => {
    await fonction("gardien-envois", { organization_id: orgId, sections: ["fuites"] });
    const fuite = await laFuite();
    const { data } = await admin.from("envois").select("canal, destinataire, corps").eq("objet_id", fuite!.id).eq("etape", "initial");
    expect(data!.map((l) => [l.canal, l.destinataire]).sort()).toEqual([
      ["email", comptes.tech.email],
      ["sms", TELEPHONE],
    ]);
    expect(data!.find((l) => l.canal === "sms")!.corps.replace(/[  ]/g, " ")).toContain("2,70 € par jour");
  });

  it("prise en charge puis réparation : 18 m³ et 81 € économisés (méthode prudente)", async () => {
    const fuite = await laFuite();
    expect((await comptes.tech.client.rpc("fuite_prendre_en_charge", { p_leak_id: fuite!.id })).error).toBeNull();
    const { data, error } = await comptes.tech.client.rpc("fuite_declarer_reparee", { p_leak_id: fuite!.id });
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: "reparee", repair_source: "utilisateur" });
    expect(Number(data.saved_m3)).toBe(18);
    expect(Number(data.saved_amount)).toBe(81);
    expect(data.method).toContain("Méthode prudente");
  });

  it("rapports de première nuit et de première semaine", async () => {
    const pose = dateLocale(POSE, FUSEAU);
    for (const jours of [1, 7]) {
      await fonction("gardien-envois", {
        organization_id: orgId,
        maintenant: new Date(instantLocal(decalerJour(pose, jours), 9, FUSEAU)).toISOString(),
        sections: ["rapports"],
      });
    }
    const { data } = await admin.from("site_reports").select("kind, period, sent_at").eq("site_id", siteId).order("period");
    expect(data!.map((r) => r.kind)).toEqual(["premiere_nuit", "premiere_semaine"]);
    expect(data!.every((r) => r.sent_at)).toBe(true);
  });

  it("fin de pilote : résumé et page preuve lisible sans connexion, avec les 81 € économisés", async () => {
    await fonction("gardien-envois", { organization_id: orgId, sections: ["pilotes"] });
    const { data: resume } = await admin.from("site_reports").select("content").eq("site_id", siteId).eq("kind", "fin_pilote").single();
    expect(resume!.content.anomalies).toBe(1);
    const anonyme = createClient(supabaseUrl, anonKey);
    const { data: page } = await anonyme.rpc("page_preuve_publique", { p_token: resume!.content.pagePreuve.token });
    expect(page.content.economies).toMatchObject({ m3: 18, montant: 81 });
    expect(page.site.name).toBe("Hôtel du Parcours");
    expect(JSON.stringify(page)).not.toContain("@");
  });
});
