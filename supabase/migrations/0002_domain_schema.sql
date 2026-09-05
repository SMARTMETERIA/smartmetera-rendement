-- Modèle métier complet : sectorisation, comptage, relevés, imports, bilan
-- d'eau, débit de nuit, alertes, interventions, plans d'action, rapports,
-- audit. Toutes les tables suivent le gabarit RLS défini en 0001_init.sql.

-- ---------------------------------------------------------------------------
-- Secteurs de sectorisation
-- ---------------------------------------------------------------------------
create table public.sectors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  code text not null,
  nom text not null,
  nb_abonnes integer,
  lineaire_km numeric(10, 2),
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create index sectors_org_idx on public.sectors (organization_id);
alter table public.sectors enable row level security;

create policy "lecture_sectors" on public.sectors for select
  using (public.is_member(organization_id));
create policy "ecriture_sectors" on public.sectors for all
  using (public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]))
  with check (public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]));

-- ---------------------------------------------------------------------------
-- Sources de données (exports CSV, webhooks LoRaWAN, saisie manuelle, API)
-- ---------------------------------------------------------------------------
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  type text not null check (type in ('export_csv', 'webhook_lorawan', 'saisie_manuelle', 'api')),
  nom text not null,
  configuration jsonb not null default '{}'::jsonb,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

create index sources_org_idx on public.sources (organization_id);
alter table public.sources enable row level security;

create policy "lecture_sources" on public.sources for select
  using (public.is_member(organization_id));
create policy "ecriture_sources" on public.sources for all
  using (public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]))
  with check (public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]));

-- ---------------------------------------------------------------------------
-- Compteurs
-- ---------------------------------------------------------------------------
create table public.meters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sector_id uuid references public.sectors (id) on delete set null,
  type text not null check (
    type in ('production', 'import', 'export', 'sectorisation', 'comptage_abonne', 'service')
  ),
  numero_serie text not null,
  nom text not null,
  diametre_mm integer,
  actif boolean not null default true,
  date_pose date,
  created_at timestamptz not null default now(),
  unique (organization_id, numero_serie)
);

create index meters_org_idx on public.meters (organization_id);
create index meters_sector_idx on public.meters (sector_id);
alter table public.meters enable row level security;

create policy "lecture_meters" on public.meters for select
  using (public.is_member(organization_id));
create policy "ecriture_meters" on public.meters for all
  using (public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]))
  with check (public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]));

-- ---------------------------------------------------------------------------
-- Relevés — partitionnés par mois sur ts. Idempotence des imports : unicité
-- (compteur + horodatage + source). Jamais de suppression physique : voir
-- CLAUDE.md, corriger via quality_flag (aucune policy DELETE ci-dessous).
-- ---------------------------------------------------------------------------
create table public.readings (
  id bigint generated always as identity,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  meter_id uuid not null references public.meters (id) on delete cascade,
  source_id uuid not null references public.sources (id),
  ts timestamptz not null,
  -- Volume écoulé pendant l'heure se terminant à ts, en m³ (équivaut
  -- numériquement à un débit m³/h au pas horaire, cf. CLAUDE.md).
  volume_m3 numeric(14, 3) not null,
  quality_flag text not null default 'valide'
    check (quality_flag in ('valide', 'suspecte', 'manquante', 'corrigee')),
  created_at timestamptz not null default now(),
  primary key (meter_id, ts, id)
) partition by range (ts);

create unique index readings_meter_ts_source_uniq on public.readings (meter_id, ts, source_id);
create index readings_org_idx on public.readings (organization_id);

alter table public.readings enable row level security;

create policy "lecture_readings" on public.readings for select
  using (public.is_member(organization_id));
create policy "creation_readings" on public.readings for insert
  with check (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]));
create policy "modification_readings" on public.readings for update
  using (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]))
  with check (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]));

-- Création idempotente d'une partition mensuelle. security definer : seule
-- l'écriture DDL est élevée, la fonction ne fait rien d'autre que créer une
-- table de partition bornée par des dates (pas d'injection possible, %I/%L).
create function public.readings_ensure_partition(p_month date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_name text := format('readings_%s', to_char(v_start, 'YYYY_MM'));
begin
  if not exists (select 1 from pg_class where relname = v_name and relkind = 'r') then
    execute format(
      'create table public.%I partition of public.readings for values from (%L) to (%L)',
      v_name, v_start, v_end
    );
  end if;
end;
$$;

revoke all on function public.readings_ensure_partition(date) from public;
grant execute on function public.readings_ensure_partition(date) to service_role;

-- Planifie la création automatique de la partition du mois suivant, si
-- pg_cron est disponible sur ce projet (non bloquant sinon).
do $$
begin
  begin
    create extension if not exists pg_cron with schema extensions;
    perform cron.schedule(
      'readings-ensure-next-partition',
      '0 0 25 * *',
      $cron$select public.readings_ensure_partition((current_date + interval '1 month')::date);$cron$
    );
  exception when others then
    raise notice 'pg_cron indisponible : planifier readings_ensure_partition() manuellement chaque mois.';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Journaux d'import (traçabilité des exports CSV / webhooks)
-- ---------------------------------------------------------------------------
create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_id uuid references public.sources (id),
  statut text not null default 'en_attente'
    check (statut in ('en_attente', 'en_cours', 'termine', 'echec')),
  nb_lignes_total integer,
  nb_lignes_importees integer,
  nb_lignes_rejetees integer,
  fichier_nom text,
  erreurs jsonb,
  demarre_le timestamptz,
  termine_le timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create index import_jobs_org_idx on public.import_jobs (organization_id);
alter table public.import_jobs enable row level security;

create policy "lecture_import_jobs" on public.import_jobs for select
  using (public.is_member(organization_id));
create policy "ecriture_import_jobs" on public.import_jobs for all
  using (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]))
  with check (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]));

-- ---------------------------------------------------------------------------
-- Bilan d'eau — saisies annuelles (balance_inputs) et résultats calculés
-- (balances). Formules : voir CLAUDE.md et src/lib/rendement.ts (source de
-- vérité commune, dupliquée ici en SQL pour un calcul serveur immédiat).
-- ---------------------------------------------------------------------------
create table public.balance_inputs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  annee integer not null,
  v_produit numeric(14, 3) not null default 0,
  v_importe numeric(14, 3) not null default 0,
  v_exporte numeric(14, 3) not null default 0,
  v_comptabilise numeric(14, 3) not null default 0,
  v_sans_comptage numeric(14, 3) not null default 0,
  v_service numeric(14, 3) not null default 0,
  lineaire_reseau_km numeric(10, 2) not null,
  nb_abonnes integer not null,
  zone_repartition_eaux boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (organization_id, annee)
);

create index balance_inputs_org_idx on public.balance_inputs (organization_id);
alter table public.balance_inputs enable row level security;

create trigger balance_inputs_set_updated_at
  before update on public.balance_inputs
  for each row execute function public.set_updated_at();

create policy "lecture_balance_inputs" on public.balance_inputs for select
  using (public.is_member(organization_id));
create policy "ecriture_balance_inputs" on public.balance_inputs for all
  using (public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]))
  with check (public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]));

create table public.balances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  balance_input_id uuid not null references public.balance_inputs (id) on delete cascade,
  annee integer not null,
  v_mise_en_distribution numeric(14, 3) not null,
  v_consomme_autorise numeric(14, 3) not null,
  pertes numeric(14, 3) not null,
  rendement numeric(6, 4) not null,
  ilp numeric(10, 4) not null,
  ilc numeric(10, 4) not null,
  seuil_reglementaire numeric(6, 4) not null,
  conforme_decret boolean not null,
  calcule_le timestamptz not null default now(),
  unique (organization_id, annee)
);

create index balances_org_idx on public.balances (organization_id);
alter table public.balances enable row level security;

create policy "lecture_balances" on public.balances for select
  using (public.is_member(organization_id));
-- Pas de policy d'écriture directe : balances n'est alimentée que par le
-- trigger recalculer_balance() (security definer, cf. ci-dessous).

create function public.recalculer_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vmd numeric(14, 3);
  v_vca numeric(14, 3);
  v_pertes numeric(14, 3);
  v_rendement numeric(6, 4);
  v_ilp numeric(10, 4);
  v_ilc numeric(10, 4);
  v_terme_fixe numeric(6, 2);
  v_seuil numeric(6, 4);
  v_conforme boolean;
begin
  v_vmd := new.v_produit + new.v_importe - new.v_exporte;
  v_vca := new.v_comptabilise + new.v_sans_comptage + new.v_service;
  v_pertes := v_vmd - v_vca;
  v_rendement := (v_vca + new.v_exporte) / nullif(new.v_produit + new.v_importe, 0);
  v_ilp := v_pertes / nullif(365 * new.lineaire_reseau_km, 0);
  v_ilc := (v_vca + new.v_exporte) / nullif(365 * new.lineaire_reseau_km, 0);
  v_terme_fixe := case when new.zone_repartition_eaux then 70 else 65 end;
  v_seuil := (v_terme_fixe + 0.2 * v_ilc) / 100;
  v_conforme := v_rendement >= 0.85 or v_rendement >= v_seuil;

  insert into public.balances (
    organization_id, balance_input_id, annee,
    v_mise_en_distribution, v_consomme_autorise, pertes,
    rendement, ilp, ilc, seuil_reglementaire, conforme_decret, calcule_le
  ) values (
    new.organization_id, new.id, new.annee,
    v_vmd, v_vca, v_pertes,
    v_rendement, v_ilp, v_ilc, v_seuil, v_conforme, now()
  )
  on conflict (organization_id, annee) do update set
    balance_input_id = excluded.balance_input_id,
    v_mise_en_distribution = excluded.v_mise_en_distribution,
    v_consomme_autorise = excluded.v_consomme_autorise,
    pertes = excluded.pertes,
    rendement = excluded.rendement,
    ilp = excluded.ilp,
    ilc = excluded.ilc,
    seuil_reglementaire = excluded.seuil_reglementaire,
    conforme_decret = excluded.conforme_decret,
    calcule_le = now();

  return new;
end;
$$;

create trigger balance_inputs_recalculer
  after insert or update on public.balance_inputs
  for each row execute function public.recalculer_balance();

-- ---------------------------------------------------------------------------
-- Débit de nuit par secteur (nightlines)
-- ---------------------------------------------------------------------------
create table public.nightlines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sector_id uuid not null references public.sectors (id) on delete cascade,
  nuit_date date not null,
  debit_min_nocturne_m3h numeric(10, 3) not null,
  baseline_m3h numeric(10, 3),
  volume_fuite_estime_m3j numeric(10, 3),
  created_at timestamptz not null default now(),
  unique (organization_id, sector_id, nuit_date)
);

create index nightlines_org_idx on public.nightlines (organization_id);
alter table public.nightlines enable row level security;

create policy "lecture_nightlines" on public.nightlines for select
  using (public.is_member(organization_id));
create policy "ecriture_nightlines" on public.nightlines for all
  using (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]))
  with check (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]));

-- ---------------------------------------------------------------------------
-- Alertes
-- ---------------------------------------------------------------------------
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sector_id uuid references public.sectors (id) on delete set null,
  type text not null check (
    type in ('fuite_suspectee', 'depassement_dmn', 'anomalie_comptage', 'import_echec')
  ),
  statut text not null default 'ouverte'
    check (statut in ('ouverte', 'acquittee', 'resolue', 'ignoree')),
  severite text not null default 'moyenne'
    check (severite in ('faible', 'moyenne', 'haute', 'critique')),
  titre text not null,
  description text,
  declenchee_le timestamptz not null default now(),
  acquittee_le timestamptz,
  acquittee_par uuid references auth.users (id),
  resolue_le timestamptz,
  donnees jsonb,
  created_at timestamptz not null default now()
);

create index alerts_org_idx on public.alerts (organization_id);
alter table public.alerts enable row level security;

create policy "lecture_alerts" on public.alerts for select
  using (public.is_member(organization_id));
create policy "ecriture_alerts" on public.alerts for all
  using (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]))
  with check (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]));

-- ---------------------------------------------------------------------------
-- Interventions terrain
-- ---------------------------------------------------------------------------
create table public.interventions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sector_id uuid references public.sectors (id) on delete set null,
  alert_id uuid references public.alerts (id) on delete set null,
  type text not null check (
    type in ('recherche_fuite', 'reparation', 'releve_manuel', 'maintenance_compteur', 'autre')
  ),
  statut text not null default 'planifiee'
    check (statut in ('planifiee', 'en_cours', 'terminee', 'annulee')),
  assignee_id uuid references auth.users (id),
  planifiee_le timestamptz,
  demarree_le timestamptz,
  terminee_le timestamptz,
  resultat text,
  volume_recupere_m3j numeric(10, 3),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create index interventions_org_idx on public.interventions (organization_id);
alter table public.interventions enable row level security;

create policy "lecture_interventions" on public.interventions for select
  using (public.is_member(organization_id));
create policy "ecriture_interventions" on public.interventions for all
  using (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]))
  with check (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]));

-- ---------------------------------------------------------------------------
-- Plans d'action et actions
-- ---------------------------------------------------------------------------
create table public.action_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  nom text not null,
  description text,
  annee_debut integer,
  annee_fin integer,
  statut text not null default 'actif'
    check (statut in ('brouillon', 'actif', 'termine', 'abandonne')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create index action_plans_org_idx on public.action_plans (organization_id);
alter table public.action_plans enable row level security;

create policy "lecture_action_plans" on public.action_plans for select
  using (public.is_member(organization_id));
create policy "ecriture_action_plans" on public.action_plans for all
  using (public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]))
  with check (public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]));

create table public.actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  action_plan_id uuid not null references public.action_plans (id) on delete cascade,
  sector_id uuid references public.sectors (id) on delete set null,
  titre text not null,
  description text,
  statut text not null default 'a_faire'
    check (statut in ('a_faire', 'en_cours', 'terminee', 'annulee')),
  priorite text not null default 'moyenne'
    check (priorite in ('faible', 'moyenne', 'haute')),
  echeance date,
  cout_estime_eur numeric(12, 2),
  responsable_id uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index actions_org_idx on public.actions (organization_id);
create index actions_plan_idx on public.actions (action_plan_id);
alter table public.actions enable row level security;

create policy "lecture_actions" on public.actions for select
  using (public.is_member(organization_id));
create policy "ecriture_actions" on public.actions for all
  using (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]))
  with check (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]));

-- ---------------------------------------------------------------------------
-- Rapports (RPQS, SISPEA, rapports générés en PDF)
-- ---------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  type text not null check (type in ('rpqs', 'sispea', 'rapport_mensuel', 'rapport_fuites', 'autre')),
  annee integer,
  statut text not null default 'genere' check (statut in ('en_cours', 'genere', 'echec')),
  fichier_path text,
  genere_le timestamptz not null default now(),
  genere_par uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index reports_org_idx on public.reports (organization_id);
alter table public.reports enable row level security;

create policy "lecture_reports" on public.reports for select
  using (public.is_member(organization_id));
create policy "ecriture_reports" on public.reports for all
  using (public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]))
  with check (public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]));

-- ---------------------------------------------------------------------------
-- Journal d'audit — écriture réservée aux triggers security definer / au
-- rôle service_role (Edge Functions), jamais en direct par les clients.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id),
  action text not null,
  entite text not null,
  entite_id text,
  avant jsonb,
  apres jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_org_idx on public.audit_log (organization_id);
alter table public.audit_log enable row level security;

create policy "lecture_audit_log" on public.audit_log for select
  using (
    (organization_id is null and public.is_superadmin())
    or (
      organization_id is not null
      and public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[])
    )
  );
