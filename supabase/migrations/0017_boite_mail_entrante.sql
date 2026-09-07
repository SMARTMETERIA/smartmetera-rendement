-- Boîte mail entrante : chaque source de type 'email_entrant' a une adresse
-- dédiée (jeton en local-part ou en suffixe "+jeton", voir
-- src/lib/inboundMail/token.ts) et un modèle d'import par défaut (puisque
-- personne n'est là pour choisir un mapping au moment de la réception,
-- contrairement à l'assistant /import). Le fichier reçu (CSV direct, ou
-- XLSX converti en CSV par l'Edge Function `inbound-email`) est déposé dans
-- le même pipeline que l'upload manuel : bucket "imports" + import_jobs +
-- Edge Function `process-import`, sans aucune duplication de la logique de
-- parsing/mapping/deltas.

alter table public.sources
  drop constraint sources_type_check,
  add constraint sources_type_check check (
    type in ('export_csv', 'webhook_lorawan', 'saisie_manuelle', 'api', 'email_entrant')
  ),
  add column default_template_id uuid references public.import_templates (id),
  add column inbound_token text;

create unique index sources_inbound_token_uniq
  on public.sources (inbound_token)
  where inbound_token is not null;

alter table public.sources
  add constraint sources_email_entrant_requiert_modele
  check (
    type <> 'email_entrant'
    or (default_template_id is not null and inbound_token is not null)
  );

-- ---------------------------------------------------------------------------
-- Journal des e-mails entrants : traçabilité complète (expéditeur, pièce
-- jointe, job d'import résultant ou raison de l'échec). Écriture réservée
-- au service_role (Edge Function), lecture seule pour les membres.
-- ---------------------------------------------------------------------------
create table public.inbound_emails (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_id uuid not null references public.sources (id) on delete cascade,
  import_job_id uuid references public.import_jobs (id) on delete set null,
  expediteur text not null,
  objet text,
  piece_jointe_nom text,
  statut text not null
    check (statut in ('traite', 'piece_jointe_manquante', 'format_non_supporte', 'erreur')),
  erreur text,
  recu_le timestamptz not null default now()
);

create index inbound_emails_org_idx on public.inbound_emails (organization_id);
create index inbound_emails_recu_le_idx on public.inbound_emails (recu_le desc);

alter table public.inbound_emails enable row level security;

create policy "lecture_inbound_emails" on public.inbound_emails for select
  using (public.is_member(organization_id));
