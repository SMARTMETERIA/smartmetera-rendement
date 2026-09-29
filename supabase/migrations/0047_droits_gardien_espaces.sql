-- Droits d'exécution des fonctions de 0046 : chacune vérifie l'appelant.

revoke all on function public.courbe_horaire_site(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.accepter_conversion_pilote(uuid, text) from public, anon;
revoke all on function public.retirer_conversion_pilote(uuid) from public, anon;
revoke all on function public.journaliser_consultation(uuid, text) from public, anon;

grant execute on function public.courbe_horaire_site(uuid, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.accepter_conversion_pilote(uuid, text) to authenticated;
grant execute on function public.retirer_conversion_pilote(uuid) to authenticated;
grant execute on function public.journaliser_consultation(uuid, text) to authenticated;
