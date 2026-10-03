-- Gardien de l'eau, phase G2 : rôles, sécurité et connexion
-- (voir docs/PLAN_GARDIEN.md, section 4, phase G2).
--
-- 1. Pays d'une organisation (retenue à la source par défaut au Maroc).
-- 2. Adhésions à portée « site » : directeur de site (ses sites) et
--    technicien limité à certains sites. Un technicien peut aussi avoir
--    une portée organisation (installateur d'un partenaire).
-- 3. Fonctions d'aide : mes_sites(), can_read_site(), site_role(),
--    peut_agir_site(), mes_compteurs(), mes_points_temperature().
--    Dans les politiques, « x in (select public.mes_sites()) » est évalué
--    une seule fois par requête (sous-requête non corrélée).
-- 4. Politiques de chaque table Gardien : lecture par les membres de
--    l'organisation ou par les adhésions à portée site ; écriture selon le
--    rôle. Les pilotes ne se lisent directement que par le superadmin
--    (notes internes) ; les autres passent par pilotes_visibles().
-- 5. Page preuve : lisible sans connexion uniquement par son jeton, tant
--    qu'elle n'a pas expiré (page_preuve_publique), sans donnée
--    personnelle.
--
-- Toutes les fonctions : security definer + search_path vide. Droits
-- d'exécution dans 0035.

-- ---------------------------------------------------------------------------
-- 1) Pays de l'organisation
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column country text not null default 'FR' check (country in ('FR', 'MA'));

-- ---------------------------------------------------------------------------
-- 2) Adhésions à portée site
-- ---------------------------------------------------------------------------
alter table public.memberships
  add column site_id uuid,
  drop constraint memberships_scope_type_check,
  drop constraint memberships_scope_coherent;

alter table public.memberships
  add constraint memberships_scope_type_check
    check (scope_type in ('organisation', 'client', 'site')),
  add constraint memberships_scope_coherent check (
    (scope_type = 'organisation' and scope_id is null and site_id is null
      and role not in ('gestionnaire', 'directeur_site'))
    or (scope_type = 'client' and scope_id is not null and site_id is null
      and role = 'gestionnaire')
    or (scope_type = 'site' and site_id is not null and scope_id is null
      and role in ('directeur_site', 'technicien'))
  ),
  -- Le site doit appartenir à l'organisation de l'adhésion.
  add constraint memberships_site_fk foreign key (site_id, organization_id)
    references public.sites (id, organization_id) on delete cascade;

drop index public.memberships_user_org_scope_uniq;
create unique index memberships_user_org_scope_uniq on public.memberships (
  user_id,
  organization_id,
  coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(site_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
create index memberships_site_idx on public.memberships (site_id, organization_id)
  where site_id is not null;

-- ---------------------------------------------------------------------------
-- 3) Fonctions d'aide
-- ---------------------------------------------------------------------------

-- Sites accessibles par une adhésion à portée site (rôles filtrés si
-- p_roles est donné). Les membres de l'organisation passent par
-- is_member() : ils ne figurent pas ici.
create function public.mes_sites(p_roles public.role_utilisateur[] default null)
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select m.site_id
  from public.memberships m
  where m.user_id = auth.uid()
    and m.scope_type = 'site'
    and (p_roles is null or m.role = any(p_roles));
$$;

create function public.can_read_site(p_site_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.sites s
    where s.id = p_site_id
      and (
        public.is_member(s.organization_id)
        or s.id in (select public.mes_sites())
      )
  );
$$;

-- Rôle de l'utilisateur courant sur un site : rôle d'organisation s'il en
-- a un, sinon rôle à portée site ; 'superadmin' pour la plateforme.
create function public.site_role(p_site_id uuid)
returns public.role_utilisateur
language sql
security definer
stable
set search_path = ''
as $$
  select case
    when public.is_platform_admin() then 'superadmin'::public.role_utilisateur
    else coalesce(
      (
        select m.role
        from public.memberships m
        join public.sites s on s.organization_id = m.organization_id
        where s.id = p_site_id
          and m.user_id = auth.uid()
          and m.scope_type = 'organisation'
        limit 1
      ),
      (
        select m.role
        from public.memberships m
        where m.site_id = p_site_id
          and m.user_id = auth.uid()
          and m.scope_type = 'site'
        limit 1
      )
    )
  end;
$$;

-- Action sur un site : rôle d'organisation parmi p_roles_org, ou rôle à
-- portée site parmi p_roles_site (le superadmin passe par has_role).
create function public.peut_agir_site(
  p_site_id uuid,
  p_roles_org public.role_utilisateur[],
  p_roles_site public.role_utilisateur[]
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.sites s
    where s.id = p_site_id
      and (
        public.has_role(s.organization_id, p_roles_org)
        or s.id in (select public.mes_sites(p_roles_site))
      )
  );
$$;

create function public.mes_compteurs()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select m.id
  from public.meters m
  where m.site_id in (select public.mes_sites());
$$;

create function public.mes_points_temperature()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select p.id
  from public.temperature_points p
  where p.site_id in (select public.mes_sites());
$$;

-- ---------------------------------------------------------------------------
-- 4) Politiques
-- ---------------------------------------------------------------------------

-- Sites : création par l'organisation ; le directeur modifie ses sites
-- (les prix restent protégés par sites_valeurs_par_defaut).
drop policy "lecture_sites" on public.sites;
drop policy "ecriture_sites" on public.sites;
create policy "lecture_sites" on public.sites for select
  using (public.is_member(organization_id) or id in (select public.mes_sites()));
create policy "creation_sites" on public.sites for insert
  with check (public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]));
create policy "modification_sites" on public.sites for update
  using (
    public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[])
    or id in (select public.mes_sites(array['directeur_site']::public.role_utilisateur[]))
  )
  with check (
    public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[])
    or id in (select public.mes_sites(array['directeur_site']::public.role_utilisateur[]))
  );
create policy "suppression_sites" on public.sites for delete
  using (public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]));

-- Points de comptage : lecture par site ; pose par un agent ou un
-- technicien (portée organisation ou site). Admin : politique existante.
create policy "lecture_meters_site" on public.meters for select
  using (site_id in (select public.mes_sites()));
create policy "pose_meters_creation" on public.meters for insert
  with check (
    site_id is not null
    and type = 'point_comptage'
    and (
      public.has_role(organization_id, array['agent', 'technicien']::public.role_utilisateur[])
      or site_id in (select public.mes_sites(array['technicien']::public.role_utilisateur[]))
    )
  );
create policy "pose_meters_modification" on public.meters for update
  using (
    site_id is not null
    and (
      public.has_role(organization_id, array['agent', 'technicien']::public.role_utilisateur[])
      or site_id in (select public.mes_sites(array['technicien']::public.role_utilisateur[]))
    )
  )
  with check (
    site_id is not null
    and type = 'point_comptage'
    and (
      public.has_role(organization_id, array['agent', 'technicien']::public.role_utilisateur[])
      or site_id in (select public.mes_sites(array['technicien']::public.role_utilisateur[]))
    )
  );

-- Appareils : lecture par site ; pose (rattachement, état) par un agent ou
-- un technicien. La clé composite (site_id, organization_id) empêche de
-- déplacer un appareil vers une autre organisation.
create policy "lecture_devices_site" on public.devices for select
  using (site_id in (select public.mes_sites()));
create policy "pose_devices_modification" on public.devices for update
  using (
    public.has_role(organization_id, array['agent', 'technicien']::public.role_utilisateur[])
    or site_id in (select public.mes_sites(array['technicien']::public.role_utilisateur[]))
  )
  with check (
    public.has_role(organization_id, array['agent', 'technicien']::public.role_utilisateur[])
    or site_id in (select public.mes_sites(array['technicien']::public.role_utilisateur[]))
  );

-- Relevés d'eau des points de comptage d'un site.
create policy "lecture_readings_site" on public.readings for select
  using (meter_id in (select public.mes_compteurs()));

-- Points et relevés de température.
drop policy "lecture_temperature_points" on public.temperature_points;
drop policy "ecriture_temperature_points" on public.temperature_points;
create policy "lecture_temperature_points" on public.temperature_points for select
  using (public.is_member(organization_id) or site_id in (select public.mes_sites()));
create policy "ecriture_temperature_points" on public.temperature_points for all
  using (
    public.has_role(organization_id, array['admin_client', 'agent', 'technicien', 'superadmin']::public.role_utilisateur[])
    or site_id in (select public.mes_sites(array['technicien']::public.role_utilisateur[]))
  )
  with check (
    public.has_role(organization_id, array['admin_client', 'agent', 'technicien', 'superadmin']::public.role_utilisateur[])
    or site_id in (select public.mes_sites(array['technicien']::public.role_utilisateur[]))
  );

create policy "lecture_temperature_readings_site" on public.temperature_readings for select
  using (point_id in (select public.mes_points_temperature()));

-- Plages de nuit et données d'activité : saisies aussi par le directeur.
drop policy "lecture_quiet_windows" on public.quiet_windows;
drop policy "ecriture_quiet_windows" on public.quiet_windows;
create policy "lecture_quiet_windows" on public.quiet_windows for select
  using (public.is_member(organization_id) or site_id in (select public.mes_sites()));
create policy "ecriture_quiet_windows" on public.quiet_windows for all
  using (
    public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[])
    or site_id in (select public.mes_sites(array['directeur_site']::public.role_utilisateur[]))
  )
  with check (
    public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[])
    or site_id in (select public.mes_sites(array['directeur_site']::public.role_utilisateur[]))
  );

drop policy "lecture_activity_data" on public.activity_data;
drop policy "ecriture_activity_data" on public.activity_data;
create policy "lecture_activity_data" on public.activity_data for select
  using (public.is_member(organization_id) or site_id in (select public.mes_sites()));
create policy "ecriture_activity_data" on public.activity_data for all
  using (
    public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[])
    or site_id in (select public.mes_sites(array['directeur_site']::public.role_utilisateur[]))
  )
  with check (
    public.has_role(organization_id, array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[])
    or site_id in (select public.mes_sites(array['directeur_site']::public.role_utilisateur[]))
  );

-- Fuites, alertes, pages preuve, rapports : lecture par site.
drop policy "lecture_leak_events" on public.leak_events;
create policy "lecture_leak_events" on public.leak_events for select
  using (public.is_member(organization_id) or site_id in (select public.mes_sites()));

create policy "lecture_alerts_site" on public.alerts for select
  using (site_id in (select public.mes_sites()));

drop policy "lecture_proof_pages" on public.proof_pages;
create policy "lecture_proof_pages" on public.proof_pages for select
  using (public.is_member(organization_id) or site_id in (select public.mes_sites()));

drop policy "lecture_site_reports" on public.site_reports;
create policy "lecture_site_reports" on public.site_reports for select
  using (public.is_member(organization_id) or site_id in (select public.mes_sites()));

-- Pilotes : lecture directe réservée au superadmin (notes internes et
-- prochaine action) ; les champs utiles au client via pilotes_visibles().
drop policy "lecture_pilots" on public.pilots;
create policy "lecture_pilots" on public.pilots for select
  using (public.is_platform_admin());

create function public.pilotes_visibles()
returns table (
  id uuid,
  organization_id uuid,
  site_id uuid,
  started_at timestamptz,
  ends_at timestamptz,
  status text,
  auto_convert_consent boolean,
  consent_at timestamptz,
  consent_by_name text,
  setup_refund_if_nothing_found boolean,
  anomalies_found integer
)
language sql
security definer
stable
set search_path = ''
as $$
  select p.id, p.organization_id, p.site_id, p.started_at, p.ends_at, p.status,
    p.auto_convert_consent, p.consent_at, p.consent_by_name,
    p.setup_refund_if_nothing_found, p.anomalies_found
  from public.pilots p
  where auth.uid() is not null
    and public.can_read_site(p.site_id)
  order by p.started_at desc;
$$;

-- ---------------------------------------------------------------------------
-- 5) Page preuve publique : jeton exact, non expirée. Renvoie le contenu
--    figé, le site (nom, type, ville) et la marque du partenaire si
--    l'organisation en a une (sinon l'écran affiche SmartMeteria). Compte
--    les consultations.
-- ---------------------------------------------------------------------------
create function public.page_preuve_publique(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_page public.proof_pages;
  v_site public.sites;
  v_marque jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then
    return null;
  end if;

  update public.proof_pages
  set views = views + 1
  where token = p_token
    and expires_at > now()
  returning * into v_page;
  if not found then
    return null;
  end if;

  select * into v_site from public.sites where id = v_page.site_id;

  select jsonb_build_object(
    'display_name', coalesce(b.display_name, o.nom),
    'logo_path', b.logo_path,
    'primary_color', b.primary_color,
    'accent_color', b.accent_color,
    'show_powered_by', b.show_powered_by
  )
  into v_marque
  from public.org_branding b
  join public.organizations o on o.id = b.organization_id
  where b.organization_id = v_page.organization_id;

  return jsonb_build_object(
    'period_start', v_page.period_start,
    'period_end', v_page.period_end,
    'expires_at', v_page.expires_at,
    'content', v_page.content,
    'site', jsonb_build_object(
      'name', v_site.name,
      'type', v_site.type,
      'city', v_site.city,
      'country', v_site.country,
      'currency', v_site.currency,
      'timezone', v_site.timezone,
      'activity_unit', v_site.activity_unit
    ),
    'marque', v_marque
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Membres d'une organisation : ajoute le site des adhésions à portée
--    site.
-- ---------------------------------------------------------------------------
drop function public.membres_organisation(uuid);

create function public.membres_organisation(p_organization_id uuid)
returns table (
  membership_id uuid,
  user_id uuid,
  email text,
  role public.role_utilisateur,
  created_at timestamptz,
  scope_type text,
  scope_id uuid,
  client_name text,
  site_id uuid,
  site_name text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_role(p_organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;

  return query
    select m.id, m.user_id, u.email::text, m.role, m.created_at, m.scope_type, m.scope_id, c.name,
      m.site_id, s.name
    from public.memberships m
    join auth.users u on u.id = m.user_id
    left join public.clients c on c.id = m.scope_id
    left join public.sites s on s.id = m.site_id
    where m.organization_id = p_organization_id
    order by m.created_at;
end;
$$;
