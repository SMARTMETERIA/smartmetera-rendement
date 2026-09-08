import { envelopperHtml, echapperHtml, type EmailRendu } from "./emailLayout";

const LABEL_ROLE: Record<string, string> = {
  superadmin: "superadmin",
  admin_client: "administrateur",
  agent: "agent",
  lecteur: "lecteur",
};

/** Invitation envoyée depuis l'espace superadmin (/admin) : lien généré via
 * l'API Admin Auth de Supabase (auth.admin.generateLink, type "invite"),
 * envoyé par Resend plutôt que par le service e-mail par défaut de
 * Supabase, pour un gabarit cohérent avec le reste de l'application. */
export function construireEmailInvitation(
  organisationNom: string,
  role: string,
  lienInvitation: string,
  appUrl: string,
): EmailRendu {
  const subject = `[SmartMeteria] Invitation — ${organisationNom}`;

  const corpsHtml = `
    <p style="margin:0 0 16px;">Bonjour,</p>
    <p style="margin:0 0 16px;">Vous avez été invité(e) à rejoindre <strong>${echapperHtml(organisationNom)}</strong> sur SmartMeteria, en tant que <strong>${LABEL_ROLE[role] ?? role}</strong>.</p>
    <p style="margin:0 0 20px;">
      <a href="${lienInvitation}" style="display:inline-block;background-color:#18181b;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Accepter l&apos;invitation</a>
    </p>
    <p style="margin:0;color:#71717a;font-size:13px;">Ce lien vous connecte directement, sans mot de passe.</p>
  `;

  const text = [
    `Invitation a rejoindre ${organisationNom} sur SmartMeteria (role : ${LABEL_ROLE[role] ?? role}).`,
    lienInvitation,
    "",
    appUrl,
  ].join("\n");

  return { subject, html: envelopperHtml(subject, corpsHtml, appUrl), text };
}
