// Gabarit HTML des e-mails à la marque d'un partenaire (ou de la
// plateforme). Styles en ligne (les clients mail ignorent les feuilles de
// style), couleurs lues depuis la marque et src/lib/marque.ts.
import { echapperHtml, type EmailRendu } from "@/lib/notifications/emailLayout";
import {
  COULEURS_NEUTRES,
  NOM_PLATEFORME,
  couleurTexteSur,
  type Marque,
} from "@/lib/marque";

export type { EmailRendu };
export { echapperHtml };

export function boutonHtml(marque: Marque, libelle: string, lien: string): string {
  const texte = couleurTexteSur(marque.couleur);
  return `<a href="${echapperHtml(lien)}" style="display:inline-block;background-color:${marque.couleur};color:${texte};padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">${echapperHtml(libelle)}</a>`;
}

export function paragrapheHtml(texte: string): string {
  return `<p style="margin:0 0 16px;">${echapperHtml(texte)}</p>`;
}

export function noteHtml(texte: string): string {
  return `<p style="margin:16px 0 0;color:${COULEURS_NEUTRES.texteSecondaire};font-size:13px;">${echapperHtml(texte)}</p>`;
}

export function envelopperHtmlMarque(
  marque: Marque,
  titre: string,
  corpsHtml: string,
): string {
  const n = COULEURS_NEUTRES;
  const entete = marque.logoUrl
    ? `<img src="${echapperHtml(marque.logoUrl)}" alt="${echapperHtml(marque.nom)}" height="36" style="display:block;height:36px;max-width:200px;" />`
    : `<span style="font-size:16px;font-weight:700;color:${n.texte};">${echapperHtml(marque.nom)}</span>`;
  const piedLegal = marque.piedDePage
    ? `<p style="margin:0 0 8px;">${echapperHtml(marque.piedDePage)}</p>`
    : "";
  const propulse = marque.afficherPropulse
    ? `<p style="margin:0;">Propulsé par ${NOM_PLATEFORME}</p>`
    : "";

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${echapperHtml(titre)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${n.fond};font-family:Arial,Helvetica,sans-serif;color:${n.texte};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${n.fond};padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:${n.carte};border-radius:8px;border:1px solid ${n.bordure};">
            <tr>
              <td style="padding:20px 28px;border-top:4px solid ${marque.couleur};border-bottom:1px solid ${n.bordure};border-radius:8px 8px 0 0;">
                ${entete}
              </td>
            </tr>
            <tr>
              <td style="padding:28px;font-size:15px;line-height:1.6;">
                ${corpsHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;border-top:1px solid ${n.bordure};font-size:12px;color:${n.texteSecondaire};">
                ${piedLegal}${propulse}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
