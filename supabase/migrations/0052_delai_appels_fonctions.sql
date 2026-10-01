-- Phase G10 (relecture) : délai d'attente des appels planifiés vers les
-- fonctions Supabase.
--
-- pg_net attend 5 secondes par défaut. Les passages de gardien-moteur et
-- gardien-envois durent déjà 3 à 5 secondes sur la base de développement
-- (12 appels sur 54 « expirés » en 6 heures) : la fonction termine son
-- travail, mais l'appel est compté en échec dans la surveillance et le
-- récapitulatif quotidien. Avec plus de sites en production, ce serait
-- systématique. Délai porté à 2 minutes (une fonction Supabase s'arrête
-- d'elle-même avant). Même corps qu'en 0016, avec un search_path vide.

create or replace function public.cron_appeler_edge_function(p_route text)
returns void
language plpgsql
security definer
set search_path = ''
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
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$$;

revoke execute on function public.cron_appeler_edge_function(text) from public, anon, authenticated;
