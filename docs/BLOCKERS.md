# Questions et actions en attente de Rayan

Chaque point est contourné dans le code par un bouchon marqué
`TODO(RAYAN)` ; le travail continue sur ce qui n'en dépend pas.

## Ouverts

1. **Base vierge pour vérifier les migrations** — le poste n'a ni Docker ni
   CLI Supabase, et il n'existe qu'un projet Supabase (développement). Les
   migrations sont appliquées sur ce projet, par-dessus l'existant. Pour
   vérifier « sur base vierge », il faudra soit installer Docker + CLI
   Supabase (`supabase start` puis `supabase db reset`), soit utiliser le
   futur projet de production (phase 10).
