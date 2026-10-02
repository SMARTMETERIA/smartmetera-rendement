-- Droits d'exécution des fonctions de 0053 (migration séparée, même
-- constat que les précédentes). La saisie vérifie elle-même le rôle de
-- l'appelant ; le déclencheur n'est jamais appelé directement.

revoke all on function public.mes_reserves() from public, anon;
revoke all on function public.releves_niveau_sans_suppression() from public, anon, authenticated;
revoke all on function public.reserve_enregistrer(uuid, uuid, jsonb) from public, anon;
revoke all on function public.reserve_retirer(uuid) from public, anon;
revoke all on function public.site_arrivees_reseau(uuid, uuid[]) from public, anon;

grant execute on function public.mes_reserves() to authenticated, service_role;
grant execute on function public.reserve_enregistrer(uuid, uuid, jsonb) to authenticated;
grant execute on function public.reserve_retirer(uuid) to authenticated;
grant execute on function public.site_arrivees_reseau(uuid, uuid[]) to authenticated;

-- Relevés de niveau et coupures : écrits par le service_role seulement.
revoke insert, update, delete, truncate on public.reserve_levels from anon, authenticated;
revoke insert, update, delete, truncate on public.supply_cuts from anon, authenticated;
revoke insert, update, delete, truncate on public.water_reserves from anon, authenticated;
