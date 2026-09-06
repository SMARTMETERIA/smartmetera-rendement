-- Bug réel trouvé en validant le moteur contre les données réelles :
-- "v_bi IS NOT NULL" sur une variable de type "record" ne détecte pas
-- fiablement si SELECT INTO a trouvé une ligne (le champ v_bi.v_comptabilise
-- était correctement peuplé, mais le test composite retournait quand même
-- false). Remplacé par la variable spéciale FOUND, la façon fiable en
-- PL/pgSQL de tester le résultat du dernier SELECT INTO.

create or replace function public.calculer_bilan_annee_civile(p_organization_id uuid, p_annee integer)
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

  if not found then
    return null;
  end if;

  return public.upsert_bilan_calcule(
    p_organization_id, 'annee_civile', v_debut, v_fin,
    v_produit, v_importe, v_exporte,
    v_bi.v_comptabilise, v_bi.v_sans_comptage, v_bi.v_service,
    v_bi.lineaire_reseau_km, v_bi.zone_repartition_eaux
  );
end;
$$;

create or replace function public.calculer_bilan_glissant_12m(p_organization_id uuid, p_date_fin date)
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

    if found then
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
