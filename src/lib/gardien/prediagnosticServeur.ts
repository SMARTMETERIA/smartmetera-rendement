// Pré-diagnostic côté serveur : qui y a accès, tarifs et débits de
// référence (platform_settings, lus avec la clé de service), marque.
import type { ContexteUtilisateur } from "@/lib/auth/destination";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tarifs } from "@/lib/gardien-rapports/contenus";
import { DEBITS_REFERENCE } from "./prediagnostic";

/** Superadmin, ou administrateur et agent d'une organisation Gardien (partenaire). */
export function peutPrediagnostic(ctx: ContexteUtilisateur): boolean {
  return (
    ctx.isPlatformAdmin ||
    (ctx.adhesion?.kind === "sites" && ["admin_client", "agent"].includes(ctx.adhesion.role))
  );
}

export async function reglagesPrediagnostic(): Promise<{
  tarifs: Record<string, Tarifs>;
  debits: typeof DEBITS_REFERENCE;
}> {
  const admin = createAdminClient();
  const { data } = await admin.from("platform_settings").select("key, value").in("key", ["tarifs", "prediagnostic"]);
  const valeur = (cle: string) => ((data ?? []).find((r) => r.key === cle)?.value ?? {}) as Record<string, unknown>;
  const p = valeur("prediagnostic");
  const nombre = (v: unknown, defaut: number) => (typeof v === "number" && v > 0 ? v : defaut);
  return {
    tarifs: valeur("tarifs") as Record<string, Tarifs>,
    debits: {
      chasseLph: nombre(p.chasse_lph, DEBITS_REFERENCE.chasseLph),
      fuiteEnterreeLph: nombre(p.fuite_enterree_lph, DEBITS_REFERENCE.fuiteEnterreeLph),
    },
  };
}
