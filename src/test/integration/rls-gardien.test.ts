import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Matrice RLS du Gardien de l'eau (phase G2) sur le vrai projet Supabase
 * (voir .env.local) : 2 organisations, une chaîne de 3 sites, un directeur
 * limité à un site, un technicien, une page preuve valide et une expirée.
 * Tout est jetable et supprimé à la fin.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY " +
      "sont requis dans .env.local pour lancer la matrice RLS.",
  );
}

const admin = createClient(supabaseUrl, serviceRoleKey);
const suffix = crypto.randomUUID().slice(0, 8);
const password = `Test-${crypto.randomUUID()}!`;

type Profil = "adminA" | "directeur" | "technicien" | "adminB";
const emails: Record<Profil, string> = {
  adminA: `rls-g-admin-a-${suffix}@example.com`,
  directeur: `rls-g-directeur-${suffix}@example.com`,
  technicien: `rls-g-technicien-${suffix}@example.com`,
  adminB: `rls-g-admin-b-${suffix}@example.com`,
};
const userIds: Partial<Record<Profil, string>> = {};
const clients: Partial<Record<Profil, SupabaseClient>> = {};
const anon = createClient(supabaseUrl, anonKey);

let orgA: string;
let orgB: string;
const siteA: string[] = [];
let siteB: string;
const meterA: string[] = [];
let tokenValide: string;
let tokenExpire: string;

function sb(profil: Profil): SupabaseClient {
  return clients[profil]!;
}

async function inserer<T = { id: string }>(
  table: string,
  ligne: Record<string, unknown>,
  colonnes = "id",
): Promise<T> {
  const { data, error } = await admin
    .from(table)
    .insert(ligne)
    .select(colonnes)
    .single();
  if (error) throw new Error(`${table} : ${error.message}`);
  return data as T;
}

async function connecter(email: string): Promise<SupabaseClient> {
  const c = createClient(supabaseUrl, anonKey);
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error || !data.session)
    throw new Error(`Connexion impossible pour ${email}`);
  return createClient(supabaseUrl, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    },
  });
}

beforeAll(async () => {
  orgA = (
    await inserer("organizations", {
      nom: `Chaîne RLS ${suffix}`,
      kind: "sites",
      status: "essai",
    })
  ).id;
  orgB = (
    await inserer("organizations", {
      nom: `Autre RLS ${suffix}`,
      kind: "sites",
      status: "essai",
    })
  ).id;
  for (const n of [1, 2, 3]) {
    siteA.push(
      (
        await inserer("sites", {
          organization_id: orgA,
          name: `Hôtel ${n}`,
          type: "hotel",
        })
      ).id,
    );
  }
  siteB = (
    await inserer("sites", {
      organization_id: orgB,
      name: "Camping B",
      type: "camping",
    })
  ).id;

  for (const profil of Object.keys(emails) as Profil[]) {
    const { data, error } = await admin.auth.admin.createUser({
      email: emails[profil],
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userIds[profil] = data.user.id;
  }
  // Insertion groupée : chaque ligne porte toutes les colonnes (une colonne
  // absente d'une ligne vaudrait null, pas sa valeur par défaut).
  const organisation = { scope_type: "organisation", site_id: null };
  const { error: erreurAdhesions } = await admin.from("memberships").insert([
    {
      user_id: userIds.adminA,
      organization_id: orgA,
      role: "admin_client",
      ...organisation,
    },
    {
      user_id: userIds.directeur,
      organization_id: orgA,
      role: "directeur_site",
      scope_type: "site",
      site_id: siteA[0],
    },
    {
      user_id: userIds.technicien,
      organization_id: orgA,
      role: "technicien",
      ...organisation,
    },
    {
      user_id: userIds.adminB,
      organization_id: orgB,
      role: "admin_client",
      ...organisation,
    },
  ]);
  if (erreurAdhesions) throw erreurAdhesions;

  const source = await inserer("sources", {
    organization_id: orgA,
    type: "api",
    nom: "Test RLS",
  });
  for (const [i, site] of siteA.entries()) {
    const meter = await inserer("meters", {
      organization_id: orgA,
      site_id: site,
      type: "point_comptage",
      numero_serie: `RLS-${suffix}-${i}`,
      nom: "Général",
      zone: "Général",
    });
    meterA.push(meter.id);
    const { error } = await admin.from("readings").insert({
      organization_id: orgA,
      meter_id: meter.id,
      source_id: source.id,
      ts: "2026-09-27T01:00:00Z",
      volume_m3: 0.025,
    });
    if (error) throw error;
  }
  for (const i of [0, 1]) {
    await inserer("leak_events", {
      organization_id: orgA,
      site_id: siteA[i],
      meter_id: meterA[i],
      type: "fuite_nuit",
      excess_flow_lph: 25,
      currency: "EUR",
    });
    await inserer("alerts", {
      organization_id: orgA,
      site_id: siteA[i],
      type: "compteur_muet",
      titre: `Capteur muet ${i}`,
    });
  }
  const point = await inserer("temperature_points", {
    organization_id: orgA,
    site_id: siteA[0],
    label: "Départ ECS",
    type: "sortie_production",
  });
  const { error: erreurTemp } = await admin
    .from("temperature_readings")
    .insert({
      organization_id: orgA,
      point_id: point.id,
      ts: "2026-09-27T06:00:00Z",
      value_c: 57.5,
    });
  if (erreurTemp) throw erreurTemp;
  await inserer("activity_data", {
    organization_id: orgA,
    site_id: siteA[1],
    date: "2026-09-01",
    quantity: 900,
  });
  await inserer("pilots", {
    organization_id: orgA,
    site_id: siteA[0],
    notes: "Note interne : rappeler lundi",
    next_action: "Appel de conversion",
  });
  tokenValide = (
    await inserer<{ token: string }>(
      "proof_pages",
      {
        organization_id: orgA,
        site_id: siteA[0],
        period_start: "2026-09-01",
        period_end: "2026-09-27",
        content: { euros_evites: 81, fuites: 1 },
      },
      "token",
    )
  ).token;
  tokenExpire = (
    await inserer<{ token: string }>(
      "proof_pages",
      {
        organization_id: orgA,
        site_id: siteA[1],
        period_start: "2026-08-01",
        period_end: "2026-08-31",
        content: { euros_evites: 12 },
        expires_at: "2026-09-01T00:00:00Z",
      },
      "token",
    )
  ).token;

  for (const profil of Object.keys(emails) as Profil[]) {
    clients[profil] = await connecter(emails[profil]);
  }
}, 90000);

afterAll(async () => {
  if (orgA || orgB) {
    await admin
      .from("organizations")
      .delete()
      .in("id", [orgA, orgB].filter(Boolean));
  }
  for (const id of Object.values(userIds)) {
    if (id) await admin.auth.admin.deleteUser(id);
  }
}, 60000);

async function ids(profil: Profil, table: string): Promise<string[]> {
  const { data, error } = await sb(profil).from(table).select("id");
  if (error) throw new Error(`${table} : ${error.message}`);
  return (data ?? []).map((l) => String(l.id));
}

describe("matrice RLS Gardien : organisations", () => {
  it("l'admin de la chaîne voit ses 3 sites, pas ceux de l'autre organisation", async () => {
    expect((await ids("adminA", "sites")).sort()).toEqual([...siteA].sort());
    expect(await ids("adminB", "sites")).toEqual([siteB]);
  });

  it("l'autre organisation ne voit ni relevés, ni fuites, ni alertes de la chaîne", async () => {
    const { data: releves } = await sb("adminB")
      .from("readings")
      .select("id")
      .in("meter_id", meterA);
    expect(releves).toHaveLength(0);
    expect(await ids("adminB", "leak_events")).toHaveLength(0);
    const { data: alertes } = await sb("adminB")
      .from("alerts")
      .select("id")
      .eq("organization_id", orgA);
    expect(alertes).toHaveLength(0);
  });

  it("les tarifs de plateforme et les pilotes ne se lisent pas directement", async () => {
    expect(await ids("adminA", "pilots")).toHaveLength(0);
    const { data: reglages } = await sb("adminA")
      .from("platform_settings")
      .select("key");
    expect(reglages).toHaveLength(0);
  });

  it("le client voit son pilote sans les notes internes", async () => {
    const { data, error } = await sb("adminA").rpc("pilotes_visibles");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]).not.toHaveProperty("notes");
    expect(data![0]).not.toHaveProperty("next_action");
    const { data: autre } = await sb("adminB").rpc("pilotes_visibles");
    expect(autre).toHaveLength(0);
  });

  it("l'admin ne peut pas modifier sa retenue à la source", async () => {
    const { error } = await sb("adminA")
      .from("organizations")
      .update({ withholding_tax_pct: 5 })
      .eq("id", orgA);
    expect(error).not.toBeNull();
  });
});

describe("matrice RLS Gardien : directeur limité à un site", () => {
  it("ne voit que son site et ses données", async () => {
    expect(await ids("directeur", "sites")).toEqual([siteA[0]]);
    expect(await ids("directeur", "meters")).toEqual([meterA[0]]);
    // Comme les écrans, on filtre par compteur (la table des relevés est
    // volumineuse) : seul le compteur du site du directeur remonte.
    const { data: releves, error: erreurReleves } = await sb("directeur")
      .from("readings")
      .select("meter_id")
      .in("meter_id", meterA);
    expect(erreurReleves).toBeNull();
    expect((releves ?? []).map((r) => r.meter_id)).toEqual([meterA[0]]);
    const { data: fuites } = await sb("directeur")
      .from("leak_events")
      .select("site_id");
    expect((fuites ?? []).map((f) => f.site_id)).toEqual([siteA[0]]);
    const { data: alertes } = await sb("directeur")
      .from("alerts")
      .select("site_id");
    expect((alertes ?? []).map((a) => a.site_id)).toEqual([siteA[0]]);
    expect(await ids("directeur", "temperature_readings")).toHaveLength(1);
    expect(await ids("directeur", "activity_data")).toHaveLength(0);
    const { data: pages } = await sb("directeur")
      .from("proof_pages")
      .select("site_id");
    expect((pages ?? []).map((p) => p.site_id)).toEqual([siteA[0]]);
  });

  it("ne voit que sa propre adhésion", async () => {
    const { data } = await sb("directeur")
      .from("memberships")
      .select("user_id");
    expect((data ?? []).map((m) => m.user_id)).toEqual([userIds.directeur]);
  });

  it("saisit l'activité de son site, pas celle d'un autre", async () => {
    const { error: permis } = await sb("directeur")
      .from("activity_data")
      .insert({
        organization_id: orgA,
        site_id: siteA[0],
        date: "2026-09-01",
        quantity: 812,
      });
    expect(permis).toBeNull();
    const { error: refuse } = await sb("directeur")
      .from("activity_data")
      .insert({
        organization_id: orgA,
        site_id: siteA[2],
        date: "2026-09-01",
        quantity: 1,
      });
    expect(refuse).not.toBeNull();
  });

  it("modifie son site, ni les autres, ni la création de site", async () => {
    const { data: modifie } = await sb("directeur")
      .from("sites")
      .update({ city: "Lyon" })
      .eq("id", siteA[0])
      .select("id");
    expect(modifie).toHaveLength(1);
    const { data: autre } = await sb("directeur")
      .from("sites")
      .update({ city: "Lyon" })
      .eq("id", siteA[1])
      .select("id");
    expect(autre ?? []).toHaveLength(0);
    const { error } = await sb("directeur")
      .from("sites")
      .insert({ organization_id: orgA, name: "Intrus", type: "hotel" });
    expect(error).not.toBeNull();
  });

  it("ne peut pas modifier une fuite directement", async () => {
    const { data } = await sb("directeur")
      .from("leak_events")
      .update({ saved_amount: 1000 })
      .eq("site_id", siteA[0])
      .select("id");
    expect(data ?? []).toHaveLength(0);
  });
});

describe("matrice RLS Gardien : technicien", () => {
  it("voit tous les sites de la chaîne", async () => {
    expect((await ids("technicien", "sites")).sort()).toEqual(
      [...siteA].sort(),
    );
  });

  it("pose un point de comptage mais ne crée pas de site", async () => {
    const { error: pose } = await sb("technicien")
      .from("meters")
      .insert({
        organization_id: orgA,
        site_id: siteA[1],
        type: "point_comptage",
        numero_serie: `RLS-${suffix}-pose`,
        nom: "Cuisine",
        zone: "Cuisine",
      });
    expect(pose).toBeNull();
    const { error: site } = await sb("technicien")
      .from("sites")
      .insert({ organization_id: orgA, name: "Intrus", type: "hotel" });
    expect(site).not.toBeNull();
  });

  it("ne lit pas les pilotes directement", async () => {
    expect(await ids("technicien", "pilots")).toHaveLength(0);
  });
});

describe("matrice RLS Gardien : pages preuve", () => {
  it("s'ouvre sans connexion avec un lien valide", async () => {
    const { data, error } = await anon.rpc("page_preuve_publique", {
      p_token: tokenValide,
    });
    expect(error).toBeNull();
    expect(data.content).toEqual({ euros_evites: 81, fuites: 1 });
    expect(data.site.name).toBe("Hôtel 1");
    expect(JSON.stringify(data)).not.toMatch(/@/);
  });

  it("ne s'ouvre plus une fois expirée", async () => {
    const { data } = await anon.rpc("page_preuve_publique", {
      p_token: tokenExpire,
    });
    expect(data).toBeNull();
  });

  it("refuse un jeton inventé", async () => {
    const { data } = await anon.rpc("page_preuve_publique", {
      p_token: "0".repeat(48),
    });
    expect(data).toBeNull();
    const { data: mauvais } = await anon.rpc("page_preuve_publique", {
      p_token: "x",
    });
    expect(mauvais).toBeNull();
  });

  it("ne se lit pas dans la table sans connexion", async () => {
    const { data } = await anon.from("proof_pages").select("token");
    expect(data ?? []).toHaveLength(0);
  });

  it("compte les consultations", async () => {
    const { data } = await admin
      .from("proof_pages")
      .select("views")
      .eq("token", tokenValide)
      .single();
    expect(data!.views).toBeGreaterThanOrEqual(1);
  });
});
