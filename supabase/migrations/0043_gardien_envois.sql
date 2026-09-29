-- Gardien de l'eau, phase G5 : alertes, rapports et moments de vente
-- (voir docs/PLAN_GARDIEN.md, section 4, phase G5).
--
-- 1. Téléphone d'alerte de chaque membre (SMS, appel, WhatsApp), saisi par
--    le membre lui-même (mon_telephone_alerte).
-- 2. Journal des envois (e-mail, SMS, appel, WhatsApp) : une ligne par
--    message et par destinataire, en ajout seul. En développement, tout
--    est seulement journalisé (mode « journal »).
-- 3. Tâches du superadmin : appel de conversion d'un pilote, remboursement
--    et retrait du capteur, rapports non ouverts depuis 2 mois.
-- 4. Suivi d'ouverture des rapports (marquer_rapport_ouvert), sans compter
--    les consultations du superadmin.
-- 5. Planification : gardien-envois toutes les 15 minutes.

-- ---------------------------------------------------------------------------
-- 1) Téléphone d'alerte
-- ---------------------------------------------------------------------------
alter table public.memberships
  add column alert_phone text check (alert_phone is null or alert_phone ~ '^\+[1-9][0-9]{7,14}$');

-- Le membre renseigne son numéro (format international) pour toutes ses
-- adhésions Gardien ; null l'efface.
create function public.mon_telephone_alerte(p_phone text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nb integer;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  if p_phone is not null and p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Numéro invalide : format international attendu (+33…, +212…).' using errcode = '22023';
  end if;
  update public.memberships m
  set alert_phone = p_phone
  from public.organizations o
  where m.user_id = auth.uid()
    and o.id = m.organization_id
    and o.kind = 'sites';
  get diagnostics v_nb = row_count;
  return v_nb;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Journal des envois
-- ---------------------------------------------------------------------------
create table public.envois (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid,
  -- Ce qui a déclenché l'envoi : fuite (leak_events), alerte (alerts),
  -- rapport (site_reports), pilote (pilots), pose (pose_sessions), groupe
  -- (organisation, synthèse mensuelle).
  objet text not null check (objet in ('fuite', 'alerte', 'rapport', 'pilote', 'pose', 'groupe')),
  objet_id uuid not null,
  -- Étape : initial, appel, directeur, premiere_donnee, rapport,
  -- resume, confirmation, mensuel:AAAA-MM…
  etape text not null check (char_length(etape) between 1 and 40),
  canal text not null check (canal in ('email', 'sms', 'appel', 'whatsapp')),
  destinataire text not null check (char_length(destinataire) between 3 and 320),
  user_id uuid references auth.users (id) on delete set null,
  sujet text,
  corps text not null,
  mode text not null check (mode in ('journal', 'redirection', 'reel')),
  statut text not null check (statut in ('journalise', 'envoye', 'echec')),
  fournisseur text,
  fournisseur_id text,
  erreur text,
  created_at timestamptz not null default now(),
  -- Un même message n'est jamais envoyé deux fois au même destinataire.
  unique (objet, objet_id, etape, canal, destinataire),
  foreign key (site_id, organization_id) references public.sites (id, organization_id) on delete cascade
);

create index envois_org_idx on public.envois (organization_id, created_at desc);
create index envois_site_idx on public.envois (site_id, organization_id) where site_id is not null;
create index envois_objet_idx on public.envois (objet, objet_id);
create index envois_user_idx on public.envois (user_id) where user_id is not null;
alter table public.envois enable row level security;

create policy "lecture_envois" on public.envois for select
  using (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]));
-- Écriture : service_role seulement (fonction gardien-envois).

-- Ajout seul, sauf purge complète de l'organisation par le superadmin
-- (même règle que le registre des températures).
create function public.envois_ajout_seul()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and (
    current_setting('app.purge_organisation_id', true) = old.organization_id::text
    or pg_trigger_depth() > 1
  ) then
    return old;
  end if;
  raise exception 'Journal des envois : ajout seul.';
end;
$$;

create trigger envois_ajout_seul
  before update or delete on public.envois
  for each row execute function public.envois_ajout_seul();

-- ---------------------------------------------------------------------------
-- 3) Tâches du superadmin
-- ---------------------------------------------------------------------------
create table public.admin_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid,
  pilot_id uuid,
  kind text not null check (kind in ('appel_conversion', 'remboursement_retrait', 'rapports_non_ouverts')),
  status text not null default 'a_faire' check (status in ('a_faire', 'faite', 'annulee')),
  due_at timestamptz,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by uuid references auth.users (id) on delete set null,
  foreign key (site_id, organization_id) references public.sites (id, organization_id) on delete cascade,
  foreign key (pilot_id, organization_id) references public.pilots (id, organization_id) on delete cascade
);

create index admin_tasks_org_idx on public.admin_tasks (organization_id, created_at desc);
create index admin_tasks_site_idx on public.admin_tasks (site_id, organization_id) where site_id is not null;
create index admin_tasks_pilot_idx on public.admin_tasks (pilot_id, organization_id) where pilot_id is not null;
create index admin_tasks_done_by_idx on public.admin_tasks (done_by) where done_by is not null;
create index admin_tasks_a_faire_idx on public.admin_tasks (status, created_at) where status = 'a_faire';
-- Une tâche par pilote et par nature ; une seule alerte « rapports non
-- ouverts » à faire par organisation.
create unique index admin_tasks_pilote_uniq on public.admin_tasks (kind, pilot_id) where pilot_id is not null;
create unique index admin_tasks_rapports_uniq on public.admin_tasks (organization_id)
  where kind = 'rapports_non_ouverts' and status = 'a_faire';
alter table public.admin_tasks enable row level security;

create policy "lecture_admin_tasks" on public.admin_tasks for select
  using (public.is_platform_admin());
create policy "modification_admin_tasks" on public.admin_tasks for update
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
-- Création : service_role (fonction gardien-envois).

-- ---------------------------------------------------------------------------
-- 4) Ouverture des rapports
-- ---------------------------------------------------------------------------
create function public.marquer_rapport_ouvert(p_report_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.site_reports r
  set opened_at = now()
  where r.id = p_report_id
    and r.opened_at is null
    and auth.uid() is not null
    and not public.is_platform_admin()
    and public.can_read_site(r.site_id);
$$;

-- ---------------------------------------------------------------------------
-- 5) Planification
-- ---------------------------------------------------------------------------
do $$
begin
  perform cron.schedule(
    'gardien-envois',
    '*/15 * * * *',
    $cron$select public.cron_appeler_edge_function('gardien-envois');$cron$
  );
exception when others then
  raise notice 'pg_cron indisponible : appeler gardien-envois manuellement.';
end $$;
