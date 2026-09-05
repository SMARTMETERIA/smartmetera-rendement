-- Le revoke "from public" (0003) ne retire pas les grants explicites que
-- Supabase applique nommément à anon/authenticated à la création d'une
-- fonction dans le schéma public. Il faut révoquer nommément.

revoke execute on function public.readings_ensure_partition(date) from anon, authenticated;
revoke execute on function public.recalculer_balance() from anon, authenticated, service_role;
