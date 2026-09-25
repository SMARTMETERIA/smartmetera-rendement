// Garde-fou d'envoi aux occupants (docs/PLAN_IMMEUBLE.md, section 3) : un
// e-mail part seulement si EMAIL_SENDING_ENABLED=true (production) ET
// organisation « actif » ET envois activés ET accord de traitement signé.

export interface EtatEnvoiOrganisation {
  status: string;
  sending_enabled: boolean;
  dpa_signed_at: string | null;
}

/** Motif de blocage lisible, ou null si l'envoi est autorisé. */
export function motifBlocageEnvoi(
  org: EtatEnvoiOrganisation,
  env: Record<string, string | undefined>,
): string | null {
  if (env.NODE_ENV === "production" && env.EMAIL_SENDING_ENABLED !== "true") {
    return "Envois désactivés sur la plateforme.";
  }
  if (org.status !== "actif") {
    return org.status === "essai"
      ? "Organisation en période d'essai : envois non activés par SmartMetera."
      : "Organisation suspendue.";
  }
  if (!org.dpa_signed_at) {
    return "Accord de traitement des données non signé.";
  }
  if (!org.sending_enabled) {
    return "Envois non activés pour cette organisation.";
  }
  return null;
}
