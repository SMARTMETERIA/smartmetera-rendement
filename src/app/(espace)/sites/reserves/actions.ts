"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getEspaceSites } from "@/lib/auth/espaces";
import { messageBase } from "@/lib/erreurs/base";
import { validerReserve, type SaisieReserve } from "@/lib/gardien/reserves";

export type Resultat = { ok: true } | { erreur: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Nos messages en français (introuvable, déjà utilisé) sont montrés tels quels. */
function erreurBase(error: { code?: string | null; message?: string | null }, generique: string): string {
  const code = error.code === "P0002" || error.code === "23505" ? "P0001" : error.code;
  return messageBase({ ...error, code }, generique);
}

/**
 * Ajoute ou modifie une réserve d'un site, avec son capteur de niveau. Le
 * rôle est vérifié par la base (administrateur, agent ou technicien).
 */
export async function enregistrerReserve(
  siteId: string,
  reserveId: string | null,
  saisie: SaisieReserve,
): Promise<Resultat> {
  await getEspaceSites();
  if (!UUID.test(siteId) || (reserveId !== null && !UUID.test(reserveId))) return { erreur: "Réserve introuvable." };
  const validation = validerReserve(saisie);
  if (!validation.ok) return { erreur: validation.erreur };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reserve_enregistrer", {
    p_site_id: siteId,
    p_reserve_id: reserveId,
    p_champs: validation.champs,
  });
  if (error) return { erreur: erreurBase(error, "Enregistrement impossible pour le moment. Vérifiez les valeurs puis réessayez.") };
  revalidatePath("/sites/reserves");
  return { ok: true };
}

/** Retire une réserve du suivi (ses relevés sont conservés). */
export async function retirerReserve(reserveId: string): Promise<Resultat> {
  await getEspaceSites();
  if (!UUID.test(reserveId)) return { erreur: "Réserve introuvable." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reserve_retirer", { p_reserve_id: reserveId });
  if (error) return { erreur: erreurBase(error, "Retrait impossible pour le moment. Réessayez.") };
  revalidatePath("/sites/reserves");
  return { ok: true };
}

/** Compteurs qui mesurent l'arrivée du réseau public sur un site. */
export async function definirArrivees(siteId: string, meterIds: string[]): Promise<Resultat> {
  await getEspaceSites();
  if (!UUID.test(siteId) || meterIds.some((id) => !UUID.test(id))) return { erreur: "Compteur introuvable." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("site_arrivees_reseau", { p_site_id: siteId, p_meter_ids: meterIds });
  if (error) return { erreur: erreurBase(error, "Enregistrement impossible pour le moment. Réessayez.") };
  revalidatePath("/sites/reserves");
  return { ok: true };
}
