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

/** France, Maroc, République démocratique du Congo. */
export type Pays = "FR" | "MA" | "CD";

export const PAYS: readonly Pays[] = ["FR", "MA", "CD"];

/** Pays d'une saisie ou d'une ligne de la base, France par défaut. */
export function paysDe(valeur: unknown): Pays {
  return (PAYS as readonly unknown[]).includes(valeur) ? (valeur as Pays) : "FR";
}

/**
 * Numéro français : 10 chiffres (0X…), ou +33 suivi de 9 chiffres.
 * Numéro marocain : 10 chiffres (05, 06, 07…), ou +212 suivi de 9 chiffres.
 * Numéro congolais (RDC) : 10 chiffres (08…, 09… : mobiles), ou +243 suivi
 * de 9 chiffres.
 * Renvoie le format national à 10 chiffres.
 */
export function normaliserTelephone(
  telephone: string,
  pays: Pays = "FR",
): string | null {
  const brut = telephone.replace(/[\s.\-()]/g, "");
  if (pays === "MA") {
    if (/^0[5-8]\d{8}$/.test(brut)) return brut;
    if (/^\+212[5-8]\d{8}$/.test(brut)) return `0${brut.slice(4)}`;
    if (/^00212[5-8]\d{8}$/.test(brut)) return `0${brut.slice(5)}`;
    return null;
  }
  if (pays === "CD") {
    if (/^0[89]\d{8}$/.test(brut)) return brut;
    if (/^\+243[89]\d{8}$/.test(brut)) return `0${brut.slice(4)}`;
    if (/^00243[89]\d{8}$/.test(brut)) return `0${brut.slice(5)}`;
    return null;
  }
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
  pays: Pays;
  telephone: string;
  /** France seulement. */
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
  pays?: string;
  telephone?: string;
  siren?: string;
  motDePasse?: string;
  confirmation?: string;
}): ResultatValidation<DonneesInscription> {
  const erreurs: Partial<Record<keyof DonneesInscription, string>> = {};
  const raisonSociale = (brut.raisonSociale ?? "").trim();
  const nom = (brut.nom ?? "").trim();
  const email = normaliserEmail(brut.email ?? "");
  const pays: Pays = paysDe(brut.pays);
  const telephone = normaliserTelephone(brut.telephone ?? "", pays);
  // Le SIREN n'existe qu'en France : ignoré ailleurs.
  const siren = pays === "FR" ? (brut.siren ?? "").replace(/\s/g, "") : "";
  const motDePasse = brut.motDePasse ?? "";

  if (
    brut.pays !== undefined &&
    !(PAYS as readonly string[]).includes(brut.pays)
  ) {
    erreurs.pays = "Choisissez la France, le Maroc ou la République démocratique du Congo.";
  }
  if (raisonSociale.length < 2 || raisonSociale.length > 120) {
    erreurs.raisonSociale =
      "Indiquez le nom de votre établissement ou de votre groupe.";
  }
  if (nom.length < 2 || nom.length > 120) {
    erreurs.nom = "Indiquez votre prénom et votre nom.";
  }
  if (!emailValide(email)) {
    erreurs.email = "Indiquez une adresse e-mail valide.";
  }
  if (!telephone) {
    erreurs.telephone =
      pays === "MA"
        ? "Indiquez un numéro de téléphone marocain (10 chiffres, ou +212)."
        : pays === "CD"
          ? "Indiquez un numéro de téléphone congolais (10 chiffres, ou +243)."
          : "Indiquez un numéro de téléphone français (10 chiffres).";
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
      pays,
      telephone: telephone!,
      siren: siren || null,
      motDePasse,
    },
  };
}
