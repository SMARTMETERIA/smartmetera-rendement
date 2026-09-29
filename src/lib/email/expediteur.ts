// En-tête From des e-mails (pur, sans dépendance) : partagé par l'envoi de
// l'application (envoyer.ts) et par la fonction gardien-envois (copie Deno).

/**
 * Le nom du partenaire devant l'adresse d'envoi vérifiée de la plateforme.
 * L'adresse d'envoi peut déjà contenir un nom
 * (« SmartMeteria <releves@…> ») : on n'en garde que l'adresse.
 */
export function formaterExpediteur(
  fromName: string | undefined,
  resendFrom: string,
): string {
  const adresse = resendFrom.match(/<([^>]+)>/)?.[1] ?? resendFrom.trim();
  if (!fromName) return resendFrom.trim();
  const nomPropre = fromName.replace(/["<>\r\n]/g, "").trim();
  return nomPropre ? `"${nomPropre}" <${adresse}>` : adresse;
}
