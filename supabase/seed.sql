-- Jeu de données de démonstration : « Régie des Sources ».
-- 20 000 abonnés, 800 km de réseau, hors ZRE, 3 secteurs, 8 compteurs
-- (2 production, 6 sectorisation), 24 mois de relevés horaires réalistes
-- avec une fuite qui démarre au mois 20 dans le secteur 2 (secteur 2 sur 3
-- ~= secteur "Centre" ci-dessous), et les volumes annuels du bilan.
--
-- Idempotent : rejoue-le autant de fois que nécessaire, il nettoie d'abord
-- toute donnée précédente identifiée par le nom de l'organisation.

do $$
declare
  v_org_id uuid;
  v_sector1_id uuid;
  v_sector2_id uuid;
  v_sector3_id uuid;
  v_source_id uuid;
  v_meter_prod1 uuid;
  v_meter_prod2 uuid;
  v_meter_sect1a uuid;
  v_meter_sect1b uuid;
  v_meter_sect2a uuid;
  v_meter_sect2b uuid;
  v_meter_sect3a uuid;
  v_meter_sect3b uuid;
  v_start_date date := date_trunc('month', now() - interval '24 months')::date;
  v_leak_start_ts timestamptz := (date_trunc('month', now() - interval '24 months') + interval '19 months')::timestamptz;
  v_month date;
  v_annee1 int;
  v_annee2 int;
  v_produit_an1 numeric(14, 3);
  v_produit_an2 numeric(14, 3);
begin
  -- Reproductibilité du bruit aléatoire entre deux exécutions.
  perform setseed(0.42);

  -- Nettoyage idempotent (cascade sur secteurs, compteurs, relevés, bilan).
  delete from public.organizations where nom = 'Régie des Sources';

  insert into public.organizations (nom, zone_repartition_eaux, lineaire_reseau_km, nb_abonnes)
  values ('Régie des Sources', false, 800, 20000)
  returning id into v_org_id;

  insert into public.sectors (organization_id, code, nom, nb_abonnes, lineaire_km)
    values (v_org_id, 'SECT-01', 'Secteur Nord', 7000, 280)
    returning id into v_sector1_id;
  insert into public.sectors (organization_id, code, nom, nb_abonnes, lineaire_km)
    values (v_org_id, 'SECT-02', 'Secteur Centre', 6500, 260)
    returning id into v_sector2_id;
  insert into public.sectors (organization_id, code, nom, nb_abonnes, lineaire_km)
    values (v_org_id, 'SECT-03', 'Secteur Sud', 6500, 260)
    returning id into v_sector3_id;

  insert into public.sources (organization_id, type, nom)
    values (v_org_id, 'saisie_manuelle', 'Jeu de données de démonstration')
    returning id into v_source_id;

  insert into public.meters (organization_id, sector_id, type, numero_serie, nom)
    values (v_org_id, null, 'production', 'PROD-001', 'Production - Station A')
    returning id into v_meter_prod1;
  insert into public.meters (organization_id, sector_id, type, numero_serie, nom)
    values (v_org_id, null, 'production', 'PROD-002', 'Production - Station B')
    returning id into v_meter_prod2;
  insert into public.meters (organization_id, sector_id, type, numero_serie, nom)
    values (v_org_id, v_sector1_id, 'sectorisation', 'SECT-01-A', 'Secteur Nord - Entrée A')
    returning id into v_meter_sect1a;
  insert into public.meters (organization_id, sector_id, type, numero_serie, nom)
    values (v_org_id, v_sector1_id, 'sectorisation', 'SECT-01-B', 'Secteur Nord - Entrée B')
    returning id into v_meter_sect1b;
  insert into public.meters (organization_id, sector_id, type, numero_serie, nom)
    values (v_org_id, v_sector2_id, 'sectorisation', 'SECT-02-A', 'Secteur Centre - Entrée A')
    returning id into v_meter_sect2a;
  insert into public.meters (organization_id, sector_id, type, numero_serie, nom)
    values (v_org_id, v_sector2_id, 'sectorisation', 'SECT-02-B', 'Secteur Centre - Entrée B')
    returning id into v_meter_sect2b;
  insert into public.meters (organization_id, sector_id, type, numero_serie, nom)
    values (v_org_id, v_sector3_id, 'sectorisation', 'SECT-03-A', 'Secteur Sud - Entrée A')
    returning id into v_meter_sect3a;
  insert into public.meters (organization_id, sector_id, type, numero_serie, nom)
    values (v_org_id, v_sector3_id, 'sectorisation', 'SECT-03-B', 'Secteur Sud - Entrée B')
    returning id into v_meter_sect3b;

  -- Partitions mensuelles nécessaires aux 24 mois de relevés.
  v_month := v_start_date;
  while v_month < v_start_date + interval '24 months' loop
    perform public.readings_ensure_partition(v_month);
    v_month := (v_month + interval '1 month')::date;
  end loop;

  -- Génération des relevés horaires : courbe journalière (nuit basse,
  -- pointes matin/soir), effet week-end, bruit ±3 %, et fuite constante de
  -- 3 m³/h injectée à partir du mois 20 (secteur Centre + production, car
  -- l'eau perdue en distribution doit aussi être produite).
  with pattern(heure, poids) as (
    values
      (0, 0.5), (1, 0.4), (2, 0.35), (3, 0.35), (4, 0.4), (5, 0.6), (6, 0.9), (7, 1.4),
      (8, 1.6), (9, 1.3), (10, 1.1), (11, 1.05), (12, 1.1), (13, 1.05), (14, 0.95), (15, 0.9),
      (16, 0.95), (17, 1.1), (18, 1.3), (19, 1.5), (20, 1.4), (21, 1.1), (22, 0.8), (23, 0.6)
  ),
  pattern_norm as (
    select heure, poids / (select avg(poids) from pattern) as multiplicateur
    from pattern
  ),
  meters_config (meter_id, baseline_avg, leak_share) as (
    values
      (v_meter_prod1, 190.0, 1.5),
      (v_meter_prod2, 158.0, 1.5),
      (v_meter_sect1a, 60.9, 0.0),
      (v_meter_sect1b, 60.9, 0.0),
      (v_meter_sect2a, 56.55, 1.5),
      (v_meter_sect2b, 56.55, 1.5),
      (v_meter_sect3a, 56.55, 0.0),
      (v_meter_sect3b, 56.55, 0.0)
  ),
  heures as (
    select generate_series(
      v_start_date::timestamptz,
      v_start_date::timestamptz + interval '24 months' - interval '1 hour',
      interval '1 hour'
    ) as ts
  )
  insert into public.readings (organization_id, meter_id, source_id, ts, volume_m3, quality_flag)
  select
    v_org_id,
    mc.meter_id,
    v_source_id,
    h.ts,
    greatest(
      mc.baseline_avg * pn.multiplicateur
        * (case when extract(dow from h.ts) in (0, 6) then 0.85 else 1.0 end)
        * (1 + (random() - 0.5) * 0.06)
      + (case when h.ts >= v_leak_start_ts then mc.leak_share else 0 end),
      0
    )::numeric(14, 3),
    'valide'
  from heures h
  join pattern_norm pn on pn.heure = extract(hour from h.ts)::int
  cross join meters_config mc;

  -- Volumes annuels du bilan : v_produit dérivé des relevés de production
  -- réellement générés ci-dessus (cohérence relevés <-> bilan) ; les autres
  -- volumes viennent typiquement du système de facturation du client, donc
  -- saisis indépendamment ici.
  v_annee1 := extract(year from v_start_date)::int;
  v_annee2 := v_annee1 + 1;

  select coalesce(sum(volume_m3), 0) into v_produit_an1
  from public.readings
  where meter_id in (v_meter_prod1, v_meter_prod2)
    and ts >= v_start_date::timestamptz
    and ts < (v_start_date + interval '12 months')::timestamptz;

  select coalesce(sum(volume_m3), 0) into v_produit_an2
  from public.readings
  where meter_id in (v_meter_prod1, v_meter_prod2)
    and ts >= (v_start_date + interval '12 months')::timestamptz
    and ts < (v_start_date + interval '24 months')::timestamptz;

  insert into public.balance_inputs (
    organization_id, annee, v_produit, v_importe, v_exporte,
    v_comptabilise, v_sans_comptage, v_service,
    lineaire_reseau_km, nb_abonnes, zone_repartition_eaux
  ) values
    (v_org_id, v_annee1, v_produit_an1, 0, 0, 2400000, 20000, 15000, 800, 20000, false),
    (v_org_id, v_annee2, v_produit_an2, 0, 0, 2400000, 20000, 15000, 800, 20000, false);
  -- balances (rendement, ILP, ILC, conformité) calculée automatiquement par
  -- le trigger balance_inputs_recalculer.

  raise notice 'Seed « Régie des Sources » terminé : organization_id=%', v_org_id;
end $$;
