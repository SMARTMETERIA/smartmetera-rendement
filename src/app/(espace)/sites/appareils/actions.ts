"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getEspaceSites,
  organisationEspaceSites,
  peutGererAppareils,
} from "@/lib/auth/espaces";
import { analyserImportStock, genererCodeQr } from "@/lib/gardien/stock";
import { MODELES_CAPTEURS } from "@/lib/gardien/modeles";

export type ResultatImport =
  | { ok: true; importes: number; dejaEnregistres: string[] }
  | { erreurs: { ligne: number; message: string }[] };

/**
 * Import CSV vers le stock : tout ou rien. Une ligne fautive bloque
 * l'import (le fichier est corrigé puis réimporté) ; une référence déjà
 * enregistrée est ignorée et signalée.
 */
export async function importerStock(texte: string): Promise<ResultatImport> {
  const ctx = await getEspaceSites();
  if (!peutGererAppareils(ctx)) {
    return {
      erreurs: [
        {
          ligne: 0,
          message: "Votre rôle ne permet pas d'importer des appareils.",
        },
      ],
    };
  }
  const analyse = analyserImportStock(texte);
  if (analyse.erreurs.length > 0) return { erreurs: analyse.erreurs };
  if (analyse.lignes.length === 0) {
    return {
      erreurs: [
        { ligne: 0, message: "Le fichier ne contient aucun appareil." },
      ],
    };
  }
  const { organizationId } = organisationEspaceSites(ctx);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("importer_stock", {
    p_organization_id: organizationId,
    p_lignes: analyse.lignes.map((l) => ({
      device_ref: l.device_ref,
      model: MODELES_CAPTEURS[l.modele].libelle,
      kit: MODELES_CAPTEURS[l.modele].kit,
      transmission: MODELES_CAPTEURS[l.modele].transmission,
      sim_ref: l.sim_ref,
      qr_code: genererCodeQr(),
    })),
  });
  if (error)
    return {
      erreurs: [{ ligne: 0, message: `Import impossible : ${error.message}` }],
    };
  revalidatePath("/sites/appareils");
  const r = data as { importes: number; deja_enregistres: string[] };
  return {
    ok: true,
    importes: r.importes,
    dejaEnregistres: r.deja_enregistres,
  };
}

export async function attribuerLot(
  deviceIds: string[],
  siteId: string,
): Promise<{ ok: true; nombre: number } | { erreur: string }> {
  const ctx = await getEspaceSites();
  if (!peutGererAppareils(ctx))
    return { erreur: "Votre rôle ne permet pas d'attribuer des appareils." };
  if (deviceIds.length === 0) return { erreur: "Cochez au moins un appareil." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("attribuer_appareils", {
    p_device_ids: deviceIds,
    p_site_id: siteId,
  });
  if (error) return { erreur: `Attribution impossible : ${error.message}` };
  revalidatePath("/sites/appareils");
  return { ok: true, nombre: Number(data) };
}
