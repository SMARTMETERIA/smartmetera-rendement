-- Droits d'exécution des fonctions de 0034 (migration séparée, même
-- constat qu'en 0004/0009/0010/0018/0021/0023/0025/0028/0031).
--
-- - Fonctions des politiques RLS et RPC applicatives : authenticated
--   (chacune vérifie elle-même l'appelant).
-- - Page preuve : anon aussi (lien partagé, sans connexion).

revoke all on function public.mes_sites(public.role_utilisateur[]) from public, anon;
revoke all on function public.can_read_site(uuid) from public, anon;
revoke all on function public.site_role(uuid) from public, anon;
revoke all on function public.peut_agir_site(uuid, public.role_utilisateur[], public.role_utilisateur[]) from public, anon;
revoke all on function public.mes_compteurs() from public, anon;
revoke all on function public.mes_points_temperature() from public, anon;
revoke all on function public.pilotes_visibles() from public, anon;
revoke all on function public.membres_organisation(uuid) from public, anon;
revoke all on function public.page_preuve_publique(text) from public;

grant execute on function public.mes_sites(public.role_utilisateur[]) to authenticated, service_role;
grant execute on function public.can_read_site(uuid) to authenticated, service_role;
grant execute on function public.site_role(uuid) to authenticated, service_role;
grant execute on function public.peut_agir_site(uuid, public.role_utilisateur[], public.role_utilisateur[]) to authenticated, service_role;
grant execute on function public.mes_compteurs() to authenticated, service_role;
grant execute on function public.mes_points_temperature() to authenticated, service_role;
grant execute on function public.pilotes_visibles() to authenticated;
grant execute on function public.membres_organisation(uuid) to authenticated;
grant execute on function public.page_preuve_publique(text) to anon, authenticated, service_role;
