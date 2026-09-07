// Gabarit HTML sobre partagé par tous les e-mails envoyés par l'application
// (alertes, digest hebdomadaire, accusés de réception d'import par e-mail) :
// un seul bandeau, une seule police système, pas de logo/image à héberger.
// Dupliqué dans supabase/functions/notifications/lib et
// supabase/functions/inbound-email/lib (voir README de ces dossiers).
export interface EmailRendu {
  subject: string;
  html: string;
  text: string;
}

export function echapperHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function envelopperHtml(
  titre: string,
  corpsHtml: string,
  appUrl: string,
): string {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${echapperHtml(titre)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;border:1px solid #e4e4e7;">
            <tr>
              <td style="padding:20px 28px;border-bottom:1px solid #e4e4e7;">
                <span style="font-size:15px;font-weight:600;color:#18181b;">SmartMeteria</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;font-size:14px;line-height:1.6;">
                ${corpsHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;border-top:1px solid #e4e4e7;font-size:12px;color:#71717a;">
                <a href="${appUrl}" style="color:#3f3f46;text-decoration:underline;">Ouvrir SmartMeteria</a> — rendement de réseau et bilan d'eau.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
