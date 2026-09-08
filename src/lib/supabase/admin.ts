import { createClient } from "@supabase/supabase-js";

/**
 * Client service_role — usage strictement serveur (Server Actions
 * superadmin : invitation d'utilisateurs via l'API Admin Auth). Ne
 * contourne pas la vérification du rôle appelant : chaque Server Action
 * qui l'utilise doit d'abord confirmer que l'utilisateur courant est
 * superadmin. À ne jamais importer depuis un Client Component.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
