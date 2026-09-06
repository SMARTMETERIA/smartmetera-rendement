-- Même schéma que 0003/0009/0010 : revoke dans une migration séparée pour
-- qu'il tienne face au grant par défaut de Supabase à la création. anon ne
-- doit jamais pouvoir lister des e-mails ; authenticated le peut, la
-- fonction elle-même vérifie le rôle appelant sur l'organisation demandée.
revoke all on function public.membres_organisation(uuid) from public;
revoke all on function public.membres_organisation(uuid) from anon;
grant execute on function public.membres_organisation(uuid) to authenticated;
