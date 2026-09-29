-- Droits d'exécution des fonctions de 0037 (migration séparée, même
-- constat qu'en 0004/0009/0010/0018/0021/0023/0025/0028/0031/0035) :
-- RPC applicatives appelables par un utilisateur connecté, chacune vérifie
-- elle-même l'appelant.

revoke all on function public.demarrer_pose(uuid, uuid, text, text, text, text, numeric, numeric, text, integer, text) from public, anon;
revoke all on function public.etat_pose(uuid) from public, anon;
revoke all on function public.index_reconstitue(uuid) from public, anon;

grant execute on function public.demarrer_pose(uuid, uuid, text, text, text, text, numeric, numeric, text, integer, text) to authenticated;
grant execute on function public.etat_pose(uuid) to authenticated;
grant execute on function public.index_reconstitue(uuid) to authenticated;
