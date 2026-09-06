-- Jeu de données de démonstration : « Régie des Sources ».
-- 20 000 abonnés, 800 km de réseau, hors ZRE, 3 secteurs, 8 compteurs
-- (2 production, 6 sectorisation), ~24 mois de relevés horaires réalistes
-- se terminant hier, et les volumes annuels du bilan.
--
-- Scénario : rendement glissant 12 mois réaliste et NON conforme au décret
-- 2012-97 (~65 %, sous le seuil ~66,7 % pour ce linéaire/cette consommation
-- comptabilisée), tiré par une fuite qui démarre et monte nettement dans le
-- Secteur Centre (rampe lente sur 180 jours puis forte sur les 5 derniers
-- jours, pour que la baseline médiane 14 nuits reste basse et que le débit
-- de nuit décroche visiblement — voir README « Moteur de calcul »). Les
-- secteurs Nord et Sud restent sains (creux nocturne assez profond pour ne
-- pas générer de fuite fantôme au-dessus du seuil légitime de consommation
-- 1,7 L/h/abonné). Le compteur SECT-03-B s'arrête 5 jours avant la fin pour
-- démontrer une alerte compteur muet, en minorité.
--
-- Idempotent : rejoue-le autant de fois que nécessaire, il nettoie d'abord
-- toute donnée précédente identifiée par le nom de l'organisation. Après
-- l'avoir rejoué, relancer `npm run dev:seed-user` (rattache le compte
-- superadmin de dev à la nouvelle organisation) puis le moteur de calcul
-- (voir README) pour peupler volumes journaliers / débits de nuit / bilans.

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
  v_start_date date := (now() - interval '24 months')::date;
  v_end_date date := (now() - interval '1 day')::date;
  v_month date;
  v_annee int;
  v_produit_annee numeric(14, 3);
begin
  -- Reproductibilité du bruit aléatoire entre deux exécutions.
  perform setseed(0.91);

  -- Nettoyage idempotent (cascade sur secteurs, compteurs, relevés,
  -- bilan, adhésions).
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

  update public.meters set sens = 'entree'
  where organization_id = v_org_id and type = 'sectorisation';

  -- Partitions mensuelles nécessaires à la fenêtre de relevés.
  v_month := date_trunc('month', v_start_date)::date;
  while v_month <= date_trunc('month', v_end_date)::date loop
    perform public.readings_ensure_partition(v_month);
    v_month := (v_month + interval '1 month')::date;
  end loop;

  -- Génération des relevés horaires : courbe journalière (creux nocturne
  -- profond à 2h-3h pour rester sous le plancher de consommation légitime
  -- 1,7 L/h/abonné), effet week-end, bruit ±2 %, perte structurelle plate
  -- sur la production (fuites diffuses hors secteur instrumenté), et une
  -- fuite qui démarre et monte dans le Secteur Centre (répercutée aussi sur
  -- la production, car l'eau perdue en distribution doit aussi être
  -- produite) : rampe lente (0 → 15 % du pic) sur les 180 premiers jours de
  -- la fenêtre, puis rampe forte (15 % → 100 %) sur les 5 derniers jours,
  -- pour que la baseline médiane 14 nuits reste tirée par les nuits saines
  -- et que le décrochage soit net sur les 3 dernières nuits.
  with pattern(heure, poids) as (
    values
      (0, 0.5), (1, 0.4), (2, 0.095), (3, 0.095), (4, 0.4), (5, 0.6), (6, 0.9), (7, 1.4),
      (8, 1.6), (9, 1.3), (10, 1.1), (11, 1.05), (12, 1.1), (13, 1.05), (14, 0.95), (15, 0.9),
      (16, 0.95), (17, 1.1), (18, 1.3), (19, 1.5), (20, 1.4), (21, 1.1), (22, 0.8), (23, 0.6)
  ),
  pattern_norm as (
    select heure, poids / (select avg(poids) from pattern) as multiplicateur
    from pattern
  ),
  meters_config (meter_id, baseline_avg, structural, is_leak_meter) as (
    values
      (v_meter_prod1, 190.0, 46.36, true),
      (v_meter_prod2, 158.0, 46.36, true),
      (v_meter_sect1a, 60.9, 0.0, false),
      (v_meter_sect1b, 60.9, 0.0, false),
      (v_meter_sect2a, 56.55, 0.0, true),
      (v_meter_sect2b, 56.55, 0.0, true),
      (v_meter_sect3a, 56.55, 0.0, false),
      (v_meter_sect3b, 56.55, 0.0, false)
  ),
  heures as (
    select generate_series(
      v_start_date::timestamptz,
      (v_end_date + 1)::timestamptz - interval '1 hour',
      interval '1 hour'
    ) as ts
  ),
  ramp as (
    select
      (v_end_date - interval '180 days')::timestamptz as ramp_start,
      (v_end_date - interval '5 days')::timestamptz as steep_start,
      (v_end_date + 1)::timestamptz - interval '1 hour' as ramp_end
  )
  insert into public.readings (organization_id, meter_id, source_id, ts, volume_m3, quality_flag)
  select
    v_org_id, mc.meter_id, v_source_id, h.ts,
    greatest(
      mc.baseline_avg * pn.multiplicateur
        * (case when extract(dow from h.ts) in (0, 6) then 0.85 else 1.0 end)
        * (1 + (random() - 0.5) * 0.02)
      + mc.structural
      + (case when not mc.is_leak_meter then 0
              when h.ts < r.ramp_start then 0
              when h.ts < r.steep_start then
                0.15 * (extract(epoch from (h.ts - r.ramp_start))
                  / nullif(extract(epoch from (r.steep_start - r.ramp_start)), 0)) * 4.0
              else
                (0.15 + 0.85 * (extract(epoch from (h.ts - r.steep_start))
                  / nullif(extract(epoch from (r.ramp_end - r.steep_start)), 0))) * 4.0
         end),
      0
    )::numeric(14, 3),
    'valide'
  from heures h
  cross join ramp r
  join pattern_norm pn on pn.heure = extract(hour from h.ts)::int
  cross join meters_config mc
  -- SECT-03-B cesse de remonter des données 5 jours avant la fin
  -- (démonstration d'une alerte compteur muet, en minorité).
  where not (mc.meter_id = v_meter_sect3b and h.ts > (v_end_date - interval '5 days')::timestamptz);

  -- Volumes annuels du bilan (année civile) : v_produit dérivé des relevés
  -- de production réellement générés ci-dessus (cohérence relevés <->
  -- bilan) pour chaque année civile couverte par la fenêtre, y compris les
  -- deux années partielles aux bornes ; v_comptabilisé/sans comptage/
  -- service viennent typiquement du système de facturation du client, donc
  -- saisis indépendamment ici (constants : 2 400 000 / 20 000 / 15 000 m³,
  -- calibrés pour un rendement glissant 12 mois non conforme réaliste).
  for v_annee in extract(year from v_start_date)::int .. extract(year from v_end_date)::int loop
    select coalesce(sum(volume_m3), 0) into v_produit_annee
    from public.readings
    where organization_id = v_org_id
      and meter_id in (v_meter_prod1, v_meter_prod2)
      and ts >= make_date(v_annee, 1, 1)::timestamptz
      and ts < make_date(v_annee + 1, 1, 1)::timestamptz;

    insert into public.balance_inputs (
      organization_id, annee, v_produit, v_importe, v_exporte,
      v_comptabilise, v_sans_comptage, v_service,
      lineaire_reseau_km, nb_abonnes, zone_repartition_eaux
    ) values (
      v_org_id, v_annee, v_produit_annee, 0, 0, 2400000, 20000, 15000, 800, 20000, false
    )
    on conflict (organization_id, annee) do update set
      v_produit = excluded.v_produit, v_importe = excluded.v_importe, v_exporte = excluded.v_exporte,
      v_comptabilise = excluded.v_comptabilise, v_sans_comptage = excluded.v_sans_comptage,
      v_service = excluded.v_service, lineaire_reseau_km = excluded.lineaire_reseau_km,
      nb_abonnes = excluded.nb_abonnes, zone_repartition_eaux = excluded.zone_repartition_eaux;
  end loop;
  -- balances (rendement, ILP, ILC, conformité) calculée automatiquement par
  -- le trigger balance_inputs_recalculer ; bilans_calcules/nightlines/
  -- alertes nécessitent en plus le moteur de calcul (voir README).

  raise notice 'Seed « Régie des Sources » terminé : organization_id=%', v_org_id;
end $$;
