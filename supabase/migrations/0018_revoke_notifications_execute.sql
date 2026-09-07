-- Même constat qu'en 0004/0009/0010 : le revoke appliqué dans la même
-- migration que la création des fonctions ne tient pas (grant PUBLIC par
-- défaut réappliqué par Supabase). Migration séparée, exécutée après coup.
-- Cause racine : PostgreSQL accorde EXECUTE à PUBLIC par défaut à la
-- création d'une fonction ; anon/authenticated en héritent via PUBLIC quel
-- que soit leur revoke propre — il faut révoquer PUBLIC lui-même.

revoke all on function public.cron_appeler_edge_function(text) from public;
revoke all on function public.cron_notifier_alertes() from public;
revoke all on function public.cron_declencheur_digest_hebdo() from public;

-- service_role doit rester capable d'exécuter (pg_cron tourne comme
-- propriétaire des fonctions, qui n'a de toute façon pas besoin de grant
-- explicite ; ce grant couvre un éventuel appel manuel via la Service Role
-- Key / SQL Editor).
grant execute on function public.cron_appeler_edge_function(text) to service_role;
grant execute on function public.cron_notifier_alertes() to service_role;
grant execute on function public.cron_declencheur_digest_hebdo() to service_role;
