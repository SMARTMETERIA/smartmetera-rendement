/**
 * Identité de la plateforme et marque d'un partenaire (marque blanche).
 * Seul endroit où des couleurs sont écrites en dur : tout le reste
 * (e-mails, thème, PDF) les lit depuis ici ou depuis org_branding.
 * La marque s'écrit « SmartMeteria » partout (décision de Rayan).
 */
export const NOM_PLATEFORME = "SmartMeteria";

/** Palette SmartMeteria (brief de design, phase 8). */
export const COULEURS_PLATEFORME = {
  bleu: "#1B4F8A",
  turquoise: "#0FA3A3",
  encre: "#0A2540",
} as const;

/** Neutres des gabarits d'e-mail (fond, bordures, texte secondaire). */
export const COULEURS_NEUTRES = {
  fond: "#F4F5F7",
  carte: "#FFFFFF",
  bordure: "#E3E6EA",
  texte: "#0A2540",
  texteSecondaire: "#5B6776",
  blanc: "#FFFFFF",
} as const;

export interface Marque {
  /** Nom affiché (partenaire, ou plateforme). */
  nom: string;
  /** Couleur principale, #RRGGBB. */
  couleur: string;
  /** URL absolue du logo, ou null. */
  logoUrl: string | null;
  /** Pied de page légal du partenaire, ou null. */
  piedDePage: string | null;
  /** Mention « Propulsé par SmartMeteria ». */
  afficherPropulse: boolean;
  /** Adresse de réponse, ou null. */
  repondreA: string | null;
  /** Nom d'expéditeur des e-mails (défaut : nom affiché). */
  expediteur: string;
  /** Couleur d'accent, #RRGGBB. */
  accent: string;
}

export const MARQUE_PLATEFORME: Marque = {
  nom: NOM_PLATEFORME,
  couleur: COULEURS_PLATEFORME.bleu,
  logoUrl: null,
  piedDePage: null,
  afficherPropulse: false,
  repondreA: null,
  expediteur: NOM_PLATEFORME,
  accent: COULEURS_PLATEFORME.turquoise,
};

const HEX = /^#[0-9a-f]{6}$/i;

function luminanceRelative(hex: string): number {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}

/** Rapport de contraste WCAG entre deux couleurs #RRGGBB. */
export function rapportContraste(a: string, b: string): number {
  const la = luminanceRelative(a);
  const lb = luminanceRelative(b);
  const [claire, foncee] = la > lb ? [la, lb] : [lb, la];
  return (claire + 0.05) / (foncee + 0.05);
}

/** Texte blanc ou encre, celui qui contraste le mieux sur le fond donné. */
export function couleurTexteSur(fond: string): string {
  if (!HEX.test(fond)) return COULEURS_NEUTRES.blanc;
  return rapportContraste(fond, COULEURS_NEUTRES.blanc) >=
    rapportContraste(fond, COULEURS_NEUTRES.texte)
    ? COULEURS_NEUTRES.blanc
    : COULEURS_NEUTRES.texte;
}

/** Contraste minimal texte / fond (WCAG AA). */
export const CONTRASTE_MINIMUM = 4.5;

/**
 * Couleur de marque rendue lisible : assombrie pas à pas tant que ni le
 * blanc ni l'encre n'atteignent un contraste de 4,5:1 sur elle.
 */
export function couleurLisible(hex: string): string {
  if (!HEX.test(hex)) return COULEURS_PLATEFORME.bleu;
  let [r, v, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const versHex = () => `#${[r, v, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  for (let i = 0; i < 60; i++) {
    const c = versHex();
    if (rapportContraste(c, couleurTexteSur(c)) >= CONTRASTE_MINIMUM) return i === 0 ? hex : c;
    [r, v, b] = [r, v, b].map((x) => Math.floor(x * 0.93));
  }
  return versHex();
}

/** Variables CSS du thème à la marque (boutons, anneaux de focus, courbes). */
export function variablesTheme(marque: Marque): Record<string, string> {
  const primaire = couleurLisible(marque.couleur);
  const texte = couleurTexteSur(primaire);
  return {
    "--primary": primaire,
    "--primary-foreground": texte,
    "--ring": primaire,
    "--chart-1": primaire,
    "--chart-2": couleurLisible(marque.accent),
    "--accent-marque": couleurLisible(marque.accent),
    "--sidebar-primary": primaire,
    "--sidebar-primary-foreground": texte,
  };
}

export interface LigneMarque {
  display_name: string | null;
  primary_color: string | null;
  logo_path: string | null;
  legal_footer: string | null;
  show_powered_by: boolean | null;
  reply_to_email: string | null;
  sender_name?: string | null;
  accent_color?: string | null;
}

/**
 * Marque d'un partenaire à partir de sa ligne org_branding (ou de rien) et
 * du nom de l'organisation. Couleur invalide ou absente : bleu plateforme.
 */
export function marqueDepuisBranding(
  nomOrganisation: string,
  branding: LigneMarque | null,
): Marque {
  const couleur =
    branding?.primary_color && HEX.test(branding.primary_color)
      ? branding.primary_color
      : COULEURS_PLATEFORME.bleu;
  const logo = branding?.logo_path ?? null;
  const nom = branding?.display_name?.trim() || nomOrganisation;
  return {
    nom,
    couleur: couleurLisible(couleur),
    logoUrl: logo && /^https:\/\//.test(logo) ? logo : null,
    piedDePage: branding?.legal_footer?.trim() || null,
    afficherPropulse: branding?.show_powered_by ?? true,
    repondreA: branding?.reply_to_email?.trim() || null,
    expediteur: branding?.sender_name?.trim() || nom,
    accent:
      branding?.accent_color && HEX.test(branding.accent_color)
        ? branding.accent_color
        : COULEURS_PLATEFORME.turquoise,
  };
}
