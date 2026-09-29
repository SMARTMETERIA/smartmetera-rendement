-- Gardien de l'eau, phase G7 : marque blanche
-- (voir docs/PLAN_GARDIEN.md, section 4, phase G7).
--
-- 1. Espace de stockage « marques » : logos des partenaires, lisibles par
--    tous (e-mails, pages preuve, connexion), écrits seulement par
--    l'administrateur de l'organisation (dossier = identifiant de
--    l'organisation) ou le superadmin.
-- 2. marque_publique(slug) : ce qu'affiche la page de connexion d'un
--    partenaire (/p/<slug>/connexion), sans connexion et sans donnée
--    personnelle.

-- ---------------------------------------------------------------------------
-- 1) Logos
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marques', 'marques', true, 524288, array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'])
on conflict (id) do nothing;

create function public.peut_ecrire_marque(p_nom_objet text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select split_part(p_nom_objet, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.has_role(
      split_part(p_nom_objet, '/', 1)::uuid,
      array['admin_client', 'superadmin']::public.role_utilisateur[]
    );
$$;

create policy "marques_creation" on storage.objects for insert to authenticated
  with check (bucket_id = 'marques' and public.peut_ecrire_marque(name));
create policy "marques_modification" on storage.objects for update to authenticated
  using (bucket_id = 'marques' and public.peut_ecrire_marque(name))
  with check (bucket_id = 'marques' and public.peut_ecrire_marque(name));
create policy "marques_suppression" on storage.objects for delete to authenticated
  using (bucket_id = 'marques' and public.peut_ecrire_marque(name));

-- ---------------------------------------------------------------------------
-- 2) Marque publique d'un partenaire
-- ---------------------------------------------------------------------------
create function public.marque_publique(p_slug text)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'display_name', coalesce(b.display_name, o.nom),
    'primary_color', b.primary_color,
    'accent_color', b.accent_color,
    'logo_path', b.logo_path,
    'show_powered_by', coalesce(b.show_powered_by, true)
  )
  from public.organizations o
  left join public.org_branding b on b.organization_id = o.id
  where p_slug ~ '^[a-z0-9-]{2,60}$'
    and o.slug = p_slug
    and o.kind in ('sites', 'immeuble')
    and o.status <> 'suspendu';
$$;
