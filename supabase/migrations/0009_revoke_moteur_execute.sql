-- Même constat qu'en 0004 : le revoke appliqué dans la même migration que
-- la création des fonctions ne tient pas (grant par défaut Supabase
-- réappliqué). Il faut une migration séparée, exécutée après coup.

revoke execute on function public.calculer_volumes_journaliers(date) from anon, authenticated;
revoke execute on function public.calculer_debits_horaires_secteurs(timestamptz, timestamptz) from anon, authenticated;
revoke execute on function public.calculer_nightline(uuid, uuid, date) from anon, authenticated;
revoke execute on function public.detecter_alerte_fuite_secteur(uuid, uuid, date) from anon, authenticated;
revoke execute on function public.detecter_compteurs_muets() from anon, authenticated;
revoke execute on function public.detecter_debits_inverses(timestamptz, timestamptz) from anon, authenticated;
revoke execute on function public.detecter_index_anormaux(date) from anon, authenticated;
revoke execute on function public.upsert_bilan_calcule(
  uuid, text, date, date, numeric, numeric, numeric, numeric, numeric, numeric, numeric, boolean
) from anon, authenticated;
revoke execute on function public.calculer_bilan_annee_civile(uuid, integer) from anon, authenticated;
revoke execute on function public.calculer_bilan_glissant_12m(uuid, date) from anon, authenticated;
revoke execute on function public.executer_moteur_nocturne(date) from anon, authenticated;
revoke execute on function public.cron_declencheur_moteur_nocturne() from anon, authenticated;
