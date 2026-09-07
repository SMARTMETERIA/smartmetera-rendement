-- Ingestion LoRaWAN : jeton secret par source webhook, registre d'équipements
-- (DevEUI -> compteur) avec décodeur et facteur d'impulsion, journal des
-- trames brutes (idempotence, traçabilité, jamais de suppression physique).
-- Les Edge Functions supabase/functions/ingest/* consomment ces tables avec
-- la clé service_role (RLS ci-dessous ne s'applique qu'aux utilisateurs de
-- l'app : lecture pour les membres, écriture pour admin_client/superadmin).

-- ---------------------------------------------------------------------------
-- Sources : jeton de webhook + plateforme, pour les sources de type
-- 'webhook_lorawan'. Le jeton est un secret opaque généré côté application
-- (crypto.randomBytes), jamais un mot de passe utilisateur : il compose
-- l'URL de webhook à donner à la plateforme LoRaWAN, et peut être régénéré.
-- ---------------------------------------------------------------------------
alter table public.sources
  add column plateforme text
    check (plateforme in ('ttn', 'chirpstack', 'liveobjects', 'generic')),
  add column webhook_token text;

create unique index sources_webhook_token_uniq
  on public.sources (webhook_token)
  where webhook_token is not null;

alter table public.sources
  add constraint sources_webhook_lorawan_requiert_plateforme
  check (
    type <> 'webhook_lorawan'
    or (plateforme is not null and webhook_token is not null)
  );

-- ---------------------------------------------------------------------------
-- Registre d'équipements : associe un DevEUI (+ canal éventuel pour les
-- capteurs multi-voies) à un compteur, un décodeur de trame et le facteur
-- d'impulsion (litres représentés par une impulsion du compteur mécanique
-- raccordé). dernier_index_impulsions/dernier_horodatage mémorisent l'état
-- nécessaire au calcul du delta entre deux trames (voir
-- supabase/functions/ingest/lib/computeDelta.ts).
-- ---------------------------------------------------------------------------
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_id uuid not null references public.sources (id) on delete cascade,
  meter_id uuid not null references public.meters (id) on delete cascade,
  dev_eui text not null check (dev_eui ~ '^[0-9A-F]{16}$'),
  canal text check (canal is null or char_length(canal) <= 4),
  decodeur text not null check (
    decodeur in (
      'adeunis_pulse_v4', 'watteco_pulse_senso', 'milesight_em300_di', 'dragino_sw3l'
    )
  ),
  litres_par_impulsion numeric(10, 3) not null default 1 check (litres_par_impulsion > 0),
  dernier_index_impulsions bigint,
  dernier_horodatage timestamptz,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index devices_org_deveui_canal_uniq
  on public.devices (organization_id, dev_eui, coalesce(canal, ''));
create index devices_org_idx on public.devices (organization_id);
create index devices_source_idx on public.devices (source_id);
create index devices_meter_idx on public.devices (meter_id);

alter table public.devices enable row level security;

create trigger devices_set_updated_at
  before update on public.devices
  for each row execute function public.set_updated_at();

create policy "lecture_devices" on public.devices for select
  using (public.is_member(organization_id));
create policy "ecriture_devices" on public.devices for all
  using (public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]))
  with check (public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]));

-- ---------------------------------------------------------------------------
-- Journal des trames brutes : traçabilité complète de chaque appel webhook
-- (charge utile brute + résultat du décodage), et support de l'idempotence
-- via idempotency_key (dev_eui + compteur de trame ou horodatage). Écriture
-- réservée au service_role (Edge Function) : aucune policy insert/update/
-- delete pour les utilisateurs de l'app, lecture seule pour les membres.
-- ---------------------------------------------------------------------------
create table public.raw_frames (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source_id uuid not null references public.sources (id) on delete cascade,
  device_id uuid references public.devices (id) on delete set null,
  dev_eui text,
  idempotency_key text not null,
  recu_le timestamptz not null default now(),
  charge_utile jsonb not null,
  trame_decodee jsonb,
  statut text not null
    check (statut in ('ok', 'doublon', 'appareil_inconnu', 'erreur_decodage')),
  erreur text,
  releve_ts timestamptz,
  releve_volume_m3 numeric(14, 3)
);

create unique index raw_frames_source_idempotency_uniq
  on public.raw_frames (source_id, idempotency_key);
create index raw_frames_org_idx on public.raw_frames (organization_id);
create index raw_frames_device_idx on public.raw_frames (device_id);
create index raw_frames_recu_le_idx on public.raw_frames (recu_le desc);

alter table public.raw_frames enable row level security;

create policy "lecture_raw_frames" on public.raw_frames for select
  using (public.is_member(organization_id));
