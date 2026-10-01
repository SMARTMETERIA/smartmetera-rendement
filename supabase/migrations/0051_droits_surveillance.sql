-- Droits d'exécution des fonctions de 0050 (migration séparée, même
-- constat que les précédentes) : chacune vérifie elle-même l'appelant.

revoke all on function public.etat_taches_planifiees() from public, anon;
revoke all on function public.purger_donnees_personnelles() from public, anon, authenticated;

grant execute on function public.etat_taches_planifiees() to authenticated, service_role;
grant execute on function public.purger_donnees_personnelles() to service_role;

-- Table de plateforme : aucune écriture depuis le navigateur.
revoke insert, update, delete, truncate on public.taches_executions from anon, authenticated;
