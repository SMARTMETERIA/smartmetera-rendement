-- Moteur de calcul : volumes journaliers, bilan d'eau par période (année
-- civile / glissant 12 mois), débit de nuit par secteur (DMN, baseline,
-- fuite estimée, alerte), alertes compteur muet / débit inversé / index
-- anormal. Orchestré par executer_moteur_nocturne(), planifié chaque nuit
-- à 05:00 Europe/Paris via pg_cron (auto-gating DST-safe, voir plus bas),
-- et relançable à la main : select public.executer_moteur_nocturne();
--
-- Toutes les fonctions de calcul sont security definer et leur EXECUTE est
-- révoqué à anon/authenticated (même motif que 0003/0004) : ce sont des
-- fonctions internes au moteur, pas une API applicative.

-- ---------------------------------------------------------------------------
-- 1) Volumes journaliers par compteur
-- ---------------------------------------------------------------------------
create table public.daily_meter_volumes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  meter_id uuid not null references public.meters (id) on delete cascade,
  jour date not null,
  volume_m3 numeric(14, 3) not null,
  nb_releves integer not null,
  calcule_le timestamptz not null default now(),
  unique (meter_id, jour)
);

create index daily_meter_volumes_org_idx on public.daily_meter_volumes (organization_id);
create index daily_meter_volumes_jour_idx on public.daily_meter_volumes (jour);
alter table public.daily_meter_volumes enable row level security;

create policy "lecture_daily_meter_volumes" on public.daily_meter_volumes for select
  using (public.is_member(organization_id));

-- Agrège les relevés horaires en volume journalier, sur le jour calendaire
-- LOCAL (Europe/Paris) — pas le jour UTC (voir CLAUDE.md : horodatages UTC,
-- affichage/logique métier en Europe/Paris).
create function public.calculer_volumes_journaliers(p_jour date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debut timestamptz := (p_jour::timestamp) at time zone 'Europe/Paris';
  v_fin timestamptz := ((p_jour + 1)::timestamp) at time zone 'Europe/Paris';
  v_nb integer;
begin
  insert into public.daily_meter_volumes (organization_id, meter_id, jour, volume_m3, nb_releves, calcule_le)
  select r.organization_id, r.meter_id, p_jour, sum(r.volume_m3), count(*), now()
  from public.readings r
  where r.ts >= v_debut and r.ts < v_fin
  group by r.organization_id, r.meter_id
  on conflict (meter_id, jour) do update set
    volume_m3 = excluded.volume_m3,
    nb_releves = excluded.nb_releves,
    organization_id = excluded.organization_id,
    calcule_le = now();

  get diagnostics v_nb = row_count;
  return v_nb;
end;
$$;

revoke execute on function public.calculer_volumes_journaliers(date) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Débit horaire par secteur (entrées − sorties)
-- ---------------------------------------------------------------------------

-- Sens du compteur de sectorisation : entrée (par défaut) ou sortie. Les
-- compteurs de sectorisation existants (seed) sont tous des entrées.
alter table public.meters add column sens text check (sens in ('entree', 'sortie'));
update public.meters set sens = 'entree' where type = 'sectorisation' and sens is null;

create table public.sector_hourly_flows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sector_id uuid not null references public.sectors (id) on delete cascade,
  heure timestamptz not null,
  debit_m3h numeric(10, 3) not null,
  calcule_le timestamptz not null default now(),
  unique (sector_id, heure)
);

create index sector_hourly_flows_org_idx on public.sector_hourly_flows (organization_id);
alter table public.sector_hourly_flows enable row level security;

create policy "lecture_sector_hourly_flows" on public.sector_hourly_flows for select
  using (public.is_member(organization_id));

create function public.calculer_debits_horaires_secteurs(p_debut timestamptz, p_fin timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nb integer;
begin
  insert into public.sector_hourly_flows (organization_id, sector_id, heure, debit_m3h, calcule_le)
  select
    m.organization_id,
    m.sector_id,
    r.ts,
    sum(case when m.sens = 'sortie' then -r.volume_m3 else r.volume_m3 end),
    now()
  from public.readings r
  join public.meters m on m.id = r.meter_id
  where m.type = 'sectorisation'
    and m.sector_id is not null
    and r.ts >= p_debut
    and r.ts < p_fin
  group by m.organization_id, m.sector_id, r.ts
  on conflict (sector_id, heure) do update set
    debit_m3h = excluded.debit_m3h,
    calcule_le = now();

  get diagnostics v_nb = row_count;
  return v_nb;
end;
$$;

revoke execute on function public.calculer_debits_horaires_secteurs(timestamptz, timestamptz) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Nightline : DMN 2h-4h heure locale, baseline médiane 14 nuits, fuite
--    estimée. Les bornes de fenêtre sont résolues heure-locale-par-heure-
--    locale (pas par arithmétique d'intervalle sur un instant UTC) pour
--    rester correctes lors du changement d'heure : PostgreSQL résout
--    chaque "AT TIME ZONE 'Europe/Paris'" selon les vraies règles DST de la
--    base tzdata, y compris sur les 2 nuits de bascule par an.
-- ---------------------------------------------------------------------------
create function public.calculer_nightline(p_organization_id uuid, p_sector_id uuid, p_nuit_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debut_fenetre timestamptz := (p_nuit_date + time '02:00')::timestamp at time zone 'Europe/Paris';
  v_fin_fenetre timestamptz := (p_nuit_date + time '04:00')::timestamp at time zone 'Europe/Paris';
  v_dmn numeric(10, 3);
  v_baseline numeric(10, 3);
  v_nb_abonnes integer;
  v_fuite numeric(10, 3);
begin
  select min(debit_m3h) into v_dmn
  from public.sector_hourly_flows
  where sector_id = p_sector_id
    and heure > v_debut_fenetre
    and heure <= v_fin_fenetre;

  if v_dmn is null then
    return;
  end if;

  select percentile_cont(0.5) within group (order by debit_min_nocturne_m3h)
  into v_baseline
  from public.nightlines
  where sector_id = p_sector_id
    and nuit_date >= p_nuit_date - 14
    and nuit_date < p_nuit_date;

  select nb_abonnes into v_nb_abonnes from public.sectors where id = p_sector_id;

  v_fuite := greatest((v_dmn - coalesce(v_nb_abonnes, 0) * 1.7 / 1000) * 20, 0);

  insert into public.nightlines (
    organization_id, sector_id, nuit_date, debit_min_nocturne_m3h, baseline_m3h, volume_fuite_estime_m3j
  ) values (
    p_organization_id, p_sector_id, p_nuit_date, v_dmn, v_baseline, v_fuite
  )
  on conflict (organization_id, sector_id, nuit_date) do update set
    debit_min_nocturne_m3h = excluded.debit_min_nocturne_m3h,
    baseline_m3h = excluded.baseline_m3h,
    volume_fuite_estime_m3j = excluded.volume_fuite_estime_m3j;
end;
$$;

revoke execute on function public.calculer_nightline(uuid, uuid, date) from anon, authenticated;

-- Alerte : DMN > baseline + max(20 %, 0,5 m³/h) sur 3 nuits consécutives.
create function public.detecter_alerte_fuite_secteur(p_organization_id uuid, p_sector_id uuid, p_nuit_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nb_nuits integer;
  v_nb_depassements integer;
  v_alerte_existante uuid;
  v_dmn_actuel numeric;
  v_baseline_actuel numeric;
begin
  select
    count(*),
    count(*) filter (
      where baseline_m3h is not null
        and debit_min_nocturne_m3h > baseline_m3h + greatest(baseline_m3h * 0.2, 0.5)
    )
  into v_nb_nuits, v_nb_depassements
  from public.nightlines
  where sector_id = p_sector_id
    and nuit_date > p_nuit_date - 3
    and nuit_date <= p_nuit_date;

  if v_nb_nuits < 3 or v_nb_depassements < 3 then
    return;
  end if;

  select id into v_alerte_existante
  from public.alerts
  where sector_id = p_sector_id
    and type = 'fuite_suspectee'
    and statut in ('ouverte', 'acquittee')
    and declenchee_le > now() - interval '7 days'
  limit 1;

  if v_alerte_existante is not null then
    return;
  end if;

  select debit_min_nocturne_m3h, baseline_m3h into v_dmn_actuel, v_baseline_actuel
  from public.nightlines
  where sector_id = p_sector_id and nuit_date = p_nuit_date;

  insert into public.alerts (organization_id, sector_id, type, severite, titre, description, donnees)
  values (
    p_organization_id, p_sector_id, 'fuite_suspectee', 'haute',
    'Fuite suspectée : débit de nuit anormalement élevé 3 nuits de suite',
    format(
      'Débit minimum nocturne = %s m³/h, supérieur à la baseline (%s m³/h) + seuil, 3 nuits consécutives.',
      v_dmn_actuel, v_baseline_actuel
    ),
    jsonb_build_object('dmn', v_dmn_actuel, 'baseline', v_baseline_actuel, 'nuit_date', p_nuit_date)
  );
end;
$$;

revoke execute on function public.detecter_alerte_fuite_secteur(uuid, uuid, date) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Alertes compteur muet (48h), débit inversé, index anormal
-- ---------------------------------------------------------------------------
alter table public.alerts drop constraint alerts_type_check;
alter table public.alerts add constraint alerts_type_check check (
  type in (
    'fuite_suspectee', 'depassement_dmn', 'anomalie_comptage', 'import_echec',
    'compteur_muet', 'debit_inverse', 'index_anormal'
  )
);

create function public.detecter_compteurs_muets()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nb integer;
begin
  with dernier_releve as (
    select m.id as meter_id, m.organization_id, m.nom, max(r.ts) as dernier_ts
    from public.meters m
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

revoke execute on function public.detecter_compteurs_muets() from anon, authenticated;

create function public.detecter_debits_inverses(p_debut timestamptz, p_fin timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nb integer;
begin
  with negatifs as (
    select organization_id, sector_id, heure, debit_m3h
    from public.sector_hourly_flows
    where heure >= p_debut and heure < p_fin and debit_m3h < -0.5
  )
  insert into public.alerts (organization_id, sector_id, type, severite, titre, description, donnees)
  select
    n.organization_id, n.sector_id, 'debit_inverse', 'moyenne',
    format('Débit horaire négatif détecté (secteur %s)', s.nom),
    format('Débit = %s m³/h à %s : sorties > entrées, sens des compteurs ou données à vérifier.', n.debit_m3h, n.heure),
    jsonb_build_object('debit_m3h', n.debit_m3h, 'heure', n.heure)
  from negatifs n
  join public.sectors s on s.id = n.sector_id
  where not exists (
    select 1 from public.alerts a
    where a.type = 'debit_inverse'
      and a.sector_id = n.sector_id
      and a.statut in ('ouverte', 'acquittee')
      and a.declenchee_le > now() - interval '24 hours'
  );

  get diagnostics v_nb = row_count;
  return v_nb;
end;
$$;

revoke execute on function public.detecter_debits_inverses(timestamptz, timestamptz) from anon, authenticated;

-- Index anormal : détection d'anomalie statistique (écart-type) sur le
-- volume journalier d'un compteur par rapport à ses 30 derniers jours
-- (minimum 14 jours d'historique requis). Heuristique documentée, pas une
-- règle métier officielle — à ajuster avec des retours terrain.
create function public.detecter_index_anormaux(p_jour date)
returns integer
language plpgsql
security definer
set search_path = public
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

revoke execute on function public.detecter_index_anormaux(date) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2-3 bis) Bilan d'eau calculé par organisation, sur période (année civile
-- ou glissant 12 mois). v_produit/v_importe/v_exporte viennent de la
-- télérelève réelle (daily_meter_volumes) ; v_comptabilise/sans_comptage/
-- service viennent de balance_inputs (saisie/import facturation), exacts
-- pour une année civile, répartis au prorata des jours chevauchés pour une
-- fenêtre glissante à cheval sur deux exercices.
-- ---------------------------------------------------------------------------
create table public.bilans_calcules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  type_periode text not null check (type_periode in ('annee_civile', 'glissant_12m')),
  periode_debut date not null,
  periode_fin date not null,
  v_produit numeric(14, 3) not null,
  v_importe numeric(14, 3) not null,
  v_exporte numeric(14, 3) not null,
  v_comptabilise numeric(14, 3) not null,
  v_sans_comptage numeric(14, 3) not null,
  v_service numeric(14, 3) not null,
  lineaire_reseau_km numeric(10, 2) not null,
  zone_repartition_eaux boolean not null,
  v_mise_en_distribution numeric(14, 3) not null,
  v_consomme_autorise numeric(14, 3) not null,
  pertes numeric(14, 3) not null,
  rendement numeric(6, 4),
  ilp numeric(10, 4),
  ilc numeric(10, 4),
  seuil_reglementaire numeric(6, 4),
  distance_seuil numeric(6, 4),
  conforme_decret boolean,
  calcule_le timestamptz not null default now(),
  unique (organization_id, type_periode, periode_fin)
);

create index bilans_calcules_org_idx on public.bilans_calcules (organization_id);
alter table public.bilans_calcules enable row level security;

create policy "lecture_bilans_calcules" on public.bilans_calcules for select
  using (public.is_member(organization_id));

-- Calcul commun rendement/ILP/ILC/seuil/conformité/distance (mêmes formules
-- que recalculer_balance() et src/lib/rendement.ts — CLAUDE.md).
create function public.upsert_bilan_calcule(
  p_organization_id uuid, p_type_periode text, p_debut date, p_fin date,
  p_v_produit numeric, p_v_importe numeric, p_v_exporte numeric,
  p_v_comptabilise numeric, p_v_sans_comptage numeric, p_v_service numeric,
  p_km numeric, p_zre boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vmd numeric(14, 3);
  v_vca numeric(14, 3);
  v_pertes numeric(14, 3);
  v_rendement numeric(6, 4);
  v_ilp numeric(10, 4);
  v_ilc numeric(10, 4);
  v_terme_fixe numeric(6, 2);
  v_seuil numeric(6, 4);
  v_conforme boolean;
  v_distance numeric(6, 4);
  v_id uuid;
begin
  v_vmd := p_v_produit + p_v_importe - p_v_exporte;
  v_vca := p_v_comptabilise + p_v_sans_comptage + p_v_service;
  v_pertes := v_vmd - v_vca;
  v_rendement := (v_vca + p_v_exporte) / nullif(p_v_produit + p_v_importe, 0);
  v_ilp := v_pertes / nullif(365 * p_km, 0);
  v_ilc := (v_vca + p_v_exporte) / nullif(365 * p_km, 0);
  v_terme_fixe := case when p_zre then 70 else 65 end;
  v_seuil := (v_terme_fixe + 0.2 * v_ilc) / 100;
  v_conforme := case when v_rendement is null or v_seuil is null then null
                     else (v_rendement >= 0.85 or v_rendement >= v_seuil) end;
  v_distance := case when v_rendement is null or v_seuil is null then null else v_rendement - v_seuil end;

  insert into public.bilans_calcules (
    organization_id, type_periode, periode_debut, periode_fin,
    v_produit, v_importe, v_exporte, v_comptabilise, v_sans_comptage, v_service,
    lineaire_reseau_km, zone_repartition_eaux,
    v_mise_en_distribution, v_consomme_autorise, pertes,
    rendement, ilp, ilc, seuil_reglementaire, distance_seuil, conforme_decret, calcule_le
  ) values (
    p_organization_id, p_type_periode, p_debut, p_fin,
    p_v_produit, p_v_importe, p_v_exporte, p_v_comptabilise, p_v_sans_comptage, p_v_service,
    p_km, p_zre,
    v_vmd, v_vca, v_pertes, v_rendement, v_ilp, v_ilc, v_seuil, v_distance, v_conforme, now()
  )
  on conflict (organization_id, type_periode, periode_fin) do update set
    periode_debut = excluded.periode_debut,
    v_produit = excluded.v_produit, v_importe = excluded.v_importe, v_exporte = excluded.v_exporte,
    v_comptabilise = excluded.v_comptabilise, v_sans_comptage = excluded.v_sans_comptage, v_service = excluded.v_service,
    lineaire_reseau_km = excluded.lineaire_reseau_km, zone_repartition_eaux = excluded.zone_repartition_eaux,
    v_mise_en_distribution = excluded.v_mise_en_distribution, v_consomme_autorise = excluded.v_consomme_autorise,
    pertes = excluded.pertes, rendement = excluded.rendement, ilp = excluded.ilp, ilc = excluded.ilc,
    seuil_reglementaire = excluded.seuil_reglementaire, distance_seuil = excluded.distance_seuil,
    conforme_decret = excluded.conforme_decret, calcule_le = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.upsert_bilan_calcule(
  uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, boolean
) from anon, authenticated;

create function public.calculer_bilan_annee_civile(p_organization_id uuid, p_annee integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debut date := make_date(p_annee, 1, 1);
  v_fin date := make_date(p_annee, 12, 31);
  v_produit numeric;
  v_importe numeric;
  v_exporte numeric;
  v_bi record;
begin
  select
    coalesce(sum(d.volume_m3) filter (where m.type = 'production'), 0),
    coalesce(sum(d.volume_m3) filter (where m.type = 'import'), 0),
    coalesce(sum(d.volume_m3) filter (where m.type = 'export'), 0)
  into v_produit, v_importe, v_exporte
  from public.daily_meter_volumes d
  join public.meters m on m.id = d.meter_id
  where d.organization_id = p_organization_id
    and d.jour between v_debut and v_fin;

  select * into v_bi from public.balance_inputs
  where organization_id = p_organization_id and annee = p_annee;

  if v_bi is null then
    return null; -- pas de saisie facturation pour cet exercice : bilan non conclusif.
  end if;

  return public.upsert_bilan_calcule(
    p_organization_id, 'annee_civile', v_debut, v_fin,
    v_produit, v_importe, v_exporte,
    v_bi.v_comptabilise, v_bi.v_sans_comptage, v_bi.v_service,
    v_bi.lineaire_reseau_km, v_bi.zone_repartition_eaux
  );
end;
$$;

revoke execute on function public.calculer_bilan_annee_civile(uuid, integer) from anon, authenticated;

create function public.calculer_bilan_glissant_12m(p_organization_id uuid, p_date_fin date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debut date := p_date_fin - 364;
  v_produit numeric;
  v_importe numeric;
  v_exporte numeric;
  v_comptabilise numeric := 0;
  v_sans_comptage numeric := 0;
  v_service numeric := 0;
  v_km numeric := 0;
  v_zre boolean := false;
  v_poids_total numeric := 0;
  v_annee integer;
  v_bi record;
  v_jours_annee integer;
  v_overlap_debut date;
  v_overlap_fin date;
  v_jours_overlap integer;
  v_org record;
begin
  select
    coalesce(sum(d.volume_m3) filter (where m.type = 'production'), 0),
    coalesce(sum(d.volume_m3) filter (where m.type = 'import'), 0),
    coalesce(sum(d.volume_m3) filter (where m.type = 'export'), 0)
  into v_produit, v_importe, v_exporte
  from public.daily_meter_volumes d
  join public.meters m on m.id = d.meter_id
  where d.organization_id = p_organization_id
    and d.jour between v_debut and p_date_fin;

  select * into v_org from public.organizations where id = p_organization_id;

  -- Répartition au prorata des jours sur chaque exercice civil chevauché
  -- (une fenêtre glissante de 365 jours en chevauche au maximum deux).
  for v_annee in extract(year from v_debut)::integer .. extract(year from p_date_fin)::integer loop
    v_overlap_debut := greatest(v_debut, make_date(v_annee, 1, 1));
    v_overlap_fin := least(p_date_fin, make_date(v_annee, 12, 31));
    if v_overlap_debut > v_overlap_fin then
      continue;
    end if;
    v_jours_overlap := v_overlap_fin - v_overlap_debut + 1;
    v_jours_annee := make_date(v_annee, 12, 31) - make_date(v_annee, 1, 1) + 1;

    select * into v_bi from public.balance_inputs
    where organization_id = p_organization_id and annee = v_annee;

    if v_bi is not null then
      v_comptabilise := v_comptabilise + v_bi.v_comptabilise / v_jours_annee * v_jours_overlap;
      v_sans_comptage := v_sans_comptage + v_bi.v_sans_comptage / v_jours_annee * v_jours_overlap;
      v_service := v_service + v_bi.v_service / v_jours_annee * v_jours_overlap;
      v_km := v_km + v_bi.lineaire_reseau_km * v_jours_overlap;
      v_zre := v_bi.zone_repartition_eaux;
      v_poids_total := v_poids_total + v_jours_overlap;
    end if;
  end loop;

  if v_poids_total = 0 then
    v_km := coalesce(v_org.lineaire_reseau_km, 0);
  else
    v_km := v_km / v_poids_total;
  end if;

  return public.upsert_bilan_calcule(
    p_organization_id, 'glissant_12m', v_debut, p_date_fin,
    v_produit, v_importe, v_exporte,
    v_comptabilise, v_sans_comptage, v_service,
    v_km, v_zre
  );
end;
$$;

revoke execute on function public.calculer_bilan_glissant_12m(uuid, date) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Orchestrateur nocturne + journal d'exécution + planification pg_cron
-- ---------------------------------------------------------------------------
create table public.moteur_executions (
  id uuid primary key default gen_random_uuid(),
  execute_le timestamptz not null default now(),
  jour_traite date not null,
  statut text not null check (statut in ('succes', 'echec_partiel', 'echec')),
  details jsonb,
  duree_ms integer
);

alter table public.moteur_executions enable row level security;

create policy "lecture_moteur_executions" on public.moteur_executions for select
  using (public.is_superadmin());

-- Traite p_jour (par défaut : hier en Europe/Paris — le dernier jour
-- complet au moment de l'exécution planifiée). Chaque étape est isolée
-- (bloc begin/exception) : l'échec d'une organisation ou d'un secteur
-- n'interrompt pas le reste du traitement.
create function public.executer_moteur_nocturne(p_jour date default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jour date := coalesce(p_jour, ((now() at time zone 'Europe/Paris')::date - 1));
  v_debut_horloge timestamptz := clock_timestamp();
  v_org record;
  v_secteur record;
  v_erreurs jsonb := '[]'::jsonb;
  v_statut text := 'succes';
  v_execution_id uuid;
  v_debut_fenetre timestamptz := ((v_jour - 15)::timestamp) at time zone 'Europe/Paris';
  v_fin_fenetre timestamptz := ((v_jour + 1)::timestamp) at time zone 'Europe/Paris';
begin
  begin
    perform public.calculer_volumes_journaliers(v_jour);
  exception when others then
    v_statut := 'echec_partiel';
    v_erreurs := v_erreurs || jsonb_build_object('etape', 'volumes_journaliers', 'erreur', sqlerrm);
  end;

  -- Fenêtre de 15 nuits : couvre la baseline médiane (14 nuits) + la nuit traitée.
  begin
    perform public.calculer_debits_horaires_secteurs(v_debut_fenetre, v_fin_fenetre);
  exception when others then
    v_statut := 'echec_partiel';
    v_erreurs := v_erreurs || jsonb_build_object('etape', 'debits_horaires_secteurs', 'erreur', sqlerrm);
  end;

  for v_org in select id from public.organizations loop
    begin
      perform public.calculer_bilan_annee_civile(v_org.id, extract(year from v_jour)::integer);
      perform public.calculer_bilan_glissant_12m(v_org.id, v_jour);
    exception when others then
      v_statut := 'echec_partiel';
      v_erreurs := v_erreurs || jsonb_build_object('etape', 'bilan', 'organization_id', v_org.id, 'erreur', sqlerrm);
    end;

    for v_secteur in select id from public.sectors where organization_id = v_org.id loop
      begin
        perform public.calculer_nightline(v_org.id, v_secteur.id, v_jour);
        perform public.detecter_alerte_fuite_secteur(v_org.id, v_secteur.id, v_jour);
      exception when others then
        v_statut := 'echec_partiel';
        v_erreurs := v_erreurs || jsonb_build_object('etape', 'nightline', 'sector_id', v_secteur.id, 'erreur', sqlerrm);
      end;
    end loop;
  end loop;

  begin
    perform public.detecter_compteurs_muets();
  exception when others then
    v_statut := 'echec_partiel';
    v_erreurs := v_erreurs || jsonb_build_object('etape', 'compteurs_muets', 'erreur', sqlerrm);
  end;

  begin
    perform public.detecter_debits_inverses(v_debut_fenetre, v_fin_fenetre);
  exception when others then
    v_statut := 'echec_partiel';
    v_erreurs := v_erreurs || jsonb_build_object('etape', 'debits_inverses', 'erreur', sqlerrm);
  end;

  begin
    perform public.detecter_index_anormaux(v_jour);
  exception when others then
    v_statut := 'echec_partiel';
    v_erreurs := v_erreurs || jsonb_build_object('etape', 'index_anormaux', 'erreur', sqlerrm);
  end;

  insert into public.moteur_executions (jour_traite, statut, details, duree_ms)
  values (v_jour, v_statut, v_erreurs, extract(epoch from (clock_timestamp() - v_debut_horloge)) * 1000)
  returning id into v_execution_id;

  return v_execution_id;
end;
$$;

revoke execute on function public.executer_moteur_nocturne(date) from anon, authenticated;

-- Planification : pg_cron n'a pas de notion native de fuseau horaire nommé
-- pour ses expressions cron (l'offset Europe/Paris change avec le DST). On
-- planifie donc un déclencheur toutes les 15 minutes qui s'auto-filtre sur
-- l'heure locale réelle (résolue via AT TIME ZONE, donc DST-safe) et ne
-- s'exécute qu'une fois par jour (journal moteur_executions).
create function public.cron_declencheur_moteur_nocturne()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_heure_locale time;
  v_deja_execute boolean;
begin
  v_heure_locale := (now() at time zone 'Europe/Paris')::time;
  if v_heure_locale < time '04:55' or v_heure_locale > time '05:10' then
    return;
  end if;

  select exists(
    select 1 from public.moteur_executions
    where (execute_le at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date
  ) into v_deja_execute;

  if v_deja_execute then
    return;
  end if;

  perform public.executer_moteur_nocturne();
end;
$$;

revoke execute on function public.cron_declencheur_moteur_nocturne() from anon, authenticated;

do $$
begin
  begin
    perform cron.schedule(
      'moteur-nocturne-declencheur',
      '*/15 * * * *',
      $cron$select public.cron_declencheur_moteur_nocturne();$cron$
    );
  exception when others then
    raise notice 'pg_cron indisponible : lancer executer_moteur_nocturne() manuellement chaque nuit vers 05:00 Europe/Paris.';
  end;
end $$;
