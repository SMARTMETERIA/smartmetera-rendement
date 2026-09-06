-- Cause racine du problème persistant en 0009 : PostgreSQL accorde EXECUTE
-- à PUBLIC par défaut à la création d'une fonction. Revoke ciblé sur
-- anon/authenticated (0009) ne suffit pas tant que PUBLIC reste autorisé —
-- authenticated/anon en héritent via PUBLIC quel que soit leur revoke
-- propre. Voir aussi 0003 qui avait déjà géré ce cas pour d'autres fonctions.

revoke all on function public.calculer_volumes_journaliers(date) from public;
revoke all on function public.calculer_debits_horaires_secteurs(timestamptz, timestamptz) from public;
revoke all on function public.calculer_nightline(uuid, uuid, date) from public;
revoke all on function public.detecter_alerte_fuite_secteur(uuid, uuid, date) from public;
revoke all on function public.detecter_compteurs_muets() from public;
revoke all on function public.detecter_debits_inverses(timestamptz, timestamptz) from public;
revoke all on function public.detecter_index_anormaux(date) from public;
revoke all on function public.upsert_bilan_calcule(
  uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, boolean
) from public;
revoke all on function public.calculer_bilan_annee_civile(uuid, integer) from public;
revoke all on function public.calculer_bilan_glissant_12m(uuid, date) from public;
revoke all on function public.executer_moteur_nocturne(date) from public;
revoke all on function public.cron_declencheur_moteur_nocturne() from public;

-- service_role doit rester capable d'exécuter (utilisé par pg_cron et un
-- éventuel appel manuel via la Service Role Key / SQL Editor en tant que
-- postgres, propriétaire des fonctions, qui n'a de toute façon pas besoin
-- de grant explicite).
grant execute on function public.executer_moteur_nocturne(date) to service_role;
grant execute on function public.calculer_volumes_journaliers(date) to service_role;
grant execute on function public.calculer_debits_horaires_secteurs(timestamptz, timestamptz) to service_role;
grant execute on function public.calculer_nightline(uuid, uuid, date) to service_role;
grant execute on function public.detecter_alerte_fuite_secteur(uuid, uuid, date) to service_role;
grant execute on function public.detecter_compteurs_muets() to service_role;
grant execute on function public.detecter_debits_inverses(timestamptz, timestamptz) to service_role;
grant execute on function public.detecter_index_anormaux(date) to service_role;
grant execute on function public.calculer_bilan_annee_civile(uuid, integer) to service_role;
grant execute on function public.calculer_bilan_glissant_12m(uuid, date) to service_role;
