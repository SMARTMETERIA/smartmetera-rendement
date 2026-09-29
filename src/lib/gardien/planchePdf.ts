// Planche d'étiquettes QR en PDF A4 (code serveur) : un QR code par
// capteur qui ouvre l'assistant de pose, le code lisible, le modèle et la
// fin de la référence.
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import qrcode from "qrcode-generator";
import { COULEURS_NEUTRES, NOM_PLATEFORME } from "@/lib/marque";
import {
  GABARIT_A4_24,
  MM,
  positionsEtiquettes,
  referenceCourte,
} from "./etiquettes";
import { lienPose } from "./stock";

export interface EtiquetteCapteur {
  qrCode: string;
  reference: string;
  modele: string;
}

function couleur(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function dessinerQr(
  page: PDFPage,
  texte: string,
  x: number,
  y: number,
  taille: number,
) {
  const qr = qrcode(0, "M");
  qr.addData(texte);
  qr.make();
  const n = qr.getModuleCount();
  const cote = taille / n;
  const noir = couleur(COULEURS_NEUTRES.texte);
  for (let ligne = 0; ligne < n; ligne++) {
    // Modules sombres consécutifs regroupés : moins d'opérations PDF.
    let debut = -1;
    for (let col = 0; col <= n; col++) {
      const sombre = col < n && qr.isDark(ligne, col);
      if (sombre && debut < 0) debut = col;
      if (!sombre && debut >= 0) {
        page.drawRectangle({
          x: x + debut * cote,
          y: y + taille - (ligne + 1) * cote,
          width: (col - debut) * cote,
          height: cote,
          color: noir,
        });
        debut = -1;
      }
    }
  }
}

function couperLignes(
  texte: string,
  police: PDFFont,
  taille: number,
  largeur: number,
): string[] {
  const lignes: string[] = [];
  let courante = "";
  for (const mot of texte.split(/\s+/)) {
    const essai = courante ? `${courante} ${mot}` : mot;
    if (police.widthOfTextAtSize(essai, taille) <= largeur || !courante) {
      courante = essai;
    } else {
      lignes.push(courante);
      courante = mot;
    }
  }
  if (courante) lignes.push(courante);
  return lignes;
}

export async function construirePlancheEtiquettes(
  etiquettes: EtiquetteCapteur[],
  urlSite: string,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Étiquettes ${NOM_PLATEFORME}`);
  const normale = await pdf.embedFont(StandardFonts.Helvetica);
  const grasse = await pdf.embedFont(StandardFonts.HelveticaBold);
  const texte = couleur(COULEURS_NEUTRES.texte);
  const secondaire = couleur(COULEURS_NEUTRES.texteSecondaire);
  const g = GABARIT_A4_24;
  const pages: PDFPage[] = [];

  const marge = 3.5 * MM;
  // QR de 28 mm centré verticalement : 4,5 mm de marge blanche autour
  // (environ 4 modules), pour une lecture fiable au téléphone.
  const tailleQr = 28 * MM;
  const margeQr = (g.hauteur - tailleQr) / 2;
  const xTexte = margeQr + tailleQr + 2.5 * MM;
  const largeurTexte = g.largeur - xTexte - marge;

  positionsEtiquettes(etiquettes.length).forEach((pos, i) => {
    while (pages.length <= pos.page)
      pages.push(pdf.addPage([g.largeurPage, g.hauteurPage]));
    const page = pages[pos.page];
    const e = etiquettes[i];
    dessinerQr(
      page,
      lienPose(urlSite, e.qrCode),
      pos.x + margeQr,
      pos.y + margeQr,
      tailleQr,
    );

    let y = pos.y + g.hauteur - marge - 11;
    page.drawText(e.qrCode, {
      x: pos.x + xTexte,
      y,
      size: 11,
      font: grasse,
      color: texte,
    });
    y -= 12;
    for (const ligne of couperLignes(
      e.modele,
      normale,
      7.5,
      largeurTexte,
    ).slice(0, 2)) {
      page.drawText(ligne, {
        x: pos.x + xTexte,
        y,
        size: 7.5,
        font: normale,
        color: texte,
      });
      y -= 9;
    }
    page.drawText(`réf. ${referenceCourte(e.reference)}`, {
      x: pos.x + xTexte,
      y,
      size: 7,
      font: normale,
      color: secondaire,
    });
    page.drawText("Scannez pour poser", {
      x: pos.x + xTexte,
      y: pos.y + marge + 9,
      size: 7,
      font: normale,
      color: secondaire,
    });
    page.drawText(NOM_PLATEFORME, {
      x: pos.x + xTexte,
      y: pos.y + marge,
      size: 7,
      font: grasse,
      color: secondaire,
    });
  });

  if (pages.length === 0) pdf.addPage([g.largeurPage, g.hauteurPage]);
  return pdf.save();
}
