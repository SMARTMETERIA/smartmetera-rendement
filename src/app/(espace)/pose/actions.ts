"use server";

import { revalidatePath } from "next/cache";
import { messageBase } from "@/lib/erreurs/base";
import { createClient } from "@/lib/supabase/server";
import { getEspaceSites, peutPoser } from "@/lib/auth/espaces";
import {
  MODELES_CAPTEURS,
  modeleDepuisDecodeur,
  trouverModele,
} from "@/lib/gardien/modeles";
import {
  verifierPoidsImpulsion,
  type VerificationPoids,
} from "@/lib/gardien/pose";

export interface SaisiePose {
  deviceId: string;
  siteId: string;
  canal: string | null;
  zone: string;
  photoPath: string | null;
  indexM3: number | null;
  poidsL: number | null;
  typePoint: string | null;
}

export type ResultatPose = { ok: true; sessionId: string } | { erreur: string };

/**
 * Enregistre la pose : point de comptage (ou de température), rattachement
 * du capteur, session suivie par l'écran du robinet test. Le décodeur et
 * l'intervalle d'émission viennent du catalogue des modèles.
 */
export async function validerPose(saisie: SaisiePose): Promise<ResultatPose> {
  const ctx = await getEspaceSites();
  if (!peutPoser(ctx))
    return { erreur: "Votre rôle ne permet pas de poser un capteur." };
  const supabase = await createClient();
  const { data: appareil } = await supabase
    .from("devices")
    .select("id, model, decodeur, transmission_interval_s")
    .eq("id", saisie.deviceId)
    .maybeSingle();
  if (!appareil) return { erreur: "Capteur introuvable." };
  const cle =
    trouverModele(appareil.model ?? "") ??
    modeleDepuisDecodeur(appareil.decodeur);
  if (!cle)
    return { erreur: "Modèle de capteur inconnu : contactez le support." };
  const modele = MODELES_CAPTEURS[cle];

  const { data, error } = await supabase.rpc("demarrer_pose", {
    p_device_id: saisie.deviceId,
    p_site_id: saisie.siteId,
    p_nature: modele.nature,
    p_canal: saisie.canal,
    p_zone: saisie.zone,
    p_photo_path: saisie.photoPath,
    p_index_m3: saisie.indexM3,
    p_poids_l: saisie.poidsL,
    p_decodeur: modele.decodeur,
    p_intervalle_s:
      appareil.transmission_interval_s ?? modele.intervalleEmissionS,
    p_type_point: saisie.typePoint,
  });
  if (error) {
    return {
      erreur: messageBase(error, "Pose impossible pour le moment. Vérifiez les réponses puis réessayez."),
    };
  }
  revalidatePath("/pose");
  return { ok: true, sessionId: data as string };
}

export interface EtatPoseEcran {
  nature: "eau" | "temperature";
  started_at: string;
  expected_first_data_at: string | null;
  premiere_donnee_at: string | null;
  derniere_donnee_at: string | null;
  ecoulement_detecte_at: string | null;
  volume_depuis_pose_m3: number | null;
  temperature_c: number | null;
  battery_low: boolean | null;
  battery_pct: number | null;
  surveillance: string | null;
}

export async function lireEtatPose(
  sessionId: string,
): Promise<EtatPoseEcran | { erreur: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("etat_pose", {
    p_session_id: sessionId,
  });
  if (error) return { erreur: "Pose introuvable." };
  return data as EtatPoseEcran;
}

export type ResultatVerification =
  | { ok: true; verification: VerificationPoids; poidsActuelL: number }
  | { erreur: string };

/** Compare l'index lu sur le compteur à l'index reconstitué. */
export async function verifierIndex(
  meterId: string,
  indexLuM3: number,
): Promise<ResultatVerification> {
  if (!Number.isFinite(indexLuM3) || indexLuM3 < 0) {
    return { erreur: "Indiquez l'index affiché par le compteur (en m³)." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("index_reconstitue", {
    p_meter_id: meterId,
  });
  if (error || !data) return { erreur: "Point de comptage introuvable." };
  const index = data as {
    install_index_m3: number | null;
    volume_depuis_pose_m3: number;
    pulse_weight_l: number | null;
  };
  if (index.install_index_m3 === null || !index.pulse_weight_l) {
    return {
      erreur: "Index de pose ou poids d'impulsion manquant pour ce point.",
    };
  }
  return {
    ok: true,
    poidsActuelL: Number(index.pulse_weight_l),
    verification: verifierPoidsImpulsion({
      indexPoseM3: Number(index.install_index_m3),
      indexLuM3,
      volumeMesureM3: Number(index.volume_depuis_pose_m3),
      poidsActuelL: Number(index.pulse_weight_l),
    }),
  };
}

export async function corrigerPoids(
  meterId: string,
  poidsL: number,
): Promise<{ ok: true; releves: number } | { erreur: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("corriger_poids_impulsion", {
    p_meter_id: meterId,
    p_poids_l: poidsL,
  });
  if (error) return { erreur: messageBase(error, "Correction impossible pour le moment. Réessayez.") };
  revalidatePath("/pose");
  return {
    ok: true,
    releves: Number((data as { releves_corriges: number }).releves_corriges),
  };
}
