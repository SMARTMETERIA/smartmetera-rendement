"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const email = process.env.NEXT_PUBLIC_DEV_AUTO_LOGIN_EMAIL;
const password = process.env.NEXT_PUBLIC_DEV_AUTO_LOGIN_PASSWORD;

/**
 * Connexion automatique en développement local uniquement (voir
 * scripts/create-dev-user.mjs). N'a aucun effet si NEXT_PUBLIC_DEV_AUTO_LOGIN_*
 * n'est pas défini dans .env.local, ou en production (process.env.NODE_ENV
 * est figé par Next.js au build : ce bloc est éliminé du bundle de prod).
 */
export function DevAutoLogin() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || !email || !password) return;

    void (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (data.user) return;
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        console.warn(
          "[dev-auto-login] échec de connexion automatique :",
          error.message,
        );
      } else {
        console.info("[dev-auto-login] connecté en tant que", email);
      }
    })();
  }, []);

  return null;
}
