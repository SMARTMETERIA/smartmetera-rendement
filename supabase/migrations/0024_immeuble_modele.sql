-- Offre Immeuble, phase 1 : modèle de données (voir docs/PLAN_IMMEUBLE.md).
--
-- Un immeuble est un petit réseau : compteur général = entrée, compteurs
-- des logements = sorties, écart = eau perdue de l'immeuble. Hiérarchie :
-- organisation (partenaire) → clients (syndics, bailleurs, gestionnaires)
-- → immeubles → logements → occupations (occupant + période).
--
-- Conventions propres à cette migration :
-- - Les noms de colonnes suivent le plan (en anglais), l'existant Réseau
--   n'est pas renommé (voir docs/AUDIT.md, section 6).
-- - Toute référence entre tables métier passe par une clé étrangère
--   composite (id, organization_id) : une ligne ne peut jamais pointer vers
--   une ligne d'une autre organisation, même si un utilisateur devine un
--   identifiant. Les "on delete set null (colonne)" (PostgreSQL 15+) ne
--   remettent à null que la colonne de référence, jamais organization_id.
-- - RLS activée sur chaque table dès sa création, avec des politiques de
--   base pour les rôles d'organisation ; la phase 2 les élargit (gestionnaire,
--   occupant) et resserre is_member().
-- - Les révocations d'EXECUTE vivent dans 0025 (même constat qu'en
--   0004/0009/0010/0018/0021/0023).

create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------------------
-- 1) Organisations : offre, statut commercial, garde-fou d'envoi, slug public,
--    réglages Immeuble.
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column kind text not null default 'reseau' check (kind in ('reseau', 'immeuble')),
  add column status text not null default 'actif' check (status in ('essai', 'actif', 'suspendu')),
  add column trial_ends_at timestamptz,
  add column sending_enabled boolean not null default false,
  add column dpa_signed_at timestamptz,
  add column slug text,
  -- Réglages Immeuble. Clés lues par le moteur, les envois et l'interface ;
  -- toute clé absente retombe sur ces valeurs par défaut côté code.
  add column settings jsonb not null default '{
    "water_price_eur_m3": 4.5,
    "alert_thresholds": {
      "night_leak_lph": 3,
      "night_leak_nights": 3,
      "abnormal_factor": 3,
      "abnormal_min_m3_day": 0.5,
      "abnormal_days": 3,
      "silent_days_daily": 7,
      "silent_hours_hourly": 48,
      "building_gap_pct": 10
    },
    "sending_schedule": {
      "generate_day": 1,
      "generate_hour": 6,
      "send_day": 3,
      "send_hour": 9
    },
    "statement_blocks": {
      "comparisons": true,
      "estimate_notice": true,
      "leak_alert": true,
      "tip": true,
      "history_button": true
    }
  }'::jsonb;

-- Identifiant d'URL (/p/[slug]) : minuscules, chiffres et tirets.
create function public.slugifier(p_texte text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(
    lower(translate(
      replace(replace(replace(replace(coalesce(p_texte, ''), 'œ', 'oe'), 'Œ', 'oe'), 'æ', 'ae'), 'Æ', 'ae'),
      'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÝýÿ',
      'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOOooooooUUUUuuuuYyy'
    )),
    '[^a-z0-9]+', '-', 'g'
  ));
$$;

-- Slug libre dérivé d'un nom : suffixe -2, -3… en cas de collision.
-- security definer : l'unicité se vérifie sur toutes les organisations,
-- y compris celles que l'appelant ne voit pas (RLS).
create function public.generer_slug_organisation(p_nom text, p_exclure uuid default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text := left(public.slugifier(p_nom), 48);
  v_slug text;
  v_n integer := 1;
begin
  if v_base = '' then
    v_base := 'organisation';
  end if;
  v_slug := v_base;
  while exists (
    select 1 from public.organizations
    where slug = v_slug and (p_exclure is null or id <> p_exclure)
  ) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;
  return v_slug;
end;
$$;

create function public.organizations_remplir_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := public.generer_slug_organisation(new.nom, new.id);
  end if;
  return new;
end;
$$;

create trigger organizations_remplir_slug
  before insert on public.organizations
  for each row execute function public.organizations_remplir_slug();

update public.organizations
set slug = public.generer_slug_organisation(nom, id)
where slug is null;

alter table public.organizations
  alter column slug set not null,
  add constraint organizations_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  add constraint organizations_slug_uniq unique (slug);

create index organizations_kind_status_idx on public.organizations (kind, status);

-- ---------------------------------------------------------------------------
-- 2) Marque blanche (une ligne par organisation).
-- ---------------------------------------------------------------------------
create table public.org_branding (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  display_name text,
  logo_path text,
  primary_color text check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  sender_name text,
  reply_to_email text,
  support_email text,
  support_phone text,
  legal_footer text,
  -- Mention « Propulsé par SmartMetera » : active par défaut, seul le
  -- superadmin peut la masquer (déclencheur ci-dessous).
  show_powered_by boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.org_branding enable row level security;

create trigger org_branding_set_updated_at
  before update on public.org_branding
  for each row execute function public.set_updated_at();

create function public.org_branding_proteger_mention()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- auth.uid() est null pour service_role (code serveur de confiance).
  if auth.uid() is null or public.is_superadmin() then
    return new;
  end if;
  if tg_op = 'INSERT' and not new.show_powered_by then
    raise exception 'Seul le superadmin peut masquer la mention « Propulsé par SmartMetera ».';
  end if;
  if tg_op = 'UPDATE' and new.show_powered_by is distinct from old.show_powered_by then
    raise exception 'Seul le superadmin peut masquer la mention « Propulsé par SmartMetera ».';
  end if;
  return new;
end;
$$;

create trigger org_branding_proteger_mention
  before insert or update on public.org_branding
  for each row execute function public.org_branding_proteger_mention();

create policy "lecture_org_branding" on public.org_branding for select
  using (public.is_member(organization_id));
create policy "ecriture_org_branding" on public.org_branding for all
  using (public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]))
  with check (public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]));

-- ---------------------------------------------------------------------------
-- 3) Clients du partenaire (syndics, bailleurs, gestionnaires).
-- ---------------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  type text not null default 'autre' check (
    type in ('syndic_pro', 'syndic_benevole', 'bailleur', 'gestionnaire', 'autre')
  ),
  contact_name text,
  email text,
  phone text,
  address text,
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create index clients_org_idx on public.clients (organization_id, name);
create unique index clients_org_external_ref_uniq on public.clients (organization_id, external_ref)
  where external_ref is not null;
alter table public.clients enable row level security;

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

create policy "lecture_clients" on public.clients for select
  using (public.is_member(organization_id));
create policy "ecriture_clients" on public.clients for all
  using (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]))
  with check (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]));

-- ---------------------------------------------------------------------------
-- 4) Immeubles. client_id facultatif : un import crée les immeubles avant
--    que le partenaire les rattache à un client.
-- ---------------------------------------------------------------------------
create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid,
  name text not null,
  address_line1 text,
  address_line2 text,
  postal_code text,
  city text,
  country text not null default 'FR',
  -- null : prix de l'organisation (settings.water_price_eur_m3).
  water_price_eur_m3 numeric(6, 3) check (water_price_eur_m3 is null or water_price_eur_m3 >= 0),
  -- Usage déclaré des parties communes (arrosage, nettoyage…), en m³/mois.
  common_usage_m3_month numeric(10, 3) not null default 0 check (common_usage_m3_month >= 0),
  -- Fluides comptés dans la somme des logements pour le bilan d'immeuble
  -- (eau froide et eau chaude sanitaire : l'eau chaude collective est
  -- produite à partir de l'eau froide passée au compteur général).
  balance_config jsonb not null default '{"fluids": ["eau_froide", "eau_chaude"]}'::jsonb,
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (client_id, organization_id)
    references public.clients (id, organization_id) on delete set null (client_id)
);

create index buildings_org_idx on public.buildings (organization_id, name);
create index buildings_client_idx on public.buildings (client_id, organization_id);
create unique index buildings_org_external_ref_uniq on public.buildings (organization_id, external_ref)
  where external_ref is not null;
alter table public.buildings enable row level security;

create trigger buildings_set_updated_at
  before update on public.buildings
  for each row execute function public.set_updated_at();

create policy "lecture_buildings" on public.buildings for select
  using (public.is_member(organization_id));
create policy "ecriture_buildings" on public.buildings for all
  using (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]))
  with check (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]));

-- ---------------------------------------------------------------------------
-- 5) Logements.
-- ---------------------------------------------------------------------------
create table public.units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  building_id uuid not null,
  label text not null,
  floor text,
  surface_m2 numeric(8, 2) check (surface_m2 is null or surface_m2 > 0),
  external_ref text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (building_id, label),
  foreign key (building_id, organization_id)
    references public.buildings (id, organization_id) on delete cascade
);

create index units_org_idx on public.units (organization_id, building_id);
alter table public.units enable row level security;

create trigger units_set_updated_at
  before update on public.units
  for each row execute function public.set_updated_at();

create policy "lecture_units" on public.units for select
  using (public.is_member(organization_id));
create policy "ecriture_units" on public.units for all
  using (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]))
  with check (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]));

-- ---------------------------------------------------------------------------
-- 6) Occupants et occupations. Un occupant peut occuper plusieurs logements ;
--    un logement peut avoir plusieurs occupants à la fois.
-- ---------------------------------------------------------------------------
create table public.occupants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email extensions.citext,
  first_name text,
  last_name text,
  phone text,
  delivery_channel text not null default 'email' check (delivery_channel in ('email', 'papier')),
  email_status text not null default 'inconnu' check (email_status in ('valide', 'rejete', 'inconnu')),
  alerts_opt_in boolean not null default true,
  -- Lien vers le compte de connexion (créé à la première demande de lien).
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create unique index occupants_org_email_uniq on public.occupants (organization_id, email)
  where email is not null;
create index occupants_user_idx on public.occupants (user_id) where user_id is not null;
alter table public.occupants enable row level security;

create trigger occupants_set_updated_at
  before update on public.occupants
  for each row execute function public.set_updated_at();

create policy "lecture_occupants" on public.occupants for select
  using (public.is_member(organization_id));
create policy "ecriture_occupants" on public.occupants for all
  using (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]))
  with check (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]));

create table public.occupancies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  unit_id uuid not null,
  occupant_id uuid not null,
  role text not null default 'locataire' check (
    role in ('locataire', 'proprietaire_occupant', 'proprietaire_bailleur')
  ),
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  check (end_date is null or end_date >= start_date),
  foreign key (unit_id, organization_id)
    references public.units (id, organization_id) on delete cascade,
  foreign key (occupant_id, organization_id)
    references public.occupants (id, organization_id) on delete cascade
);

create index occupancies_org_unit_idx on public.occupancies (organization_id, unit_id, start_date);
create index occupancies_occupant_idx on public.occupancies (occupant_id, organization_id);
create index occupancies_unit_idx on public.occupancies (unit_id, organization_id);
alter table public.occupancies enable row level security;

create trigger occupancies_set_updated_at
  before update on public.occupancies
  for each row execute function public.set_updated_at();

create policy "lecture_occupancies" on public.occupancies for select
  using (public.is_member(organization_id));
create policy "ecriture_occupancies" on public.occupancies for all
  using (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]))
  with check (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]));

-- ---------------------------------------------------------------------------
-- 7) Compteurs : rattachement immeuble / logement, fluide, unité, rôles
--    Immeuble. Les compteurs Réseau existants restent en eau froide, m³.
-- ---------------------------------------------------------------------------
alter table public.meters
  add column building_id uuid,
  add column unit_id uuid,
  add column fluid text not null default 'eau_froide'
    check (fluid in ('eau_froide', 'eau_chaude', 'chaleur', 'repartiteur', 'froid')),
  add column measure_unit text not null default 'm3'
    check (measure_unit in ('m3', 'kWh', 'MWh', 'unites')),
  add constraint meters_building_fk foreign key (building_id, organization_id)
    references public.buildings (id, organization_id) on delete set null (building_id),
  add constraint meters_unit_fk foreign key (unit_id, organization_id)
    references public.units (id, organization_id) on delete set null (unit_id);

alter table public.meters drop constraint meters_type_check;
alter table public.meters add constraint meters_type_check check (
  type in (
    'production', 'import', 'export', 'sectorisation', 'comptage_abonne', 'service',
    'general_immeuble', 'divisionnaire', 'parties_communes'
  )
);

create index meters_building_idx on public.meters (building_id, organization_id) where building_id is not null;
create index meters_unit_idx on public.meters (unit_id, organization_id) where unit_id is not null;

-- Un compteur de logement est aussi rattaché à l'immeuble du logement
-- (requêtes par immeuble sans jointure) : l'immeuble est déduit du logement.
create function public.meters_deduire_immeuble()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.unit_id is not null then
    select building_id into new.building_id from public.units where id = new.unit_id;
  end if;
  return new;
end;
$$;

create trigger meters_deduire_immeuble
  before insert or update of unit_id, building_id on public.meters
  for each row execute function public.meters_deduire_immeuble();

-- ---------------------------------------------------------------------------
-- 8) Relevés : codes d'alarme fabricant et index brut.
--    index_value (unité du compteur) permet de calculer le delta d'un import
--    à partir du dernier index connu en base, au lieu de perdre le premier
--    intervalle de chaque compteur à chaque fichier (voir docs/AUDIT.md).
-- ---------------------------------------------------------------------------
alter table public.readings
  add column alarm_codes text[],
  add column index_value numeric(16, 3);

alter table public.readings add constraint readings_alarm_codes_check check (
  alarm_codes is null or alarm_codes <@ array[
    'fuite', 'retour_eau', 'fraude_magnetique', 'demontage', 'pile_faible', 'blocage'
  ]::text[]
);

-- ---------------------------------------------------------------------------
-- 9) Alertes : rattachement immeuble / logement et types Immeuble.
-- ---------------------------------------------------------------------------
alter table public.alerts
  add column building_id uuid,
  add column unit_id uuid,
  add constraint alerts_building_fk foreign key (building_id, organization_id)
    references public.buildings (id, organization_id) on delete set null (building_id),
  add constraint alerts_unit_fk foreign key (unit_id, organization_id)
    references public.units (id, organization_id) on delete set null (unit_id);

alter table public.alerts drop constraint alerts_type_check;
alter table public.alerts add constraint alerts_type_check check (
  type in (
    'fuite_suspectee', 'depassement_dmn', 'anomalie_comptage', 'import_echec',
    'compteur_muet', 'debit_inverse', 'index_anormal',
    'fuite_logement', 'consommation_anormale', 'ecart_immeuble', 'retour_eau', 'alarme_fabricant'
  )
);

create index alerts_building_idx on public.alerts (building_id, organization_id) where building_id is not null;
create index alerts_unit_idx on public.alerts (unit_id, organization_id) where unit_id is not null;
create index alerts_org_statut_idx on public.alerts (organization_id, statut, declenchee_le desc);

-- ---------------------------------------------------------------------------
-- 10) Relevés mensuels (un par occupation, mois et fluide).
-- ---------------------------------------------------------------------------
create table public.monthly_statements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  building_id uuid not null,
  unit_id uuid not null,
  occupancy_id uuid not null,
  period date not null check (extract(day from period) = 1),
  fluid text not null check (fluid in ('eau_froide', 'eau_chaude', 'chaleur', 'repartiteur', 'froid')),
  consumption numeric(14, 3),
  previous_month numeric(14, 3),
  same_month_last_year numeric(14, 3),
  building_average numeric(14, 3),
  is_estimated boolean not null default false,
  status text not null default 'brouillon' check (
    status in ('brouillon', 'pret', 'annule', 'bloque', 'envoye')
  ),
  blocked_reason text,
  content jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (occupancy_id, period, fluid),
  foreign key (building_id, organization_id) references public.buildings (id, organization_id),
  foreign key (unit_id, organization_id) references public.units (id, organization_id),
  foreign key (occupancy_id, organization_id) references public.occupancies (id, organization_id)
);

create index monthly_statements_org_period_idx on public.monthly_statements (organization_id, period, status);
create index monthly_statements_building_idx on public.monthly_statements (building_id, period);
create index monthly_statements_unit_idx on public.monthly_statements (unit_id, period);
create index monthly_statements_occupancy_idx on public.monthly_statements (occupancy_id, organization_id);
alter table public.monthly_statements enable row level security;

create trigger monthly_statements_set_updated_at
  before update on public.monthly_statements
  for each row execute function public.set_updated_at();

create policy "lecture_monthly_statements" on public.monthly_statements for select
  using (public.is_member(organization_id));
-- Génération réservée au service_role ; le partenaire peut seulement
-- modifier (annuler) pendant la fenêtre de contrôle.
create policy "modification_monthly_statements" on public.monthly_statements for update
  using (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]))
  with check (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]));

-- ---------------------------------------------------------------------------
-- 11) Notes annuelles (une par occupation et par année).
-- ---------------------------------------------------------------------------
create table public.annual_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  building_id uuid not null,
  unit_id uuid not null,
  occupancy_id uuid not null,
  year integer not null check (year between 2000 and 2100),
  content jsonb not null default '{}'::jsonb,
  pdf_path text,
  generated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (occupancy_id, year),
  foreign key (building_id, organization_id) references public.buildings (id, organization_id),
  foreign key (unit_id, organization_id) references public.units (id, organization_id),
  foreign key (occupancy_id, organization_id) references public.occupancies (id, organization_id)
);

create index annual_notes_org_year_idx on public.annual_notes (organization_id, year);
create index annual_notes_building_idx on public.annual_notes (building_id, year);
create index annual_notes_unit_idx on public.annual_notes (unit_id, organization_id);
create index annual_notes_occupancy_idx on public.annual_notes (occupancy_id, organization_id);
alter table public.annual_notes enable row level security;

create policy "lecture_annual_notes" on public.annual_notes for select
  using (public.is_member(organization_id));

-- ---------------------------------------------------------------------------
-- 12) Registre des envois (preuve de conformité) : ajout seul.
-- ---------------------------------------------------------------------------
create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  building_id uuid not null,
  occupant_id uuid not null,
  statement_id uuid,
  annual_note_id uuid,
  channel text not null check (channel in ('email', 'papier')),
  -- Copie de l'adresse au moment de l'envoi (l'occupant peut en changer).
  to_email text,
  subject text,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  provider_message_id text,
  status text not null default 'en_file' check (
    status in ('en_file', 'envoye', 'delivre', 'rejete', 'plainte', 'papier_genere')
  ),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  status_updated_at timestamptz not null default now(),
  unique (id, organization_id),
  check (num_nonnulls(statement_id, annual_note_id) = 1),
  check (channel = 'papier' or to_email is not null),
  foreign key (building_id, organization_id) references public.buildings (id, organization_id),
  foreign key (occupant_id, organization_id) references public.occupants (id, organization_id),
  foreign key (statement_id, organization_id) references public.monthly_statements (id, organization_id),
  foreign key (annual_note_id, organization_id) references public.annual_notes (id, organization_id)
);

-- Jamais deux envois du même document par le même canal.
create unique index deliveries_statement_channel_uniq on public.deliveries (statement_id, channel)
  where statement_id is not null;
create unique index deliveries_annual_note_channel_uniq on public.deliveries (annual_note_id, channel)
  where annual_note_id is not null;
create unique index deliveries_provider_message_uniq on public.deliveries (provider_message_id)
  where provider_message_id is not null;
create index deliveries_org_created_idx on public.deliveries (organization_id, created_at desc);
create index deliveries_building_idx on public.deliveries (building_id, created_at desc);
create index deliveries_occupant_idx on public.deliveries (occupant_id, organization_id);
alter table public.deliveries enable row level security;

create policy "lecture_deliveries" on public.deliveries for select
  using (public.is_member(organization_id));
-- Aucune politique d'écriture : seul le service_role (Edge Function d'envoi)
-- écrit dans le registre.

create table public.delivery_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  delivery_id uuid not null,
  provider_message_id text,
  type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  foreign key (delivery_id, organization_id) references public.deliveries (id, organization_id)
);

create index delivery_events_delivery_idx on public.delivery_events (delivery_id, received_at);
create index delivery_events_org_idx on public.delivery_events (organization_id, received_at desc);
alter table public.delivery_events enable row level security;

create policy "lecture_delivery_events" on public.delivery_events for select
  using (public.is_member(organization_id));

-- Ajout seul, y compris pour le service_role : les champs de contenu ne
-- changent jamais, provider_message_id ne s'écrit qu'une fois, et aucune
-- ligne ne se supprime. Seule exception : la purge complète d'une
-- organisation par le superadmin (après export), qui positionne
-- app.purge_organisation_id pour la durée de sa transaction.
create function public.registre_envois_ajout_seul()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('app.purge_organisation_id', true) = old.organization_id::text then
      return old;
    end if;
    raise exception 'Registre des envois : suppression interdite (ajout seul).';
  end if;

  if tg_table_name = 'delivery_events' then
    raise exception 'Registre des envois : un événement reçu ne se modifie pas.';
  end if;

  if new.organization_id is distinct from old.organization_id
    or new.building_id is distinct from old.building_id
    or new.occupant_id is distinct from old.occupant_id
    or new.statement_id is distinct from old.statement_id
    or new.annual_note_id is distinct from old.annual_note_id
    or new.channel is distinct from old.channel
    or new.to_email is distinct from old.to_email
    or new.subject is distinct from old.subject
    or new.content_sha256 is distinct from old.content_sha256
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Registre des envois : les champs de contenu ne se modifient pas.';
  end if;

  if old.provider_message_id is not null
    and new.provider_message_id is distinct from old.provider_message_id then
    raise exception 'Registre des envois : l''identifiant du fournisseur ne se modifie pas.';
  end if;

  if new.status is distinct from old.status then
    new.status_updated_at := now();
  end if;
  return new;
end;
$$;

create trigger deliveries_ajout_seul
  before update or delete on public.deliveries
  for each row execute function public.registre_envois_ajout_seul();

create trigger delivery_events_ajout_seul
  before update or delete on public.delivery_events
  for each row execute function public.registre_envois_ajout_seul();

-- ---------------------------------------------------------------------------
-- 13) Bilan d'immeuble par mois et par fluide (calculé par le moteur).
-- ---------------------------------------------------------------------------
create table public.building_balances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  building_id uuid not null,
  period date not null check (extract(day from period) = 1),
  fluid text not null check (fluid in ('eau_froide', 'eau_chaude', 'chaleur', 'repartiteur', 'froid')),
  v_general numeric(14, 3),
  v_units_sum numeric(14, 3),
  v_common_declared numeric(14, 3),
  -- null quand la complétude est inférieure à 90 % (« données insuffisantes »).
  gap_m3 numeric(14, 3),
  gap_pct numeric(7, 2),
  gap_eur numeric(12, 2),
  completeness_pct numeric(5, 2) not null default 0,
  calculated_at timestamptz not null default now(),
  unique (building_id, period, fluid),
  foreign key (building_id, organization_id)
    references public.buildings (id, organization_id) on delete cascade
);

create index building_balances_org_period_idx on public.building_balances (organization_id, period);
alter table public.building_balances enable row level security;

create policy "lecture_building_balances" on public.building_balances for select
  using (public.is_member(organization_id));

-- ---------------------------------------------------------------------------
-- 14) Usage mensuel (facturation manuelle : 0,30 € HT par compteur actif,
--     minimum 99 € HT par mois et par partenaire).
-- ---------------------------------------------------------------------------
create table public.usage_monthly (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  period date not null check (extract(day from period) = 1),
  active_meters integer not null default 0 check (active_meters >= 0),
  amount_eur_ht numeric(10, 2) not null default 0 check (amount_eur_ht >= 0),
  computed_at timestamptz not null default now(),
  unique (organization_id, period)
);

create index usage_monthly_period_idx on public.usage_monthly (period);
alter table public.usage_monthly enable row level security;

create policy "lecture_usage_monthly" on public.usage_monthly for select
  using (public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]));
