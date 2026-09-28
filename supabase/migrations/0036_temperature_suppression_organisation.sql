-- Registre des températures : la suppression reste interdite, sauf quand
-- elle découle de la suppression de l'organisation entière (cascade depuis
-- organizations, seule clé étrangère en cascade vers cette table). Une
-- suppression directe s'exécute au niveau 1 de déclencheurs ; une cascade,
-- lancée par le déclencheur de clé étrangère, au niveau 2 ou plus.
create or replace function public.releves_temperature_sans_suppression()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('app.purge_organisation_id', true) = old.organization_id::text
    or pg_trigger_depth() > 1
  then
    return old;
  end if;
  raise exception 'Registre des températures : suppression interdite (marquer la qualité à la place).';
end;
$$;
