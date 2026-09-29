// Saisie de la marque d'un partenaire (pur, testable) : couleurs au format
// #RRGGBB, logo hébergé en https, adresse de réponse valide, textes bornés.
import { CONTRASTE_MINIMUM, couleurLisible, couleurTexteSur, rapportContraste } from "@/lib/marque";

export interface SaisieMarque {
  nomAffiche: string;
  couleur: string;
  accent: string;
  logo: string | null;
  expediteur: string;
  repondreA: string;
  piedDePage: string;
}

const HEX = /^#[0-9a-f]{6}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validerMarque(s: SaisieMarque):
  | {
      ok: true;
      ligne: {
        display_name: string | null;
        primary_color: string | null;
        accent_color: string | null;
        logo_path: string | null;
        sender_name: string | null;
        reply_to_email: string | null;
        legal_footer: string | null;
      };
    }
  | { ok: false; erreur: string } {
  const texte = (v: string, max: number) => v.trim().slice(0, max) || null;
  if (s.couleur && !HEX.test(s.couleur)) return { ok: false, erreur: "Couleur principale : format #RRGGBB attendu." };
  if (s.accent && !HEX.test(s.accent)) return { ok: false, erreur: "Couleur d'accent : format #RRGGBB attendu." };
  if (s.logo && !/^https:\/\/\S+$/.test(s.logo)) return { ok: false, erreur: "Le logo doit être une adresse https." };
  if (s.repondreA.trim() && !EMAIL.test(s.repondreA.trim())) {
    return { ok: false, erreur: "Adresse de réponse invalide." };
  }
  if (/[<>"\r\n]/.test(s.expediteur)) return { ok: false, erreur: "Nom d'expéditeur : caractères non autorisés." };
  return {
    ok: true,
    ligne: {
      display_name: texte(s.nomAffiche, 80),
      primary_color: s.couleur ? s.couleur.toUpperCase() : null,
      accent_color: s.accent ? s.accent.toUpperCase() : null,
      logo_path: s.logo || null,
      sender_name: texte(s.expediteur, 60),
      reply_to_email: texte(s.repondreA, 200),
      legal_footer: texte(s.piedDePage, 300),
    },
  };
}

/** Ce que l'écran affiche sur la lisibilité d'une couleur de marque. */
export function avisContraste(couleur: string): { ok: boolean; contraste: number; appliquee: string } {
  if (!HEX.test(couleur)) return { ok: false, contraste: 0, appliquee: couleurLisible(couleur) };
  const contraste = Math.round(rapportContraste(couleur, couleurTexteSur(couleur)) * 10) / 10;
  return { ok: contraste >= CONTRASTE_MINIMUM, contraste, appliquee: couleurLisible(couleur) };
}
