// Export complet d'une organisation (préalable obligatoire à sa
// suppression) : chaque table portant organization_id, ligne par ligne, au
// format NDJSON. La liste est vérifiée par un test contre les migrations.

export interface TableExportee {
  table: string;
  /** Colonnes de tri stable pour la pagination. */
  tri: string[];
  /** Colonne d'appartenance (id pour la table organizations elle-même). */
  colonne: string;
}

export const TABLES_EXPORTEES: TableExportee[] = [
  { table: "organizations", tri: ["id"], colonne: "id" },
  { table: "org_branding", tri: ["organization_id"], colonne: "organization_id" },
  { table: "memberships", tri: ["id"], colonne: "organization_id" },
  { table: "sectors", tri: ["id"], colonne: "organization_id" },
  { table: "sources", tri: ["id"], colonne: "organization_id" },
  { table: "meters", tri: ["id"], colonne: "organization_id" },
  { table: "devices", tri: ["id"], colonne: "organization_id" },
  { table: "raw_frames", tri: ["id"], colonne: "organization_id" },
  { table: "readings", tri: ["ts", "id"], colonne: "organization_id" },
  { table: "import_jobs", tri: ["id"], colonne: "organization_id" },
  { table: "import_templates", tri: ["id"], colonne: "organization_id" },
  { table: "inbound_emails", tri: ["id"], colonne: "organization_id" },
  { table: "balance_inputs", tri: ["id"], colonne: "organization_id" },
  { table: "balances", tri: ["id"], colonne: "organization_id" },
  { table: "bilans_calcules", tri: ["id"], colonne: "organization_id" },
  { table: "daily_meter_volumes", tri: ["id"], colonne: "organization_id" },
  { table: "sector_hourly_flows", tri: ["id"], colonne: "organization_id" },
  { table: "nightlines", tri: ["id"], colonne: "organization_id" },
  { table: "alerts", tri: ["id"], colonne: "organization_id" },
  { table: "interventions", tri: ["id"], colonne: "organization_id" },
  { table: "action_plans", tri: ["id"], colonne: "organization_id" },
  { table: "actions", tri: ["id"], colonne: "organization_id" },
  { table: "catalogue_actions_types", tri: ["id"], colonne: "organization_id" },
  { table: "reports", tri: ["id"], colonne: "organization_id" },
  { table: "rapport_destinataires", tri: ["id"], colonne: "organization_id" },
  { table: "digest_hebdo_envois", tri: ["id"], colonne: "organization_id" },
  { table: "checklist_activation_suivi", tri: ["id"], colonne: "organization_id" },
  { table: "audit_log", tri: ["id"], colonne: "organization_id" },
  { table: "clients", tri: ["id"], colonne: "organization_id" },
  { table: "buildings", tri: ["id"], colonne: "organization_id" },
  { table: "units", tri: ["id"], colonne: "organization_id" },
  { table: "occupants", tri: ["id"], colonne: "organization_id" },
  { table: "occupancies", tri: ["id"], colonne: "organization_id" },
  { table: "monthly_statements", tri: ["id"], colonne: "organization_id" },
  { table: "annual_notes", tri: ["id"], colonne: "organization_id" },
  { table: "deliveries", tri: ["id"], colonne: "organization_id" },
  { table: "delivery_events", tri: ["id"], colonne: "organization_id" },
  { table: "building_balances", tri: ["id"], colonne: "organization_id" },
  { table: "usage_monthly", tri: ["id"], colonne: "organization_id" },
];

export function nomFichierExport(slug: string, maintenant = new Date()): string {
  const jour = maintenant.toISOString().slice(0, 10);
  return `export-${slug}-${jour}.ndjson`;
}
