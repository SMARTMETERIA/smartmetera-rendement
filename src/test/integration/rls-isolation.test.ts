import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Vérifie l'isolation RLS entre deux organisations sur le vrai projet
 * Supabase (voir .env.local). Crée deux organisations et deux utilisateurs
 * jetables, un membre admin_client de chacune, puis vérifie qu'aucun ne
 * peut lire ni écrire les données de l'autre. Nettoie tout à la fin.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY " +
      "sont requis dans .env.local pour lancer les tests d'isolation RLS.",
  );
}

const admin = createClient(supabaseUrl, serviceRoleKey);

const suffix = crypto.randomUUID().slice(0, 8);
const emailA = `rls-test-a-${suffix}@example.com`;
const emailB = `rls-test-b-${suffix}@example.com`;
const password = `Test-${crypto.randomUUID()}!`;

let orgAId: string;
let orgBId: string;
let userAId: string;
let userBId: string;
let sectorAId: string;
let clientA: SupabaseClient;
let clientB: SupabaseClient;

async function clientFor(email: string): Promise<SupabaseClient> {
  const anon = createClient(supabaseUrl!, anonKey!);
  const { data, error } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) {
    throw new Error(`Connexion impossible pour ${email} : ${error?.message}`);
  }
  return createClient(supabaseUrl!, anonKey!, {
    global: {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    },
  });
}

beforeAll(async () => {
  const { data: orgA, error: orgAError } = await admin
    .from("organizations")
    .insert({ nom: `Test isolation RLS A ${suffix}` })
    .select("id")
    .single();
  if (orgAError) throw orgAError;
  orgAId = orgA.id;

  const { data: orgB, error: orgBError } = await admin
    .from("organizations")
    .insert({ nom: `Test isolation RLS B ${suffix}` })
    .select("id")
    .single();
  if (orgBError) throw orgBError;
  orgBId = orgB.id;

  const { data: userA, error: userAError } = await admin.auth.admin.createUser({
    email: emailA,
    password,
    email_confirm: true,
  });
  if (userAError) throw userAError;
  userAId = userA.user.id;

  const { data: userB, error: userBError } = await admin.auth.admin.createUser({
    email: emailB,
    password,
    email_confirm: true,
  });
  if (userBError) throw userBError;
  userBId = userB.user.id;

  const { error: membershipsError } = await admin.from("memberships").insert([
    { user_id: userAId, organization_id: orgAId, role: "admin_client" },
    { user_id: userBId, organization_id: orgBId, role: "admin_client" },
  ]);
  if (membershipsError) throw membershipsError;

  const { data: sectorA, error: sectorAError } = await admin
    .from("sectors")
    .insert({ organization_id: orgAId, code: "TEST-A", nom: "Secteur test A" })
    .select("id")
    .single();
  if (sectorAError) throw sectorAError;
  sectorAId = sectorA.id;

  clientA = await clientFor(emailA);
  clientB = await clientFor(emailB);
}, 30000);

afterAll(async () => {
  await admin.from("sectors").delete().eq("organization_id", orgAId);
  await admin
    .from("memberships")
    .delete()
    .in("organization_id", [orgAId, orgBId]);
  await admin.from("organizations").delete().in("id", [orgAId, orgBId]);
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
}, 30000);

describe("isolation RLS entre organisations", () => {
  it("un membre ne voit que sa propre organisation", async () => {
    const { data: dataA } = await clientA
      .from("organizations")
      .select("id")
      .eq("id", orgAId);
    const { data: dataAforOrgB } = await clientA
      .from("organizations")
      .select("id")
      .eq("id", orgBId);

    expect(dataA).toHaveLength(1);
    expect(dataAforOrgB).toHaveLength(0);
  });

  it("un membre ne voit pas les secteurs d'une autre organisation", async () => {
    const { data: visibleByOwner } = await clientA
      .from("sectors")
      .select("id")
      .eq("id", sectorAId);
    const { data: visibleByOther } = await clientB
      .from("sectors")
      .select("id")
      .eq("id", sectorAId);

    expect(visibleByOwner).toHaveLength(1);
    expect(visibleByOther).toHaveLength(0);
  });

  it("un membre ne peut pas créer de secteur dans une autre organisation", async () => {
    const { error } = await clientB
      .from("sectors")
      .insert({ organization_id: orgAId, code: "INTRUSION", nom: "Tentative" });

    expect(error).not.toBeNull();

    const { data: leaked } = await admin
      .from("sectors")
      .select("id")
      .eq("organization_id", orgAId)
      .eq("code", "INTRUSION");
    expect(leaked).toHaveLength(0);
  });

  it("un membre ne peut pas lire les adhésions d'une autre organisation", async () => {
    const { data } = await clientB
      .from("memberships")
      .select("id")
      .eq("organization_id", orgAId);
    expect(data).toHaveLength(0);
  });
});
