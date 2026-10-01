// Messages d'erreur de la base montrés à l'utilisateur : ceux que nos
// fonctions SQL lèvent (« raise exception '…' », en français) sont gardés ;
// les erreurs techniques de Postgres (en anglais : contrainte, règle
// d'accès, syntaxe) sont remplacées par une phrase qui dit quoi faire.

const CODES_DE_NOS_FONCTIONS = new Set(["P0001", "42501", "22023"]);
const FRANCAIS = /[àâçéèêëîïôûùœ]|\b(le|la|les|du|des|un|une|est|pas|au|aux|ou|sur)\b/i;

export function messageBase(
  erreur: { code?: string | null; message?: string | null } | null | undefined,
  generique: string,
): string {
  const message = erreur?.message?.trim();
  if (!message || !CODES_DE_NOS_FONCTIONS.has(erreur?.code ?? "")) return generique;
  // Une règle d'accès refusée (42501) a un message anglais : « new row violates… ».
  if (/row-level security|permission denied|violates|invalid input/i.test(message)) return generique;
  return FRANCAIS.test(message) ? message : generique;
}
