import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Marque blanche (phase G7) : logos écrits seulement par l'administrateur
 * de l'organisation, marque publique par identifiant d'URL (sans donnée
 * personnelle, jamais pour une organisation suspendue), mention « Propulsé
 * par » réservée au superadmin.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const suffixe = crypto.randomUUID().slice(0, 8);
const password = `Test-${crypto.randomUUID()}!`;
const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

const orgs: string[] = [];
const utilisateurs: string[] = [];
let partenaire: SupabaseClient;
let agent: SupabaseClient;
let orgA: string;
let orgB: string;

async function compte(orgId: string, role: string) {
  const email = `marque-${role}-${crypto.randomUUID().slice(0, 6)}@example.com`;
  const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  utilisateurs.push(data.user!.id);
  await admin.from("memberships").insert({ user_id: data.user!.id, organization_id: orgId, role, scope_type: "organisation" });
  const anon = createClient(supabaseUrl, anonKey);
  const { data: session } = await anon.auth.signInWithPassword({ email, password });
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${session.session!.access_token}` } },
  });
}

beforeAll(async () => {
  for (const [nom, statut] of [
    ["A", "actif"],
    ["B", "suspendu"],
  ]) {
    const { data } = await admin
      .from("organizations")
      .insert({ nom: `Marque ${nom} ${suffixe}`, kind: "sites", status: statut, slug: `marque-${nom.toLowerCase()}-${suffixe}` })
      .select("id")
      .single();
    orgs.push(data!.id);
    await admin.from("org_branding").insert({ organization_id: data!.id, display_name: `Partenaire ${nom}`, primary_color: "#2A9D8F" });
  }
  [orgA, orgB] = orgs;
  partenaire = await compte(orgA, "admin_client");
  agent = await compte(orgA, "agent");
}, 120000);

afterAll(async () => {
  await admin.storage.from("marques").remove([`${orgA}/logo-test.png`]);
  for (const id of orgs) await admin.from("organizations").delete().eq("id", id);
  for (const id of utilisateurs) await admin.auth.admin.deleteUser(id);
}, 60000);

describe("marque blanche", () => {
  it("l'administrateur dépose le logo de son organisation, pas d'une autre ; l'agent non plus", async () => {
    const ok = await partenaire.storage.from("marques").upload(`${orgA}/logo-test.png`, PNG, { contentType: "image/png" });
    expect(ok.error).toBeNull();
    const ailleurs = await partenaire.storage.from("marques").upload(`${orgB}/logo-test.png`, PNG, { contentType: "image/png" });
    expect(ailleurs.error).not.toBeNull();
    const parAgent = await agent.storage.from("marques").upload(`${orgA}/logo-agent.png`, PNG, { contentType: "image/png" });
    expect(parAgent.error).not.toBeNull();
    const publique = partenaire.storage.from("marques").getPublicUrl(`${orgA}/logo-test.png`).data.publicUrl;
    expect((await fetch(publique)).status).toBe(200);
  });

  it("marque publique par identifiant, jamais pour une organisation suspendue", async () => {
    const anonyme = createClient(supabaseUrl, anonKey);
    const { data } = await anonyme.rpc("marque_publique", { p_slug: `marque-a-${suffixe}` });
    expect(data).toEqual({
      display_name: "Partenaire A",
      primary_color: "#2A9D8F",
      accent_color: null,
      logo_path: null,
      show_powered_by: true,
    });
    const suspendue = await anonyme.rpc("marque_publique", { p_slug: `marque-b-${suffixe}` });
    expect(suspendue.data).toBeNull();
  });

  it("la mention « Propulsé par SmartMeteria » reste réservée au superadmin", async () => {
    const { error } = await partenaire.from("org_branding").update({ show_powered_by: false }).eq("organization_id", orgA);
    expect(error?.message).toContain("Propulsé par SmartMeteria");
    const nom = await partenaire.from("org_branding").update({ sender_name: "Alertes A" }).eq("organization_id", orgA);
    expect(nom.error).toBeNull();
  });
});
