-- République démocratique du Congo (2 octobre 2026), sur le modèle du
-- Maroc : pays CD, monnaies de site USD (dollar américain) et CDF (franc
-- congolais), fuseaux Africa/Kinshasa (ouest) et Africa/Lubumbashi (est).
-- Aucun tarif ni prix de l'eau inventé : valeurs vides (null) dans les
-- réglages de plateforme, à renseigner par Rayan (TODO(RAYAN)).

alter table public.organizations drop constraint organizations_country_check;
alter table public.organizations add constraint organizations_country_check
  check (country in ('FR', 'MA', 'CD'));

alter table public.sites drop constraint sites_country_check;
alter table public.sites add constraint sites_country_check
  check (country in ('FR', 'MA', 'CD'));

alter table public.sites drop constraint sites_timezone_check;
alter table public.sites add constraint sites_timezone_check
  check (timezone in ('Europe/Paris', 'Africa/Casablanca', 'Africa/Kinshasa', 'Africa/Lubumbashi'));

alter table public.sites drop constraint sites_currency_check;
alter table public.sites add constraint sites_currency_check
  check (currency in ('EUR', 'MAD', 'USD', 'CDF'));

alter table public.leak_events drop constraint leak_events_currency_check;
alter table public.leak_events add constraint leak_events_currency_check
  check (currency in ('EUR', 'MAD', 'USD', 'CDF'));

alter table public.usage_monthly drop constraint usage_monthly_currency_check;
alter table public.usage_monthly add constraint usage_monthly_currency_check
  check (currency in ('EUR', 'MAD', 'USD', 'CDF'));

-- Tarifs et prix de l'eau par défaut : à paramétrer (null), jamais inventés.
update public.platform_settings
set value = value || jsonb_build_object(
  'USD', coalesce(value -> 'USD', jsonb_build_object(
    'mise_en_service_point', null,
    'mise_en_service_premier_point_passerelle', null,
    'abonnement_premier_point', null,
    'abonnement_point_supplementaire', null,
    'sonde_temperature_mois', null,
    'retenue_source_pct_defaut', null
  )),
  'CDF', coalesce(value -> 'CDF', jsonb_build_object(
    'mise_en_service_point', null,
    'mise_en_service_premier_point_passerelle', null,
    'abonnement_premier_point', null,
    'abonnement_point_supplementaire', null,
    'sonde_temperature_mois', null,
    'retenue_source_pct_defaut', null
  ))
),
description = 'Tarifs HT par défaut (section 1 du plan). null : à paramétrer. USD et CDF (RDC) : TODO(RAYAN), aucun tarif fixé.'
where key = 'tarifs';

update public.platform_settings
set value = value || jsonb_build_object(
  'USD', coalesce(value -> 'USD', 'null'::jsonb),
  'CDF', coalesce(value -> 'CDF', 'null'::jsonb)
),
description = 'Prix de l''eau par défaut au m³ d''un nouveau site, dans sa monnaie. EUR : moyenne française TTC au 1er janvier 2025. MAD, USD et CDF : à renseigner site par site (TODO(RAYAN)).'
where key = 'prix_eau_defaut';

-- Méthode prudente : le code de la monnaie après le montant (€ pour l'euro).
create or replace function public.economies_prudentes(
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
  v_unite text := case when p_monnaie = 'EUR' then '€' else p_monnaie end;
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
