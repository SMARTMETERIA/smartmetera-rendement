-- Fondations multi-tenant : organisations, rôles, appartenance.
-- Toute table métier future doit suivre ce même schéma : organization_id
-- + RLS activée + policies basées sur la fonction current_organization_ids().

create type public.role_utilisateur as enum (
  'superadmin',
  'admin_client',
  'agent',
  'lecteur'
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  role public.role_utilisateur not null default 'lecteur',
  created_at timestamptz not null default now(),
  unique (user_id, organization_id)
);

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;

-- Fonction utilitaire : organisations auxquelles l'utilisateur connecté appartient.
-- security definer + search_path fixe pour éviter tout contournement RLS.
create function public.current_organization_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select organization_id
  from public.memberships
  where user_id = auth.uid();
$$;

create policy "Lecture des organisations membres"
  on public.organizations for select
  using (id in (select public.current_organization_ids()));

create policy "Lecture de ses propres appartenances"
  on public.memberships for select
  using (user_id = auth.uid());

-- Gabarit à copier pour chaque nouvelle table métier :
--
-- create table public.exemple (
--   id uuid primary key default gen_random_uuid(),
--   organization_id uuid not null references public.organizations (id) on delete cascade,
--   ...
-- );
-- alter table public.exemple enable row level security;
-- create policy "Accès par organisation" on public.exemple for all
--   using (organization_id in (select public.current_organization_ids()))
--   with check (organization_id in (select public.current_organization_ids()));
