-- Même constat qu'en 0004/0009/0010/0018 : le revoke ne tient pas dans la
-- même migration que la création de la fonction (grant PUBLIC par défaut
-- réappliqué par Supabase). Migration séparée.
revoke all on function public.cron_declencheur_rapport_mensuel() from public;
grant execute on function public.cron_declencheur_rapport_mensuel() to service_role;
