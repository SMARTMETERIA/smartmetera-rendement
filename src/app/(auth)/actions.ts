"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { envoyerEmail } from "@/lib/email/envoyer";
import {
  emailConfirmationInscription,
  emailReinitialisation,
} from "@/lib/email/emailsConnexion";
import { MARQUE_PLATEFORME } from "@/lib/marque";
import { lienConfirmation, urlSite } from "@/lib/auth/liens";
import {
  emailValide,
  normaliserEmail,
  validerInscription,
  type DonneesInscription,
} from "@/lib/auth/validation";
import { chargerMarque, userIdParEmail } from "@/lib/auth/envoisConnexion";
import {
  adresseIpAppelant,
  consommerQuota,
  verifierCaptcha,
} from "@/lib/securite/protection";

export type EtatFormulaire<Champ extends string = string> =
  | { statut: "repos" }
  | { statut: "succes"; email: string; journalDev: boolean }
  | {
      statut: "erreur";
      message: string;
      champs?: Partial<Record<Champ, string>>;
      /** Saisie à réafficher (jamais les mots de passe). */
      valeurs?: Record<string, string>;
    };

function saisieSansMotDePasse(formData: FormData): Record<string, string> {
  const valeurs: Record<string, string> = {};
  for (const [cle, valeur] of formData.entries()) {
    if (typeof valeur !== "string" || cle.startsWith("$")) continue;
    if (/mot|passe|confirmation|turnstile/i.test(cle)) continue;
    valeurs[cle] = valeur;
  }
  return valeurs;
}

const DUREE_ESSAI_JOURS = 30;

function journalDev(): boolean {
  return process.env.NODE_ENV !== "production" && !process.env.EMAIL_DEV_REDIRECT;
}

/**
 * Inscription autonome d'un partenaire : compte (mot de passe, adresse à
 * confirmer), organisation Immeuble en essai de 30 jours, rôle admin,
 * marque initialisée avec la raison sociale. Les envois aux occupants
 * restent bloqués tant que le superadmin n'a pas activé l'organisation.
 */
export async function inscrirePartenaire(
  _etat: EtatFormulaire<keyof DonneesInscription>,
  formData: FormData,
): Promise<EtatFormulaire<keyof DonneesInscription>> {
  const resultat = await inscrire(formData);
  return resultat.statut === "erreur"
    ? { ...resultat, valeurs: saisieSansMotDePasse(formData) }
    : resultat;
}

async function inscrire(
  formData: FormData,
): Promise<EtatFormulaire<keyof DonneesInscription>> {
  const ip = await adresseIpAppelant();
  if (!(await consommerQuota(`inscription:ip:${ip}`, 5, 3600))) {
    return {
      statut: "erreur",
      message: "Trop de tentatives d'inscription. Réessayez dans une heure.",
    };
  }

  const captcha = await verifierCaptcha(
    formData.get("cf-turnstile-response") as string | null,
    ip,
  );
  if (!captcha.ok) return { statut: "erreur", message: captcha.erreur };

  const validation = validerInscription({
    raisonSociale: String(formData.get("raisonSociale") ?? ""),
    nom: String(formData.get("nom") ?? ""),
    email: String(formData.get("email") ?? ""),
    telephone: String(formData.get("telephone") ?? ""),
    siren: String(formData.get("siren") ?? ""),
    motDePasse: String(formData.get("motDePasse") ?? ""),
    confirmation: String(formData.get("confirmation") ?? ""),
  });
  if (!validation.ok) {
    return {
      statut: "erreur",
      message: "Corrigez les champs signalés.",
      champs: validation.erreurs,
    };
  }
  const d = validation.donnees;

  const admin = createAdminClient();
  if (await userIdParEmail(admin, d.email)) {
    return {
      statut: "erreur",
      message:
        "Un compte existe déjà avec cette adresse. Connectez-vous, ou utilisez « Mot de passe oublié ».",
      champs: { email: "Adresse déjà utilisée." },
    };
  }

  const { data: lien, error: erreurLien } = await admin.auth.admin.generateLink(
    {
      type: "signup",
      email: d.email,
      password: d.motDePasse,
      options: { data: { full_name: d.nom, phone: d.telephone } },
    },
  );
  if (erreurLien || !lien.user) {
    return {
      statut: "erreur",
      message: "Création du compte impossible. Réessayez dans un instant.",
    };
  }
  const userId = lien.user.id;

  let organizationId: string | null = null;
  try {
    const finEssai = new Date(Date.now() + DUREE_ESSAI_JOURS * 86_400_000);
    const { data: org, error: erreurOrg } = await admin
      .from("organizations")
      .insert({
        nom: d.raisonSociale,
        kind: "immeuble",
        status: "essai",
        trial_ends_at: finEssai.toISOString(),
        siren: d.siren,
        contact_phone: d.telephone,
      })
      .select("id")
      .single();
    if (erreurOrg) throw erreurOrg;
    organizationId = org.id;

    const { error: erreurAdhesion } = await admin.from("memberships").insert({
      user_id: userId,
      organization_id: organizationId,
      role: "admin_client",
    });
    if (erreurAdhesion) throw erreurAdhesion;

    const { error: erreurMarque } = await admin.from("org_branding").insert({
      organization_id: organizationId,
      display_name: d.raisonSociale,
      sender_name: d.raisonSociale,
      reply_to_email: d.email,
      support_email: d.email,
      support_phone: d.telephone,
    });
    if (erreurMarque) throw erreurMarque;

    const rendu = emailConfirmationInscription(
      MARQUE_PLATEFORME,
      lienConfirmation(urlSite(), lien.properties.hashed_token, "signup"),
      d.raisonSociale,
    );
    await envoyerEmail({ to: d.email, ...rendu, fromName: MARQUE_PLATEFORME.nom });
  } catch (err) {
    // Rien de partiel : ni compte orphelin, ni organisation sans admin.
    if (organizationId) {
      await admin.from("organizations").delete().eq("id", organizationId);
    }
    await admin.auth.admin.deleteUser(userId);
    console.error(
      "[inscription] échec :",
      err instanceof Error ? err.message : err,
    );
    return {
      statut: "erreur",
      message: "Création du compte impossible. Réessayez dans un instant.",
    };
  }

  return { statut: "succes", email: d.email, journalDev: journalDev() };
}

/**
 * Mot de passe oublié : lien de réinitialisation à la marque du partenaire.
 * Même réponse que l'adresse soit connue ou non.
 */
export async function demanderReinitialisation(
  _etat: EtatFormulaire<"email">,
  formData: FormData,
): Promise<EtatFormulaire<"email">> {
  const email = normaliserEmail(String(formData.get("email") ?? ""));
  if (!emailValide(email)) {
    return {
      statut: "erreur",
      message: "Indiquez une adresse e-mail valide.",
      champs: { email: "Adresse invalide." },
    };
  }
  const ip = await adresseIpAppelant();
  const quotaIp = await consommerQuota(`reinit:ip:${ip}`, 10, 15 * 60);
  const quotaEmail = await consommerQuota(`reinit:email:${email}`, 3, 15 * 60);
  if (!quotaIp || !quotaEmail) {
    return {
      statut: "erreur",
      message: "Trop de demandes. Réessayez dans quelques minutes.",
    };
  }

  try {
    const admin = createAdminClient();
    const userId = await userIdParEmail(admin, email);
    if (userId) {
      const { data, error } = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
      });
      if (error) throw error;
      const { data: adhesion } = await admin
        .from("memberships")
        .select("organization_id")
        .eq("user_id", userId)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      const marque = adhesion
        ? await chargerMarque(admin, adhesion.organization_id)
        : MARQUE_PLATEFORME;
      const rendu = emailReinitialisation(
        marque,
        lienConfirmation(
          urlSite(),
          data.properties.hashed_token,
          "recovery",
          "/reinitialisation",
        ),
      );
      await envoyerEmail({
        to: email,
        ...rendu,
        fromName: marque.nom,
        replyTo: marque.repondreA,
      });
    }
  } catch (err) {
    console.error(
      "[mot de passe oublié] envoi impossible :",
      err instanceof Error ? err.message : err,
    );
  }

  return { statut: "succes", email, journalDev: journalDev() };
}
