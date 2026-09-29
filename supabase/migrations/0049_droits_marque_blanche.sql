-- Droits d'exécution des fonctions de 0048.

revoke all on function public.peut_ecrire_marque(text) from public, anon;
revoke all on function public.marque_publique(text) from public;

grant execute on function public.peut_ecrire_marque(text) to authenticated, service_role;
-- Page de connexion d'un partenaire : lisible sans connexion.
grant execute on function public.marque_publique(text) to anon, authenticated, service_role;
