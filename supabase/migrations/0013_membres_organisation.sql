-- Expose l'email des membres d'une organisation (dans auth.users,
-- inaccessible directement même à l'utilisateur authentifié) pour la page
-- /parametres > Utilisateurs. security definer + vérification explicite du
-- rôle appelant (même garantie qu'une policy RLS, appliquée manuellement
-- puisque auth.users n'est pas dans le schéma public).
create function public.membres_organisation(p_organization_id uuid)
returns table (membership_id uuid, user_id uuid, email text, role public.role_utilisateur, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(p_organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]) then
    raise exception 'Accès refusé';
  end if;

  return query
    select m.id, m.user_id, u.email::text, m.role, m.created_at
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.organization_id = p_organization_id
    order by m.created_at;
end;
$$;
