-- La marque s'écrit « SmartMeteria » partout (décision de Rayan, 29 septembre
-- 2026) : message de la protection de la mention « Propulsé par » (0024).

create or replace function public.org_branding_proteger_mention()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- auth.uid() est null pour service_role (code serveur de confiance).
  if auth.uid() is null or public.is_superadmin() then
    return new;
  end if;
  if tg_op = 'INSERT' and not new.show_powered_by then
    raise exception 'Seul le superadmin peut masquer la mention « Propulsé par SmartMeteria ».';
  end if;
  if tg_op = 'UPDATE' and new.show_powered_by is distinct from old.show_powered_by then
    raise exception 'Seul le superadmin peut masquer la mention « Propulsé par SmartMeteria ».';
  end if;
  return new;
end;
$$;
