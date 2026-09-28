-- Gardien de l'eau, phase G1 : modèle de données « Sites »
-- (voir docs/PLAN_GARDIEN.md, section 4, phase G1, version 2).
--
-- Hiérarchie : organisation (partenaire, chaîne ou client direct)
-- → clients (facultatif, pour les partenaires) → sites → points de
-- comptage (meters) et points de température.
--
-- Conventions (identiques à 0024) :
-- - Noms de colonnes du plan (en anglais) ; l'existant n'est pas renommé.
-- - Toute référence entre tables métier passe par une clé étrangère
--   composite (id, organization_id) : une ligne ne pointe jamais vers une
--   ligne d'une autre organisation.
-- - RLS activée sur chaque table dès sa création, politiques de base pour
--   les rôles d'organisation ; la phase G2 ajoute directeur de site et
--   technicien.
-- - Les montants économiques (fuites, usage, pages preuve, rapports) ne
--   s'écrivent que par le service_role (moteur, Edge Functions) : aucune
--   politique d'écriture pour les utilisateurs.
-- - Droits d'exécution des fonctions dans 0031.

-- ---------------------------------------------------------------------------
-- 1) Organisations : offre « sites », facturation.
-- ---------------------------------------------------------------------------
alter table public.organizations drop constraint organizations_kind_check;
alter table public.organizations add constraint organizations_kind_check
  check (kind in ('reseau', 'immeuble', 'sites'));

alter table public.organizations
  -- Retenue à la source reprise dans l'export de facturation (Maroc : 10 %
  -- pour une organisation facturée depuis l'étranger, fixé à la création).
  add column withholding_tax_pct numeric(5, 2) not null default 0
    check (withholding_tax_pct between 0 and 100),
  add column founder_discount_pct numeric(5, 2) not null default 0
    check (founder_discount_pct between 0 and 100),
  -- Marque blanche : prix par point facturé au partenaire (null : tarif
  -- standard), dans la monnaie de ses sites.
  add column partner_price_per_point numeric(8, 2)
    check (partner_price_per_point is null or partner_price_per_point >= 0);

-- Les réglages Gardien d'une organisation vivent sous settings.gardien
-- (surcharges des réglages de plateforme ci-dessous), pour ne pas se mêler
-- aux clés de l'offre Immeuble.

-- Champs de plateforme : superadmin seulement (0027), plus la facturation
-- et les tarifs Gardien.
create or replace function public.organizations_proteger_champs_plateforme()
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
    or new.withholding_tax_pct is distinct from old.withholding_tax_pct
    or new.founder_discount_pct is distinct from old.founder_discount_pct
    or new.partner_price_per_point is distinct from old.partner_price_per_point
    or (new.settings -> 'gardien' -> 'tarifs') is distinct from (old.settings -> 'gardien' -> 'tarifs')
  then
    raise exception 'Seul le superadmin peut modifier l''offre, le statut, l''essai, l''activation des envois, l''accord de traitement, l''identifiant d''URL, la facturation ou les tarifs.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Réglages de plateforme (valeurs par défaut du Gardien), modifiables
--    par le superadmin sans nouvelle version du code. Ordre de lecture :
--    plateforme → organizations.settings.gardien → site.
-- ---------------------------------------------------------------------------
create table public.platform_settings (
  key text primary key check (key ~ '^[a-z_]+$'),
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create index platform_settings_updated_by_idx on public.platform_settings (updated_by)
  where updated_by is not null;
alter table public.platform_settings enable row level security;

create trigger platform_settings_set_updated_at
  before update on public.platform_settings
  for each row execute function public.set_updated_at();

-- Tarifs et prix partenaires : lecture superadmin seulement. Le moteur et
-- les écrans lisent les valeurs utiles par des fonctions dédiées.
create policy "lecture_platform_settings" on public.platform_settings for select
  using (public.is_platform_admin());
create policy "ecriture_platform_settings" on public.platform_settings for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

insert into public.platform_settings (key, value, description) values
(
  'tarifs',
  '{
    "EUR": {
      "mise_en_service_point": 349,
      "mise_en_service_premier_point_passerelle": 590,
      "abonnement_premier_point": 19,
      "abonnement_point_supplementaire": 12,
      "sonde_temperature_mois": 9,
      "retenue_source_pct_defaut": 0
    },
    "MAD": {
      "mise_en_service_point": 2500,
      "mise_en_service_premier_point_passerelle": null,
      "abonnement_premier_point": 120,
      "abonnement_point_supplementaire": null,
      "sonde_temperature_mois": null,
      "retenue_source_pct_defaut": 10
    },
    "prix_partenaire_point": {"min": 6, "max": 9},
    "engagement_mois": 24,
    "option_annuelle_mois_offerts": 2
  }'::jsonb,
  'Tarifs HT par défaut (section 1 du plan). null : à paramétrer.'
),
(
  'prix_eau_defaut',
  '{"EUR": 4.89, "MAD": null}'::jsonb,
  'Prix de l''eau par défaut au m³ d''un nouveau site, dans sa monnaie. EUR : moyenne française TTC au 1er janvier 2025. MAD : à renseigner site par site (TODO(RAYAN)).'
),
(
  'seuils',
  '{
    "fuite_nuit": {"debut_h": 2, "fin_h": 5, "marge_pct": 20, "marge_min_lph": 5, "nuits": 2},
    "apprentissage": {"jours_min": 7, "jours_max": 14},
    "debit_continu": {"min_lph": 5, "heures": 24},
    "rupture": {"facteur_max_30j": 3, "min_lph": 500},
    "fermeture": {"min_lph": 2, "heures": 2},
    "capteur_muet": {"cellulaire_h": 36, "lorawan_h": 6},
    "reparation": {"nuits": 2},
    "frequence_min_h": 1
  }'::jsonb,
  'Seuils de détection (phase G4). Surchargés par organizations.settings.gardien.seuils.'
),
(
  'economies',
  '{"delai_decouverte_evite_jours": 30}'::jsonb,
  'Méthode prudente : excès de débit × 24 h × délai de découverte évité × prix du m³.'
),
(
  'temperatures',
  '{
    "seuils_c": {"sortie_production": 55, "retour_boucle": 50, "point_eloigne": null},
    "rappel_analyses_avant_reouverture_jours": null,
    "a_verifier": true
  }'::jsonb,
  'TODO(RAYAN) : vérifier dans les textes les seuils, les fréquences et le délai des analyses avant réouverture. null : à paramétrer.'
),
(
  'alertes',
  '{"escalade_appel_h": 2, "escalade_directeur_h": 12}'::jsonb,
  'Escalade d''une fuite sans prise en charge (phase G5).'
),
(
  'pilotes',
  '{"duree_jours": 30, "resume_jour": 25}'::jsonb,
  'Pilotes : durée par défaut et jour d''envoi du résumé de fin de pilote.'
),
(
  'pages_preuve',
  '{"validite_jours": 90}'::jsonb,
  'Durée de validité d''un lien de page preuve.'
);

-- ---------------------------------------------------------------------------
-- 3) Sites.
-- ---------------------------------------------------------------------------
create table public.sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid,
  name text not null check (char_length(name) between 1 and 160),
  type text not null default 'autre' check (
    type in (
      'hotel', 'camping', 'village_vacances', 'residence_tourisme', 'centre_commercial',
      'salle_sport', 'restaurant', 'laverie', 'autre'
    )
  ),
  address_line1 text,
  address_line2 text,
  postal_code text,
  city text,
  country text not null default 'FR' check (country in ('FR', 'MA')),
  timezone text not null default 'Europe/Paris' check (timezone in ('Europe/Paris', 'Africa/Casablanca')),
  currency text not null default 'EUR' check (currency in ('EUR', 'MAD')),
  -- Dans la monnaie du site. null : à renseigner (aucun montant calculé).
  -- Rempli à la création depuis platform_settings.prix_eau_defaut.
  water_price_per_m3 numeric(8, 3) check (water_price_per_m3 is null or water_price_per_m3 >= 0),
  activity_unit text not null default 'aucune' check (
    activity_unit in ('nuitee', 'emplacement', 'couvert', 'm2', 'aucune')
  ),
  capacity integer check (capacity is null or capacity >= 0),
  -- Taux d'occupation (0 à 1) pour estimer l'indicateur par activité
  -- faute de données saisies.
  occupancy_rate_default numeric(4, 3) check (
    occupancy_rate_default is null or occupancy_rate_default between 0 and 1
  ),
  -- Périodes de fermeture : [{"start": "2026-11-01", "end": "2027-03-31", "label": "Hiver"}]
  -- (dates locales du site, bornes incluses).
  closed_periods jsonb not null default '[]'::jsonb check (jsonb_typeof(closed_periods) = 'array'),
  -- Surcharges de prix facultatives (mêmes clés que platform_settings.tarifs),
  -- modifiables par le superadmin seulement.
  price_overrides jsonb not null default '{}'::jsonb check (jsonb_typeof(price_overrides) = 'object'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (client_id, organization_id)
    references public.clients (id, organization_id) on delete set null (client_id)
);

create index sites_org_idx on public.sites (organization_id, name);
create index sites_client_idx on public.sites (client_id, organization_id) where client_id is not null;
create index sites_type_idx on public.sites (type, country) where active;
alter table public.sites enable row level security;

create trigger sites_set_updated_at
  before update on public.sites
  for each row execute function public.set_updated_at();

create function public.sites_valeurs_par_defaut()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.water_price_per_m3 is null then
    select (s.value ->> new.currency)::numeric into new.water_price_per_m3
    from public.platform_settings s
    where s.key = 'prix_eau_defaut';
  end if;
  if tg_op = 'UPDATE'
    and new.price_overrides is distinct from old.price_overrides
    and auth.uid() is not null
    and not public.is_platform_admin()
  then
    raise exception 'Seul le superadmin peut modifier les prix d''un site.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT'
    and new.price_overrides <> '{}'::jsonb
    and auth.uid() is not null
    and not public.is_platform_admin()
  then
    raise exception 'Seul le superadmin peut modifier les prix d''un site.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger sites_valeurs_par_defaut
  before insert or update on public.sites
  for each row execute function public.sites_valeurs_par_defaut();

create policy "lecture_sites" on public.sites for select
  using (public.is_member(organization_id));
create policy "ecriture_sites" on public.sites for all
  using (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]))
  with check (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]));

-- ---------------------------------------------------------------------------
-- 4) Points de comptage : les compteurs d'un site.
-- ---------------------------------------------------------------------------
alter table public.meters
  add constraint meters_id_org_uniq unique (id, organization_id),
  add column site_id uuid,
  -- Zone desservie : « Général », « Cuisine », « Piscine »…
  add column zone text,
  -- Litres représentés par une impulsion du compteur.
  add column pulse_weight_l numeric(10, 3) check (pulse_weight_l is null or pulse_weight_l > 0),
  -- Index affiché par le compteur à la pose (reconstitution de l'index).
  add column install_index_m3 numeric(14, 3) check (install_index_m3 is null or install_index_m3 >= 0),
  add column installed_at timestamptz,
  add column device_ref text,
  add column device_model text,
  add column transmission text check (transmission in ('lorawan', 'cellulaire', 'import')),
  -- « limitee » : relevés moins qu'horaires (plan, section 3).
  add column surveillance text not null default 'complete' check (surveillance in ('complete', 'limitee')),
  add constraint meters_site_fk foreign key (site_id, organization_id)
    references public.sites (id, organization_id);

alter table public.meters drop constraint meters_type_check;
alter table public.meters add constraint meters_type_check check (
  type in (
    'production', 'import', 'export', 'sectorisation', 'comptage_abonne', 'service',
    'general_immeuble', 'divisionnaire', 'parties_communes',
    'point_comptage'
  )
);

create index meters_site_idx on public.meters (site_id, organization_id) where site_id is not null;

-- ---------------------------------------------------------------------------
-- 5) Appareils : la flotte (stock, attribution, pose, état radio et pile).
--    Une ligne par appareil et par voie (un Adeunis PULSE compte 2 voies).
--    Les appareils Réseau existants deviennent « actifs ».
-- ---------------------------------------------------------------------------
alter table public.devices
  alter column source_id drop not null,
  alter column meter_id drop not null,
  alter column dev_eui drop not null,
  alter column decodeur drop not null,
  add constraint devices_id_org_uniq unique (id, organization_id),
  add column site_id uuid,
  -- DevEUI (LoRaWAN, 16 caractères hexadécimaux) ou IMEI (cellulaire, 15 chiffres).
  add column device_ref text,
  add column model text,
  add column kit text check (kit in ('A', 'C', 'sonde', 'autre')),
  add column transmission text check (transmission in ('lorawan', 'cellulaire', 'import')),
  add column sim_ref text,
  add column battery_pct numeric(5, 2) check (battery_pct is null or battery_pct between 0 and 100),
  add column rssi numeric(6, 1),
  add column snr numeric(5, 1),
  add column last_seen_at timestamptz,
  add column firmware text,
  add column provisioning_status text not null default 'en_stock' check (
    provisioning_status in ('en_stock', 'attribue', 'pose', 'actif', 'retire')
  ),
  -- Code imprimé sur l'étiquette : ouvre l'assistant de pose pré-rempli.
  add column qr_code text check (qr_code is null or qr_code ~ '^[A-Za-z0-9_-]{8,64}$');

update public.devices
set device_ref = dev_eui,
    transmission = 'lorawan',
    provisioning_status = case when actif then 'actif' else 'retire' end;

alter table public.devices
  alter column device_ref set not null,
  add constraint devices_device_ref_format check (device_ref ~ '^([0-9A-F]{16}|[0-9]{15})$'),
  add constraint devices_site_fk foreign key (site_id, organization_id)
    references public.sites (id, organization_id) on delete set null (site_id);

-- Retirer un compteur ou une source ne supprime plus l'appareil (flotte).
alter table public.devices
  drop constraint devices_meter_id_fkey,
  drop constraint devices_source_id_fkey;
alter table public.sources
  add constraint sources_id_org_uniq unique (id, organization_id);
alter table public.devices
  add constraint devices_meter_fk foreign key (meter_id, organization_id)
    references public.meters (id, organization_id) on delete set null (meter_id),
  add constraint devices_source_fk foreign key (source_id, organization_id)
    references public.sources (id, organization_id) on delete set null (source_id);

-- Un appareil physique n'appartient qu'à une organisation à la fois.
create unique index devices_ref_canal_uniq on public.devices (device_ref, coalesce(canal, ''))
  where provisioning_status <> 'retire';
create unique index devices_qr_code_uniq on public.devices (qr_code) where qr_code is not null;
create index devices_site_idx on public.devices (site_id, organization_id) where site_id is not null;
create index devices_org_status_idx on public.devices (organization_id, provisioning_status);
create index devices_last_seen_idx on public.devices (last_seen_at) where provisioning_status in ('pose', 'actif');

-- Cohérence DevEUI / référence : la réception LoRaWAN existante cherche
-- par dev_eui ; les écrans Réseau n'écrivent que dev_eui.
create function public.devices_completer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.device_ref is null and new.dev_eui is not null then
    new.device_ref := new.dev_eui;
  end if;
  if new.dev_eui is null and new.device_ref ~ '^[0-9A-F]{16}$' then
    new.dev_eui := new.device_ref;
  end if;
  -- Appareil créé déjà branché à un compteur et à une source (écrans
  -- Réseau) : il est en service.
  if tg_op = 'INSERT'
    and new.provisioning_status = 'en_stock'
    and new.meter_id is not null
    and new.source_id is not null
  then
    new.provisioning_status := 'actif';
  end if;
  return new;
end;
$$;

create trigger devices_completer
  before insert or update of device_ref, dev_eui on public.devices
  for each row execute function public.devices_completer();

-- ---------------------------------------------------------------------------
-- 6) Points de température (eau chaude sanitaire, suivi légionelles).
-- ---------------------------------------------------------------------------
create table public.temperature_points (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  label text not null check (char_length(label) between 1 and 120),
  type text not null check (type in ('sortie_production', 'retour_boucle', 'point_eloigne')),
  device_id uuid,
  -- null : seuil par défaut du type (platform_settings.temperatures).
  threshold_c numeric(4, 1) check (threshold_c is null or threshold_c between 0 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (site_id, organization_id) references public.sites (id, organization_id),
  foreign key (device_id, organization_id)
    references public.devices (id, organization_id) on delete set null (device_id)
);

create index temperature_points_org_idx on public.temperature_points (organization_id, site_id);
create index temperature_points_site_idx on public.temperature_points (site_id, organization_id);
create index temperature_points_device_idx on public.temperature_points (device_id, organization_id)
  where device_id is not null;
alter table public.temperature_points enable row level security;

create trigger temperature_points_set_updated_at
  before update on public.temperature_points
  for each row execute function public.set_updated_at();

create policy "lecture_temperature_points" on public.temperature_points for select
  using (public.is_member(organization_id));
create policy "ecriture_temperature_points" on public.temperature_points for all
  using (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]))
  with check (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]));

-- Relevés de température : UTC, jamais de suppression physique (registre
-- sanitaire) ; une valeur douteuse se marque avec quality_flag.
create table public.temperature_readings (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  point_id uuid not null,
  ts timestamptz not null,
  value_c numeric(5, 2) not null check (value_c between -20 and 120),
  quality_flag text not null default 'valide'
    check (quality_flag in ('valide', 'suspecte', 'manquante', 'corrigee')),
  created_at timestamptz not null default now(),
  unique (point_id, ts),
  foreign key (point_id, organization_id) references public.temperature_points (id, organization_id)
);

create index temperature_readings_org_idx on public.temperature_readings (organization_id, ts desc);
create index temperature_readings_point_idx on public.temperature_readings (point_id, ts desc);
alter table public.temperature_readings enable row level security;

create policy "lecture_temperature_readings" on public.temperature_readings for select
  using (public.is_member(organization_id));
-- Écriture : service_role seulement (réception des sondes).

-- Seule exception à l'interdiction de suppression : la purge complète
-- d'une organisation par le superadmin (voir supprimer_organisation, 0027).
create function public.releves_temperature_sans_suppression()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.purge_organisation_id', true) = old.organization_id::text then
    return old;
  end if;
  raise exception 'Registre des températures : suppression interdite (marquer la qualité à la place).';
end;
$$;

create trigger temperature_readings_sans_suppression
  before delete on public.temperature_readings
  for each row execute function public.releves_temperature_sans_suppression();

-- ---------------------------------------------------------------------------
-- 7) Plages où une consommation de nuit est normale (arrosage, piscine).
--    Heures locales du site ; une plage peut passer minuit (22 h → 6 h).
-- ---------------------------------------------------------------------------
create table public.quiet_windows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  -- null : tous les points du site.
  meter_id uuid,
  label text not null check (char_length(label) between 1 and 120),
  -- Jours ISO (1 = lundi … 7 = dimanche) ; null : tous les jours.
  weekdays smallint[] check (weekdays is null or weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  start_local time not null,
  end_local time not null,
  starts_on date,
  ends_on date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_local <> end_local),
  check (ends_on is null or starts_on is null or ends_on >= starts_on),
  foreign key (site_id, organization_id) references public.sites (id, organization_id) on delete cascade,
  foreign key (meter_id, organization_id) references public.meters (id, organization_id) on delete cascade
);

create index quiet_windows_org_idx on public.quiet_windows (organization_id);
create index quiet_windows_site_idx on public.quiet_windows (site_id, organization_id);
create index quiet_windows_meter_idx on public.quiet_windows (meter_id, organization_id) where meter_id is not null;
alter table public.quiet_windows enable row level security;

create trigger quiet_windows_set_updated_at
  before update on public.quiet_windows
  for each row execute function public.set_updated_at();

create policy "lecture_quiet_windows" on public.quiet_windows for select
  using (public.is_member(organization_id));
create policy "ecriture_quiet_windows" on public.quiet_windows for all
  using (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]))
  with check (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]));

-- ---------------------------------------------------------------------------
-- 8) Données d'activité (nuitées, emplacements occupés, couverts), par jour
--    ou par mois (date = 1er du mois). Unité : sites.activity_unit.
-- ---------------------------------------------------------------------------
create table public.activity_data (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  date date not null,
  period text not null default 'mois' check (period in ('jour', 'mois')),
  quantity numeric(12, 2) not null check (quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, date, period),
  check (period = 'jour' or extract(day from date) = 1),
  foreign key (site_id, organization_id) references public.sites (id, organization_id) on delete cascade
);

create index activity_data_org_idx on public.activity_data (organization_id, date);
create index activity_data_site_idx on public.activity_data (site_id, organization_id);
alter table public.activity_data enable row level security;

create trigger activity_data_set_updated_at
  before update on public.activity_data
  for each row execute function public.set_updated_at();

create policy "lecture_activity_data" on public.activity_data for select
  using (public.is_member(organization_id));
create policy "ecriture_activity_data" on public.activity_data for all
  using (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]))
  with check (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]));

-- ---------------------------------------------------------------------------
-- 9) Fuites : détection, prise en charge, réparation, économies (méthode
--    prudente, texte de méthode enregistré avec le montant).
-- ---------------------------------------------------------------------------
create table public.leak_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  meter_id uuid not null,
  type text not null check (type in ('fuite_nuit', 'debit_continu', 'rupture', 'fuite_fermeture')),
  -- Début estimé de la fuite (première heure anormale), heure UTC.
  started_at timestamptz,
  detected_at timestamptz not null default now(),
  excess_flow_lph numeric(10, 1) not null check (excess_flow_lph >= 0),
  status text not null default 'ouverte' check (
    status in ('ouverte', 'prise_en_compte', 'reparee', 'fausse_alerte')
  ),
  acknowledged_by uuid references auth.users (id) on delete set null,
  acknowledged_at timestamptz,
  repaired_at timestamptz,
  -- Réparation détectée par le moteur ou déclarée par un utilisateur.
  repair_source text check (repair_source in ('automatique', 'utilisateur')),
  closed_by uuid references auth.users (id) on delete set null,
  saved_m3 numeric(12, 3) check (saved_m3 is null or saved_m3 >= 0),
  saved_amount numeric(12, 2) check (saved_amount is null or saved_amount >= 0),
  currency text not null check (currency in ('EUR', 'MAD')),
  method text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  -- Une fausse alerte ne compte jamais dans les économies.
  check (status <> 'fausse_alerte' or (saved_m3 is null and saved_amount is null)),
  foreign key (site_id, organization_id) references public.sites (id, organization_id),
  foreign key (meter_id, organization_id) references public.meters (id, organization_id)
);

create index leak_events_org_idx on public.leak_events (organization_id, detected_at desc);
create index leak_events_site_idx on public.leak_events (site_id, detected_at desc);
create index leak_events_meter_idx on public.leak_events (meter_id, organization_id);
create index leak_events_ouvertes_idx on public.leak_events (site_id, status)
  where status in ('ouverte', 'prise_en_compte');
create index leak_events_acknowledged_by_idx on public.leak_events (acknowledged_by) where acknowledged_by is not null;
create index leak_events_closed_by_idx on public.leak_events (closed_by) where closed_by is not null;
-- Une seule fuite en cours par point et par type.
create unique index leak_events_une_ouverte_uniq on public.leak_events (meter_id, type)
  where status in ('ouverte', 'prise_en_compte');
alter table public.leak_events enable row level security;

create trigger leak_events_set_updated_at
  before update on public.leak_events
  for each row execute function public.set_updated_at();

create policy "lecture_leak_events" on public.leak_events for select
  using (public.is_member(organization_id));
-- Écriture : moteur (service_role) ; prise en charge, réparation déclarée
-- et fausse alerte par des fonctions dédiées (phases G2 et G4).

-- ---------------------------------------------------------------------------
-- 10) Alertes : rattachement au site et types Gardien. Les fuites vivent
--     dans leak_events ; alerts porte les capteurs muets (distincts d'une
--     fuite) et les températures.
-- ---------------------------------------------------------------------------
alter table public.alerts
  add column site_id uuid,
  add constraint alerts_site_fk foreign key (site_id, organization_id)
    references public.sites (id, organization_id) on delete set null (site_id);

alter table public.alerts drop constraint alerts_type_check;
alter table public.alerts add constraint alerts_type_check check (
  type in (
    'fuite_suspectee', 'depassement_dmn', 'anomalie_comptage', 'import_echec',
    'compteur_muet', 'debit_inverse', 'index_anormal',
    'fuite_logement', 'consommation_anormale', 'ecart_immeuble', 'retour_eau', 'alarme_fabricant',
    'temperature_basse', 'rappel_analyses'
  )
);

create index alerts_site_idx on public.alerts (site_id, organization_id) where site_id is not null;

-- ---------------------------------------------------------------------------
-- 11) Pilotes de 30 jours. Conversion automatique uniquement avec un
--     consentement écrit : case cochée, horodatée, avec le nom.
-- ---------------------------------------------------------------------------
create table public.pilots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  started_at timestamptz not null default now(),
  -- null à l'insertion : started_at + platform_settings.pilotes.duree_jours.
  ends_at timestamptz not null,
  status text not null default 'en_cours' check (status in ('en_cours', 'converti', 'retire', 'prolonge')),
  auto_convert_consent boolean not null default false,
  consent_at timestamptz,
  consent_by_name text,
  setup_refund_if_nothing_found boolean not null default false,
  anomalies_found integer not null default 0 check (anomalies_found >= 0),
  next_action text,
  notes text,
  converted_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  check (ends_at > started_at),
  check (
    not auto_convert_consent
    or (consent_at is not null and char_length(coalesce(consent_by_name, '')) >= 2)
  ),
  foreign key (site_id, organization_id) references public.sites (id, organization_id)
);

create index pilots_org_idx on public.pilots (organization_id, status);
create index pilots_site_idx on public.pilots (site_id, organization_id);
create index pilots_ends_idx on public.pilots (ends_at) where status in ('en_cours', 'prolonge');
create index pilots_created_by_idx on public.pilots (created_by) where created_by is not null;
-- Un seul pilote en cours par site.
create unique index pilots_un_en_cours_uniq on public.pilots (site_id)
  where status in ('en_cours', 'prolonge');
alter table public.pilots enable row level security;

create trigger pilots_set_updated_at
  before update on public.pilots
  for each row execute function public.set_updated_at();

create function public.pilots_fin_par_defaut()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ends_at is null then
    new.ends_at := new.started_at + make_interval(days => coalesce((
      select (s.value ->> 'duree_jours')::integer
      from public.platform_settings s
      where s.key = 'pilotes'
    ), 30));
  end if;
  return new;
end;
$$;

create trigger pilots_fin_par_defaut
  before insert on public.pilots
  for each row execute function public.pilots_fin_par_defaut();

create policy "lecture_pilots" on public.pilots for select
  using (public.is_member(organization_id));
-- Création et suivi par le superadmin ; le consentement du client passe
-- par une fonction dédiée (phase G5).
create policy "ecriture_pilots" on public.pilots for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 12) Pages preuve : contenu figé, lisible sans connexion par lien signé
--     non expiré (fonction dédiée en phase G2). Aucune donnée personnelle
--     dans content.
-- ---------------------------------------------------------------------------
create table public.proof_pages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  period_start date not null,
  period_end date not null,
  content jsonb not null,
  -- Jeton aléatoire de 192 bits : seul moyen d'ouvrir la page sans connexion.
  token text not null default encode(extensions.gen_random_bytes(24), 'hex')
    check (token ~ '^[0-9a-f]{48}$'),
  expires_at timestamptz not null default (now() + interval '90 days'),
  views integer not null default 0 check (views >= 0),
  pdf_path text,
  created_at timestamptz not null default now(),
  unique (token),
  check (period_end >= period_start),
  foreign key (site_id, organization_id) references public.sites (id, organization_id)
);

create index proof_pages_org_idx on public.proof_pages (organization_id, created_at desc);
create index proof_pages_site_idx on public.proof_pages (site_id, organization_id);
alter table public.proof_pages enable row level security;

create policy "lecture_proof_pages" on public.proof_pages for select
  using (public.is_member(organization_id));

-- ---------------------------------------------------------------------------
-- 13) Rapports de site (mensuel, première nuit, première semaine, fin de
--     pilote), générés par le service_role.
-- ---------------------------------------------------------------------------
create table public.site_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  -- Mensuel : 1er du mois ; autres : jour de référence (local au site).
  period date not null,
  kind text not null check (kind in ('mensuel', 'premiere_nuit', 'premiere_semaine', 'fin_pilote')),
  content jsonb not null default '{}'::jsonb,
  pdf_path text,
  sent_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  unique (site_id, kind, period),
  foreign key (site_id, organization_id) references public.sites (id, organization_id)
);

create index site_reports_org_idx on public.site_reports (organization_id, created_at desc);
create index site_reports_site_idx on public.site_reports (site_id, organization_id);
alter table public.site_reports enable row level security;

create policy "lecture_site_reports" on public.site_reports for select
  using (public.is_member(organization_id));

-- ---------------------------------------------------------------------------
-- 14) Usage mensuel (facturation manuelle, EUR et MAD).
-- ---------------------------------------------------------------------------
alter table public.usage_monthly
  add column currency text not null default 'EUR' check (currency in ('EUR', 'MAD')),
  add column active_points integer not null default 0 check (active_points >= 0),
  add column setup_points integer not null default 0 check (setup_points >= 0),
  add column temperature_points integer not null default 0 check (temperature_points >= 0),
  add column amount_ht numeric(12, 2) not null default 0 check (amount_ht >= 0),
  add column withholding_tax_amount numeric(12, 2) not null default 0 check (withholding_tax_amount >= 0),
  add column gross_amount numeric(12, 2) not null default 0 check (gross_amount >= 0),
  -- Détail ligne par ligne (mise en service, abonnements, sondes, remise).
  add column details jsonb not null default '{}'::jsonb;

-- Une organisation peut avoir des sites en France et au Maroc.
alter table public.usage_monthly drop constraint usage_monthly_organization_id_period_key;
alter table public.usage_monthly add constraint usage_monthly_org_period_currency_key
  unique (organization_id, period, currency);
