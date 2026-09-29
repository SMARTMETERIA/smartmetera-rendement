-- Gardien de l'eau, phase G4 : moteur fuites, températures et économies
-- (voir docs/PLAN_GARDIEN.md, section 4, phase G4).
--
-- 1. meter_days : bilan quotidien de chaque point de comptage, en date
--    locale du site (volume, débit minimum de nuit, ligne de base, seuil).
--    Écrit par la fonction gardien-moteur (service_role) ; sert de mémoire
--    à la ligne de base auto-calibrée et aux courbes des espaces (G6).
-- 2. Économies prudentes en SQL (même calcul et même texte de méthode que
--    src/lib/moteur-gardien/economies.ts, vérifié par un test).
-- 3. Actions sur une fuite : « Je m'en occupe », réparation déclarée,
--    fausse alerte (une fausse alerte ne compte jamais dans les économies).
-- 4. Pilotes : anomalies trouvées comptées à chaque fuite détectée.
-- 5. Registre des températures : relevé de référence mensuel par point.
-- 6. Alertes Gardien : une seule alerte ouverte par clé (capteur muet,
--    température basse, rappel d'analyses).
-- 7. Détecteurs SQL de l'offre Réseau limités aux organisations hors
--    Gardien (le moteur du Gardien a ses propres règles).
-- 8. Planification : gardien-moteur toutes les heures à la 10e minute.

-- ---------------------------------------------------------------------------
-- 1) Bilan quotidien par point de comptage
-- ---------------------------------------------------------------------------
create table public.meter_days (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  meter_id uuid not null,
  -- Date locale du site (Europe/Paris ou Africa/Casablanca).
  day date not null,
  volume_m3 numeric(14, 3) not null default 0 check (volume_m3 >= 0),
  -- Heures mesurées (25 le jour du passage à l'heure d'hiver).
  hours_covered smallint not null default 0 check (hours_covered between 0 and 25),
  -- Débit minimum de nuit (fenêtre locale, hors plages calmes), L/h ;
  -- null si la nuit n'est pas terminée ou trop peu mesurée.
  night_min_lph numeric(10, 1) check (night_min_lph is null or night_min_lph >= 0),
  night_hours smallint not null default 0 check (night_hours >= 0),
  quiet_hours smallint not null default 0 check (quiet_hours >= 0),
  -- Débits horaires extrêmes de la journée, hors plages calmes, L/h.
  max_hourly_lph numeric(10, 1) check (max_hourly_lph is null or max_hourly_lph >= 0),
  min_hourly_lph numeric(10, 1) check (min_hourly_lph is null or min_hourly_lph >= 0),
  -- Jour compris dans une période de fermeture du site.
  closed boolean not null default false,
  baseline_lph numeric(10, 1),
  threshold_lph numeric(10, 1),
  baseline_mode text check (baseline_mode in ('apprentissage', 'prudent', 'normal')),
  -- Nuit au-dessus du seuil (information). Les lignes de base suivantes
  -- excluent les nuits d'une fuite confirmée (pas d'une fausse alerte).
  leak_night boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (meter_id, day),
  foreign key (site_id, organization_id) references public.sites (id, organization_id) on delete cascade,
  foreign key (meter_id, organization_id) references public.meters (id, organization_id) on delete cascade
);

create index meter_days_org_idx on public.meter_days (organization_id, day);
create index meter_days_site_idx on public.meter_days (site_id, organization_id, day);
create index meter_days_meter_org_idx on public.meter_days (meter_id, organization_id);
alter table public.meter_days enable row level security;

create policy "lecture_meter_days" on public.meter_days for select
  using (public.is_member(organization_id) or site_id in (select public.mes_sites()));
-- Écriture : service_role seulement (moteur).

-- ---------------------------------------------------------------------------
-- 2) Économies prudentes
-- ---------------------------------------------------------------------------

-- Nombre au format français : espace fine insécable entre les milliers,
-- virgule décimale (identique à Intl.NumberFormat('fr-FR')).
create function public.nombre_fr(p_valeur numeric, p_decimales integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(
    to_char(
      round(p_valeur, p_decimales),
      'FM999,999,999,990' || case when p_decimales > 0 then '.' || repeat('0', p_decimales) else '' end
    ),
    ',.',
    U&'\202F,'
  );
$$;

-- Excès de débit × 24 h × délai de découverte évité × prix du m³ du site.
-- Sans prix : volume seul, aucun montant inventé.
create function public.economies_prudentes(
  p_exces_lph numeric,
  p_prix_m3 numeric,
  p_monnaie text,
  p_delai_jours integer
)
returns table (m3 numeric, montant numeric, methode text)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_unite text := case when p_monnaie = 'EUR' then '€' else 'MAD' end;
begin
  m3 := round(p_exces_lph / 1000 * 24 * p_delai_jours, 3);
  montant := case when p_prix_m3 is null then null else round(m3 * p_prix_m3, 2) end;
  methode := case
    when montant is null then format(
      'Méthode prudente : %s L/h d''excès × 24 h × %s jours de découverte évités = %s m³ (prix de l''eau du site à renseigner).',
      public.nombre_fr(p_exces_lph, 1), p_delai_jours, public.nombre_fr(m3, 3)
    )
    else format(
      'Méthode prudente : %s L/h d''excès × 24 h × %s jours de découverte évités × %s %s/m³ = %s %s.',
      public.nombre_fr(p_exces_lph, 1), p_delai_jours, public.nombre_fr(p_prix_m3, 2), v_unite,
      public.nombre_fr(montant, 2), v_unite
    )
  end;
  return next;
end;
$$;

-- Clôture d'une fuite réparée (moteur ou utilisateur) avec ses économies.
-- Interne : appelée par gardien-moteur (service_role) et par
-- fuite_declarer_reparee après vérification du rôle.
create function public.fuite_cloturer_reparee(
  p_leak_id uuid,
  p_source text,
  p_quand timestamptz,
  p_par uuid
)
returns public.leak_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fuite public.leak_events;
  v_prix numeric;
  v_delai integer;
  v_eco record;
begin
  if p_source not in ('automatique', 'utilisateur') then
    raise exception 'Origine de réparation inconnue.' using errcode = '22023';
  end if;

  select * into v_fuite from public.leak_events where id = p_leak_id for update;
  if not found then
    raise exception 'Fuite introuvable.' using errcode = 'P0002';
  end if;
  if v_fuite.status not in ('ouverte', 'prise_en_compte') then
    raise exception 'Cette fuite est déjà close.' using errcode = '22023';
  end if;

  select s.water_price_per_m3 into v_prix from public.sites s where s.id = v_fuite.site_id;
  select (s.value ->> 'delai_decouverte_evite_jours')::integer into v_delai
  from public.platform_settings s
  where s.key = 'economies';
  v_delai := coalesce(v_delai, 30);

  select * into v_eco
  from public.economies_prudentes(v_fuite.excess_flow_lph, v_prix, v_fuite.currency, v_delai);

  update public.leak_events
  set status = 'reparee',
      repaired_at = coalesce(p_quand, now()),
      repair_source = p_source,
      closed_by = p_par,
      saved_m3 = v_eco.m3,
      saved_amount = v_eco.montant,
      method = v_eco.methode,
      details = details || jsonb_build_object(
        'delai_decouverte_evite_jours', v_delai,
        'prix_m3', v_prix
      )
  where id = p_leak_id
  returning * into v_fuite;
  return v_fuite;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Actions des utilisateurs sur une fuite. Rôles : admin, agent ou
--    technicien de l'organisation ; directeur ou technicien du site.
-- ---------------------------------------------------------------------------
create function public.peut_agir_fuite(p_leak_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.leak_events l
    where l.id = p_leak_id
      and public.peut_agir_site(
        l.site_id,
        array['admin_client', 'agent', 'technicien', 'superadmin']::public.role_utilisateur[],
        array['directeur_site', 'technicien']::public.role_utilisateur[]
      )
  );
$$;

create function public.fuite_prendre_en_charge(p_leak_id uuid)
returns public.leak_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fuite public.leak_events;
begin
  if auth.uid() is null or not public.peut_agir_fuite(p_leak_id) then
    raise exception 'Action non autorisée.' using errcode = '42501';
  end if;

  update public.leak_events
  set status = 'prise_en_compte',
      acknowledged_by = auth.uid(),
      acknowledged_at = now()
  where id = p_leak_id
    and status = 'ouverte'
  returning * into v_fuite;

  if not found then
    select * into v_fuite from public.leak_events where id = p_leak_id;
    if v_fuite.status <> 'prise_en_compte' then
      raise exception 'Cette fuite est déjà close.' using errcode = '22023';
    end if;
  end if;
  return v_fuite;
end;
$$;

create function public.fuite_declarer_reparee(p_leak_id uuid)
returns public.leak_events
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.peut_agir_fuite(p_leak_id) then
    raise exception 'Action non autorisée.' using errcode = '42501';
  end if;
  return public.fuite_cloturer_reparee(p_leak_id, 'utilisateur', now(), auth.uid());
end;
$$;

-- Fausse alerte : aussi possible après une réparation (les économies
-- sont alors retirées).
create function public.fuite_declarer_fausse_alerte(p_leak_id uuid, p_motif text default null)
returns public.leak_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fuite public.leak_events;
begin
  if auth.uid() is null or not public.peut_agir_fuite(p_leak_id) then
    raise exception 'Action non autorisée.' using errcode = '42501';
  end if;
  if p_motif is not null and char_length(p_motif) > 500 then
    raise exception 'Motif trop long (500 caractères au plus).' using errcode = '22023';
  end if;

  update public.leak_events
  set status = 'fausse_alerte',
      saved_m3 = null,
      saved_amount = null,
      method = null,
      closed_by = auth.uid(),
      details = details || jsonb_build_object(
        'fausse_alerte', jsonb_build_object('motif', nullif(btrim(p_motif), ''), 'le', now())
      )
  where id = p_leak_id
    and status in ('ouverte', 'prise_en_compte', 'reparee')
  returning * into v_fuite;

  if not found then
    raise exception 'Cette fuite est déjà marquée comme fausse alerte.' using errcode = '22023';
  end if;
  return v_fuite;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Pilotes : anomalies trouvées pendant le pilote
-- ---------------------------------------------------------------------------
create function public.leak_events_compter_pilote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delta integer := 0;
begin
  if tg_op = 'INSERT' and new.status <> 'fausse_alerte' then
    v_delta := 1;
  elsif tg_op = 'UPDATE' and new.status = 'fausse_alerte' and old.status <> 'fausse_alerte' then
    v_delta := -1;
  end if;
  if v_delta <> 0 then
    update public.pilots p
    set anomalies_found = greatest(p.anomalies_found + v_delta, 0)
    where p.site_id = new.site_id
      and p.status in ('en_cours', 'prolonge')
      and new.detected_at between p.started_at and p.ends_at;
  end if;
  return new;
end;
$$;

create trigger leak_events_compter_pilote
  after insert or update of status on public.leak_events
  for each row execute function public.leak_events_compter_pilote();

-- ---------------------------------------------------------------------------
-- 5) Registre des températures : par point et par mois local, relevé de
--    référence (le premier du mois), minimum, maximum, relevés sous le
--    seuil. Les relevés ne sont jamais supprimés (flag qualité).
-- ---------------------------------------------------------------------------
create function public.registre_temperatures(p_site_id uuid, p_debut date, p_fin date)
returns table (
  point_id uuid,
  label text,
  type text,
  seuil_c numeric,
  mois date,
  premier_releve timestamptz,
  premiere_valeur_c numeric,
  min_c numeric,
  max_c numeric,
  nb_releves integer,
  nb_sous_seuil integer
)
language sql
security definer
stable
set search_path = ''
as $$
  with site as (
    select s.id, s.timezone
    from public.sites s
    where s.id = p_site_id
      and public.can_read_site(s.id)
      and p_fin >= p_debut
      and p_fin - p_debut <= 400
  ),
  seuils as (
    select ps.value -> 'seuils_c' as valeurs
    from public.platform_settings ps
    where ps.key = 'temperatures'
  ),
  points as (
    select p.id, p.label, p.type,
      coalesce(p.threshold_c, (select (x.valeurs ->> p.type)::numeric from seuils x)) as seuil
    from public.temperature_points p
    join site on site.id = p.site_id
  ),
  releves as (
    select r.point_id, r.ts, r.value_c,
      date_trunc('month', r.ts at time zone site.timezone)::date as mois
    from public.temperature_readings r
    join points pt on pt.id = r.point_id
    cross join site
    where r.quality_flag in ('valide', 'corrigee')
      and r.ts >= (p_debut::timestamp at time zone site.timezone)
      and r.ts < ((p_fin + 1)::timestamp at time zone site.timezone)
  )
  select pt.id, pt.label, pt.type, pt.seuil, r.mois,
    min(r.ts),
    (array_agg(r.value_c order by r.ts))[1],
    min(r.value_c),
    max(r.value_c),
    count(*)::integer,
    (count(*) filter (where pt.seuil is not null and r.value_c < pt.seuil))::integer
  from points pt
  join releves r on r.point_id = pt.id
  group by pt.id, pt.label, pt.type, pt.seuil, r.mois
  order by pt.label, r.mois;
$$;

-- ---------------------------------------------------------------------------
-- 6) Alertes Gardien : une seule alerte en cours par clé
--    (donnees.cle : « muet:<appareil> », « temperature:<point> »,
--    « analyses:<site>:<fin de fermeture> »).
-- ---------------------------------------------------------------------------
create unique index alerts_gardien_une_en_cours_uniq
  on public.alerts (type, (donnees ->> 'cle'))
  where site_id is not null
    and donnees ? 'cle'
    and statut in ('ouverte', 'acquittee');

-- ---------------------------------------------------------------------------
-- 7) Détecteurs de l'offre Réseau : hors organisations Gardien (kind =
--    'sites'), qui ont leur propre moteur (capteur muet à 36 h ou 6 h,
--    alerte au partenaire).
-- ---------------------------------------------------------------------------
create or replace function public.detecter_compteurs_muets()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_nb integer;
begin
  with dernier_releve as (
    select m.id as meter_id, m.organization_id, m.nom, max(r.ts) as dernier_ts
    from public.meters m
    join public.organizations o on o.id = m.organization_id and o.kind <> 'sites'
    left join public.readings r on r.meter_id = m.id
    where m.actif
    group by m.id, m.organization_id, m.nom
  ),
  muets as (
    select * from dernier_releve
    where dernier_ts is null or dernier_ts < now() - interval '48 hours'
  )
  insert into public.alerts (organization_id, type, severite, titre, description, donnees)
  select
    muets.organization_id, 'compteur_muet', 'moyenne',
    format('Compteur muet depuis plus de 48h : %s', muets.nom),
    format('Dernier relevé : %s', coalesce(muets.dernier_ts::text, 'aucun')),
    jsonb_build_object('meter_id', muets.meter_id, 'dernier_ts', muets.dernier_ts)
  from muets
  where not exists (
    select 1 from public.alerts a
    where a.type = 'compteur_muet'
      and a.statut in ('ouverte', 'acquittee')
      and (a.donnees ->> 'meter_id')::uuid = muets.meter_id
      and a.declenchee_le > now() - interval '48 hours'
  );

  get diagnostics v_nb = row_count;
  return v_nb;
end;
$$;

create or replace function public.detecter_index_anormaux(p_jour date)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_nb integer;
begin
  with stats as (
    select meter_id, avg(volume_m3) as moyenne, stddev_samp(volume_m3) as ecart_type, count(*) as nb_jours
    from public.daily_meter_volumes
    where jour >= p_jour - 30 and jour < p_jour
    group by meter_id
  ),
  anomalies as (
    select d.organization_id, d.meter_id, m.nom, d.volume_m3, s.moyenne, s.ecart_type
    from public.daily_meter_volumes d
    join stats s on s.meter_id = d.meter_id and s.nb_jours >= 14
    join public.meters m on m.id = d.meter_id
    join public.organizations o on o.id = m.organization_id and o.kind <> 'sites'
    where d.jour = p_jour
      and abs(d.volume_m3 - s.moyenne) > greatest(5 * coalesce(s.ecart_type, 0), 0.5 * s.moyenne, 1)
  )
  insert into public.alerts (organization_id, type, severite, titre, description, donnees)
  select
    anomalies.organization_id, 'index_anormal', 'moyenne',
    format('Volume journalier anormal : %s', anomalies.nom),
    format(
      '%s m³ le %s, moyenne récente %s m³ (écart-type %s)',
      round(anomalies.volume_m3, 2), p_jour, round(anomalies.moyenne, 2), round(coalesce(anomalies.ecart_type, 0), 2)
    ),
    jsonb_build_object(
      'meter_id', anomalies.meter_id, 'jour', p_jour, 'volume_m3', anomalies.volume_m3,
      'moyenne', anomalies.moyenne, 'ecart_type', anomalies.ecart_type
    )
  from anomalies
  where not exists (
    select 1 from public.alerts a
    where a.type = 'index_anormal'
      and (a.donnees ->> 'meter_id')::uuid = anomalies.meter_id
      and (a.donnees ->> 'jour')::date = p_jour
  );

  get diagnostics v_nb = row_count;
  return v_nb;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) Planification : toutes les heures, 10 minutes après l'heure pleine
--    (les relevés horaires de l'heure écoulée sont arrivés).
-- ---------------------------------------------------------------------------
do $$
begin
  perform cron.schedule(
    'gardien-moteur',
    '10 * * * *',
    $cron$select public.cron_appeler_edge_function('gardien-moteur');$cron$
  );
exception when others then
  raise notice 'pg_cron indisponible : appeler gardien-moteur manuellement.';
end $$;
