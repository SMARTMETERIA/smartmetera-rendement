-- Gardien de l'eau, phase G11 : autonomie en eau (niveau des réserves)
-- (voir docs/PLAN_GARDIEN.md, section 4, phase G11, lancée sur instruction
-- explicite de Rayan le 2 octobre 2026).
--
-- Une réserve (citerne, bâche, château d'eau) porte un capteur de niveau
-- LoRaWAN (modèle TODO(RAYAN)). Le moteur calcule le volume utile, les
-- heures d'autonomie au rythme de consommation réel, détecte la coupure du
-- réseau public (plus aucune arrivée d'eau sur le compteur d'arrivée alors
-- que les réserves baissent) et prévient à la coupure et avant le niveau
-- bas. Mêmes conventions que 0030 : clés composites, RLS dès la création,
-- relevés jamais supprimés, écritures du moteur par le service_role.
-- Droits d'exécution des fonctions dans 0054.

-- ---------------------------------------------------------------------------
-- 1) Compteur d'arrivée du réseau public, capteur de niveau.
-- ---------------------------------------------------------------------------
alter table public.meters
  -- Compteur général qui mesure l'eau arrivant du réseau public (et
  -- remplissant les réserves) : sert à détecter une coupure.
  add column public_inlet boolean not null default false;

create index meters_arrivee_idx on public.meters (site_id) where public_inlet;

alter table public.devices drop constraint devices_kit_check;
alter table public.devices add constraint devices_kit_check
  check (kit in ('A', 'C', 'sonde', 'niveau', 'autre'));

alter table public.devices drop constraint devices_decodeur_check;
alter table public.devices add constraint devices_decodeur_check check (
  decodeur in (
    'adeunis_pulse_v4', 'watteco_pulse_senso', 'milesight_em300_di', 'dragino_sw3l',
    'adeunis_pulse_mqtt', 'temperature_objet', 'niveau_objet'
  )
);

-- ---------------------------------------------------------------------------
-- 2) Réglages de plateforme. TODO(RAYAN) : valeurs de départ à valider sur
--    le terrain ; modèle du capteur de niveau et champ de son décodeur.
-- ---------------------------------------------------------------------------
insert into public.platform_settings (key, value, description) values
(
  'autonomie',
  '{
    "coupure": {"heures": 2, "arrivee_max_lph": 1, "baisse_min_pct": 2},
    "seuil_bas_pct": 20,
    "alerte_avant_seuil_h": 6,
    "profil_jours": 7,
    "a_verifier": true
  }'::jsonb,
  'Autonomie en eau (phase G11) : coupure = arrivée ≤ arrivee_max_lph pendant « heures » heures alors que les réserves baissent d''au moins baisse_min_pct % du volume utile ; niveau bas par défaut (% du volume utile) ; alerte quand le niveau bas est prévu dans moins de alerte_avant_seuil_h heures pendant une coupure ; jours d''historique du profil de consommation. TODO(RAYAN) : à valider sur le terrain. Surchargé par organizations.settings.gardien.autonomie.'
),
(
  'capteur_niveau',
  '{"champ": "distance", "unite": "mm", "a_verifier": true}'::jsonb,
  'Capteur de niveau LoRaWAN : nom du champ (chemin possible « a.b ») et unité (mm, cm ou m) de la mesure dans l''objet décodé par le serveur réseau (décodeur du fabricant). TODO(RAYAN) : modèle à choisir, champ et unité à confirmer avec sa documentation.'
)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 3) Réserves d'eau.
-- ---------------------------------------------------------------------------
create table public.water_reserves (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  label text not null check (char_length(label) between 1 and 120),
  kind text not null default 'citerne' check (kind in ('citerne', 'bache', 'chateau_eau', 'autre')),
  -- Volume quand la réserve est pleine (au trop-plein).
  capacity_m3 numeric(10, 3) not null check (capacity_m3 > 0 and capacity_m3 <= 100000),
  -- « verticale » : section constante ; « cylindre_horizontal » : cuve couchée.
  shape text not null default 'verticale' check (shape in ('verticale', 'cylindre_horizontal')),
  -- Hauteur d'eau quand la réserve est pleine (diamètre pour une cuve couchée).
  full_height_m numeric(7, 3) not null check (full_height_m > 0 and full_height_m <= 50),
  -- Prise d'eau : sous ce niveau, l'eau n'est pas utilisable.
  outlet_height_m numeric(7, 3) not null default 0 check (outlet_height_m >= 0),
  -- « distance » : capteur au-dessus de l'eau ; « hauteur » : capteur immergé.
  sensor_mounting text not null default 'distance' check (sensor_mounting in ('distance', 'hauteur')),
  sensor_height_m numeric(7, 3) check (sensor_height_m is null or sensor_height_m > 0),
  -- null : niveau bas par défaut (platform_settings.autonomie.seuil_bas_pct).
  low_threshold_pct numeric(5, 2) check (low_threshold_pct is null or low_threshold_pct between 0 and 100),
  device_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  check (outlet_height_m < full_height_m),
  check (sensor_mounting = 'hauteur' or (sensor_height_m is not null and sensor_height_m >= full_height_m)),
  foreign key (site_id, organization_id) references public.sites (id, organization_id),
  foreign key (device_id, organization_id)
    references public.devices (id, organization_id) on delete set null (device_id)
);

create index water_reserves_org_idx on public.water_reserves (organization_id, site_id);
create index water_reserves_site_idx on public.water_reserves (site_id, organization_id);
create index water_reserves_device_idx on public.water_reserves (device_id, organization_id)
  where device_id is not null;
-- Un capteur de niveau ne mesure qu'une réserve active.
create unique index water_reserves_device_uniq on public.water_reserves (device_id)
  where device_id is not null and active;
alter table public.water_reserves enable row level security;

create trigger water_reserves_set_updated_at
  before update on public.water_reserves
  for each row execute function public.set_updated_at();

create function public.mes_reserves()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select r.id
  from public.water_reserves r
  where r.site_id in (select public.mes_sites());
$$;

-- Lecture par l'organisation et par les personnes du site ; écriture par
-- reserve_enregistrer (contrôles et rattachement du capteur).
create policy "lecture_water_reserves" on public.water_reserves for select
  using (public.is_member(organization_id) or site_id in (select public.mes_sites()));

-- Relevés de niveau : UTC, jamais de suppression physique (sauf avec
-- l'organisation entière) ; une valeur douteuse se marque avec quality_flag.
create table public.reserve_levels (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  reserve_id uuid not null,
  ts timestamptz not null,
  -- Valeur du capteur en mètres : distance jusqu'à la surface ou hauteur
  -- d'eau selon water_reserves.sensor_mounting.
  measure_m numeric(9, 4) not null check (measure_m between 0 and 100),
  quality_flag text not null default 'valide'
    check (quality_flag in ('valide', 'suspecte', 'manquante', 'corrigee')),
  created_at timestamptz not null default now(),
  unique (reserve_id, ts),
  foreign key (reserve_id, organization_id) references public.water_reserves (id, organization_id)
);

create index reserve_levels_org_idx on public.reserve_levels (organization_id, ts desc);
create index reserve_levels_reserve_idx on public.reserve_levels (reserve_id, ts desc);
alter table public.reserve_levels enable row level security;

create policy "lecture_reserve_levels" on public.reserve_levels for select
  using (public.is_member(organization_id) or reserve_id in (select public.mes_reserves()));
-- Écriture : service_role seulement (réception des capteurs).

create function public.releves_niveau_sans_suppression()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.purge_organisation_id', true) = old.organization_id::text
    or pg_trigger_depth() > 1
  then
    return old;
  end if;
  raise exception 'Relevés de niveau : suppression interdite (marquer la qualité à la place).';
end;
$$;

create trigger reserve_levels_sans_suppression
  before delete on public.reserve_levels
  for each row execute function public.releves_niveau_sans_suppression();

-- ---------------------------------------------------------------------------
-- 4) Coupures du réseau public, écrites par le moteur.
-- ---------------------------------------------------------------------------
create table public.supply_cuts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  -- Première heure sans arrivée d'eau (UTC).
  started_at timestamptz not null,
  detected_at timestamptz not null default now(),
  -- Retour de l'eau : première heure où elle arrive de nouveau.
  ended_at timestamptz,
  status text not null default 'en_cours' check (status in ('en_cours', 'terminee')),
  -- Plus faible autonomie et plus faible volume utile constatés pendant la coupure.
  min_autonomy_h numeric(8, 1) check (min_autonomy_h is null or min_autonomy_h >= 0),
  min_volume_m3 numeric(12, 3) check (min_volume_m3 is null or min_volume_m3 >= 0),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  check (ended_at is null or ended_at >= started_at),
  check ((status = 'terminee') = (ended_at is not null)),
  foreign key (site_id, organization_id) references public.sites (id, organization_id)
);

create index supply_cuts_org_idx on public.supply_cuts (organization_id, started_at desc);
create index supply_cuts_site_idx on public.supply_cuts (site_id, started_at desc);
create index supply_cuts_site_org_idx on public.supply_cuts (site_id, organization_id);
-- Une seule coupure en cours par site.
create unique index supply_cuts_une_en_cours_uniq on public.supply_cuts (site_id)
  where status = 'en_cours';
alter table public.supply_cuts enable row level security;

create trigger supply_cuts_set_updated_at
  before update on public.supply_cuts
  for each row execute function public.set_updated_at();

create policy "lecture_supply_cuts" on public.supply_cuts for select
  using (public.is_member(organization_id) or site_id in (select public.mes_sites()));

-- ---------------------------------------------------------------------------
-- 5) Alertes : coupure du réseau et niveau bas des réserves.
-- ---------------------------------------------------------------------------
alter table public.alerts drop constraint alerts_type_check;
alter table public.alerts add constraint alerts_type_check check (
  type in (
    'fuite_suspectee', 'depassement_dmn', 'anomalie_comptage', 'import_echec',
    'compteur_muet', 'debit_inverse', 'index_anormal',
    'fuite_logement', 'consommation_anormale', 'ecart_immeuble', 'retour_eau', 'alarme_fabricant',
    'temperature_basse', 'rappel_analyses',
    'coupure_reseau', 'reserve_basse'
  )
);

-- ---------------------------------------------------------------------------
-- 6) Saisie : réserve (avec rattachement du capteur de niveau) et compteurs
--    d'arrivée du réseau public. Administrateur, agent ou technicien de
--    l'organisation, technicien du site.
-- ---------------------------------------------------------------------------
create function public.reserve_enregistrer(
  p_site_id uuid,
  p_reserve_id uuid,
  p_champs jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site public.sites;
  v_avant public.water_reserves;
  v_id uuid;
  v_device uuid := nullif(p_champs ->> 'device_id', '')::uuid;
  v_appareil public.devices;
begin
  select * into v_site from public.sites where id = p_site_id;
  if v_site.id is null
    or not public.peut_agir_site(
      p_site_id,
      array['admin_client', 'agent', 'technicien', 'superadmin']::public.role_utilisateur[],
      array['technicien']::public.role_utilisateur[]
    )
  then
    raise exception 'Votre rôle ne permet pas de régler les réserves de ce site.' using errcode = '42501';
  end if;

  if p_reserve_id is not null then
    select * into v_avant from public.water_reserves where id = p_reserve_id and site_id = p_site_id;
    if v_avant.id is null then
      raise exception 'Réserve introuvable sur ce site.' using errcode = 'P0002';
    end if;
  end if;

  if v_device is not null then
    select * into v_appareil from public.devices
    where id = v_device and organization_id = v_site.organization_id;
    if v_appareil.id is null then
      raise exception 'Capteur introuvable dans votre organisation.' using errcode = 'P0002';
    end if;
    if v_appareil.kit is distinct from 'niveau' then
      raise exception 'Ce capteur n''est pas un capteur de niveau.' using errcode = '22023';
    end if;
    if v_appareil.provisioning_status = 'retire' then
      raise exception 'Ce capteur est retiré du service.' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.water_reserves r
      where r.device_id = v_device and r.active and r.id is distinct from p_reserve_id
    ) then
      raise exception 'Ce capteur mesure déjà une autre réserve.' using errcode = '23505';
    end if;
  end if;

  if p_reserve_id is null then
    insert into public.water_reserves (
      organization_id, site_id, label, kind, capacity_m3, shape, full_height_m, outlet_height_m,
      sensor_mounting, sensor_height_m, low_threshold_pct, device_id
    ) values (
      v_site.organization_id,
      p_site_id,
      trim(p_champs ->> 'label'),
      coalesce(p_champs ->> 'kind', 'citerne'),
      (p_champs ->> 'capacity_m3')::numeric,
      coalesce(p_champs ->> 'shape', 'verticale'),
      (p_champs ->> 'full_height_m')::numeric,
      coalesce((p_champs ->> 'outlet_height_m')::numeric, 0),
      coalesce(p_champs ->> 'sensor_mounting', 'distance'),
      (p_champs ->> 'sensor_height_m')::numeric,
      (p_champs ->> 'low_threshold_pct')::numeric,
      v_device
    )
    returning id into v_id;
  else
    update public.water_reserves set
      label = trim(p_champs ->> 'label'),
      kind = coalesce(p_champs ->> 'kind', kind),
      capacity_m3 = (p_champs ->> 'capacity_m3')::numeric,
      shape = coalesce(p_champs ->> 'shape', shape),
      full_height_m = (p_champs ->> 'full_height_m')::numeric,
      outlet_height_m = coalesce((p_champs ->> 'outlet_height_m')::numeric, 0),
      sensor_mounting = coalesce(p_champs ->> 'sensor_mounting', sensor_mounting),
      sensor_height_m = (p_champs ->> 'sensor_height_m')::numeric,
      low_threshold_pct = (p_champs ->> 'low_threshold_pct')::numeric,
      device_id = v_device
    where id = p_reserve_id
    returning id into v_id;
  end if;

  -- Rattachement du capteur : posé sur ce site, décodé par le serveur réseau.
  if v_device is not null then
    update public.devices set
      site_id = p_site_id,
      decodeur = 'niveau_objet',
      provisioning_status = case
        when provisioning_status in ('en_stock', 'attribue') then 'pose'
        else provisioning_status
      end
    where id = v_device;
  end if;

  insert into public.audit_log (organization_id, user_id, action, entite, entite_id, avant, apres)
  values (
    v_site.organization_id,
    auth.uid(),
    case when p_reserve_id is null then 'creation' else 'modification' end,
    'water_reserves',
    v_id::text,
    case when v_avant.id is null then null else to_jsonb(v_avant) end,
    (select to_jsonb(r) from public.water_reserves r where r.id = v_id)
  );
  return v_id;
end;
$$;

-- Retrait d'une réserve : elle n'est plus suivie, ses relevés sont gardés.
create function public.reserve_retirer(p_reserve_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserve public.water_reserves;
begin
  select * into v_reserve from public.water_reserves where id = p_reserve_id;
  if v_reserve.id is null
    or not public.peut_agir_site(
      v_reserve.site_id,
      array['admin_client', 'agent', 'technicien', 'superadmin']::public.role_utilisateur[],
      array['technicien']::public.role_utilisateur[]
    )
  then
    raise exception 'Votre rôle ne permet pas de régler les réserves de ce site.' using errcode = '42501';
  end if;
  update public.water_reserves set active = false where id = p_reserve_id;
  insert into public.audit_log (organization_id, user_id, action, entite, entite_id, avant)
  values (v_reserve.organization_id, auth.uid(), 'retrait', 'water_reserves', p_reserve_id::text, to_jsonb(v_reserve));
end;
$$;

-- Compteurs d'arrivée du réseau public d'un site (les autres ne le sont plus).
create function public.site_arrivees_reseau(p_site_id uuid, p_meter_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site public.sites;
  v_nombre integer;
begin
  select * into v_site from public.sites where id = p_site_id;
  if v_site.id is null
    or not public.peut_agir_site(
      p_site_id,
      array['admin_client', 'agent', 'technicien', 'superadmin']::public.role_utilisateur[],
      array['technicien']::public.role_utilisateur[]
    )
  then
    raise exception 'Votre rôle ne permet pas de régler les compteurs de ce site.' using errcode = '42501';
  end if;
  update public.meters
  set public_inlet = (id = any(coalesce(p_meter_ids, array[]::uuid[])))
  where site_id = p_site_id and type = 'point_comptage';
  select count(*) into v_nombre from public.meters where site_id = p_site_id and public_inlet;
  insert into public.audit_log (organization_id, user_id, action, entite, entite_id, apres)
  values (v_site.organization_id, auth.uid(), 'modification', 'arrivees_reseau', p_site_id::text,
    jsonb_build_object('compteurs', to_jsonb(coalesce(p_meter_ids, array[]::uuid[]))));
  return v_nombre;
end;
$$;
