-- Durcissement sécurité relevé par les advisors Supabase après 0002 :
--
-- 1) Les partitions de "readings" sont des tables Postgres à part entière,
--    potentiellement accessibles en direct via l'API REST (PostgREST expose
--    toutes les tables du schéma public). On active RLS dessus SANS policy :
--    l'accès direct à une partition est donc refusé par défaut. L'accès
--    légitime passe par la table mère "readings", dont les policies
--    s'appliquent normalement quel que soit l'état RLS des partitions.
-- 2) readings_ensure_partition() et recalculer_balance() n'ont pas besoin
--    d'être appelables directement par anon/authenticated : la première est
--    réservée à service_role, la seconde n'est invoquée que par le trigger.
--    (is_superadmin/is_member/has_role restent volontairement exécutables
--    par anon/authenticated : les policies RLS elles-mêmes en dépendent.)

do $$
declare
  v_partition text;
begin
  for v_partition in
    select c.relname
    from pg_inherits i
    join pg_class c on c.oid = i.inhrelid
    join pg_class p on p.oid = i.inhparent
    where p.relname = 'readings' and p.relnamespace = 'public'::regnamespace
  loop
    execute format('alter table public.%I enable row level security', v_partition);
  end loop;
end $$;

create or replace function public.readings_ensure_partition(p_month date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_name text := format('readings_%s', to_char(v_start, 'YYYY_MM'));
begin
  if not exists (select 1 from pg_class where relname = v_name and relkind = 'r') then
    execute format(
      'create table public.%I partition of public.readings for values from (%L) to (%L)',
      v_name, v_start, v_end
    );
    execute format('alter table public.%I enable row level security', v_name);
  end if;
end;
$$;

revoke all on function public.readings_ensure_partition(date) from public;
grant execute on function public.readings_ensure_partition(date) to service_role;

revoke all on function public.recalculer_balance() from public;
