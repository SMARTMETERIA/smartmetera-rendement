-- Phase G10 (mise en ligne) : surveillance des tâches planifiées et durée
-- de conservation des données personnelles.
--
-- 1) taches_executions : une ligne par passage planifié des fonctions
--    gardien-moteur et gardien-envois (écrite par la fonction elle-même,
--    en fin de passage) et par le récapitulatif quotidien au superadmin.
--    Table de plateforme (pas de données d'une organisation) : lecture
--    réservée au superadmin, écriture par service_role seulement.
-- 2) etat_taches_planifiees() : état de chaque tâche pg_cron (dernier
--    passage, échecs sur 24 h) et des fonctions, pour l'onglet
--    « Surveillance » du superadmin et le récapitulatif quotidien.
-- 3) Conservation : platform_settings.conservation, vide par défaut
--    (TODO(RAYAN) : durées à valider). Quand envois_mois est renseigné, les
--    destinataires et le contenu des envois plus anciens sont effacés (la
--    ligne reste : date, canal, statut). Les relevés ne sont jamais
--    supprimés.

-- ---------------------------------------------------------------------------
-- 1) Passages des tâches
-- ---------------------------------------------------------------------------
create table public.taches_executions (
  id bigint generated always as identity primary key,
  tache text not null check (char_length(tache) between 1 and 60),
  -- Clé d'unicité facultative (récapitulatif : le jour).
  cle text check (cle is null or char_length(cle) between 1 and 60),
  debut timestamptz not null,
  fin timestamptz,
  statut text not null check (statut in ('en_cours', 'ok', 'partiel', 'echec')),
  bilan jsonb not null default '{}'::jsonb,
  erreurs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create unique index taches_executions_cle_idx on public.taches_executions (tache, cle) where cle is not null;
create index taches_executions_tache_idx on public.taches_executions (tache, debut desc);
create index taches_executions_created_idx on public.taches_executions (created_at);
alter table public.taches_executions enable row level security;

create policy "lecture_taches_executions" on public.taches_executions for select
  using (public.is_platform_admin());
-- Écriture : service_role seulement (fonctions Supabase).

-- ---------------------------------------------------------------------------
-- 2) État des tâches planifiées
-- ---------------------------------------------------------------------------
create function public.etat_taches_planifiees()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cron jsonb := '[]'::jsonb;
  v_fonctions jsonb;
  v_http jsonb := null;
begin
  if not (public.is_platform_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Réservé au superadmin.' using errcode = '42501';
  end if;

  begin
    select coalesce(jsonb_agg(jsonb_build_object(
      'nom', j.jobname,
      'planification', j.schedule,
      'active', j.active,
      'dernier_debut', d.start_time,
      'derniere_fin', d.end_time,
      'dernier_statut', d.status,
      'dernier_message', left(d.return_message, 300),
      'echecs_24h', (
        select count(*) from cron.job_run_details e
        where e.jobid = j.jobid and e.status = 'failed' and e.start_time > now() - interval '24 hours'
      )
    ) order by j.jobname), '[]'::jsonb)
    into v_cron
    from cron.job j
    left join lateral (
      select r.start_time, r.end_time, r.status, r.return_message
      from cron.job_run_details r
      where r.jobid = j.jobid
      order by r.start_time desc
      limit 1
    ) d on true;
  exception when others then
    v_cron := '[]'::jsonb;
  end;

  -- Appels des fonctions par pg_net en échec (réponses gardées 6 h par pg_net).
  begin
    select jsonb_build_object(
      'echecs_6h', count(*) filter (where r.status_code >= 400 or r.error_msg is not null or r.timed_out),
      'total_6h', count(*)
    )
    into v_http
    from net._http_response r
    where r.created > now() - interval '6 hours';
  exception when others then
    v_http := null;
  end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'tache', t.tache,
    'dernier_debut', t.debut,
    'derniere_fin', t.fin,
    'dernier_statut', t.statut,
    'dernieres_erreurs', t.erreurs,
    'passages_24h', (select count(*) from public.taches_executions x where x.tache = t.tache and x.debut > now() - interval '24 hours'),
    'echecs_24h', (
      select count(*) from public.taches_executions x
      where x.tache = t.tache and x.statut in ('partiel', 'echec') and x.debut > now() - interval '24 hours'
    )
  ) order by t.tache), '[]'::jsonb)
  into v_fonctions
  from (
    select distinct on (e.tache) e.tache, e.debut, e.fin, e.statut, e.erreurs
    from public.taches_executions e
    order by e.tache, e.debut desc
  ) t;

  return jsonb_build_object(
    'maintenant', now(),
    'cron', v_cron,
    'fonctions', v_fonctions,
    'appels_http', v_http
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Conservation des données personnelles
-- ---------------------------------------------------------------------------
insert into public.platform_settings (key, value, description) values (
  'conservation',
  '{"envois_mois": null, "taches_jours": 90}'::jsonb,
  'Durées de conservation. envois_mois : au-delà, destinataire et contenu des envois sont effacés (vide = rien n''est effacé ; TODO(RAYAN) : durée à valider). taches_jours : historique des tâches planifiées.'
)
on conflict (key) do nothing;

-- Le journal des envois reste en ajout seul ; seule exception nouvelle :
-- l'effacement du destinataire et du contenu par purger_donnees_personnelles().
create or replace function public.envois_ajout_seul()
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
  if tg_op = 'UPDATE'
    and current_setting('app.anonymisation_envois', true) = 'on'
    and (new.id, new.organization_id, new.site_id, new.objet, new.objet_id, new.etape, new.canal,
         new.mode, new.statut, new.fournisseur, new.fournisseur_id, new.erreur, new.created_at)
      is not distinct from
        (old.id, old.organization_id, old.site_id, old.objet, old.objet_id, old.etape, old.canal,
         old.mode, old.statut, old.fournisseur, old.fournisseur_id, old.erreur, old.created_at)
  then
    return new;
  end if;
  raise exception 'Journal des envois : ajout seul.';
end;
$$;

create function public.purger_donnees_personnelles()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reglage jsonb;
  v_mois integer;
  v_jours integer;
  v_envois integer := 0;
  v_taches integer := 0;
  v_debut timestamptz := clock_timestamp();
  v_bilan jsonb;
begin
  select value into v_reglage from public.platform_settings where key = 'conservation';
  v_mois := case when jsonb_typeof(v_reglage -> 'envois_mois') = 'number' then (v_reglage ->> 'envois_mois')::integer end;
  v_jours := case when jsonb_typeof(v_reglage -> 'taches_jours') = 'number' then (v_reglage ->> 'taches_jours')::integer end;

  if v_mois is not null and v_mois > 0 then
    perform set_config('app.anonymisation_envois', 'on', true);
    update public.envois
    set destinataire = 'effacé-' || id,
        sujet = null,
        corps = '(contenu effacé : durée de conservation atteinte)',
        user_id = null
    where created_at < now() - make_interval(months => v_mois)
      and destinataire not like 'effacé-%';
    get diagnostics v_envois = row_count;
    perform set_config('app.anonymisation_envois', 'off', true);
  end if;

  if v_jours is not null and v_jours > 0 then
    delete from public.taches_executions where created_at < now() - make_interval(days => v_jours);
    get diagnostics v_taches = row_count;
  end if;

  v_bilan := jsonb_build_object('envois_effaces', v_envois, 'passages_supprimes', v_taches,
                                'envois_mois', v_mois, 'taches_jours', v_jours);
  insert into public.taches_executions (tache, debut, fin, statut, bilan)
  values ('purge-donnees-personnelles', v_debut, clock_timestamp(), 'ok', v_bilan);
  return v_bilan;
end;
$$;

do $$
begin
  perform cron.schedule(
    'purge-donnees-personnelles',
    '40 3 * * *',
    $cron$select public.purger_donnees_personnelles();$cron$
  );
exception when others then
  raise notice 'pg_cron indisponible : lancer purger_donnees_personnelles() manuellement chaque nuit.';
end;
$$;
