-- Corrige l'avertissement "Function Search Path Mutable" du linter Supabase.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
