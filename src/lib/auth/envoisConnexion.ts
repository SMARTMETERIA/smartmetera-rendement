// Liens de connexion générés par l'API Admin de Supabase et envoyés à la
// marque du partenaire. Code serveur uniquement (client service_role).
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { envoyerEmail } from "@/lib/email/envoyer";
import { emailLienConnexion } from "@/lib/email/emailsConnexion";
import { motifBlocageEnvoi } from "@/lib/email/gardeFou";
import {
  MARQUE_PLATEFORME,
  marqueDepuisBranding,
  type LigneMarque,
  type Marque,
} from "@/lib/marque";
import { lienConfirmation, urlSite, type TypeLien } from "./liens";

type Admin = SupabaseClient;

/** Échappe les jokers de ILIKE (une adresse peut contenir « _ »). */
export function echapperLike(valeur: string): string {
  return valeur.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function userIdParEmail(
  admin: Admin,
  email: string,
): Promise<string | null> {
  const { data, error } = await admin.rpc("auth_user_id_par_email", {
    p_email: email,
  });
  if (error) throw new Error(`Recherche du compte impossible : ${error.message}`);
  return (data as string | null) ?? null;
}

/**
 * Marque d'une organisation : celle du partenaire pour l'offre Immeuble,
 * celle de la plateforme pour une régie (offre Réseau).
 */
export async function chargerMarque(
  admin: Admin,
  organizationId: string,
): Promise<Marque> {
  const { data } = await admin
    .from("organizations")
    .select(
      "nom, kind, org_branding(display_name, primary_color, logo_path, legal_footer, show_powered_by, reply_to_email)",
    )
    .eq("id", organizationId)
    .maybeSingle();
  if (!data || data.kind !== "immeuble") return MARQUE_PLATEFORME;
  const branding = (data.org_branding ?? null) as unknown as LigneMarque | null;
  return marqueDepuisBranding(data.nom, branding);
}

/** Organisation dont la marque s'applique aux e-mails d'un utilisateur. */
async function organisationDeReference(
  admin: Admin,
  userId: string | null,
  email: string,
): Promise<string | null> {
  if (userId) {
    const { data: adhesion } = await admin
      .from("memberships")
      .select("organization_id")
      .eq("user_id", userId)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (adhesion) return adhesion.organization_id;
  }
  const { data: occupant } = await admin
    .from("occupants")
    .select("organization_id")
    .ilike("email", echapperLike(email))
    .limit(1)
    .maybeSingle();
  return occupant?.organization_id ?? null;
}

/**
 * Génère un lien de connexion pour une adresse : lien magique si le compte
 * existe, invitation (création du compte) sinon.
 */
export async function genererLienCompte(
  admin: Admin,
  email: string,
  suivant = "/accueil",
): Promise<{ userId: string; lien: string; type: TypeLien }> {
  const existant = await userIdParEmail(admin, email);
  const type: TypeLien = existant ? "magiclink" : "invite";
  const { data, error } = await admin.auth.admin.generateLink({ type, email });
  if (error || !data.user) {
    throw new Error(error?.message ?? "Génération du lien impossible.");
  }
  return {
    userId: data.user.id,
    lien: lienConfirmation(urlSite(), data.properties.hashed_token, type, suivant),
    type,
  };
}

/**
 * Envoie un lien de connexion à la marque du partenaire, sans jamais
 * révéler si l'adresse est connue : un compte existant reçoit un lien
 * magique ; un occupant importé sans compte reçoit une invitation (son
 * compte est créé à cette occasion) ; toute autre adresse ne reçoit rien.
 */
export async function envoyerLienConnexion(
  email: string,
  slug: string | null,
): Promise<void> {
  const admin = createAdminClient();
  const userId = await userIdParEmail(admin, email);

  let organisationMarque: string | null = null;
  if (slug) {
    const { data: org } = await admin
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    organisationMarque = org?.id ?? null;
  }

  if (!userId) {
    const { data: occupants } = await admin
      .from("occupants")
      .select(
        "organization_id, organizations(status, sending_enabled, dpa_signed_at)",
      )
      .ilike("email", echapperLike(email))
      .limit(10);
    const autorise = (occupants ?? []).find((o) => {
      const org = o.organizations as unknown as {
        status: string;
        sending_enabled: boolean;
        dpa_signed_at: string | null;
      } | null;
      // En développement tout part dans le journal : pas de garde-fou.
      return (
        org &&
        (process.env.NODE_ENV !== "production" ||
          motifBlocageEnvoi(org, process.env) === null)
      );
    });
    if (!autorise) return;
    organisationMarque ??= autorise.organization_id;
  }

  organisationMarque ??= await organisationDeReference(admin, userId, email);
  const marque = organisationMarque
    ? await chargerMarque(admin, organisationMarque)
    : MARQUE_PLATEFORME;

  const { lien } = await genererLienCompte(admin, email);
  const rendu = emailLienConnexion(marque, lien);
  await envoyerEmail({
    to: email,
    ...rendu,
    fromName: marque.nom,
    replyTo: marque.repondreA,
  });
}
