-- Notifications par e-mail (Resend) : alertes quasi temps réel (toutes les
-- 15 min, groupées par organisation) et digest hebdomadaire (lundi 7h
-- Europe/Paris). Déclenchées par pg_cron via pg_net vers l'Edge Function
-- supabase/functions/notifications (voir son en-tête pour le détail du
-- pipeline). Le rendu des e-mails (gabarit français sobre) vit en
-- TypeScript testable dans src/lib/notifications/, dupliqué en Deno dans
-- supabase/functions/notifications/lib/ (même convention que process-import
-- et ingest).
--
-- pg_net est utilisé pour l'appel HTTP asynchrone depuis Postgres. L'appel
-- s'authentifie avec la clé publique "anon" (un JWT valide mais sans aucun
-- privilège — la fonction Edge utilise ensuite service_role en interne pour
-- son propre travail), lue depuis Supabase Vault plutôt que codée en dur ici
-- (déploiement à valeur variable par environnement, jamais de secret dans
-- une migration versionnée). Seed des secrets Vault (à faire une fois par
-- projet, hors migration) :
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1', 'functions_base_url');
--   select vault.create_secret('<clé anon>', 'anon_key');

create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Marque de notification sur les alertes : idempotence du job "toutes les
-- 15 minutes" (une alerte n'est jamais notifiée deux fois), sans avoir
-- besoin d'un journal d'exécution séparé comme le moteur nocturne.
-- ---------------------------------------------------------------------------
alter table public.alerts add column notifie_le timestamptz;
create index alerts_notifie_le_idx on public.alerts (notifie_le) where notifie_le is null;

-- ---------------------------------------------------------------------------
-- Journal des digests hebdomadaires envoyés (dédoublonnage par organisation
-- + semaine, et trace de ce qui a été envoyé). Lecture superadmin
-- uniquement : c'est un journal d'exploitation, pas une donnée métier.
-- ---------------------------------------------------------------------------
create table public.digest_hebdo_envois (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  semaine_debut date not null,
  envoye_le timestamptz not null default now(),
  unique (organization_id, semaine_debut)
);

create index digest_hebdo_envois_org_idx on public.digest_hebdo_envois (organization_id);
alter table public.digest_hebdo_envois enable row level security;

create policy "lecture_digest_hebdo_envois" on public.digest_hebdo_envois for select
  using (public.is_superadmin());

-- ---------------------------------------------------------------------------
-- Appel générique d'une route de l'Edge Function `notifications`. Tolérant
-- à l'absence des secrets Vault (utile en dev local / avant le seed initial
-- des secrets) : se contente d'un avertissement plutôt que d'un échec dur.
-- ---------------------------------------------------------------------------
create function public.cron_appeler_edge_function(p_route text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base_url text;
  v_anon_key text;
begin
  select decrypted_secret into v_base_url
  from vault.decrypted_secrets where name = 'functions_base_url' limit 1;
  select decrypted_secret into v_anon_key
  from vault.decrypted_secrets where name = 'anon_key' limit 1;

  if v_base_url is null or v_anon_key is null then
    raise notice 'Secrets Vault functions_base_url/anon_key manquants : % non déclenchée.', p_route;
    return;
  end if;

  perform net.http_post(
    url := v_base_url || '/' || p_route,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body := '{}'::jsonb
  );
end;
$$;

revoke execute on function public.cron_appeler_edge_function(text) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Notification d'alertes : pas de fenêtre horaire, l'idempotence vient de
-- alerts.notifie_le (voir Edge Function). Tourne toutes les 15 minutes.
-- ---------------------------------------------------------------------------
create function public.cron_notifier_alertes()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.cron_appeler_edge_function('notifications/alertes');
end;
$$;

revoke execute on function public.cron_notifier_alertes() from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Digest hebdomadaire : même technique de gating DST-safe que le moteur
-- nocturne (0008_moteur_calcul.sql) — pg_cron n'a pas de fuseau horaire
-- nommé, donc on s'auto-filtre sur l'heure locale réelle résolue via
-- AT TIME ZONE. Le dédoublonnage par organisation+semaine vit côté Edge
-- Function (digest_hebdo_envois), donc plusieurs déclenchements dans la
-- fenêtre ne renvoient pas plusieurs fois le même digest.
-- ---------------------------------------------------------------------------
create function public.cron_declencheur_digest_hebdo()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jour_iso integer := extract(isodow from (now() at time zone 'Europe/Paris'))::integer;
  v_heure_locale time := (now() at time zone 'Europe/Paris')::time;
begin
  if v_jour_iso <> 1 then
    return;
  end if;
  if v_heure_locale < time '06:55' or v_heure_locale > time '07:10' then
    return;
  end if;

  perform public.cron_appeler_edge_function('notifications/digest');
end;
$$;

revoke execute on function public.cron_declencheur_digest_hebdo() from anon, authenticated;

do $$
begin
  begin
    perform cron.schedule(
      'notifications-alertes',
      '*/15 * * * *',
      $cron$select public.cron_notifier_alertes();$cron$
    );
  exception when others then
    raise notice 'pg_cron indisponible : déclencher manuellement POST /functions/v1/notifications/alertes.';
  end;

  begin
    perform cron.schedule(
      'notifications-digest-hebdo',
      '*/15 * * * *',
      $cron$select public.cron_declencheur_digest_hebdo();$cron$
    );
  exception when others then
    raise notice 'pg_cron indisponible : déclencher manuellement POST /functions/v1/notifications/digest le lundi vers 07:00 Europe/Paris.';
  end;
end $$;
