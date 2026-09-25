-- Droits d'exécution des fonctions de 0027 (migration séparée, même
-- constat qu'en 0004/0009/0010/0018/0021/0023/0025).
--
-- - Fonctions utilisées dans les politiques RLS : exécutables par
--   authenticated (une politique s'évalue avec les droits de l'appelant).
-- - RPC applicatives (occupant, gestionnaire, compte, superadmin) :
--   authenticated ; chacune vérifie elle-même l'appelant.
-- - Fonctions réservées aux routes serveur : service_role seulement.
-- - Fonctions déclencheurs : aucun appel direct.

revoke all on function public.is_platform_admin() from public, anon;
revoke all on function public.org_role(uuid) from public, anon;
revoke all on function public.can_read_client(uuid) from public, anon;
revoke all on function public.can_read_building(uuid) from public, anon;
revoke all on function public.peut_voir_organisation(uuid) from public, anon;
revoke all on function public.mes_occupations() from public, anon;
revoke all on function public.occupant_units(date) from public, anon;
revoke all on function public.lier_mes_occupations() from public, anon;
revoke all on function public.occupant_home() from public, anon;
revoke all on function public.occupant_history(uuid, integer) from public, anon;
revoke all on function public.occupant_update_preferences(uuid, text, boolean) from public, anon;
revoke all on function public.gestionnaire_envois(uuid, date) from public, anon;
revoke all on function public.membres_organisation(uuid) from public, anon;
revoke all on function public.organisations_ou_seul_admin() from public, anon;
revoke all on function public.journaliser_export(uuid) from public, anon;
revoke all on function public.supprimer_organisation(uuid) from public, anon;

grant execute on function public.is_platform_admin() to authenticated, service_role;
grant execute on function public.org_role(uuid) to authenticated, service_role;
grant execute on function public.can_read_client(uuid) to authenticated, service_role;
grant execute on function public.can_read_building(uuid) to authenticated, service_role;
grant execute on function public.peut_voir_organisation(uuid) to authenticated, service_role;
grant execute on function public.mes_occupations() to authenticated;
grant execute on function public.occupant_units(date) to authenticated;
grant execute on function public.lier_mes_occupations() to authenticated;
grant execute on function public.occupant_home() to authenticated;
grant execute on function public.occupant_history(uuid, integer) to authenticated;
grant execute on function public.occupant_update_preferences(uuid, text, boolean) to authenticated;
grant execute on function public.gestionnaire_envois(uuid, date) to authenticated;
grant execute on function public.membres_organisation(uuid) to authenticated;
grant execute on function public.organisations_ou_seul_admin() to authenticated;
grant execute on function public.journaliser_export(uuid) to authenticated;
grant execute on function public.supprimer_organisation(uuid) to authenticated;

revoke all on function public.consommer_quota(text, integer, integer) from public, anon, authenticated;
revoke all on function public.auth_user_id_par_email(text) from public, anon, authenticated;
grant execute on function public.consommer_quota(text, integer, integer) to service_role;
grant execute on function public.auth_user_id_par_email(text) to service_role;

revoke all on function public.organizations_proteger_champs_plateforme() from public, anon, authenticated;
