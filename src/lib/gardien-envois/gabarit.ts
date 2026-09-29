// Gabarit des e-mails du Gardien, à la marque du partenaire (ou de
// SmartMeteria). Styles en ligne (les messageries ignorent les feuilles de
// style) ; couleurs lues depuis la marque et src/lib/marque.ts, jamais
// écrites ici. Version texte produite à partir des mêmes blocs.
import { COULEURS_NEUTRES, NOM_PLATEFORME, couleurTexteSur, type Marque } from "../marque";

export type Bloc =
  | { type: "paragraphe"; texte: string }
  | { type: "chiffre"; valeur: string; libelle: string }
  | { type: "liste"; lignes: [string, string][] }
  | { type: "bouton"; libelle: string; lien: string }
  | { type: "note"; texte: string };

export function echapper(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function blocHtml(marque: Marque, bloc: Bloc): string {
  const n = COULEURS_NEUTRES;
  switch (bloc.type) {
    case "paragraphe":
      return `<p style="margin:0 0 16px;">${echapper(bloc.texte)}</p>`;
    case "chiffre":
      return `<p style="margin:0 0 4px;font-size:32px;font-weight:700;color:${marque.couleur};">${echapper(bloc.valeur)}</p><p style="margin:0 0 16px;color:${n.texteSecondaire};">${echapper(bloc.libelle)}</p>`;
    case "liste":
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;width:100%;">${bloc.lignes
        .map(
          ([libelle, valeur]) =>
            `<tr><td style="padding:4px 12px 4px 0;color:${n.texteSecondaire};vertical-align:top;">${echapper(libelle)}</td><td style="padding:4px 0;font-weight:600;">${echapper(valeur)}</td></tr>`,
        )
        .join("")}</table>`;
    case "bouton":
      return `<p style="margin:8px 0 16px;"><a href="${echapper(bloc.lien)}" style="display:inline-block;background-color:${marque.couleur};color:${couleurTexteSur(marque.couleur)};padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">${echapper(bloc.libelle)}</a></p>`;
    case "note":
      return `<p style="margin:16px 0 0;color:${n.texteSecondaire};font-size:13px;">${echapper(bloc.texte)}</p>`;
  }
}

export function emailHtml(marque: Marque, titre: string, blocs: Bloc[]): string {
  const n = COULEURS_NEUTRES;
  const entete = marque.logoUrl
    ? `<img src="${echapper(marque.logoUrl)}" alt="${echapper(marque.nom)}" height="36" style="display:block;height:36px;max-width:200px;" />`
    : `<span style="font-size:16px;font-weight:700;color:${n.texte};">${echapper(marque.nom)}</span>`;
  const pied = [
    marque.piedDePage ? `<p style="margin:0 0 8px;">${echapper(marque.piedDePage)}</p>` : "",
    marque.afficherPropulse ? `<p style="margin:0;">Propulsé par ${NOM_PLATEFORME}</p>` : "",
  ].join("");
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${echapper(titre)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${n.fond};font-family:Arial,Helvetica,sans-serif;color:${n.texte};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${n.fond};padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:${n.carte};border-radius:8px;border:1px solid ${n.bordure};">
            <tr>
              <td style="padding:20px 28px;border-top:4px solid ${marque.couleur};border-bottom:1px solid ${n.bordure};border-radius:8px 8px 0 0;">${entete}</td>
            </tr>
            <tr>
              <td style="padding:28px;font-size:15px;line-height:1.6;">
                <h1 style="margin:0 0 16px;font-size:20px;">${echapper(titre)}</h1>
                ${blocs.map((b) => blocHtml(marque, b)).join("\n")}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;border-top:1px solid ${n.bordure};font-size:12px;color:${n.texteSecondaire};">${pied}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function emailTexte(marque: Marque, titre: string, blocs: Bloc[]): string {
  const lignes = [titre, ""];
  for (const b of blocs) {
    if (b.type === "paragraphe" || b.type === "note") lignes.push(b.texte, "");
    if (b.type === "chiffre") lignes.push(`${b.valeur} — ${b.libelle}`, "");
    if (b.type === "liste") lignes.push(...b.lignes.map(([l, v]) => `${l} : ${v}`), "");
    if (b.type === "bouton") lignes.push(`${b.libelle} : ${b.lien}`, "");
  }
  lignes.push("—", marque.nom);
  if (marque.afficherPropulse) lignes.push(`Propulsé par ${NOM_PLATEFORME}`);
  return lignes.join("\n");
}
