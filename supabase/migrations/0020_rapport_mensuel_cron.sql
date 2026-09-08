-- Déclenchement du rapport mensuel : le 1er du mois vers 06:00 Europe/Paris
-- (gating DST-safe, même technique que le moteur nocturne et le digest
-- hebdomadaire — voir 0008_moteur_calcul.sql et 0016_alertes_notifications.sql).
-- Réutilise public.cron_appeler_edge_function() déjà défini en 0016.
create function public.cron_declencheur_rapport_mensuel()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jour_du_mois integer := extract(day from (now() at time zone 'Europe/Paris'))::integer;
  v_heure_locale time := (now() at time zone 'Europe/Paris')::time;
begin
  if v_jour_du_mois <> 1 then
    return;
  end if;
  if v_heure_locale < time '05:55' or v_heure_locale > time '06:10' then
    return;
  end if;

  perform public.cron_appeler_edge_function('reports/mensuel');
end;
$$;

do $$
begin
  perform cron.schedule(
    'rapport-mensuel-declencheur',
    '*/15 * * * *',
    $cron$select public.cron_declencheur_rapport_mensuel();$cron$
  );
exception when others then
  raise notice 'pg_cron indisponible : déclencher manuellement POST /functions/v1/reports/mensuel le 1er du mois vers 06:00 Europe/Paris.';
end $$;
