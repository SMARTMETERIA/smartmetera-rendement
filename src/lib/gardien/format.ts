// Mise en forme française (pur, testable) : dates à l'heure locale du
// site, nombres avec espace insécable et virgule décimale.

export function formaterDateHeure(iso: string | null, fuseau: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: fuseau,
  }).format(new Date(iso));
}

export function formaterHeure(iso: string, fuseau: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: fuseau,
  }).format(new Date(iso));
}

/** « aujourd'hui à 14:35 », « demain à 02:00 », sinon la date complète. */
export function formaterEcheance(
  iso: string,
  fuseau: string,
  maintenant = new Date(),
): string {
  const jour = (d: Date) =>
    new Intl.DateTimeFormat("fr-CA", { timeZone: fuseau }).format(d);
  const cible = new Date(iso);
  const demain = new Date(maintenant.getTime() + 86_400_000);
  if (jour(cible) === jour(maintenant))
    return `aujourd'hui à ${formaterHeure(iso, fuseau)}`;
  if (jour(cible) === jour(demain))
    return `demain à ${formaterHeure(iso, fuseau)}`;
  return formaterDateHeure(iso, fuseau);
}

export function formaterNombre(n: number, decimales = 1): string {
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: decimales,
  }).format(n);
}
