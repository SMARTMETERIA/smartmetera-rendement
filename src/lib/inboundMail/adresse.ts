export function adresseInbound(domaine: string | null, jeton: string): string {
  return `${jeton}@${domaine || "<domaine-a-configurer>"}`;
}
