-- Gardien de l'eau, phase G6 : les espaces
-- (voir docs/PLAN_GARDIEN.md, section 4, phase G6).
--
-- 1. Courbe horaire d'un site (litres par heure, tous ses points), pour la
--    courbe des 30 derniers jours avec la bande de nuit.
-- 2. Consentement écrit du client à la conversion automatique d'un pilote
--    (case cochée, horodatée, avec son nom) et son retrait, tracés dans le
--    journal d'audit.
-- 3. Consultation en lecture seule d'une organisation par le superadmin,
--    journalisée.
-- 4. Débits de référence du pré-diagnostic (valeurs du plan : chasse
--    d'eau qui fuit 25 L/h, fuite enterrée 500 L/h), modifiables.

-- ---------------------------------------------------------------------------
-- 1) Courbe horaire d'un site
-- ---------------------------------------------------------------------------
create function public.courbe_horaire_site(p_site_id uuid, p_debut timestamptz, p_fin timestamptz)
returns table (heure timestamptz, litres numeric)
language sql
security definer
stable
set search_path = ''
as $$
  -- Un relevé porte le volume de l'intervalle qui se termine à ts.
  select date_trunc('hour', r.ts - interval '1 millisecond') as heure,
    round(sum(r.volume_m3) * 1000, 1) as litres
  from public.readings r
  join public.meters m on m.id = r.meter_id
  where public.can_read_site(p_site_id)
    and m.site_id = p_site_id
    and m.type = 'point_comptage'
    and r.quality_flag in ('valide', 'corrigee')
    and r.ts > p_debut
    and r.ts <= p_fin
    and p_fin - p_debut <= interval '62 days'
  group by 1
  order by 1;
$$;

-- ---------------------------------------------------------------------------
-- 2) Consentement de conversion d'un pilote
-- ---------------------------------------------------------------------------
create function public.accepter_conversion_pilote(p_pilot_id uuid, p_nom text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pilote public.pilots;
begin
  select * into v_pilote from public.pilots where id = p_pilot_id;
  if not found
    or auth.uid() is null
    or not public.peut_agir_site(
      v_pilote.site_id,
      array['admin_client', 'superadmin']::public.role_utilisateur[],
      array['directeur_site']::public.role_utilisateur[]
    )
  then
    raise exception 'Action non autorisée.' using errcode = '42501';
  end if;
  if v_pilote.status not in ('en_cours', 'prolonge') then
    raise exception 'Ce pilote est terminé.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_nom, ''))) < 2 or char_length(p_nom) > 120 then
    raise exception 'Indiquez votre prénom et votre nom.' using errcode = '22023';
  end if;

  update public.pilots
  set auto_convert_consent = true,
      consent_at = now(),
      consent_by_name = btrim(p_nom)
  where id = p_pilot_id;

  insert into public.audit_log (organization_id, user_id, action, entite, entite_id, apres)
  values (
    v_pilote.organization_id, auth.uid(), 'consentement_conversion', 'pilots', p_pilot_id::text,
    jsonb_build_object('consent_by_name', btrim(p_nom), 'consent_at', now())
  );
end;
$$;

create function public.retirer_conversion_pilote(p_pilot_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pilote public.pilots;
begin
  select * into v_pilote from public.pilots where id = p_pilot_id;
  if not found
    or auth.uid() is null
    or not public.peut_agir_site(
      v_pilote.site_id,
      array['admin_client', 'superadmin']::public.role_utilisateur[],
      array['directeur_site']::public.role_utilisateur[]
    )
  then
    raise exception 'Action non autorisée.' using errcode = '42501';
  end if;
  if v_pilote.status not in ('en_cours', 'prolonge') then
    raise exception 'Ce pilote est terminé.' using errcode = '22023';
  end if;

  update public.pilots
  set auto_convert_consent = false,
      consent_at = null,
      consent_by_name = null
  where id = p_pilot_id;

  insert into public.audit_log (organization_id, user_id, action, entite, entite_id, avant)
  values (
    v_pilote.organization_id, auth.uid(), 'retrait_consentement_conversion', 'pilots', p_pilot_id::text,
    jsonb_build_object('consent_by_name', v_pilote.consent_by_name, 'consent_at', v_pilote.consent_at)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Consultation superadmin journalisée
-- ---------------------------------------------------------------------------
create function public.journaliser_consultation(p_organization_id uuid, p_page text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Réservé au superadmin.' using errcode = '42501';
  end if;
  insert into public.audit_log (organization_id, user_id, action, entite, entite_id, apres)
  values (
    p_organization_id, auth.uid(), 'consultation', 'organizations', p_organization_id::text,
    jsonb_build_object('page', left(coalesce(p_page, ''), 200))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Pré-diagnostic
-- ---------------------------------------------------------------------------
insert into public.platform_settings (key, value, description) values (
  'prediagnostic',
  '{"chasse_lph": 25, "fuite_enterree_lph": 500}'::jsonb,
  'Débits de référence du pré-diagnostic (valeurs du plan) : chasse d''eau qui fuit, fuite enterrée.'
)
on conflict (key) do nothing;
