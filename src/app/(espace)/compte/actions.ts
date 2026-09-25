"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailValide, normaliserEmail } from "@/lib/auth/validation";
import { lienConfirmation, urlSite } from "@/lib/auth/liens";
import { chargerMarque, userIdParEmail } from "@/lib/auth/envoisConnexion";
import { emailChangementAdresse } from "@/lib/email/emailsConnexion";
import { envoyerEmail } from "@/lib/email/envoyer";
import { MARQUE_PLATEFORME } from "@/lib/marque";
import { consommerQuota } from "@/lib/securite/protection";

export type Resultat = { ok: true; message: string } | { erreur: string };

/**
 * Changement d'adresse de connexion : un lien de confirmation part vers la
 * nouvelle adresse, et un autre vers l'ancienne (Supabase exige les deux
 * quand le « changement d'adresse sécurisé » est actif, réglage par défaut).
 */
export async function demanderChangementAdresse(
  nouvelleAdresse: string,
): Promise<Resultat> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user?.email) return { erreur: "Non connecté." };

  const nouvelle = normaliserEmail(nouvelleAdresse);
  if (!emailValide(nouvelle)) return { erreur: "Indiquez une adresse e-mail valide." };
  if (nouvelle === user.email.toLowerCase()) {
    return { erreur: "C'est déjà votre adresse actuelle." };
  }
  if (!(await consommerQuota(`changement-adresse:${user.id}`, 3, 3600))) {
    return { erreur: "Trop de demandes. Réessayez dans une heure." };
  }

  const admin = createAdminClient();
  if (await userIdParEmail(admin, nouvelle)) {
    return { erreur: "Cette adresse est déjà utilisée par un autre compte." };
  }

  const { data: adhesion } = await admin
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  const marque = adhesion
    ? await chargerMarque(admin, adhesion.organization_id)
    : MARQUE_PLATEFORME;

  try {
    for (const cible of ["nouvelle", "actuelle"] as const) {
      const { data: lien, error } = await admin.auth.admin.generateLink({
        type: cible === "nouvelle" ? "email_change_new" : "email_change_current",
        email: user.email,
        newEmail: nouvelle,
      });
      if (error) throw error;
      const rendu = emailChangementAdresse(
        marque,
        lienConfirmation(
          urlSite(),
          lien.properties.hashed_token,
          "email_change",
          "/compte?adresse=modifiee",
        ),
        cible,
        nouvelle,
      );
      await envoyerEmail({
        to: cible === "nouvelle" ? nouvelle : user.email,
        ...rendu,
        fromName: marque.nom,
        replyTo: marque.repondreA,
      });
    }
  } catch (err) {
    console.error(
      "[changement d'adresse] échec :",
      err instanceof Error ? err.message : err,
    );
    return { erreur: "Demande impossible pour le moment. Réessayez." };
  }

  return {
    ok: true,
    message: `Deux liens sont partis : l'un vers ${nouvelle}, l'autre vers votre adresse actuelle. Cliquez sur les deux pour valider le changement.`,
  };
}

/**
 * Suppression de son propre compte. Refusée si l'utilisateur est le
 * dernier administrateur d'une organisation (il doit d'abord en désigner
 * un autre). Les traces laissées (imports, journal) deviennent anonymes.
 */
export async function supprimerMonCompte(confirmation: string): Promise<Resultat> {
  if (confirmation.trim().toUpperCase() !== "SUPPRIMER") {
    return { erreur: "Tapez SUPPRIMER pour confirmer." };
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { erreur: "Non connecté." };

  const { data: bloquantes, error } = await supabase.rpc("organisations_ou_seul_admin");
  if (error) return { erreur: "Vérification impossible. Réessayez." };
  if (bloquantes && bloquantes.length > 0) {
    const noms = (bloquantes as { nom: string }[]).map((o) => o.nom).join(", ");
    return {
      erreur: `Vous êtes le seul administrateur de : ${noms}. Invitez un autre administrateur avant de supprimer votre compte.`,
    };
  }

  const admin = createAdminClient();
  const { error: erreurSuppression } = await admin.auth.admin.deleteUser(user.id);
  if (erreurSuppression) {
    return { erreur: "Suppression impossible. Réessayez ou contactez-nous." };
  }
  await supabase.auth.signOut();
  return { ok: true, message: "Compte supprimé." };
}
