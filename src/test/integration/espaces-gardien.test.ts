import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Fonctions de la base pour les espaces (phase G6) : courbe horaire d'un
 * site, accord écrit de conversion d'un pilote (directeur oui, technicien
 * non), consultation journalisée réservée au superadmin.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const suffixe = crypto.randomUUID().slice(0, 8);
const password = `Test-${crypto.randomUUID()}!`;

let orgId: string;
let siteId: string;
let piloteId: string;
const comptes: Record<string, { id: string; client: SupabaseClient }> = {};

beforeAll(async () => {
  const { data: org } = await admin
    .from("organizations")
    .insert({ nom: `Espaces test ${suffixe}`, kind: "sites", status: "essai" })
    .select("id")
    .single();
  orgId = org!.id;
  const { data: site } = await admin
    .from("sites")
    .insert({ organization_id: orgId, name: "Hôtel Espaces", type: "hotel" })
    .select("id")
    .single();
  siteId = site!.id;
  const { data: src } = await admin
    .from("sources")
    .insert({ organization_id: orgId, type: "saisie_manuelle", nom: "Test" })
    .select("id")
    .single();
  const { data: compteur } = await admin
    .from("meters")
    .insert({ organization_id: orgId, site_id: siteId, type: "point_comptage", numero_serie: `ES-${suffixe}`, nom: "Général" })
    .select("id")
    .single();
  await admin.from("readings").insert(
    ["2026-09-10T01:00:00Z", "2026-09-10T01:30:00Z", "2026-09-10T02:00:00Z", "2026-09-10T03:00:00Z"].map((ts, i) => ({
      organization_id: orgId,
      meter_id: compteur!.id,
      source_id: src!.id,
      ts,
      volume_m3: [0.01, 0.005, 0.005, 0.02][i],
    })),
  );
  const { data: pilote } = await admin
    .from("pilots")
    .insert({ organization_id: orgId, site_id: siteId, started_at: new Date().toISOString(), ends_at: new Date(Date.now() + 30 * 86_400_000).toISOString() })
    .select("id")
    .single();
  piloteId = pilote!.id;

  for (const [profil, role, portee] of [
    ["directeur", "directeur_site", "site"],
    ["tech", "technicien", "organisation"],
  ] as const) {
    const email = `espaces-${profil}-${suffixe}@example.com`;
    const { data: u } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    await admin.from("memberships").insert({
      user_id: u.user!.id,
      organization_id: orgId,
      role,
      scope_type: portee,
      site_id: portee === "site" ? siteId : null,
    });
    const anon = createClient(supabaseUrl, anonKey);
    const { data: session } = await anon.auth.signInWithPassword({ email, password });
    comptes[profil] = {
      id: u.user!.id,
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

describe("fonctions des espaces", () => {
  it("courbe horaire d'un site : litres par heure, lisible par le directeur", async () => {
    const { data, error } = await comptes.directeur.client.rpc("courbe_horaire_site", {
      p_site_id: siteId,
      p_debut: "2026-09-10T00:00:00Z",
      p_fin: "2026-09-10T04:00:00Z",
    });
    expect(error).toBeNull();
    expect(data.map((l: { heure: string; litres: number }) => [l.heure, Number(l.litres)])).toEqual([
      ["2026-09-10T00:00:00+00:00", 10],
      ["2026-09-10T01:00:00+00:00", 10],
      ["2026-09-10T02:00:00+00:00", 20],
    ]);
    const anonyme = await createClient(supabaseUrl, anonKey).rpc("courbe_horaire_site", {
      p_site_id: siteId,
      p_debut: "2026-09-10T00:00:00Z",
      p_fin: "2026-09-10T04:00:00Z",
    });
    expect(anonyme.error).not.toBeNull();
  });

  it("accord écrit de conversion : refusé au technicien, donné puis retiré par le directeur", async () => {
    const refus = await comptes.tech.client.rpc("accepter_conversion_pilote", { p_pilot_id: piloteId, p_nom: "Paul" });
    expect(refus.error?.code).toBe("42501");

    const vide = await comptes.directeur.client.rpc("accepter_conversion_pilote", { p_pilot_id: piloteId, p_nom: " " });
    expect(vide.error?.message).toContain("prénom et votre nom");

    const { error } = await comptes.directeur.client.rpc("accepter_conversion_pilote", {
      p_pilot_id: piloteId,
      p_nom: "Claire Martin",
    });
    expect(error).toBeNull();
    const { data: p } = await admin.from("pilots").select("auto_convert_consent, consent_at, consent_by_name").eq("id", piloteId).single();
    expect(p).toMatchObject({ auto_convert_consent: true, consent_by_name: "Claire Martin" });
    expect(p!.consent_at).not.toBeNull();

    const retrait = await comptes.directeur.client.rpc("retirer_conversion_pilote", { p_pilot_id: piloteId });
    expect(retrait.error).toBeNull();
    const { data: apres } = await admin.from("pilots").select("auto_convert_consent, consent_at").eq("id", piloteId).single();
    expect(apres).toEqual({ auto_convert_consent: false, consent_at: null });

    const { data: journal } = await admin
      .from("audit_log")
      .select("action")
      .eq("organization_id", orgId)
      .in("action", ["consentement_conversion", "retrait_consentement_conversion"]);
    expect(journal!.map((j) => j.action).sort()).toEqual(["consentement_conversion", "retrait_consentement_conversion"]);
  });

  it("consultation journalisée réservée au superadmin", async () => {
    const { error } = await comptes.directeur.client.rpc("journaliser_consultation", {
      p_organization_id: orgId,
      p_page: "/sites",
    });
    expect(error?.code).toBe("42501");
  });
});
