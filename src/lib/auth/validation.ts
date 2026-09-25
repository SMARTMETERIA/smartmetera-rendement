// Validation des formulaires de connexion et d'inscription (pure, testable,
// partagée par les formulaires et les Server Actions).

export const LONGUEUR_MIN_MOT_DE_PASSE = 10;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normaliserEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailValide(email: string): boolean {
  return EMAIL.test(normaliserEmail(email)) && email.length <= 254;
}

export function erreurMotDePasse(motDePasse: string): string | null {
  if (motDePasse.length < LONGUEUR_MIN_MOT_DE_PASSE) {
    return `Choisissez un mot de passe d'au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.`;
  }
  if (motDePasse.length > 72) {
    return "Choisissez un mot de passe de 72 caractères au plus.";
  }
  return null;
}

/** Numéro français : 10 chiffres (0X…), ou +33 suivi de 9 chiffres. */
export function normaliserTelephone(telephone: string): string | null {
  const brut = telephone.replace(/[\s.\-()]/g, "");
  if (/^0[1-9]\d{8}$/.test(brut)) return brut;
  if (/^\+33[1-9]\d{8}$/.test(brut)) return `0${brut.slice(3)}`;
  if (/^0033[1-9]\d{8}$/.test(brut)) return `0${brut.slice(4)}`;
  return null;
}

/** SIREN : 9 chiffres avec clé de Luhn valide. */
export function sirenValide(siren: string): boolean {
  if (!/^\d{9}$/.test(siren)) return false;
  let somme = 0;
  for (let i = 0; i < 9; i++) {
    let chiffre = Number(siren[8 - i]);
    if (i % 2 === 1) {
      chiffre *= 2;
      if (chiffre > 9) chiffre -= 9;
    }
    somme += chiffre;
  }
  return somme % 10 === 0;
}

export interface DonneesInscription {
  raisonSociale: string;
  nom: string;
  email: string;
  telephone: string;
  siren: string | null;
  motDePasse: string;
}

export type ResultatValidation<T> =
  | { ok: true; donnees: T }
  | { ok: false; erreurs: Partial<Record<keyof T, string>> };

export function validerInscription(brut: {
  raisonSociale?: string;
  nom?: string;
  email?: string;
  telephone?: string;
  siren?: string;
  motDePasse?: string;
  confirmation?: string;
}): ResultatValidation<DonneesInscription> {
  const erreurs: Partial<Record<keyof DonneesInscription, string>> = {};
  const raisonSociale = (brut.raisonSociale ?? "").trim();
  const nom = (brut.nom ?? "").trim();
  const email = normaliserEmail(brut.email ?? "");
  const telephone = normaliserTelephone(brut.telephone ?? "");
  const siren = (brut.siren ?? "").replace(/\s/g, "");
  const motDePasse = brut.motDePasse ?? "";

  if (raisonSociale.length < 2 || raisonSociale.length > 120) {
    erreurs.raisonSociale = "Indiquez la raison sociale de votre entreprise.";
  }
  if (nom.length < 2 || nom.length > 120) {
    erreurs.nom = "Indiquez votre prénom et votre nom.";
  }
  if (!emailValide(email)) {
    erreurs.email = "Indiquez une adresse e-mail valide.";
  }
  if (!telephone) {
    erreurs.telephone =
      "Indiquez un numéro de téléphone français (10 chiffres).";
  }
  if (siren && !sirenValide(siren)) {
    erreurs.siren =
      "Ce SIREN n'est pas valide (9 chiffres). Laissez vide si vous ne l'avez pas.";
  }
  const erreurMdp = erreurMotDePasse(motDePasse);
  if (erreurMdp) {
    erreurs.motDePasse = erreurMdp;
  } else if (
    brut.confirmation !== undefined &&
    brut.confirmation !== motDePasse
  ) {
    erreurs.motDePasse = "Les deux mots de passe ne sont pas identiques.";
  }

  if (Object.keys(erreurs).length > 0) return { ok: false, erreurs };
  return {
    ok: true,
    donnees: {
      raisonSociale,
      nom,
      email,
      telephone: telephone!,
      siren: siren || null,
      motDePasse,
    },
  };
}
