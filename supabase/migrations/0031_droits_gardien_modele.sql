-- Droits d'exécution des fonctions de 0030 (migration séparée, même
-- constat qu'en 0004/0009/0010/0018/0021/0023/0025/0028) : fonctions
-- déclencheurs, aucun appel direct via /rest/v1/rpc/…

revoke all on function public.sites_valeurs_par_defaut() from public, anon, authenticated;
revoke all on function public.devices_completer() from public, anon, authenticated;
revoke all on function public.releves_temperature_sans_suppression() from public, anon, authenticated;
revoke all on function public.pilots_fin_par_defaut() from public, anon, authenticated;
