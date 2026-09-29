-- Gardien de l'eau, phase G3 : provisionnement en masse et correction du
-- poids d'impulsion.
--
-- 1. importer_stock() : appareils ajoutés au stock d'une organisation ;
--    une référence déjà enregistrée (dans cette organisation ou une autre)
--    est ignorée et signalée, jamais écrasée.
-- 2. attribuer_appareils() : un lot d'appareils en stock rattaché à un site.
-- 3. corriger_poids_impulsion() : après vérification de l'index lu sur le
--    compteur, le poids d'impulsion est corrigé et les volumes mesurés
--    depuis la pose sont recalculés (marqués « corrigee », jamais
--    supprimés), avec une trace dans audit_log.
-- Droits d'exécution dans 0040.

create function public.importer_stock(p_organization_id uuid, p_lignes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ligne jsonb;
  v_importes integer := 0;
  v_ignores text[] := array[]::text[];
  v_id uuid;
begin
  if not public.has_role(
    p_organization_id,
    array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]
  ) then
    raise exception 'Votre rôle ne permet pas d''ajouter des appareils au stock.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) > 2000 then
    raise exception 'Liste d''appareils invalide (2000 au plus).';
  end if;

  for v_ligne in select * from jsonb_array_elements(p_lignes) loop
    v_id := null;
    insert into public.devices (
      organization_id, device_ref, model, kit, transmission, sim_ref, qr_code, provisioning_status
    ) values (
      p_organization_id,
      v_ligne ->> 'device_ref',
      v_ligne ->> 'model',
      v_ligne ->> 'kit',
      v_ligne ->> 'transmission',
      nullif(v_ligne ->> 'sim_ref', ''),
      v_ligne ->> 'qr_code',
      'en_stock'
    )
    on conflict do nothing
    returning id into v_id;
    if v_id is null then
      v_ignores := v_ignores || (v_ligne ->> 'device_ref');
    else
      v_importes := v_importes + 1;
    end if;
  end loop;

  return jsonb_build_object('importes', v_importes, 'deja_enregistres', to_jsonb(v_ignores));
end;
$$;

create function public.attribuer_appareils(p_device_ids uuid[], p_site_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site public.sites;
  v_nb integer;
begin
  select * into v_site from public.sites where id = p_site_id and active;
  if v_site.id is null or not public.has_role(
    v_site.organization_id,
    array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]
  ) then
    raise exception 'Site introuvable ou rôle insuffisant.' using errcode = '42501';
  end if;
  update public.devices
  set site_id = p_site_id,
      provisioning_status = 'attribue'
  where id = any(p_device_ids)
    and organization_id = v_site.organization_id
    and provisioning_status in ('en_stock', 'attribue');
  get diagnostics v_nb = row_count;
  return v_nb;
end;
$$;

create function public.corriger_poids_impulsion(p_meter_id uuid, p_poids_l numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meter public.meters;
  v_nb integer;
begin
  select * into v_meter from public.meters where id = p_meter_id;
  if v_meter.id is null or v_meter.site_id is null or not public.peut_agir_site(
    v_meter.site_id,
    array['admin_client', 'agent', 'technicien', 'superadmin']::public.role_utilisateur[],
    array['technicien']::public.role_utilisateur[]
  ) then
    raise exception 'Point de comptage introuvable ou rôle insuffisant.' using errcode = '42501';
  end if;
  if p_poids_l is null or p_poids_l <= 0 then
    raise exception 'Poids d''impulsion invalide.';
  end if;
  if v_meter.pulse_weight_l is null or v_meter.pulse_weight_l <= 0 then
    raise exception 'Poids d''impulsion d''origine inconnu : correction impossible.';
  end if;
  if p_poids_l = v_meter.pulse_weight_l then
    return jsonb_build_object('releves_corriges', 0);
  end if;

  update public.readings
  set volume_m3 = round(volume_m3 * p_poids_l / v_meter.pulse_weight_l, 3),
      quality_flag = case when quality_flag = 'valide' then 'corrigee' else quality_flag end
  where meter_id = p_meter_id
    and ts >= coalesce(v_meter.installed_at, '-infinity'::timestamptz);
  get diagnostics v_nb = row_count;

  update public.meters set pulse_weight_l = p_poids_l where id = p_meter_id;
  update public.devices set litres_par_impulsion = p_poids_l where meter_id = p_meter_id;

  insert into public.audit_log (organization_id, user_id, action, entite, entite_id, avant, apres)
  values (
    v_meter.organization_id, auth.uid(), 'correction_poids_impulsion', 'meters', p_meter_id::text,
    jsonb_build_object('pulse_weight_l', v_meter.pulse_weight_l),
    jsonb_build_object('pulse_weight_l', p_poids_l, 'releves_corriges', v_nb)
  );

  return jsonb_build_object('releves_corriges', v_nb);
end;
$$;
