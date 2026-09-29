"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { construireEmailInvitation } from "@/lib/notifications/invitationEmail";
import { genererLienCompte } from "@/lib/auth/envoisConnexion";
import { emailValide, normaliserEmail } from "@/lib/auth/validation";
import { urlSite } from "@/lib/auth/liens";
import { envoyerEmail } from "@/lib/email/envoyer";
import { NOM_PLATEFORME } from "@/lib/marque";
import { usageMensuel } from "@/lib/gardien/usage";
import type { Tarifs } from "@/lib/gardien-rapports/contenus";

async function verifierSuperadmin(): Promise<{ userId: string } | { erreur: string }> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { erreur: "Non authentifié." };

  const { data: estAdmin } = await supabase.rpc("is_platform_admin");
  if (estAdmin !== true) return { erreur: "Réservé aux superadmins." };

  return { userId: userData.user.id };
}

const ROLES_INVITABLES = ["admin_client", "agent", "lecteur"];

/**
 * Invite un utilisateur : lien généré via l'API Admin Auth (jamais l'e-mail
 * par défaut de Supabase), ajout comme membre de l'organisation, envoi par
 * le module d'envoi commun (Resend en production, journal en
 * développement). Le lien mène à /auth/confirmer, qui ouvre la session
 * côté serveur.
 */
export async function inviterUtilisateur(params: {
  organizationId: string;
  email: string;
  role: string;
}): Promise<{ ok: true } | { erreur: string }> {
  const verification = await verifierSuperadmin();
  if ("erreur" in verification) return verification;

  const email = normaliserEmail(params.email);
  if (!emailValide(email)) return { erreur: "Adresse e-mail invalide." };
  if (!ROLES_INVITABLES.includes(params.role)) return { erreur: "Rôle inconnu." };

  const admin = createAdminClient();
  let lien: string;
  let userId: string;
  try {
    ({ lien, userId } = await genererLienCompte(admin, email));
  } catch (err) {
    return {
      erreur: err instanceof Error ? err.message : "Génération du lien d'invitation impossible.",
    };
  }

  const { error: erreurMembership } = await admin.from("memberships").insert({
    user_id: userId,
    organization_id: params.organizationId,
    role: params.role,
  });
  if (erreurMembership) {
    return { erreur: `Ajout à l'organisation impossible : ${erreurMembership.message}` };
  }

  const { data: org } = await admin
    .from("organizations")
    .select("nom")
    .eq("id", params.organizationId)
    .single();

  const rendu = construireEmailInvitation(
    org?.nom ?? NOM_PLATEFORME,
    params.role,
    lien,
    urlSite(),
  );
  try {
    await envoyerEmail({ to: email, ...rendu });
  } catch {
    return {
      erreur:
        "Membre ajouté, mais l'e-mail n'a pas pu partir. La personne peut demander un lien depuis la page de connexion.",
    };
  }

  return { ok: true };
}

/**
 * Suppression définitive d'une organisation après export complet (la
 * fonction SQL exige un export de moins de 24 heures). Les fichiers
 * stockés (imports, rapports) sont supprimés d'abord.
 */
export async function supprimerOrganisation(params: {
  organizationId: string;
  confirmationNom: string;
}): Promise<{ ok: true } | { erreur: string }> {
  const verification = await verifierSuperadmin();
  if ("erreur" in verification) return verification;

  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, nom")
    .eq("id", params.organizationId)
    .maybeSingle();
  if (!org) return { erreur: "Organisation introuvable." };
  if (params.confirmationNom.trim() !== org.nom) {
    return { erreur: "Le nom saisi ne correspond pas." };
  }

  const { data: exportRecent } = await supabase
    .from("audit_log")
    .select("id")
    .eq("organization_id", org.id)
    .eq("action", "export")
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString())
    .limit(1)
    .maybeSingle();
  if (!exportRecent) {
    return { erreur: "Exportez d'abord toutes les données (export de moins de 24 heures)." };
  }

  const admin = createAdminClient();
  for (const bucket of ["imports", "rapports", "marques"]) {
    await supprimerDossier(admin, bucket, org.id);
  }

  const { error } = await supabase.rpc("supprimer_organisation", {
    p_organization_id: org.id,
  });
  if (error) return { erreur: error.message };

  revalidatePath("/admin");
  return { ok: true };
}

async function supprimerDossier(
  admin: ReturnType<typeof createAdminClient>,
  bucket: string,
  dossier: string,
): Promise<void> {
  const { data: elements, error } = await admin.storage
    .from(bucket)
    .list(dossier, { limit: 1000 });
  if (error || !elements) return;
  const fichiers: string[] = [];
  for (const el of elements) {
    const chemin = `${dossier}/${el.name}`;
    if (el.id === null) {
      await supprimerDossier(admin, bucket, chemin);
    } else {
      fichiers.push(chemin);
    }
  }
  if (fichiers.length > 0) await admin.storage.from(bucket).remove(fichiers);
}

/** Tâche du superadmin (pilote, rapports non ouverts) : faite ou annulée. */
export async function terminerTache(params: {
  tacheId: string;
  statut: "faite" | "annulee";
}): Promise<{ ok: true } | { erreur: string }> {
  const verification = await verifierSuperadmin();
  if ("erreur" in verification) return verification;
  const supabase = await createClient();
  const { error } = await supabase
    .from("admin_tasks")
    .update({ status: params.statut, done_at: new Date().toISOString(), done_by: verification.userId })
    .eq("id", params.tacheId)
    .eq("status", "a_faire");
  if (error) return { erreur: "Mise à jour impossible. Réessayez." };
  revalidatePath("/admin");
  return { ok: true };
}

/** Pilote de 30 jours (par défaut) sur un site Gardien. */
export async function creerPilote(params: {
  siteId: string;
  debut: string;
  dureeJours: number;
  remboursementSiRien: boolean;
  prochaineAction: string;
}): Promise<{ ok: true } | { erreur: string }> {
  const verification = await verifierSuperadmin();
  if ("erreur" in verification) return verification;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.debut)) return { erreur: "Date de début invalide." };
  const duree = Math.round(params.dureeJours);
  if (!Number.isFinite(duree) || duree < 1 || duree > 180) return { erreur: "Durée entre 1 et 180 jours." };
  const supabase = await createClient();
  const { data: site } = await supabase.from("sites").select("organization_id").eq("id", params.siteId).maybeSingle();
  if (!site) return { erreur: "Site introuvable." };
  const debut = new Date(`${params.debut}T08:00:00Z`);
  const { error } = await supabase.from("pilots").insert({
    organization_id: site.organization_id,
    site_id: params.siteId,
    started_at: debut.toISOString(),
    ends_at: new Date(debut.getTime() + duree * 86_400_000).toISOString(),
    setup_refund_if_nothing_found: params.remboursementSiRien,
    next_action: params.prochaineAction.trim() || null,
    created_by: verification.userId,
  });
  if (error) {
    return { erreur: error.code === "23505" ? "Un pilote est déjà en cours sur ce site." : "Création impossible. Réessayez." };
  }
  revalidatePath("/admin");
  return { ok: true };
}

/** Suivi d'un pilote : prochaine action, prolongation, retrait. */
export async function majPilote(params: {
  piloteId: string;
  prochaineAction: string;
  statut: "en_cours" | "prolonge" | "retire" | "converti";
  finProlongee: string | null;
}): Promise<{ ok: true } | { erreur: string }> {
  const verification = await verifierSuperadmin();
  if ("erreur" in verification) return verification;
  const supabase = await createClient();
  const modification: Record<string, unknown> = {
    next_action: params.prochaineAction.trim() || null,
    status: params.statut,
  };
  if (params.statut === "prolonge" && params.finProlongee) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(params.finProlongee)) return { erreur: "Date de fin invalide." };
    modification.ends_at = `${params.finProlongee}T08:00:00Z`;
  }
  if (params.statut === "converti") modification.converted_at = new Date().toISOString();
  const { error } = await supabase.from("pilots").update(modification).eq("id", params.piloteId);
  if (error) return { erreur: "Mise à jour impossible. Réessayez." };
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Usage mensuel de chaque organisation Gardien (facturation manuelle) :
 * calculé à partir des poses, des sondes et des tarifs, enregistré dans
 * usage_monthly (une ligne par monnaie).
 */
export async function calculerUsageMensuel(params: { mois: string }): Promise<{ ok: true; lignes: number } | { erreur: string }> {
  const verification = await verifierSuperadmin();
  if ("erreur" in verification) return verification;
  if (!/^\d{4}-\d{2}$/.test(params.mois)) return { erreur: "Mois invalide." };
  const admin = createAdminClient();
  const debut = `${params.mois}-01`;
  const d = new Date(`${debut}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const fin = d.toISOString().slice(0, 10);

  const [{ data: reglage }, { data: orgs }] = await Promise.all([
    admin.from("platform_settings").select("value").eq("key", "tarifs").maybeSingle(),
    admin.from("organizations").select("id, founder_discount_pct, withholding_tax_pct").eq("kind", "sites"),
  ]);
  const tarifs = (reglage?.value ?? {}) as Record<string, Tarifs>;
  let lignes = 0;
  for (const org of orgs ?? []) {
    const [{ data: sites }, { data: compteurs }, { data: sondes }, { data: passerelles }, { data: pilotes }] = await Promise.all([
      admin.from("sites").select("id, name, currency, price_overrides").eq("organization_id", org.id),
      admin
        .from("meters")
        .select("site_id, installed_at")
        .eq("organization_id", org.id)
        .eq("type", "point_comptage")
        .eq("actif", true)
        .not("installed_at", "is", null),
      admin
        .from("temperature_points")
        .select("site_id")
        .eq("organization_id", org.id)
        .eq("active", true)
        .not("device_id", "is", null),
      admin.from("devices").select("site_id").eq("organization_id", org.id).eq("kit", "C").in("provisioning_status", ["pose", "actif"]),
      admin
        .from("pilots")
        .select("site_id")
        .eq("organization_id", org.id)
        .in("status", ["en_cours", "prolonge"])
        .lt("started_at", `${fin}T00:00:00Z`),
    ]);
    if (!sites?.length) continue;
    const usages = usageMensuel({
      debutMois: debut,
      finMois: fin,
      tarifs,
      remiseFondateurPct: Number(org.founder_discount_pct ?? 0),
      retenuePct: Number(org.withholding_tax_pct ?? 0),
      sites: sites.map((s) => ({
        id: s.id,
        nom: s.name,
        monnaie: s.currency === "MAD" ? "MAD" : "EUR",
        surcharges: ((s.price_overrides ?? {}) as Record<string, Tarifs>)[s.currency] ?? null,
        avecPasserelle: (passerelles ?? []).some((p) => p.site_id === s.id),
        poses: (compteurs ?? []).filter((m) => m.site_id === s.id).map((m) => m.installed_at as string),
        sondes: (sondes ?? []).filter((p) => p.site_id === s.id).length,
        pilote: (pilotes ?? []).some((p) => p.site_id === s.id),
      })),
    });
    for (const u of usages) {
      if (!u.pointsActifs && !u.sondes) continue;
      const { error } = await admin.from("usage_monthly").upsert(
        {
          organization_id: org.id,
          period: debut,
          currency: u.monnaie,
          active_points: u.pointsActifs,
          active_meters: u.pointsActifs,
          setup_points: u.misesEnService,
          temperature_points: u.sondes,
          amount_ht: u.ht,
          amount_eur_ht: u.monnaie === "EUR" ? u.ht : 0,
          withholding_tax_amount: u.retenue,
          gross_amount: u.brut,
          computed_at: new Date().toISOString(),
          details: {
            lignes: u.lignes,
            remise: u.remise,
            net: u.net,
            retenue_pct: u.retenuePct,
            incomplet: u.incomplet,
            sites_en_pilote: u.sitesEnPilote,
          },
        },
        { onConflict: "organization_id,period,currency" },
      );
      if (error) return { erreur: `Enregistrement impossible : ${error.message}` };
      lignes++;
    }
  }
  revalidatePath("/admin");
  return { ok: true, lignes };
}
