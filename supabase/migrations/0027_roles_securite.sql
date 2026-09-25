-- Offre Immeuble, phase 2 : rôles, sécurité et connexion autonome
-- (voir docs/PLAN_IMMEUBLE.md, section 4, phase 2).
--
-- 1. Superadmin de plateforme : table platform_admins, is_superadmin()
--    repose désormais dessus (toutes les politiques existantes restent
--    valides). Plus aucune adhésion ne porte le rôle 'superadmin'.
-- 2. Adhésions à portée : 'organisation' (admin_client, agent, lecteur) ou
--    'client' (gestionnaire, un client du partenaire). is_member() et
--    has_role() ne comptent plus que les adhésions à portée organisation :
--    un gestionnaire ne voit jamais les tables de l'organisation entière.
-- 3. Fonctions d'aide des politiques : is_platform_admin(), org_role(),
--    can_read_client(), can_read_building(), peut_voir_organisation(),
--    occupant_units().
-- 4. Occupants : aucun accès direct aux tables ; RPC occupant_home(),
--    occupant_history(), occupant_update_preferences(), filtrées sur la
--    période d'occupation.
-- 5. Champs de plateforme d'une organisation (offre, statut, essai,
--    activation des envois, accord de traitement, slug) : modifiables par
--    le superadmin seulement.
-- 6. Quotas (limitation de débit), recherche de compte par e-mail pour les
--    routes serveur, suppression de compte et d'organisation.
-- 7. Suppression du compte de développement « dev-superadmin ».
--
-- Toutes les nouvelles fonctions : security definer + search_path vide,
-- objets entièrement qualifiés. Droits d'exécution dans 0028.

-- ---------------------------------------------------------------------------
-- 1) Superadmin de plateforme
-- ---------------------------------------------------------------------------
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

create function public.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

-- Aucune politique d'écriture : l'attribution passe par
-- scripts/grant-superadmin.sql, exécuté dans l'éditeur SQL de Supabase.
create policy "lecture_platform_admins" on public.platform_admins for select
  using (user_id = auth.uid() or public.is_platform_admin());

-- Les adhésions superadmin existantes deviennent des superadmins de
-- plateforme (sauf le compte de développement, supprimé plus bas) et
-- gardent un accès admin à leur organisation.
insert into public.platform_admins (user_id)
select distinct m.user_id
from public.memberships m
join auth.users u on u.id = m.user_id
where m.role = 'superadmin'
  and u.email <> 'dev-superadmin@smartmeteria.test'
on conflict do nothing;

update public.memberships set role = 'admin_client' where role = 'superadmin';

create or replace function public.is_superadmin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_platform_admin();
$$;

-- ---------------------------------------------------------------------------
-- 2) Adhésions à portée organisation ou client
-- ---------------------------------------------------------------------------
alter table public.memberships
  add column scope_type text not null default 'organisation'
    check (scope_type in ('organisation', 'client')),
  add column scope_id uuid,
  add constraint memberships_scope_coherent check (
    (scope_type = 'organisation' and scope_id is null and role <> 'gestionnaire')
    or (scope_type = 'client' and scope_id is not null and role = 'gestionnaire')
  ),
  add constraint memberships_pas_superadmin check (role <> 'superadmin'),
  -- Le client doit appartenir à l'organisation de l'adhésion.
  add constraint memberships_scope_client_fk foreign key (scope_id, organization_id)
    references public.clients (id, organization_id) on delete cascade;

-- Un gestionnaire peut suivre plusieurs clients du même partenaire.
alter table public.memberships drop constraint memberships_user_id_organization_id_key;
create unique index memberships_user_org_scope_uniq on public.memberships (
  user_id, organization_id, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
create index memberships_scope_idx on public.memberships (scope_id) where scope_id is not null;

create or replace function public.is_member(p_organization_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_platform_admin() or exists (
    select 1
    from public.memberships
    where user_id = auth.uid()
      and organization_id = p_organization_id
      and scope_type = 'organisation'
  );
$$;

create or replace function public.has_role(p_organization_id uuid, p_roles public.role_utilisateur[])
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_platform_admin() or exists (
    select 1
    from public.memberships
    where user_id = auth.uid()
      and organization_id = p_organization_id
      and scope_type = 'organisation'
      and role = any(p_roles)
  );
$$;

-- ---------------------------------------------------------------------------
-- 3) Fonctions d'aide des politiques
-- ---------------------------------------------------------------------------

-- Rôle de l'utilisateur courant dans une organisation (portée
-- organisation), 'superadmin' pour un superadmin de plateforme, null sinon.
create function public.org_role(p_organization_id uuid)
returns public.role_utilisateur
language sql
security definer
stable
set search_path = ''
as $$
  select case
    when public.is_platform_admin() then 'superadmin'::public.role_utilisateur
    else (
      select role
      from public.memberships
      where user_id = auth.uid()
        and organization_id = p_organization_id
        and scope_type = 'organisation'
      limit 1
    )
  end;
$$;

create function public.can_read_client(p_client_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and (
        public.is_member(c.organization_id)
        or exists (
          select 1 from public.memberships m
          where m.user_id = auth.uid()
            and m.organization_id = c.organization_id
            and m.scope_type = 'client'
            and m.scope_id = c.id
        )
      )
  );
$$;

create function public.can_read_building(p_building_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.buildings b
    where b.id = p_building_id
      and (
        public.is_member(b.organization_id)
        or (
          b.client_id is not null
          and exists (
            select 1 from public.memberships m
            where m.user_id = auth.uid()
              and m.organization_id = b.organization_id
              and m.scope_type = 'client'
              and m.scope_id = b.client_id
          )
        )
      )
  );
$$;

-- Toute personne rattachée à l'organisation (adhésion de n'importe quelle
-- portée, ou occupant) : nom et marque de l'organisation, rien d'autre.
create function public.peut_voir_organisation(p_organization_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.is_platform_admin()
    or exists (
      select 1 from public.memberships
      where user_id = auth.uid() and organization_id = p_organization_id
    )
    or exists (
      select 1 from public.occupants
      where user_id = auth.uid() and organization_id = p_organization_id
    );
$$;

-- Occupations de l'utilisateur courant (toutes dates confondues).
create function public.mes_occupations()
returns table (
  occupancy_id uuid,
  organization_id uuid,
  unit_id uuid,
  occupant_id uuid,
  start_date date,
  end_date date,
  role text
)
language sql
security definer
stable
set search_path = ''
as $$
  select o.id, o.organization_id, o.unit_id, o.occupant_id, o.start_date, o.end_date, o.role
  from public.occupancies o
  join public.occupants oc on oc.id = o.occupant_id
  where auth.uid() is not null
    and oc.user_id = auth.uid();
$$;

-- Logements occupés par l'utilisateur courant à une date (Europe/Paris).
create function public.occupant_units(
  p_at_date date default ((now() at time zone 'Europe/Paris')::date)
)
returns table (
  unit_id uuid,
  occupancy_id uuid,
  organization_id uuid,
  start_date date,
  end_date date
)
language sql
security definer
stable
set search_path = ''
as $$
  select mo.unit_id, mo.occupancy_id, mo.organization_id, mo.start_date, mo.end_date
  from public.mes_occupations() mo
  where mo.start_date <= p_at_date
    and (mo.end_date is null or mo.end_date >= p_at_date);
$$;

-- ---------------------------------------------------------------------------
-- 4) Politiques élargies (gestionnaire, occupant)
-- ---------------------------------------------------------------------------
drop policy "lecture_organizations" on public.organizations;
create policy "lecture_organizations" on public.organizations for select
  using (public.peut_voir_organisation(id));

drop policy "lecture_org_branding" on public.org_branding;
create policy "lecture_org_branding" on public.org_branding for select
  using (public.peut_voir_organisation(organization_id));

drop policy "lecture_clients" on public.clients;
create policy "lecture_clients" on public.clients for select
  using (public.can_read_client(id));

drop policy "lecture_buildings" on public.buildings;
create policy "lecture_buildings" on public.buildings for select
  using (public.can_read_building(id));

-- Le gestionnaire voit les libellés des logements de ses immeubles.
drop policy "lecture_units" on public.units;
create policy "lecture_units" on public.units for select
  using (public.is_member(organization_id) or public.can_read_building(building_id));

drop policy "lecture_building_balances" on public.building_balances;
create policy "lecture_building_balances" on public.building_balances for select
  using (public.can_read_building(building_id));

drop policy "lecture_alerts" on public.alerts;
create policy "lecture_alerts" on public.alerts for select
  using (
    public.is_member(organization_id)
    or (building_id is not null and public.can_read_building(building_id))
  );

drop policy "lecture_annual_notes" on public.annual_notes;
create policy "lecture_annual_notes" on public.annual_notes for select
  using (public.is_member(organization_id) or public.can_read_building(building_id));

-- Occupants, occupations, compteurs, relevés, relevés mensuels, registre :
-- inchangés (is_member). Le gestionnaire n'y a pas accès (minimisation :
-- ni adresses e-mail, ni données individuelles) ; l'occupant passe par les
-- RPC ci-dessous.

-- ---------------------------------------------------------------------------
-- 5) Champs de plateforme d'une organisation : superadmin seulement.
--    Sans ce garde-fou, l'admin d'un partenaire pourrait s'activer
--    lui-même (statut, envois, accord de traitement).
-- ---------------------------------------------------------------------------
create function public.organizations_proteger_champs_plateforme()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.is_platform_admin() then
    return new;
  end if;
  if new.kind is distinct from old.kind
    or new.status is distinct from old.status
    or new.trial_ends_at is distinct from old.trial_ends_at
    or new.sending_enabled is distinct from old.sending_enabled
    or new.dpa_signed_at is distinct from old.dpa_signed_at
    or new.slug is distinct from old.slug
  then
    raise exception 'Seul le superadmin peut modifier l''offre, le statut, l''essai, l''activation des envois, l''accord de traitement ou l''identifiant d''URL.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger organizations_proteger_champs_plateforme
  before update on public.organizations
  for each row execute function public.organizations_proteger_champs_plateforme();

-- ---------------------------------------------------------------------------
-- 6) RPC occupant : jamais de SELECT direct, uniquement ces fonctions,
--    filtrées sur la période d'occupation.
-- ---------------------------------------------------------------------------

-- Rattache les fiches occupant à l'utilisateur connecté dont l'adresse est
-- confirmée (appelée après chaque connexion). Comparaison insensible à la
-- casse explicite : l'opérateur citext n'est pas résolu avec un
-- search_path vide.
create function public.lier_mes_occupations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_nb integer;
begin
  if auth.uid() is null then
    return 0;
  end if;
  select email into v_email
  from auth.users
  where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then
    return 0;
  end if;
  update public.occupants
  set user_id = auth.uid()
  where user_id is null
    and lower(email::text) = lower(v_email);
  get diagnostics v_nb = row_count;
  return v_nb;
end;
$$;

create function public.occupant_home()
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_aujourdhui date := (now() at time zone 'Europe/Paris')::date;
  v_mois date := (date_trunc('month', v_aujourdhui) - interval '1 month')::date;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'dernier_mois', v_mois,
    'logements', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'occupancy_id', mo.occupancy_id,
          'unit_id', mo.unit_id,
          'unit_label', u.label,
          'building_id', b.id,
          'building_name', b.name,
          'city', b.city,
          'organization_id', mo.organization_id,
          'organization_name', coalesce(br.display_name, org.nom),
          'start_date', mo.start_date,
          'end_date', mo.end_date,
          'role', mo.role,
          'consommations', coalesce((
            select jsonb_agg(
              jsonb_build_object('fluid', x.fluid, 'unit', x.measure_unit, 'consumption', x.total, 'days', x.jours)
              order by x.fluid
            )
            from (
              select m.fluid, m.measure_unit, round(sum(d.volume_m3), 3) as total, count(distinct d.jour) as jours
              from public.meters m
              join public.daily_meter_volumes d on d.meter_id = m.id
              where m.unit_id = mo.unit_id
                and d.jour >= greatest(v_mois, mo.start_date)
                and d.jour < (v_mois + interval '1 month')::date
                and (mo.end_date is null or d.jour <= mo.end_date)
              group by m.fluid, m.measure_unit
            ) x
          ), '[]'::jsonb),
          'alertes', coalesce((
            select jsonb_agg(
              jsonb_build_object('type', a.type, 'titre', a.titre, 'statut', a.statut, 'declenchee_le', a.declenchee_le)
              order by a.declenchee_le desc
            )
            from public.alerts a
            where a.unit_id = mo.unit_id
              and a.statut in ('ouverte', 'acquittee')
              and a.type in ('fuite_logement', 'consommation_anormale', 'retour_eau', 'alarme_fabricant')
              and (a.declenchee_le at time zone 'Europe/Paris')::date >= mo.start_date
              and (mo.end_date is null or (a.declenchee_le at time zone 'Europe/Paris')::date <= mo.end_date)
          ), '[]'::jsonb)
        )
        order by b.name, u.label
      )
      from public.mes_occupations() mo
      join public.units u on u.id = mo.unit_id
      join public.buildings b on b.id = u.building_id
      join public.organizations org on org.id = mo.organization_id
      left join public.org_branding br on br.organization_id = mo.organization_id
    ), '[]'::jsonb),
    'preferences', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'organization_id', oc.organization_id,
          'first_name', oc.first_name,
          'last_name', oc.last_name,
          'delivery_channel', oc.delivery_channel,
          'alerts_opt_in', oc.alerts_opt_in
        )
      )
      from public.occupants oc
      where oc.user_id = auth.uid()
    ), '[]'::jsonb)
  );
end;
$$;

-- Historique mensuel d'un logement, par fluide, sur p_mois mois (mois en
-- cours inclus). Seuls les jours compris dans une occupation de
-- l'utilisateur courant sont comptés : rien d'antérieur à l'entrée dans
-- les lieux, rien de postérieur à la sortie.
create function public.occupant_history(p_unit_id uuid, p_mois integer default 13)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_aujourdhui date := (now() at time zone 'Europe/Paris')::date;
  v_fin date := (date_trunc('month', v_aujourdhui) + interval '1 month')::date;
  v_debut date;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.mes_occupations() where unit_id = p_unit_id) then
    raise exception 'Logement introuvable.' using errcode = '42501';
  end if;
  v_debut := (v_fin - make_interval(months => least(greatest(coalesce(p_mois, 13), 1), 36)))::date;

  return jsonb_build_object(
    'unit_id', p_unit_id,
    'mois', coalesce((
      select jsonb_agg(
        jsonb_build_object('period', x.periode, 'fluid', x.fluid, 'unit', x.measure_unit, 'consumption', x.total, 'days', x.jours)
        order by x.periode, x.fluid
      )
      from (
        select
          date_trunc('month', d.jour)::date as periode,
          m.fluid,
          m.measure_unit,
          round(sum(d.volume_m3), 3) as total,
          count(distinct d.jour) as jours
        from public.meters m
        join public.daily_meter_volumes d on d.meter_id = m.id
        where m.unit_id = p_unit_id
          and d.jour >= v_debut
          and d.jour < v_fin
          and exists (
            select 1 from public.mes_occupations() mo
            where mo.unit_id = p_unit_id
              and d.jour >= mo.start_date
              and (mo.end_date is null or d.jour <= mo.end_date)
          )
        group by 1, 2, 3
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

create function public.occupant_update_preferences(
  p_organization_id uuid,
  p_delivery_channel text,
  p_alerts_opt_in boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Non authentifié.' using errcode = '42501';
  end if;
  if p_delivery_channel not in ('email', 'papier') then
    raise exception 'Canal inconnu : %', p_delivery_channel;
  end if;
  update public.occupants
  set delivery_channel = p_delivery_channel,
      alerts_opt_in = p_alerts_opt_in
  where user_id = auth.uid()
    and organization_id = p_organization_id;
  if not found then
    raise exception 'Aucune fiche occupant pour cette organisation.' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) Gestionnaire : statuts d'envoi par logement, sans adresse e-mail.
-- ---------------------------------------------------------------------------
create function public.gestionnaire_envois(p_building_id uuid, p_period date)
returns table (
  unit_label text,
  fluid text,
  statement_status text,
  channel text,
  delivery_status text,
  sent_at timestamptz,
  delivered_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not public.can_read_building(p_building_id) then
    raise exception 'Immeuble introuvable.' using errcode = '42501';
  end if;
  return query
    select u.label, s.fluid, s.status, d.channel, d.status, d.sent_at, d.delivered_at
    from public.monthly_statements s
    join public.units u on u.id = s.unit_id
    left join public.deliveries d on d.statement_id = s.id
    where s.building_id = p_building_id
      and s.period = date_trunc('month', p_period)::date
    order by u.label, s.fluid, d.channel;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) Membres d'une organisation : ajoute la portée (gestionnaire → client).
-- ---------------------------------------------------------------------------
drop function public.membres_organisation(uuid);

create function public.membres_organisation(p_organization_id uuid)
returns table (
  membership_id uuid,
  user_id uuid,
  email text,
  role public.role_utilisateur,
  created_at timestamptz,
  scope_type text,
  scope_id uuid,
  client_name text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_role(p_organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;

  return query
    select m.id, m.user_id, u.email::text, m.role, m.created_at, m.scope_type, m.scope_id, c.name
    from public.memberships m
    join auth.users u on u.id = m.user_id
    left join public.clients c on c.id = m.scope_id
    where m.organization_id = p_organization_id
    order by m.created_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9) Quotas (limitation de débit) pour les routes publiques : inscription,
--    demande de lien de connexion. Appelé par le serveur (service_role).
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  cle text not null,
  fenetre_debut timestamptz not null,
  compteur integer not null default 0,
  primary key (cle, fenetre_debut)
);

create index rate_limits_fenetre_idx on public.rate_limits (fenetre_debut);
alter table public.rate_limits enable row level security;

create policy "lecture_rate_limits" on public.rate_limits for select
  using (public.is_platform_admin());

-- Renvoie true tant que le quota n'est pas dépassé sur la fenêtre courante.
create function public.consommer_quota(p_cle text, p_max integer, p_fenetre_secondes integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_debut timestamptz := to_timestamp(
    floor(extract(epoch from now()) / p_fenetre_secondes) * p_fenetre_secondes
  );
  v_compteur integer;
begin
  insert into public.rate_limits (cle, fenetre_debut, compteur)
  values (p_cle, v_debut, 1)
  on conflict (cle, fenetre_debut) do update
    set compteur = public.rate_limits.compteur + 1
  returning compteur into v_compteur;

  -- Ménage opportuniste des fenêtres expirées.
  if random() < 0.02 then
    delete from public.rate_limits where fenetre_debut < now() - interval '1 day';
  end if;

  return v_compteur <= p_max;
end;
$$;

-- Compte de connexion par adresse (routes serveur : lien de connexion,
-- inscription). Réservé au service_role.
create function public.auth_user_id_par_email(p_email text)
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 10) Suppression de compte et d'organisation
-- ---------------------------------------------------------------------------

-- Un compte supprimé ne doit pas bloquer sur les traces qu'il a laissées
-- (imports, interventions, journal d'audit…) : ces références deviennent
-- null au lieu d'empêcher la suppression.
do $$
declare
  r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and c.confdeltype = 'a'
      and array_length(c.conkey, 1) = 1
      and c.connamespace = 'public'::regnamespace
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format(
      'alter table %s add constraint %I foreign key (%I) references auth.users (id) on delete set null',
      r.tbl, r.conname, r.col
    );
  end loop;
end $$;

-- Organisations dont l'utilisateur courant est le seul admin : il ne peut
-- pas supprimer son compte tant qu'il n'a pas désigné un autre admin.
create function public.organisations_ou_seul_admin()
returns table (organization_id uuid, nom text)
language sql
security definer
stable
set search_path = ''
as $$
  select o.id, o.nom
  from public.memberships m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = auth.uid()
    and m.role = 'admin_client'
    and m.scope_type = 'organisation'
    and not exists (
      select 1 from public.memberships m2
      where m2.organization_id = m.organization_id
        and m2.role = 'admin_client'
        and m2.user_id <> auth.uid()
    );
$$;

-- Trace l'export complet d'une organisation (préalable à sa suppression).
create function public.journaliser_export(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Réservé au superadmin.' using errcode = '42501';
  end if;
  insert into public.audit_log (organization_id, user_id, action, entite, entite_id)
  values (p_organization_id, auth.uid(), 'export', 'organizations', p_organization_id::text);
end;
$$;

-- Supprime une organisation et toutes ses données, y compris le registre
-- des envois (seule exception à l'ajout seul), après un export complet de
-- moins de 24 heures. La trace de la suppression reste dans audit_log.
create function public.supprimer_organisation(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Réservé au superadmin.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.audit_log
    where organization_id = p_organization_id
      and action = 'export'
      and created_at > now() - interval '24 hours'
  ) then
    raise exception 'Exportez d''abord toutes les données de l''organisation (export de moins de 24 heures).';
  end if;

  select to_jsonb(o) into v_org from public.organizations o where o.id = p_organization_id;
  if v_org is null then
    raise exception 'Organisation introuvable.';
  end if;

  perform set_config('app.purge_organisation_id', p_organization_id::text, true);
  delete from public.organizations where id = p_organization_id;

  insert into public.audit_log (organization_id, user_id, action, entite, entite_id, avant)
  values (null, auth.uid(), 'suppression', 'organizations', p_organization_id::text, v_org);
end;
$$;

-- ---------------------------------------------------------------------------
-- 11) Suppression du compte de développement (mot de passe publié dans
--     l'historique Git, voir docs/AUDIT.md). Ses adhésions partent en
--     cascade ; ses traces deviennent anonymes (point 10).
-- ---------------------------------------------------------------------------
delete from auth.users where email = 'dev-superadmin@smartmeteria.test';
