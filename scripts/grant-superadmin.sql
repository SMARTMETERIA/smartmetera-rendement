-- Donne les droits superadmin de la plateforme à un compte existant.
--
-- 1. Créez d'abord le compte : inscription (/inscription), invitation, ou
--    tableau de bord Supabase (Authentication > Users > Add user).
-- 2. Remplacez l'adresse ci-dessous par la vôtre.
-- 3. Exécutez ce script dans l'éditeur SQL du tableau de bord Supabase.
--
-- Aucun compte superadmin n'est jamais créé par les migrations ni par les
-- jeux de démonstration.

insert into public.platform_admins (user_id)
select id
from auth.users
where lower(email) = lower('ADRESSE-A-REMPLIR@exemple.fr')
on conflict (user_id) do nothing
returning user_id;

-- Pour retirer ces droits :
-- delete from public.platform_admins
-- where user_id = (select id from auth.users where lower(email) = lower('ADRESSE-A-REMPLIR@exemple.fr'));
