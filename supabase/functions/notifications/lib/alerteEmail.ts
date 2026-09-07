import { envelopperHtml, echapperHtml, type EmailRendu } from "./emailLayout.ts";
import { LABEL_TYPE_ALERTE } from "./labels.ts";

export interface AlerteResume {
  type: string;
  severite: string;
  titre: string;
  description: string | null;
  secteurNom: string | null;
  declencheeLe: string;
}

/** Notification quasi temps réel : une seule alerte ou un groupe (si le
 * moteur nocturne en a déclenché plusieurs d'un coup), envoyée dès que le
 * job de notification les repère (voir src/lib/notifications/README ou le
 * commentaire en tête de l'Edge Function `notifications`). */
export function construireEmailAlertes(
  orgNom: string,
  alertes: AlerteResume[],
  appUrl: string,
): EmailRendu {
  const nb = alertes.length;
  const subject =
    nb === 1
      ? `[SmartMeteria] Nouvelle alerte — ${orgNom}`
      : `[SmartMeteria] ${nb} nouvelles alertes — ${orgNom}`;

  const lignes = alertes
    .map((a) => {
      const label = LABEL_TYPE_ALERTE[a.type] ?? a.type;
      const date = new Date(a.declencheeLe).toLocaleString("fr-FR", {
        timeZone: "Europe/Paris",
      });
      return `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e4e4e7;">
          <div style="font-weight:600;">${echapperHtml(a.titre)}</div>
          <div style="color:#71717a;font-size:13px;">${label}${a.secteurNom ? ` · ${echapperHtml(a.secteurNom)}` : ""} · ${date}</div>
          ${a.description ? `<div style="margin-top:4px;">${echapperHtml(a.description)}</div>` : ""}
        </td>
      </tr>`;
    })
    .join("");

  const corpsHtml = `
    <p style="margin:0 0 12px;">Bonjour,</p>
    <p style="margin:0 0 16px;">${
      nb === 1
        ? "Une nouvelle alerte a été déclenchée"
        : `${nb} nouvelles alertes ont été déclenchées`
    } pour <strong>${echapperHtml(orgNom)}</strong> :</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${lignes}</table>
    <p style="margin:20px 0 0;color:#71717a;font-size:13px;">Consultez le détail et acquittez ces alertes depuis la page Alertes de SmartMeteria.</p>
  `;

  const text = [
    `${nb === 1 ? "Une nouvelle alerte" : `${nb} nouvelles alertes`} pour ${orgNom} :`,
    ...alertes.map(
      (a) =>
        `- ${a.titre} (${LABEL_TYPE_ALERTE[a.type] ?? a.type}${a.secteurNom ? `, ${a.secteurNom}` : ""})`,
    ),
    "",
    appUrl,
  ].join("\n");

  return { subject, html: envelopperHtml(subject, corpsHtml, appUrl), text };
}
