// Mise en forme française des messages, rapports et pages preuve (pur,
// sans dépendance : copié dans les fonctions Deno). Montants dans la
// monnaie du site ; dates à l'heure locale du site.
import { symboleMonnaie, type Monnaie } from "../moteur-gardien/economies";

export function nombre(n: number, decimales = 1): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: decimales }).format(n);
}

export function montant(valeur: number, monnaie: Monnaie): string {
  const texte = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valeur);
  return `${texte} ${symboleMonnaie(monnaie)}`;
}

/** Montant arrondi à l'unité, pour les grands chiffres. */
export function montantRond(valeur: number, monnaie: Monnaie): string {
  const texte = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(valeur);
  return `${texte} ${symboleMonnaie(monnaie)}`;
}

export function volume(m3: number): string {
  return `${nombre(m3, 2)} m³`;
}

export function dateHeure(instantMs: number, fuseau: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: fuseau,
  }).format(new Date(instantMs));
}

export function heure(instantMs: number, fuseau: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: fuseau,
  }).format(new Date(instantMs));
}

/** « 29 septembre 2026 » à partir d'une date « AAAA-MM-JJ ». */
export function dateLongue(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

/** « septembre 2026 » à partir de « AAAA-MM » ou « AAAA-MM-JJ ». */
export function moisLong(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date.slice(0, 7)}-15T12:00:00Z`));
}

export function pourcentage(p: number): string {
  const signe = p > 0 ? "+" : "";
  return `${signe}${nombre(p, 0)} %`;
}
