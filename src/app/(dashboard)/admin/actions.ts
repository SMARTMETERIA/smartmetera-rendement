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
