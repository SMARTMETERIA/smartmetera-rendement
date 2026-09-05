-- Fondations multi-tenant : organisations, rôles, appartenance, fonctions RLS.
-- Toute table métier doit suivre ce même schéma : organization_id
-- + RLS activée + policies basées sur is_member() / has_role() (gabarit en bas de fichier).

create type public.role_utilisateur as enum (
  'superadmin',
  'admin_client',
  'agent',
  'lecteur'
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  zone_repartition_eaux boolean not null default false,
  lineaire_reseau_km numeric(10, 2),
  nb_abonnes integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  role public.role_utilisateur not null default 'lecteur',
  created_at timestamptz not null default now(),
  unique (user_id, organization_id)
);

create index memberships_user_role_idx on public.memberships (user_id, role);

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;

-- Fonctions utilitaires RLS. security definer + search_path fixe : elles lisent
-- memberships elles-mêmes, donc elles doivent pouvoir le faire indépendamment
-- des policies de la table appelante (sinon risque de récursion RLS).

create function public.is_superadmin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.memberships
    where user_id = auth.uid()
      and role = 'superadmin'
  );
$$;

create function public.is_member(p_organization_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_superadmin() or exists (
    select 1
    from public.memberships
    where user_id = auth.uid()
      and organization_id = p_organization_id
  );
$$;

create function public.has_role(p_organization_id uuid, p_roles public.role_utilisateur[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_superadmin() or exists (
    select 1
    from public.memberships
    where user_id = auth.uid()
      and organization_id = p_organization_id
      and role = any(p_roles)
  );
$$;

-- Trigger générique de maintien de updated_at.
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- Policies : organizations
create policy "lecture_organizations" on public.organizations for select
  using (public.is_member(id));

create policy "creation_organizations" on public.organizations for insert
  with check (public.is_superadmin());

create policy "modification_organizations" on public.organizations for update
  using (public.has_role(id, array['admin_client', 'superadmin']::public.role_utilisateur[]))
  with check (public.has_role(id, array['admin_client', 'superadmin']::public.role_utilisateur[]));

create policy "suppression_organizations" on public.organizations for delete
  using (public.is_superadmin());

-- Policies : memberships (un admin_client ne peut pas s'auto-promouvoir superadmin)
create policy "lecture_memberships" on public.memberships for select
  using (
    user_id = auth.uid()
    or public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[])
  );

create policy "creation_memberships" on public.memberships for insert
  with check (
    public.is_superadmin()
    or (
      public.has_role(organization_id, array['admin_client']::public.role_utilisateur[])
      and role <> 'superadmin'
    )
  );

create policy "modification_memberships" on public.memberships for update
  using (public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]))
  with check (
    public.is_superadmin()
    or (
      public.has_role(organization_id, array['admin_client']::public.role_utilisateur[])
      and role <> 'superadmin'
    )
  );

create policy "suppression_memberships" on public.memberships for delete
  using (
    user_id = auth.uid()
    or public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[])
  );

-- Gabarit à copier pour chaque nouvelle table métier :
--
-- create table public.exemple (
--   id uuid primary key default gen_random_uuid(),
--   organization_id uuid not null references public.organizations (id) on delete cascade,
--   ...
-- );
-- create index exemple_org_idx on public.exemple (organization_id);
-- alter table public.exemple enable row level security;
-- create policy "lecture_exemple" on public.exemple for select
--   using (public.is_member(organization_id));
-- create policy "ecriture_exemple" on public.exemple for all
--   using (public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]))
--   with check (public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]));
