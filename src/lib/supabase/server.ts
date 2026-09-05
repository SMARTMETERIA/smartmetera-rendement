import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Client Supabase pour Server Components, Route Handlers et Server Actions.
 * Lit/écrit les cookies de session (magic link). L'écriture est ignorée
 * si appelée depuis un Server Component (cookies immuables) : le
 * middleware se charge alors du rafraîchissement de session.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Appel depuis un Server Component : ignoré, géré par le middleware.
          }
        },
      },
    },
  );
}
