-- Même constat qu'en 0004/0009/0010/0018/0021 : le revoke ne tient pas dans
-- la même migration que la création de la fonction. log_audit() est une
-- fonction trigger (returns trigger) : la révocation ne casse pas son
-- déclenchement par organizations_log_audit/memberships_log_audit
-- (l'exécution d'un trigger ne passe pas par la vérification EXECUTE d'un
-- appel RPC), elle empêche seulement un appel direct via
-- /rest/v1/rpc/log_audit.
revoke all on function public.log_audit() from public;
