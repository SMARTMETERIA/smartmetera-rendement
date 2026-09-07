import { envelopperHtml, echapperHtml, type EmailRendu } from "./emailLayout";
import { LABEL_TYPE_ALERTE } from "../alerts/labels";
import type { AlerteResume } from "./alerteEmail";

export interface StatsBilanDigest {
  rendement: number | null;
  ilp: number | null;
  ilc: number | null;
  conformeDecret: boolean | null;
  periodeFin: string;
}

/** Digest hebdomadaire (lundi 7h Europe/Paris) : un état des lieux calme,
 * pas une alerte — envoyé même s'il n'y a rien de neuf à signaler. */
export function construireEmailDigest(
  orgNom: string,
  stats: StatsBilanDigest | null,
  alertesSemaine: AlerteResume[],
  nbAlertesOuvertes: number,
  appUrl: string,
): EmailRendu {
  const subject = `[SmartMeteria] Point hebdomadaire — ${orgNom}`;

  const blocRendement = stats
    ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr>
        <td style="padding:14px;background-color:#f4f4f5;border-radius:6px;">
          <div style="font-size:24px;font-weight:700;">${(stats.rendement !== null ? stats.rendement * 100 : 0).toFixed(1)} %</div>
          <div style="color:#71717a;font-size:13px;">
            Rendement de réseau glissant 12 mois (au ${new Date(stats.periodeFin).toLocaleDateString("fr-FR")})
            — ${stats.conformeDecret ? "conforme" : "non conforme"} au décret 2012-97.
            ${stats.ilp !== null ? ` ILP ${stats.ilp.toFixed(2)} m³/km/j.` : ""}
          </div>
        </td>
      </tr>
    </table>`
    : `<p style="color:#71717a;">Bilan pas encore calculé pour cette organisation.</p>`;

  const blocAlertes =
    alertesSemaine.length === 0
      ? `<p style="margin:0;">Aucune nouvelle alerte cette semaine.</p>`
      : `
    <p style="margin:0 0 8px;">${alertesSemaine.length} alerte(s) déclenchée(s) cette semaine :</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${alertesSemaine
        .map(
          (a) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #e4e4e7;font-size:13px;">
            <strong>${echapperHtml(a.titre)}</strong>
            <span style="color:#71717a;"> — ${LABEL_TYPE_ALERTE[a.type] ?? a.type}${a.secteurNom ? `, ${echapperHtml(a.secteurNom)}` : ""}</span>
          </td>
        </tr>`,
        )
        .join("")}
    </table>`;

  const corpsHtml = `
    <p style="margin:0 0 16px;">Bonjour, voici le point hebdomadaire pour <strong>${echapperHtml(orgNom)}</strong>.</p>
    ${blocRendement}
    ${blocAlertes}
    <p style="margin:20px 0 0;color:#71717a;font-size:13px;">${nbAlertesOuvertes} alerte(s) ouverte(s) au total. Détail sur la page Alertes de SmartMeteria.</p>
  `;

  const text = [
    `Point hebdomadaire — ${orgNom}`,
    stats
      ? `Rendement glissant 12 mois : ${(stats.rendement !== null ? stats.rendement * 100 : 0).toFixed(1)} % (${stats.conformeDecret ? "conforme" : "non conforme"})`
      : "Bilan pas encore calculé.",
    "",
    alertesSemaine.length === 0
      ? "Aucune nouvelle alerte cette semaine."
      : `${alertesSemaine.length} alerte(s) cette semaine :`,
    ...alertesSemaine.map((a) => `- ${a.titre} (${LABEL_TYPE_ALERTE[a.type] ?? a.type})`),
    "",
    `${nbAlertesOuvertes} alerte(s) ouverte(s) au total.`,
    appUrl,
  ].join("\n");

  return { subject, html: envelopperHtml(subject, corpsHtml, appUrl), text };
}
