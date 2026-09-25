"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { estAdminPartenaire, getEspacePartenaire } from "@/lib/auth/espaces";
import { LIBELLES_ROLE } from "@/lib/auth/destination";
import { emailValide, normaliserEmail } from "@/lib/auth/validation";
import { chargerMarque, genererLienCompte } from "@/lib/auth/envoisConnexion";
import { emailInvitationMembre } from "@/lib/email/emailsConnexion";
import { envoyerEmail } from "@/lib/email/envoyer";
import { consommerQuota } from "@/lib/securite/protection";

export type Resultat = { ok: true; message?: string } | { erreur: string };

const ROLES_INVITABLES = ["admin_client", "agent", "lecteur", "gestionnaire"] as const;
const TYPES_CLIENT = [
  "syndic_pro",
  "syndic_benevole",
  "bailleur",
  "gestionnaire",
  "autre",
] as const;

/**
 * L'admin d'un partenaire invite un collègue (admin, agent, lecteur) ou un
 * gestionnaire (portée : un client). Le lien d'invitation part à la marque
 * du partenaire ; le compte est créé s'il n'existe pas.
 */
export async function inviterMembre(params: {
  email: string;
  role: string;
  clientId?: string | null;
}): Promise<Resultat> {
  const ctx = await getEspacePartenaire();
  if (!estAdminPartenaire(ctx)) {
    return { erreur: "Seuls les administrateurs peuvent inviter." };
  }
  const orgId = ctx.adhesion.organizationId;
  const email = normaliserEmail(params.email);
  if (!emailValide(email)) return { erreur: "Indiquez une adresse e-mail valide." };
  if (!(ROLES_INVITABLES as readonly string[]).includes(params.role)) {
    return { erreur: "Rôle inconnu." };
  }
  const gestionnaire = params.role === "gestionnaire";
  if (gestionnaire) {
    if (!params.clientId) {
      return { erreur: "Choisissez le client suivi par ce gestionnaire." };
    }
    const supabase = await createClient();
    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("id", params.clientId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!client) return { erreur: "Client introuvable." };
  }
  if (!(await consommerQuota(`invitation:org:${orgId}`, 50, 3600))) {
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
    organization_id: orgId,
    role: params.role,
    scope_type: gestionnaire ? "client" : "organisation",
    scope_id: gestionnaire ? params.clientId : null,
  });
  if (error) {
    return {
      erreur:
        error.code === "23505"
          ? "Cette personne a déjà un accès à votre espace."
          : "Ajout à l'équipe impossible. Réessayez.",
    };
  }

  const marque = await chargerMarque(admin, orgId);
  const rendu = emailInvitationMembre(
    marque,
    lien,
    LIBELLES_ROLE[params.role] ?? params.role,
  );
  try {
    await envoyerEmail({
      to: email,
      ...rendu,
      fromName: marque.nom,
      replyTo: marque.repondreA,
    });
  } catch {
    revalidatePath("/immeuble/equipe");
    return {
      ok: true,
      message:
        "Accès créé, mais l'e-mail n'a pas pu partir. La personne peut demander un lien depuis la page de connexion.",
    };
  }

  revalidatePath("/immeuble/equipe");
  return { ok: true };
}

export async function creerClient(params: {
  name: string;
  type: string;
}): Promise<Resultat> {
  const ctx = await getEspacePartenaire();
  if (!["admin_client", "agent"].includes(ctx.adhesion.role) && !ctx.isPlatformAdmin) {
    return { erreur: "Votre rôle ne permet pas d'ajouter un client." };
  }
  const name = params.name.trim();
  if (name.length < 2) return { erreur: "Indiquez le nom du client." };
  if (!(TYPES_CLIENT as readonly string[]).includes(params.type)) {
    return { erreur: "Type de client inconnu." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("clients").insert({
    organization_id: ctx.adhesion.organizationId,
    name,
    type: params.type,
  });
  if (error) return { erreur: "Création du client impossible. Réessayez." };
  revalidatePath("/immeuble/equipe");
  return { ok: true };
}

export async function retirerMembre(membershipId: string): Promise<Resultat> {
  const ctx = await getEspacePartenaire();
  if (!estAdminPartenaire(ctx)) {
    return { erreur: "Seuls les administrateurs peuvent retirer un accès." };
  }
  const supabase = await createClient();
  const { data: cible } = await supabase
    .from("memberships")
    .select("id, user_id, role, organization_id")
    .eq("id", membershipId)
    .eq("organization_id", ctx.adhesion.organizationId)
    .maybeSingle();
  if (!cible) return { erreur: "Accès introuvable." };
  if (cible.user_id === ctx.userId) {
    return { erreur: "Vous ne pouvez pas retirer votre propre accès ici." };
  }
  const { error } = await supabase.from("memberships").delete().eq("id", cible.id);
  if (error) return { erreur: "Retrait impossible. Réessayez." };
  revalidatePath("/immeuble/equipe");
  return { ok: true };
}
