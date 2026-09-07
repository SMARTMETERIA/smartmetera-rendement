// Libellés français partagés entre la page /alertes et les e-mails de
// notification (src/lib/notifications/) : une seule source de vérité pour
// éviter que les deux dérivent.
export const LABEL_TYPE_ALERTE: Record<string, string> = {
  fuite_suspectee: "Fuite suspectée",
  depassement_dmn: "Dépassement DMN",
  anomalie_comptage: "Anomalie de comptage",
  import_echec: "Échec d'import",
  compteur_muet: "Compteur muet",
  debit_inverse: "Débit inversé",
  index_anormal: "Index anormal",
};
