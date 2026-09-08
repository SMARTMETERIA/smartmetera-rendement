// Constructeur PDF minimal (pagination automatique, titres, tableaux) au
// dessus de pdf-lib - seule Edge Function du projet a embarquer cette
// dependance (generation de rapport, aucune alternative "impression
// navigateur" possible pour un envoi automatique par e-mail).
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const LARGEUR_PAGE = 595.28; // A4
const HAUTEUR_PAGE = 841.89;
const MARGE = 50;
const COULEUR_TEXTE = rgb(0.094, 0.094, 0.106);
const COULEUR_MUTED = rgb(0.443, 0.443, 0.478);
const COULEUR_BORDURE = rgb(0.894, 0.894, 0.906);
const COULEUR_FOND_ENTETE = rgb(0.961, 0.961, 0.965);
const ELLIPSE = "…";

// Remplacements connus pour des caracteres frequents mais non codables en
// WinAnsi (police standard) : espace fine insecable U+202F (utilisee par
// Intl.NumberFormat "fr-FR" comme separateur de milliers), espace
// insecable classique U+00A0, signe moins mathematique U+2212, tiret
// demi-cadratin U+2013. Ecrits en \uXXXX pour eviter toute ambiguite.
const REMPLACEMENTS: Record<string, string> = {
  " ": " ",
  " ": " ",
  "−": "-",
  "–": "-",
};

/**
 * Neutralise tout caractere que la police WinAnsi ne sait pas encoder
 * (texte libre venant de la base : titres d'alerte, resultats
 * d'intervention... impossible de garantir qu'ils resteront toujours dans
 * le repertoire Latin-1). Verifie caractere par caractere via l'API
 * pdf-lib elle-meme plutot qu'une table de correspondance approximative.
 */
function assainir(t: string, police: PDFFont): string {
  let resultat = "";
  for (const car of t) {
    try {
      police.widthOfTextAtSize(car, 10);
      resultat += car;
    } catch {
      resultat += REMPLACEMENTS[car] ?? "?";
    }
  }
  return resultat;
}

function tronquer(t: string, largeurPx: number, police: PDFFont, taille: number): string {
  const propre = assainir(t, police);
  if (police.widthOfTextAtSize(propre, taille) <= largeurPx - 8) return propre;
  let s = propre;
  while (s.length > 1 && police.widthOfTextAtSize(s + ELLIPSE, taille) > largeurPx - 8) {
    s = s.slice(0, -1);
  }
  return s + ELLIPSE;
}

export class ConstructeurPdf {
  private doc!: PDFDocument;
  private police!: PDFFont;
  private policeGrasse!: PDFFont;
  private page!: PDFPage;
  private y = 0;

  static async creer(): Promise<ConstructeurPdf> {
    const c = new ConstructeurPdf();
    c.doc = await PDFDocument.create();
    c.police = await c.doc.embedFont(StandardFonts.Helvetica);
    c.policeGrasse = await c.doc.embedFont(StandardFonts.HelveticaBold);
    c.nouvellePage();
    return c;
  }

  nouvellePage() {
    this.page = this.doc.addPage([LARGEUR_PAGE, HAUTEUR_PAGE]);
    this.y = HAUTEUR_PAGE - MARGE;
  }

  assurerEspace(hauteur: number) {
    if (this.y - hauteur < MARGE) this.nouvellePage();
  }

  espace(h = 10) {
    this.y -= h;
  }

  texte(
    t: string,
    opts: { taille?: number; gras?: boolean; muted?: boolean; centre?: boolean } = {},
  ) {
    const taille = opts.taille ?? 10;
    this.assurerEspace(taille + 6);
    const police = opts.gras ? this.policeGrasse : this.police;
    const couleur = opts.muted ? COULEUR_MUTED : COULEUR_TEXTE;
    const propre = assainir(t, police);
    const x = opts.centre
      ? (LARGEUR_PAGE - police.widthOfTextAtSize(propre, taille)) / 2
      : MARGE;
    this.page.drawText(propre, { x, y: this.y, size: taille, font: police, color: couleur });
    this.y -= taille + 6;
  }

  ligneSeparation() {
    this.assurerEspace(10);
    this.page.drawLine({
      start: { x: MARGE, y: this.y },
      end: { x: LARGEUR_PAGE - MARGE, y: this.y },
      thickness: 0.5,
      color: COULEUR_BORDURE,
    });
    this.y -= 14;
  }

  titreSection(t: string) {
    this.assurerEspace(34);
    this.espace(8);
    this.texte(t, { taille: 14, gras: true });
    this.ligneSeparation();
  }

  /** Une ligne "cle : valeur" en gras sur la cle, pour les chiffres cles (rendement, etc.). */
  cle(cle: string, valeur: string, opts: { taille?: number } = {}) {
    const taille = opts.taille ?? 11;
    this.assurerEspace(taille + 6);
    this.page.drawText(assainir(cle, this.policeGrasse), {
      x: MARGE,
      y: this.y,
      size: taille,
      font: this.policeGrasse,
      color: COULEUR_TEXTE,
    });
    this.page.drawText(assainir(valeur, this.police), {
      x: MARGE + 220,
      y: this.y,
      size: taille,
      font: this.police,
      color: COULEUR_TEXTE,
    });
    this.y -= taille + 8;
  }

  tableau(entetes: string[], largeurs: number[], lignes: string[][]) {
    const hauteurLigne = 18;
    const largeurTotale = largeurs.reduce((a, b) => a + b, 0);
    this.assurerEspace(hauteurLigne * 2);

    this.page.drawRectangle({
      x: MARGE,
      y: this.y - 4,
      width: largeurTotale,
      height: hauteurLigne,
      color: COULEUR_FOND_ENTETE,
    });
    let x = MARGE;
    for (let i = 0; i < entetes.length; i++) {
      this.page.drawText(tronquer(entetes[i], largeurs[i], this.policeGrasse, 9), {
        x: x + 4,
        y: this.y,
        size: 9,
        font: this.policeGrasse,
        color: COULEUR_TEXTE,
      });
      x += largeurs[i];
    }
    this.y -= hauteurLigne;

    if (lignes.length === 0) {
      this.texte("Aucune donnee.", { muted: true, taille: 9 });
      return;
    }

    for (const ligne of lignes) {
      this.assurerEspace(hauteurLigne);
      x = MARGE;
      for (let i = 0; i < ligne.length; i++) {
        this.page.drawText(tronquer(ligne[i] ?? "", largeurs[i], this.police, 9), {
          x: x + 4,
          y: this.y,
          size: 9,
          font: this.police,
          color: COULEUR_TEXTE,
        });
        x += largeurs[i];
      }
      this.page.drawLine({
        start: { x: MARGE, y: this.y - 4 },
        end: { x: MARGE + largeurTotale, y: this.y - 4 },
        thickness: 0.5,
        color: COULEUR_BORDURE,
      });
      this.y -= hauteurLigne;
    }
    this.espace(6);
  }

  async octets(): Promise<Uint8Array> {
    return this.doc.save();
  }
}
