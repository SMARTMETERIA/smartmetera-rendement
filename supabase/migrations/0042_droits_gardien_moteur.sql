-- Droits d'exécution des fonctions de 0041 (migration séparée, même
-- constat que les précédentes). Les actions sur une fuite et le registre
-- vérifient eux-mêmes l'appelant ; la clôture interne est réservée au
-- moteur (service_role).

revoke all on function public.nombre_fr(numeric, integer) from public, anon;
revoke all on function public.economies_prudentes(numeric, numeric, text, integer) from public, anon;
revoke all on function public.fuite_cloturer_reparee(uuid, text, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.peut_agir_fuite(uuid) from public, anon;
revoke all on function public.fuite_prendre_en_charge(uuid) from public, anon;
revoke all on function public.fuite_declarer_reparee(uuid) from public, anon;
revoke all on function public.fuite_declarer_fausse_alerte(uuid, text) from public, anon;
revoke all on function public.leak_events_compter_pilote() from public, anon, authenticated;
revoke all on function public.registre_temperatures(uuid, date, date) from public, anon;

grant execute on function public.nombre_fr(numeric, integer) to authenticated, service_role;
grant execute on function public.economies_prudentes(numeric, numeric, text, integer) to authenticated, service_role;
grant execute on function public.fuite_cloturer_reparee(uuid, text, timestamptz, uuid) to service_role;
grant execute on function public.peut_agir_fuite(uuid) to authenticated, service_role;
grant execute on function public.fuite_prendre_en_charge(uuid) to authenticated;
grant execute on function public.fuite_declarer_reparee(uuid) to authenticated;
grant execute on function public.fuite_declarer_fausse_alerte(uuid, text) to authenticated;
grant execute on function public.registre_temperatures(uuid, date, date) to authenticated, service_role;
