-- Droits d'exécution des fonctions de 0039 (migration séparée, même
-- constat que les précédentes) : RPC applicatives, chacune vérifie
-- elle-même le rôle de l'appelant.

revoke all on function public.importer_stock(uuid, jsonb) from public, anon;
revoke all on function public.attribuer_appareils(uuid[], uuid) from public, anon;
revoke all on function public.corriger_poids_impulsion(uuid, numeric) from public, anon;

grant execute on function public.importer_stock(uuid, jsonb) to authenticated;
grant execute on function public.attribuer_appareils(uuid[], uuid) to authenticated;
grant execute on function public.corriger_poids_impulsion(uuid, numeric) to authenticated;
