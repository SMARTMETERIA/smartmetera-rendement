// Crée (ou réutilise) un compte superadmin de test rattaché à « Régie des
// Sources », pour tester l'app localement sans passer par le magic link.
//
// ⚠️ Ce mot de passe est en clair dans le dépôt Git. Ne JAMAIS exécuter ce
// script contre une base de production, et supprimer ce compte
// (SUPABASE_SERVICE_ROLE_KEY + admin.auth.admin.deleteUser) avant toute
// mise en production de ce projet Supabase. superadmin voit TOUTES les
// organisations, pas seulement Régie des Sources.
//
// Usage : npm run dev:seed-user

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(import.meta.dirname, "../.env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, serviceKey);

const EMAIL = "dev-superadmin@smartmeteria.test";
const PASSWORD = "DevLocal-2026!";

async function main() {
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .select("id")
    .eq("nom", "Régie des Sources")
    .single();
  if (orgErr) throw orgErr;

  // Idempotent : réutilise l'utilisateur s'il existe déjà.
  const { data: existingUsers, error: listErr } =
    await admin.auth.admin.listUsers();
  if (listErr) throw listErr;
  let user = existingUsers.users.find((u) => u.email === EMAIL);

  if (!user) {
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
      });
    if (createErr) throw createErr;
    user = created.user;
    console.log("Utilisateur créé :", user.id);
  } else {
    console.log("Utilisateur déjà existant, réutilisé :", user.id);
  }

  const { data: existingMembership } = await admin
    .from("memberships")
    .select("id, role")
    .eq("user_id", user.id)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (!existingMembership) {
    const { error: memErr } = await admin
      .from("memberships")
      .insert({
        user_id: user.id,
        organization_id: org.id,
        role: "superadmin",
      });
    if (memErr) throw memErr;
    console.log("Adhésion superadmin créée pour Régie des Sources.");
  } else if (existingMembership.role !== "superadmin") {
    await admin
      .from("memberships")
      .update({ role: "superadmin" })
      .eq("id", existingMembership.id);
    console.log("Adhésion existante promue superadmin.");
  } else {
    console.log("Adhésion superadmin déjà en place.");
  }

  console.log("\n--- Identifiants dev ---");
  console.log("email:", EMAIL);
  console.log("password:", PASSWORD);
  console.log("organization_id:", org.id);
}

main().catch((err) => {
  console.error("ECHEC:", err);
  process.exit(1);
});
