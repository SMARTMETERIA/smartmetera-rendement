"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  estAdminSites,
  getEspaceSites,
  organisationEspaceSites,
} from "@/lib/auth/espaces";
import { LIBELLES_ROLE } from "@/lib/auth/destination";
import { emailValide, normaliserEmail } from "@/lib/auth/validation";
import { chargerMarque, genererLienCompte } from "@/lib/auth/envoisConnexion";
import { emailInvitationMembre } from "@/lib/email/emailsConnexion";
import { envoyerEmail } from "@/lib/email/envoyer";
import { consommerQuota } from "@/lib/securite/protection";
import { porteeInvitation } from "@/lib/gardien/invitations";

export type Resultat = { ok: true; message?: string } | { erreur: string };

/**
 * L'admin invite un collègue (admin, agent, lecteur), un technicien (tous
 * les sites ou un site) ou un directeur de site (un site). Le compte est
 * créé s'il n'existe pas ; le lien part à la marque de l'organisation.
 */
export async function inviterMembreSites(params: {
  email: string;
  role: string;
  siteId?: string | null;
}): Promise<Resultat> {
  const ctx = await getEspaceSites();
  if (!estAdminSites(ctx)) {
    return { erreur: "Seuls les administrateurs peuvent inviter." };
  }
  const { organizationId } = organisationEspaceSites(ctx);
  const email = normaliserEmail(params.email);
  if (!emailValide(email))
    return { erreur: "Indiquez une adresse e-mail valide." };
  const choix = porteeInvitation(params.role, params.siteId);
  if (!choix.ok) return { erreur: choix.erreur };

  if (choix.portee.scopeType === "site") {
    const supabase = await createClient();
    const { data: site } = await supabase
      .from("sites")
      .select("id")
      .eq("id", choix.portee.siteId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!site) return { erreur: "Site introuvable." };
  }
  if (!(await consommerQuota(`invitation:org:${organizationId}`, 50, 3600))) {
    return { erreur: "Trop d'invitations en une heure. Réessayez plus tard." };
  }

  const admin = createAdminClient();
  let lien: string;
  let userId: string;
  try {
    ({ lien, userId } = await genererLienCompte(admin, email));
  } catch {
    return { erreur: "Création de l'invitation impossible. Réessayez." };
  }

  const { error } = await admin.from("memberships").insert({
    user_id: userId,
    organization_id: organizationId,
    role: choix.role,
    scope_type: choix.portee.scopeType,
    site_id: choix.portee.siteId,
  });
  if (error) {
    return {
      erreur:
        error.code === "23505"
          ? "Cette personne a déjà cet accès."
          : "Ajout à l'équipe impossible. Réessayez.",
    };
  }

  const marque = await chargerMarque(admin, organizationId);
  const rendu = emailInvitationMembre(
    marque,
    lien,
    LIBELLES_ROLE[choix.role] ?? choix.role,
  );
  try {
    await envoyerEmail({
      to: email,
      ...rendu,
      fromName: marque.nom,
      replyTo: marque.repondreA,
    });
  } catch {
    revalidatePath("/sites/equipe");
    return {
      ok: true,
      message:
        "Accès créé, mais l'e-mail n'a pas pu partir. La personne peut demander un lien depuis la page de connexion.",
    };
  }

  revalidatePath("/sites/equipe");
  return { ok: true };
}

export async function retirerMembreSites(
  membershipId: string,
): Promise<Resultat> {
  const ctx = await getEspaceSites();
  if (!estAdminSites(ctx)) {
    return { erreur: "Seuls les administrateurs peuvent retirer un accès." };
  }
  const { organizationId } = organisationEspaceSites(ctx);
  const supabase = await createClient();
  const { data: cible } = await supabase
    .from("memberships")
    .select("id, user_id")
    .eq("id", membershipId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!cible) return { erreur: "Accès introuvable." };
  if (cible.user_id === ctx.userId) {
    return { erreur: "Vous ne pouvez pas retirer votre propre accès ici." };
  }
  const { error } = await supabase
    .from("memberships")
    .delete()
    .eq("id", cible.id);
  if (error) return { erreur: "Retrait impossible. Réessayez." };
  revalidatePath("/sites/equipe");
  return { ok: true };
}
