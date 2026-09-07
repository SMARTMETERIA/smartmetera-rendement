import { envelopperHtml, echapperHtml, type EmailRendu } from "./emailLayout.ts";

export interface StatsImportEmail {
  fichierNom: string;
  nbLignesImportees: number;
  nbLignesRejetees: number;
  nbLignesIgnorees: number;
}

/** Accusé de réception après import réussi (même en cas de lignes
 * rejetées : le fichier a bien été traité, voir construireEmailErreurImport
 * pour le cas où le fichier n'a pas pu être traité du tout). */
export function construireEmailAccuseReception(
  orgNom: string,
  stats: StatsImportEmail,
  appUrl: string,
): EmailRendu {
  const subject = `[SmartMeteria] Import reçu — ${stats.fichierNom}`;

  const corpsHtml = `
    <p style="margin:0 0 16px;">Bonjour,</p>
    <p style="margin:0 0 16px;">Le fichier <strong>${echapperHtml(stats.fichierNom)}</strong> envoyé pour <strong>${echapperHtml(orgNom)}</strong> a bien été traité :</p>
    <ul style="margin:0 0 16px;padding-left:20px;">
      <li>${stats.nbLignesImportees} ligne(s) importée(s)</li>
      <li>${stats.nbLignesRejetees} ligne(s) rejetée(s)</li>
      <li>${stats.nbLignesIgnorees} ligne(s) ignorée(s)</li>
    </ul>
    ${
      stats.nbLignesRejetees > 0
        ? `<p style="margin:0;color:#71717a;font-size:13px;">Le détail des lignes rejetées est joint à cet e-mail (CSV).</p>`
        : ""
    }
  `;

  const text = [
    `Import reçu — ${stats.fichierNom} (${orgNom})`,
    `${stats.nbLignesImportees} ligne(s) importée(s)`,
    `${stats.nbLignesRejetees} ligne(s) rejetée(s)`,
    `${stats.nbLignesIgnorees} ligne(s) ignorée(s)`,
    "",
    appUrl,
  ].join("\n");

  return { subject, html: envelopperHtml(subject, corpsHtml, appUrl), text };
}

/** Le fichier n'a pas pu être traité du tout (pièce jointe absente/format
 * non reconnu, source inconnue en amont, ou échec du job d'import). */
export function construireEmailErreurImport(
  orgNom: string,
  fichierNom: string | null,
  raison: string,
  appUrl: string,
): EmailRendu {
  const subject = `[SmartMeteria] Échec d'import${fichierNom ? ` — ${fichierNom}` : ""}`;

  const corpsHtml = `
    <p style="margin:0 0 16px;">Bonjour,</p>
    <p style="margin:0 0 16px;">${
      fichierNom
        ? `Le fichier <strong>${echapperHtml(fichierNom)}</strong> envoyé pour <strong>${echapperHtml(orgNom)}</strong> n'a pas pu être traité :`
        : `L'e-mail envoyé pour <strong>${echapperHtml(orgNom)}</strong> n'a pas pu être traité :`
    }</p>
    <p style="margin:0 0 16px;padding:12px;background-color:#fef2f2;border-radius:6px;color:#991b1b;">${echapperHtml(raison)}</p>
    <p style="margin:0;color:#71717a;font-size:13px;">Formats acceptés : CSV et Excel (XLSX), un fichier par e-mail.</p>
  `;

  const text = [
    `Échec d'import${fichierNom ? ` — ${fichierNom}` : ""} (${orgNom})`,
    raison,
    "",
    appUrl,
  ].join("\n");

  return { subject, html: envelopperHtml(subject, corpsHtml, appUrl), text };
}
