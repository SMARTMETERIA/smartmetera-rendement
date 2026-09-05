import { createBrowserClient } from "@supabase/ssr";

/**
 * Client Supabase pour les Client Components (navigateur).
 * Utilise la clé publique "anon" : sécurité garantie par les policies RLS.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
