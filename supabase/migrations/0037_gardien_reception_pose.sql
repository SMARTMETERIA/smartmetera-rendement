-- Gardien de l'eau, phase G3 : réception des capteurs, provisionnement et
-- assistant de pose (voir docs/PLAN_GARDIEN.md, section 4, phase G3).
--
-- 1. Réception par la plateforme : un broker MQTT (kit A) et un serveur
--    LoRaWAN (kit C, sondes) communs à toutes les organisations. Leurs
--    jetons vivent dans platform_settings.reception (superadmin seulement) ;
--    l'appareil, retrouvé par sa référence (IMEI ou DevEUI), désigne
--    l'organisation. Une source « reception_plateforme » par organisation
--    et par canal porte ses relevés (créée à la volée par la réception).
-- 2. Décodeurs : Adeunis PULSE MQTTS (JSON officiel) et « valeur décodée
--    par le serveur réseau » (sondes de température, modèle à choisir).
-- 3. Flotte : pile faible, intervalle d'émission, première donnée.
-- 4. Trames d'appareils inconnus (plateforme) : diagnostic et capture des
--    premières trames réelles, purgées après 30 jours.
-- 5. Sessions de pose (assistant /pose), photos du compteur (stockage
--    privé), fonctions demarrer_pose(), etat_pose(), index_reconstitue().
-- Droits d'exécution dans 0038.

-- ---------------------------------------------------------------------------
-- 1) Sources de la réception plateforme
-- ---------------------------------------------------------------------------
alter table public.sources drop constraint sources_type_check;
alter table public.sources add constraint sources_type_check check (
  type in ('export_csv', 'webhook_lorawan', 'saisie_manuelle', 'api', 'email_entrant', 'reception_plateforme')
);
alter table public.sources drop constraint sources_plateforme_check;
alter table public.sources add constraint sources_plateforme_check check (
  plateforme in ('ttn', 'chirpstack', 'liveobjects', 'generic', 'mqtt')
);
alter table public.sources add constraint sources_reception_plateforme_requiert_plateforme check (
  type <> 'reception_plateforme' or plateforme is not null
);
create unique index sources_reception_plateforme_uniq on public.sources (organization_id, plateforme)
  where type = 'reception_plateforme';

insert into public.platform_settings (key, value, description) values (
  'reception',
  jsonb_build_object(
    'jeton_mqtt', encode(extensions.gen_random_bytes(24), 'hex'),
    'jeton_lorawan', encode(extensions.gen_random_bytes(24), 'hex')
  ),
  'Jetons secrets des points d''entrée de la plateforme : /ingest/mqtt/<jeton_mqtt> (transfert HTTP du broker MQTT, kit A) et /ingest/chirpstack|ttn|generic/<jeton_lorawan> (serveur LoRaWAN de la plateforme). Ne pas diffuser ; régénérer en cas de fuite.'
);

-- ---------------------------------------------------------------------------
-- 2) Décodeurs et état des appareils
-- ---------------------------------------------------------------------------
alter table public.devices drop constraint devices_decodeur_check;
alter table public.devices add constraint devices_decodeur_check check (
  decodeur in (
    'adeunis_pulse_v4', 'watteco_pulse_senso', 'milesight_em300_di', 'dragino_sw3l',
    'adeunis_pulse_mqtt', 'temperature_objet'
  )
);

alter table public.devices
  add column battery_low boolean,
  -- Intervalle d'émission réglé sur l'appareil (heure attendue de la
  -- première donnée dans l'assistant de pose).
  add column transmission_interval_s integer
    check (transmission_interval_s is null or transmission_interval_s between 60 and 604800),
  add column first_data_at timestamptz;

alter table public.raw_frames drop constraint raw_frames_statut_check;
alter table public.raw_frames add constraint raw_frames_statut_check check (
  statut in ('ok', 'doublon', 'appareil_inconnu', 'erreur_decodage', 'non_pose')
);

-- ---------------------------------------------------------------------------
-- 3) Trames d'appareils inconnus (niveau plateforme)
-- ---------------------------------------------------------------------------
create table public.unknown_frames (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  channel text not null check (channel in ('mqtt', 'lorawan')),
  device_ref text,
  payload jsonb not null
);

create index unknown_frames_ref_idx on public.unknown_frames (device_ref, received_at desc);
alter table public.unknown_frames enable row level security;

create policy "lecture_unknown_frames" on public.unknown_frames for select
  using (public.is_platform_admin());

do $$
begin
  perform cron.schedule(
    'unknown-frames-purge',
    '30 3 * * *',
    $cron$delete from public.unknown_frames where received_at < now() - interval '30 days';$cron$
  );
exception when others then
  raise notice 'pg_cron indisponible : purger unknown_frames manuellement.';
end $$;

-- ---------------------------------------------------------------------------
-- 4) Sessions de pose
-- ---------------------------------------------------------------------------
create table public.pose_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  device_id uuid not null,
  meter_id uuid,
  temperature_point_id uuid,
  started_by uuid references auth.users (id) on delete set null,
  started_at timestamptz not null default now(),
  channel text check (channel is null or char_length(channel) <= 4),
  zone text,
  photo_path text,
  displayed_index_m3 numeric(14, 3) check (displayed_index_m3 is null or displayed_index_m3 >= 0),
  pulse_weight_l numeric(10, 3) check (pulse_weight_l is null or pulse_weight_l > 0),
  expected_first_data_at timestamptz,
  status text not null default 'en_cours' check (status in ('en_cours', 'terminee', 'abandonnee')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  check (num_nonnulls(meter_id, temperature_point_id) = 1),
  foreign key (site_id, organization_id) references public.sites (id, organization_id),
  foreign key (device_id, organization_id) references public.devices (id, organization_id),
  foreign key (meter_id, organization_id) references public.meters (id, organization_id),
  foreign key (temperature_point_id, organization_id)
    references public.temperature_points (id, organization_id)
);

create index pose_sessions_org_idx on public.pose_sessions (organization_id, started_at desc);
create index pose_sessions_site_idx on public.pose_sessions (site_id, organization_id);
create index pose_sessions_device_idx on public.pose_sessions (device_id, organization_id);
create index pose_sessions_meter_idx on public.pose_sessions (meter_id, organization_id) where meter_id is not null;
create index pose_sessions_point_idx on public.pose_sessions (temperature_point_id, organization_id)
  where temperature_point_id is not null;
create index pose_sessions_started_by_idx on public.pose_sessions (started_by) where started_by is not null;
alter table public.pose_sessions enable row level security;

create trigger pose_sessions_set_updated_at
  before update on public.pose_sessions
  for each row execute function public.set_updated_at();

create policy "lecture_pose_sessions" on public.pose_sessions for select
  using (public.is_member(organization_id) or site_id in (select public.mes_sites()));
-- Écriture : demarrer_pose() seulement.

-- Photos des compteurs : <organisation>/<site>/<fichier>, privées.
insert into storage.buckets (id, name, public)
values ('poses', 'poses', false)
on conflict (id) do nothing;

-- CASE garantit l'ordre d'évaluation : la conversion en uuid ne s'applique
-- jamais aux objets des autres espaces (chemins de forme différente).
create policy "lecture_poses_storage" on storage.objects for select
  using (
    case
      when bucket_id = 'poses'
        and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.can_read_site(((storage.foldername(name))[2])::uuid)
      else false
    end
  );

create policy "ecriture_poses_storage" on storage.objects for insert
  with check (
    case
      when bucket_id = 'poses'
        and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.peut_agir_site(
        ((storage.foldername(name))[2])::uuid,
        array['admin_client', 'agent', 'technicien', 'superadmin']::public.role_utilisateur[],
        array['technicien']::public.role_utilisateur[]
      )
      else false
    end
  );

-- ---------------------------------------------------------------------------
-- 5) Assistant de pose
-- ---------------------------------------------------------------------------

-- Pose d'un capteur : crée (ou reprend) le point de comptage ou le point de
-- température, rattache l'appareil (voie A/B pour un appareil à deux
-- entrées), enregistre la session. Réservé aux admin, agent et technicien
-- (organisation) ou au technicien du site.
create function public.demarrer_pose(
  p_device_id uuid,
  p_site_id uuid,
  p_nature text,
  p_canal text,
  p_zone text,
  p_photo_path text,
  p_index_m3 numeric,
  p_poids_l numeric,
  p_decodeur text,
  p_intervalle_s integer,
  p_type_point text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device public.devices;
  v_site public.sites;
  v_cible public.devices;
  v_meter_id uuid;
  v_point_id uuid;
  v_session_id uuid;
  v_zone text := nullif(trim(coalesce(p_zone, '')), '');
  v_canal text := nullif(upper(trim(coalesce(p_canal, ''))), '');
begin
  if auth.uid() is null then
    raise exception 'Non authentifié.' using errcode = '42501';
  end if;
  select * into v_site from public.sites where id = p_site_id and active;
  if v_site.id is null then
    raise exception 'Site introuvable.' using errcode = '42501';
  end if;
  if not public.peut_agir_site(
    p_site_id,
    array['admin_client', 'agent', 'technicien', 'superadmin']::public.role_utilisateur[],
    array['technicien']::public.role_utilisateur[]
  ) then
    raise exception 'Votre rôle ne permet pas de poser un capteur sur ce site.' using errcode = '42501';
  end if;

  select * into v_device from public.devices where id = p_device_id;
  if v_device.id is null or v_device.organization_id <> v_site.organization_id then
    raise exception 'Capteur introuvable pour ce site.' using errcode = '42501';
  end if;
  if v_device.site_id is not null and v_device.site_id <> p_site_id then
    raise exception 'Ce capteur est attribué à un autre site.';
  end if;
  if v_device.provisioning_status = 'retire' then
    raise exception 'Ce capteur est retiré du service.';
  end if;
  if p_nature not in ('eau', 'temperature') then
    raise exception 'Nature de point inconnue : %', p_nature;
  end if;
  if v_zone is null then
    raise exception 'Indiquez la zone.';
  end if;

  -- Ligne d'appareil de la voie choisie (un Adeunis PULSE a deux entrées).
  if v_device.canal is not distinct from v_canal then
    v_cible := v_device;
  elsif v_device.canal is null and v_device.meter_id is null then
    update public.devices set canal = v_canal where id = v_device.id returning * into v_cible;
  else
    select * into v_cible
    from public.devices
    where device_ref = v_device.device_ref
      and canal is not distinct from v_canal
      and provisioning_status <> 'retire';
    if v_cible.id is null then
      insert into public.devices (
        organization_id, site_id, device_ref, dev_eui, canal, model, kit, transmission,
        sim_ref, qr_code, provisioning_status
      ) values (
        v_device.organization_id, p_site_id, v_device.device_ref, v_device.dev_eui, v_canal,
        v_device.model, v_device.kit, v_device.transmission, v_device.sim_ref, null, 'attribue'
      )
      returning * into v_cible;
    end if;
  end if;

  if p_nature = 'eau' then
    if p_poids_l is null or p_poids_l <= 0 then
      raise exception 'Indiquez le poids d''impulsion (litres par impulsion).';
    end if;
    if p_index_m3 is null or p_index_m3 < 0 then
      raise exception 'Indiquez l''index affiché par le compteur.';
    end if;
    insert into public.meters (
      organization_id, site_id, type, numero_serie, nom, zone, pulse_weight_l,
      install_index_m3, installed_at, device_ref, device_model, transmission, surveillance, actif
    ) values (
      v_site.organization_id, p_site_id, 'point_comptage',
      v_cible.device_ref || coalesce('-' || v_canal, ''), v_zone, v_zone, p_poids_l,
      p_index_m3, now(), v_cible.device_ref, v_cible.model, v_cible.transmission, 'complete', true
    )
    on conflict (organization_id, numero_serie) do update set
      site_id = excluded.site_id,
      nom = excluded.nom,
      zone = excluded.zone,
      pulse_weight_l = excluded.pulse_weight_l,
      install_index_m3 = excluded.install_index_m3,
      installed_at = excluded.installed_at,
      device_model = excluded.device_model,
      transmission = excluded.transmission,
      actif = true
    returning id into v_meter_id;

    update public.devices
    set meter_id = v_meter_id,
        site_id = p_site_id,
        litres_par_impulsion = p_poids_l,
        decodeur = coalesce(p_decodeur, decodeur),
        transmission_interval_s = coalesce(p_intervalle_s, transmission_interval_s),
        dernier_index_impulsions = null,
        dernier_horodatage = null,
        provisioning_status = 'pose',
        actif = true
    where id = v_cible.id;
  else
    if p_type_point not in ('sortie_production', 'retour_boucle', 'point_eloigne') then
      raise exception 'Type de point de température inconnu.';
    end if;
    insert into public.temperature_points (organization_id, site_id, label, type, device_id)
    values (v_site.organization_id, p_site_id, v_zone, p_type_point, v_cible.id)
    returning id into v_point_id;

    update public.devices
    set site_id = p_site_id,
        decodeur = coalesce(p_decodeur, decodeur),
        transmission_interval_s = coalesce(p_intervalle_s, transmission_interval_s),
        provisioning_status = 'pose',
        actif = true
    where id = v_cible.id;
  end if;

  update public.pose_sessions
  set status = 'abandonnee'
  where device_id = v_cible.id and status = 'en_cours';

  insert into public.pose_sessions (
    organization_id, site_id, device_id, meter_id, temperature_point_id, started_by,
    channel, zone, photo_path, displayed_index_m3, pulse_weight_l, expected_first_data_at
  ) values (
    v_site.organization_id, p_site_id, v_cible.id, v_meter_id, v_point_id, auth.uid(),
    v_canal, v_zone, p_photo_path,
    case when p_nature = 'eau' then p_index_m3 end,
    case when p_nature = 'eau' then p_poids_l end,
    case when coalesce(p_intervalle_s, v_cible.transmission_interval_s) is not null
      then now() + make_interval(secs => coalesce(p_intervalle_s, v_cible.transmission_interval_s))
    end
  )
  returning id into v_session_id;

  return v_session_id;
end;
$$;

-- État d'une pose (lu toutes les quelques secondes par l'assistant) :
-- données reçues depuis le début de la pose, montée des impulsions
-- (robinet test), heure attendue de la première donnée.
create function public.etat_pose(p_session_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_session public.pose_sessions;
  v_device public.devices;
  v_premiere timestamptz;
  v_derniere timestamptz;
  v_nb integer;
  v_volume numeric;
  v_premier_ecoulement timestamptz;
  v_temperature numeric;
begin
  select * into v_session from public.pose_sessions where id = p_session_id;
  if v_session.id is null or not public.can_read_site(v_session.site_id) then
    raise exception 'Pose introuvable.' using errcode = '42501';
  end if;
  select * into v_device from public.devices where id = v_session.device_id;

  select min(f.recu_le), max(f.recu_le), count(*)
  into v_premiere, v_derniere, v_nb
  from public.raw_frames f
  join public.devices d on d.id = f.device_id
  where d.device_ref = v_device.device_ref
    and f.recu_le >= v_session.started_at
    and f.statut in ('ok', 'non_pose');

  if v_session.meter_id is not null then
    select coalesce(sum(r.volume_m3), 0), min(r.ts) filter (where r.volume_m3 > 0)
    into v_volume, v_premier_ecoulement
    from public.readings r
    where r.meter_id = v_session.meter_id
      and r.ts >= v_session.started_at;
  else
    select t.value_c into v_temperature
    from public.temperature_readings t
    where t.point_id = v_session.temperature_point_id
      and t.ts >= v_session.started_at
    order by t.ts desc
    limit 1;
  end if;

  return jsonb_build_object(
    'session_id', v_session.id,
    'started_at', v_session.started_at,
    'expected_first_data_at', v_session.expected_first_data_at,
    'nature', case when v_session.meter_id is not null then 'eau' else 'temperature' end,
    'premiere_donnee_at', v_premiere,
    'derniere_donnee_at', v_derniere,
    'nb_trames', v_nb,
    'volume_depuis_pose_m3', v_volume,
    'ecoulement_detecte_at', v_premier_ecoulement,
    'temperature_c', v_temperature,
    'battery_low', v_device.battery_low,
    'battery_pct', v_device.battery_pct,
    'rssi', v_device.rssi,
    'surveillance', (select m.surveillance from public.meters m where m.id = v_session.meter_id)
  );
end;
$$;

-- Index reconstitué d'un point de comptage : index affiché à la pose +
-- volumes mesurés depuis. Sert à vérifier le poids d'impulsion en le
-- comparant à l'index lu sur le compteur quelques jours plus tard.
create function public.index_reconstitue(p_meter_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_meter public.meters;
  v_volume numeric;
begin
  select * into v_meter from public.meters where id = p_meter_id;
  if v_meter.id is null or v_meter.site_id is null or not public.can_read_site(v_meter.site_id) then
    raise exception 'Point de comptage introuvable.' using errcode = '42501';
  end if;
  select coalesce(sum(r.volume_m3), 0) into v_volume
  from public.readings r
  where r.meter_id = p_meter_id
    and r.ts >= coalesce(v_meter.installed_at, '-infinity'::timestamptz)
    and r.quality_flag <> 'manquante';
  return jsonb_build_object(
    'install_index_m3', v_meter.install_index_m3,
    'installed_at', v_meter.installed_at,
    'volume_depuis_pose_m3', v_volume,
    'index_calcule_m3', case when v_meter.install_index_m3 is not null
      then v_meter.install_index_m3 + v_volume end,
    'pulse_weight_l', v_meter.pulse_weight_l
  );
end;
$$;
