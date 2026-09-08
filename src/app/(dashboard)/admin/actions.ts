"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { construireEmailInvitation } from "@/lib/notifications/invitationEmail";

async function verifierSuperadmin(): Promise<{ userId: string } | { erreur: string }> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { erreur: "Non authentifié." };

  const { data: membership } = await supabase
    .from("memberships")
    .select("id")
    .eq("user_id", userData.user.id)
    .eq("role", "superadmin")
    .limit(1)
    .maybeSingle();
  if (!membership) return { erreur: "Réservé aux superadmins." };

  return { userId: userData.user.id };
}

/**
 * Invite un utilisateur : crée son compte via l'API Admin Auth (lien
 * généré, jamais l'e-mail par défaut de Supabase), l'ajoute comme membre
 * de l'organisation, puis envoie le lien par Resend (gabarit sobre commun
 * à l'application). Si l'utilisateur existe déjà, generateLink renvoie
 * quand même un lien de connexion valide pour lui.
 */
export async function inviterUtilisateur(params: {
  organizationId: string;
  email: string;
  role: string;
}): Promise<{ ok: true } | { erreur: string }> {
  const verification = await verifierSuperadmin();
  if ("erreur" in verification) return verification;

  const admin = createAdminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { data: lienData, error: erreurLien } = await admin.auth.admin.generateLink({
    type: "invite",
    email: params.email,
    options: { redirectTo: `${siteUrl}/auth/callback` },
  });
  if (erreurLien || !lienData?.user) {
    return { erreur: erreurLien?.message ?? "Génération du lien d'invitation impossible." };
  }

  const { error: erreurMembership } = await admin.from("memberships").insert({
    user_id: lienData.user.id,
    organization_id: params.organizationId,
    role: params.role,
  });
  if (erreurMembership) {
    return { erreur: `Compte créé mais ajout à l'organisation impossible : ${erreurMembership.message}` };
  }

  const { data: org } = await admin
    .from("organizations")
    .select("nom")
    .eq("id", params.organizationId)
    .single();

  const rendu = construireEmailInvitation(
    org?.nom ?? "SmartMeteria",
    params.role,
    lienData.properties.action_link,
    siteUrl,
  );

  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFrom = process.env.RESEND_FROM_EMAIL;
  if (resendApiKey && resendFrom) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: resendFrom,
          to: [params.email],
          subject: rendu.subject,
          html: rendu.html,
          text: rendu.text,
        }),
      });
    } catch {
      // le membre est déjà créé ; le lien peut être renvoyé manuellement depuis les logs Supabase Auth
    }
  }

  return { ok: true };
}
