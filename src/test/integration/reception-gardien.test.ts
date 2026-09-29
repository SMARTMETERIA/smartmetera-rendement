import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Réception de bout en bout (phase G3) contre la fonction « ingest »
 * déployée sur le projet de développement : une trame d'exemple envoyée à
 * chaque point d'entrée fait passer l'assistant de pose au feu vert.
 * Organisation, site, capteurs et compte jetables, supprimés à la fin.
 * Les références d'appareils sont tirées au hasard (IMEI et DevEUI
 * valides mais fictifs).
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const password = `Test-${crypto.randomUUID()}!`;
const email = `reception-${crypto.randomUUID().slice(0, 8)}@example.com`;

function imeiFictif(): string {
  const base =
    "35" + String(Math.floor(Math.random() * 1e12)).padStart(12, "0");
  let somme = 0;
  for (let i = 0; i < 14; i++) {
    let c = Number(base[13 - i]);
    if (i % 2 === 0) {
      c *= 2;
      if (c > 9) c -= 9;
    }
    somme += c;
  }
  return base + String((10 - (somme % 10)) % 10);
}
const devEuiFictif = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (o) =>
    o.toString(16).padStart(2, "0"),
  )
    .join("")
    .toUpperCase();

const IMEI = imeiFictif();
const DEVEUI_EAU = devEuiFictif();
const DEVEUI_SONDE = devEuiFictif();
const INCONNU = devEuiFictif();

let orgId: string;
let siteId: string;
let userId: string;
let technicien: SupabaseClient;
const appareils: Record<string, string> = {};
let jetons: { jeton_mqtt: string; jeton_lorawan: string };

const url = (plateforme: string, jeton: string, requete = "") =>
  `${supabaseUrl}/functions/v1/ingest/${plateforme}/${jeton}${requete}`;

async function envoyer(
  plateforme: string,
  jeton: string,
  corps: unknown,
  requete = "",
) {
  const r = await fetch(url(plateforme, jeton, requete), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
  return {
    status: r.status,
    corps: (await r.json()) as Record<string, unknown>,
  };
}

async function poser(deviceId: string, params: Record<string, unknown>) {
  const { data, error } = await technicien.rpc("demarrer_pose", {
    p_device_id: deviceId,
    p_site_id: siteId,
    p_photo_path: null,
    p_type_point: null,
    ...params,
  });
  if (error) throw new Error(`demarrer_pose : ${error.message}`);
  return data as string;
}

async function etat(sessionId: string) {
  const { data, error } = await technicien.rpc("etat_pose", {
    p_session_id: sessionId,
  });
  if (error) throw new Error(`etat_pose : ${error.message}`);
  return data as Record<string, unknown>;
}

// Horodatages figés au chargement : un message renvoyé est identique.
const DEPART = Math.floor(Date.now() / 1000) + 180;
const dans = (secondes: number) => DEPART + secondes;

beforeAll(async () => {
  const { data: reglage } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "reception")
    .single();
  jetons = reglage!.value;

  const { data: org } = await admin
    .from("organizations")
    .insert({ nom: `Réception test ${IMEI}`, kind: "sites", status: "essai" })
    .select("id")
    .single();
  orgId = org!.id;
  const { data: site } = await admin
    .from("sites")
    .insert({ organization_id: orgId, name: "Hôtel réception", type: "hotel" })
    .select("id")
    .single();
  siteId = site!.id;

  for (const [cle, ligne] of Object.entries({
    kitA: {
      device_ref: IMEI,
      model: "Adeunis PULSE NB-IoT/LTE-M",
      kit: "A",
      transmission: "cellulaire",
      qr_code: `T${IMEI.slice(-9)}`,
    },
    kitC: {
      device_ref: DEVEUI_EAU,
      model: "Milesight EM300-DI",
      kit: "C",
      transmission: "lorawan",
    },
    sonde: {
      device_ref: DEVEUI_SONDE,
      model: "Sonde",
      kit: "sonde",
      transmission: "lorawan",
    },
  })) {
    const { data, error } = await admin
      .from("devices")
      .insert({
        organization_id: orgId,
        site_id: siteId,
        provisioning_status: "attribue",
        ...ligne,
      })
      .select("id")
      .single();
    if (error) throw error;
    appareils[cle] = data.id;
  }

  const { data: u } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  userId = u.user!.id;
  await admin
    .from("memberships")
    .insert({
      user_id: userId,
      organization_id: orgId,
      role: "technicien",
      scope_type: "organisation",
    });
  const anon = createClient(supabaseUrl, anonKey);
  const { data: session } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  technicien = createClient(supabaseUrl, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${session.session!.access_token}` },
    },
  });
}, 60000);

afterAll(async () => {
  if (orgId) await admin.from("organizations").delete().eq("id", orgId);
  if (userId) await admin.auth.admin.deleteUser(userId);
  await admin.from("unknown_frames").delete().eq("device_ref", INCONNU);
}, 60000);

describe("réception de bout en bout", () => {
  it("refuse un jeton inconnu", async () => {
    expect((await envoyer("mqtt", "0".repeat(48), {})).status).toBe(401);
  });

  it("garde la trame d'un capteur attribué mais pas encore posé", async () => {
    const r = await envoyer("mqtt", jetons.jeton_mqtt, {
      clientid: `urn:imei:${IMEI}`,
      payload: JSON.stringify({
        sn: "X",
        lowbat: false,
        CHA: [{ v: 1, t: dans(-60) }],
      }),
    });
    expect(r.corps.statut).toBe("non_pose");
  });

  it("kit A (MQTT) : pose sur la voie A, données reçues puis feu vert au robinet test", async () => {
    const session = await poser(appareils.kitA, {
      p_nature: "eau",
      p_canal: "A",
      p_zone: "Cuisine",
      p_index_m3: 1234.5,
      p_poids_l: 10,
      p_decodeur: "adeunis_pulse_mqtt",
      p_intervalle_s: 3600,
    });
    let e = await etat(session);
    expect(e.expected_first_data_at).not.toBeNull();
    expect(e.premiere_donnee_at).toBeNull();

    // Forme Live Objects du guide Adeunis (page 15).
    const r1 = await envoyer("mqtt", jetons.jeton_mqtt, {
      streamId: `urn:lo:nsid:imei:${IMEI}`,
      value: {
        sn: IMEI,
        lowbat: false,
        CHA: [{ v: 1000, t: dans(30) }],
        CHB: [{ v: 0, t: dans(30) }],
      },
      metadata: { network: { mqtt: { clientId: `urn:imei:${IMEI}` } } },
    });
    expect(r1.corps.statut).toBe("ok");
    e = await etat(session);
    expect(e.premiere_donnee_at).not.toBeNull();
    expect(e.ecoulement_detecte_at).toBeNull();

    // Robinet ouvert : 3 impulsions de 10 L, avec historique.
    const r2 = await envoyer("mqtt", jetons.jeton_mqtt, {
      clientid: `urn:imei:${IMEI}`,
      payload: JSON.stringify({
        sn: IMEI,
        lowbat: true,
        CHA: [
          { v: 1001, t: dans(60) },
          { v: 1003, t: dans(90) },
        ],
        txInfo: { snr: 9, rsrp: -101 },
      }),
    });
    expect(r2.corps.statut).toBe("ok");
    e = await etat(session);
    expect(Number(e.volume_depuis_pose_m3)).toBeCloseTo(0.03, 5);
    expect(e.ecoulement_detecte_at).not.toBeNull();
    expect(e.battery_low).toBe(true);
    expect(Number(e.rssi)).toBe(-101);

    const { data: appareil } = await admin
      .from("devices")
      .select("provisioning_status, canal, meter_id")
      .eq("id", appareils.kitA)
      .single();
    expect(appareil).toMatchObject({
      provisioning_status: "actif",
      canal: "A",
    });

    // Même message renvoyé par le broker (qualité de service 1) : doublon.
    const r3 = await envoyer("mqtt", jetons.jeton_mqtt, {
      clientid: `urn:imei:${IMEI}`,
      payload: JSON.stringify({
        sn: IMEI,
        lowbat: true,
        CHA: [
          { v: 1001, t: dans(60) },
          { v: 1003, t: dans(90) },
        ],
      }),
    });
    expect(r3.corps.statut).toBe("doublon");
  });

  it("kit C (ChirpStack) : feu vert, surveillance et niveau de pile", async () => {
    const session = await poser(appareils.kitC, {
      p_nature: "eau",
      p_canal: null,
      p_zone: "Piscine",
      p_index_m3: 88,
      p_poids_l: 1,
      p_decodeur: "milesight_em300_di",
      p_intervalle_s: null,
    });
    const trame = (impulsions: number) => {
      const o = new Uint8Array([0x01, 0x75, 0x5c, 0x05, 0xc8, 0, 0, 0, 0]);
      new DataView(o.buffer).setUint32(5, impulsions, true);
      return btoa(String.fromCharCode(...o));
    };
    const up = (fCnt: number, impulsions: number, secondes: number) =>
      envoyer(
        "chirpstack",
        jetons.jeton_lorawan,
        {
          deviceInfo: { devEui: DEVEUI_EAU.toLowerCase() },
          time: new Date(dans(secondes) * 1000).toISOString(),
          fCnt,
          fPort: 85,
          data: trame(impulsions),
          rxInfo: [{ gatewayId: "gw", rssi: -95, snr: 6 }],
        },
        "?event=up",
      );

    expect((await up(1, 500, 30)).corps.statut).toBe("ok");
    expect((await up(2, 540, 1800)).corps.statut).toBe("ok");
    const e = await etat(session);
    expect(Number(e.volume_depuis_pose_m3)).toBeCloseTo(0.04, 5);
    expect(e.ecoulement_detecte_at).not.toBeNull();
    expect(e.surveillance).toBe("complete");
    expect(Number(e.battery_pct)).toBe(92);

    const statut = await envoyer(
      "chirpstack",
      jetons.jeton_lorawan,
      {
        deviceInfo: { devEui: DEVEUI_EAU },
        margin: 7,
        batteryLevel: 81.5,
      },
      "?event=status",
    );
    expect(statut.corps.statut).toBe("etat_appareil");
    const { data } = await admin
      .from("devices")
      .select("battery_pct")
      .eq("id", appareils.kitC)
      .single();
    expect(Number(data!.battery_pct)).toBe(81.5);

    const join = await envoyer(
      "chirpstack",
      jetons.jeton_lorawan,
      { deviceInfo: { devEui: DEVEUI_EAU } },
      "?event=join",
    );
    expect(join.corps.statut).toBe("ignore");
  });

  it("sonde : la première température inscrite au registre donne le feu vert", async () => {
    const session = await poser(appareils.sonde, {
      p_nature: "temperature",
      p_canal: null,
      p_zone: "Départ eau chaude",
      p_index_m3: null,
      p_poids_l: null,
      p_decodeur: "temperature_objet",
      p_intervalle_s: null,
      p_type_point: "sortie_production",
    });
    const r = await envoyer("generic", jetons.jeton_lorawan, {
      dev_eui: DEVEUI_SONDE,
      payload_hex: "",
      horodatage: new Date(dans(20) * 1000).toISOString(),
      objet: { temperature: 56.8 },
    });
    expect(r.corps.statut).toBe("ok");
    const e = await etat(session);
    expect(Number(e.temperature_c)).toBe(56.8);
  });

  it("garde la trame d'un appareil inconnu pour diagnostic", async () => {
    const r = await envoyer("generic", jetons.jeton_lorawan, {
      dev_eui: INCONNU,
      payload_hex: "05c801000000",
    });
    expect(r.corps.statut).toBe("appareil_inconnu");
    const { data } = await admin
      .from("unknown_frames")
      .select("channel")
      .eq("device_ref", INCONNU);
    expect(data).toEqual([{ channel: "lorawan" }]);
  });

  it("calcule l'index reconstitué du point de comptage", async () => {
    const { data: appareil } = await admin
      .from("devices")
      .select("meter_id")
      .eq("id", appareils.kitA)
      .single();
    const { data, error } = await technicien.rpc("index_reconstitue", {
      p_meter_id: appareil!.meter_id,
    });
    expect(error).toBeNull();
    expect(Number(data.index_calcule_m3)).toBeCloseTo(1234.53, 5);
  });
});
