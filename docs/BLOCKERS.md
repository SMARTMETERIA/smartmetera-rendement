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
2. **Accès superadmin** — le compte `dev-superadmin` est supprimé et aucun
   superadmin n'existe plus sur la base de développement. Pour retrouver
   l'espace `/admin` : exécuter `scripts/grant-superadmin.sql` avec votre
   adresse dans l'éditeur SQL de Supabase (le compte doit exister).
3. **Google** — créer les identifiants OAuth (Google Cloud Console) et
   activer le fournisseur Google dans Supabase. En attendant, le bouton
   « Continuer avec Google » affiche un message d'indisponibilité.
4. **Turnstile** — créer les clés Cloudflare Turnstile
   (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`). Sans elles,
   la case anti-robot de l'inscription est ignorée.
5. **Orthographe de la marque** — « SmartMetera » (plan) ou
   « SmartMeteria » (écrans Réseau, domaine) ? Centralisé dans
   `NOM_PLATEFORME` (`src/lib/marque.ts`).
6. **Mots de passe divulgués** — activer la protection dans le tableau de
   bord Supabase (Authentication > Sign In / Providers > Email > « Prevent
   use of leaked passwords »). Action manuelle, signalée par l'avis de
   sécurité Supabase depuis que la connexion par mot de passe existe.
7. **Prix de l'eau au Maroc** — aucun prix par défaut en dirhams : chaque
   site marocain doit recevoir son prix au m³ (sinon aucun montant n'est
   calculé). Un prix moyen de référence peut être ajouté dans
   `platform_settings` (clé `prix_eau_defaut`, valeur `MAD`).
8. **Tarifs marocains à compléter** — mise en service du premier point
   avec passerelle, point supplémentaire et sonde de température : « à
   paramétrer » dans le plan, laissés vides dans `platform_settings`
   (clé `tarifs`, valeur `MAD`).
