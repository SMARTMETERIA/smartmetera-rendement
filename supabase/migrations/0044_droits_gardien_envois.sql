-- Droits d'exécution des fonctions de 0043 (migration séparée, même
-- constat que les précédentes) : chacune vérifie elle-même l'appelant.

revoke all on function public.mon_telephone_alerte(text) from public, anon;
revoke all on function public.marquer_rapport_ouvert(uuid) from public, anon;
revoke all on function public.envois_ajout_seul() from public, anon, authenticated;

grant execute on function public.mon_telephone_alerte(text) to authenticated;
grant execute on function public.marquer_rapport_ouvert(uuid) to authenticated;
