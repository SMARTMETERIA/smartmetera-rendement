// PDF A4 d'un rapport ou d'une page preuve (code serveur), à la marque du
// partenaire : un grand chiffre, une phrase, un graphique, le détail, puis
// les méthodes et la mention de surveillance. Même vue que la page web
// (src/lib/gardien-rapports/affichage.ts).
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { COULEURS_NEUTRES, NOM_PLATEFORME, type Marque } from "@/lib/marque";
import type { VueRapport } from "@/lib/gardien-rapports/affichage";

const LARGEUR = 595.28;
const HAUTEUR = 841.89;
const MARGE = 50;
const UTILE = LARGEUR - 2 * MARGE;

function couleur(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const WIN_ANSI_EN_PLUS = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

/** Les polices standard du PDF ne connaissent que le jeu WinAnsi. */
export function texteImprimable(s: string): string {
  return [...s.replace(/[   ]/g, " ")]
    .map((c) => (c.charCodeAt(0) <= 0xff || WIN_ANSI_EN_PLUS.has(c) ? c : "?"))
    .join("");
}

function couper(texte: string, police: PDFFont, taille: number, largeur: number): string[] {
  const lignes: string[] = [];
  let ligne = "";
  for (const mot of texteImprimable(texte).split(" ")) {
    const essai = ligne ? `${ligne} ${mot}` : mot;
    if (police.widthOfTextAtSize(essai, taille) > largeur && ligne) {
      lignes.push(ligne);
      ligne = mot;
    } else {
      ligne = essai;
    }
  }
  if (ligne) lignes.push(ligne);
  return lignes;
}

class Mise {
  page: PDFPage;
  y = HAUTEUR - MARGE;
  constructor(
    private doc: PDFDocument,
    private normal: PDFFont,
    private gras: PDFFont,
    private marque: Marque,
  ) {
    this.page = doc.addPage([LARGEUR, HAUTEUR]);
  }

  place(hauteur: number) {
    if (this.y - hauteur < MARGE + 30) {
      this.page = this.doc.addPage([LARGEUR, HAUTEUR]);
      this.y = HAUTEUR - MARGE;
    }
  }

  texte(t: string, taille = 11, gras = false, teinte: string = COULEURS_NEUTRES.texte, largeur = UTILE, x = MARGE) {
    const police = gras ? this.gras : this.normal;
    for (const ligne of couper(t, police, taille, largeur)) {
      this.place(taille * 1.4);
      this.page.drawText(ligne, { x, y: this.y - taille, size: taille, font: police, color: couleur(teinte) });
      this.y -= taille * 1.4;
    }
  }

  espace(h: number) {
    this.y -= h;
  }

  bandeau() {
    this.page.drawRectangle({ x: 0, y: HAUTEUR - 8, width: LARGEUR, height: 8, color: couleur(this.marque.couleur) });
    this.texte(this.marque.nom, 12, true);
    this.espace(8);
  }

  graphique(g: NonNullable<VueRapport["graphique"]>) {
    const hauteur = 130;
    this.place(hauteur + 40);
    this.texte(g.titre, 11, true);
    const valeurs = g.points.map((p) => p.valeur ?? 0);
    const max = Math.max(...valeurs, 0.0001);
    const bas = this.y - hauteur;
    const pas = UTILE / Math.max(g.points.length, 1);
    const trait = couleur(this.marque.couleur);
    this.page.drawLine({
      start: { x: MARGE, y: bas },
      end: { x: MARGE + UTILE, y: bas },
      thickness: 0.5,
      color: couleur(COULEURS_NEUTRES.bordure),
    });
    let precedent: { x: number; y: number } | null = null;
    g.points.forEach((p, i) => {
      const x = MARGE + i * pas + pas / 2;
      const hauteurBarre = ((p.valeur ?? 0) / max) * (hauteur - 20);
      if (g.forme === "barres" && p.valeur !== null) {
        this.page.drawRectangle({ x: x - pas * 0.35, y: bas, width: pas * 0.7, height: hauteurBarre, color: trait });
      }
      if (g.forme === "courbe" && p.valeur !== null) {
        const point = { x, y: bas + hauteurBarre };
        if (precedent) this.page.drawLine({ start: precedent, end: point, thickness: 1.5, color: trait });
        this.page.drawCircle({ x: point.x, y: point.y, size: 2, color: trait });
        precedent = point;
      }
      if (g.points.length <= 16 || i % Math.ceil(g.points.length / 16) === 0) {
        this.page.drawText(texteImprimable(p.etiquette), {
          x: x - 8,
          y: bas - 11,
          size: 7,
          font: this.normal,
          color: couleur(COULEURS_NEUTRES.texteSecondaire),
        });
      }
    });
    this.page.drawText(texteImprimable(`max. ${Math.round(max * 10) / 10} ${g.unite}`), {
      x: MARGE,
      y: this.y - 12,
      size: 8,
      font: this.normal,
      color: couleur(COULEURS_NEUTRES.texteSecondaire),
    });
    this.y = bas - 24;
  }
}

export async function construirePdfVue(vue: VueRapport, marque: Marque): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(texteImprimable(`${vue.titre} — ${vue.sousTitre}`));
  doc.setCreator(NOM_PLATEFORME);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);
  const mise = new Mise(doc, normal, gras, marque);
  mise.bandeau();
  mise.texte(vue.titre, 20, true);
  mise.texte(vue.sousTitre, 11, false, COULEURS_NEUTRES.texteSecondaire);
  mise.espace(12);
  if (vue.chiffre) {
    mise.texte(vue.chiffre.valeur, 32, true, marque.couleur);
    mise.texte(vue.chiffre.libelle, 11, false, COULEURS_NEUTRES.texteSecondaire);
    mise.espace(8);
  }
  mise.texte(vue.phrase, 12);
  mise.espace(12);
  if (vue.graphique) mise.graphique(vue.graphique);
  for (const bloc of vue.blocs) {
    mise.espace(6);
    mise.texte(bloc.titre, 13, true);
    for (const [libelle, valeur] of bloc.lignes ?? []) {
      mise.texte(`${libelle} : ${valeur}`, 10);
    }
    for (const p of bloc.paragraphes ?? []) mise.texte(p, 10);
  }
  mise.espace(10);
  for (const note of vue.notes) mise.texte(note, 8, false, COULEURS_NEUTRES.texteSecondaire);
  if (marque.afficherPropulse) mise.texte(`Propulsé par ${NOM_PLATEFORME}`, 8, false, COULEURS_NEUTRES.texteSecondaire);
  return doc.save();
}
