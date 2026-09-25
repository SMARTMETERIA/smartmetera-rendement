-- Même constat qu'en 0004/0009/0010/0018/0021/0023 : le revoke ne tient pas
-- dans la même migration que la création des fonctions (grant PUBLIC par
-- défaut réappliqué par Supabase). Migration séparée.
--
-- Les fonctions déclencheurs n'ont pas besoin d'EXECUTE pour se déclencher ;
-- la révocation empêche seulement un appel direct via /rest/v1/rpc/…

revoke all on function public.slugifier(text) from public, anon, authenticated;
revoke all on function public.generer_slug_organisation(text, uuid) from public, anon, authenticated;
revoke all on function public.organizations_remplir_slug() from public, anon, authenticated;
revoke all on function public.org_branding_proteger_mention() from public, anon, authenticated;
revoke all on function public.meters_deduire_immeuble() from public, anon, authenticated;
revoke all on function public.registre_envois_ajout_seul() from public, anon, authenticated;

grant execute on function public.slugifier(text) to service_role;
grant execute on function public.generer_slug_organisation(text, uuid) to service_role;
