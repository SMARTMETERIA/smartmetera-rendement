# SmartMeteria Rendement

SaaS multi-tenant pour services d'eau potable : bilan d'eau continu, rendement
de réseau, localisation des fuites par secteur, conformité décret 2012-97,
export RPQS/SISPEA, rapports PDF, alertes.

Voir [CLAUDE.md](../CLAUDE.md) pour le brief projet complet (mission, règles
absolues, formules métier).

## Stack

- **Next.js** (App Router) + **TypeScript strict** + **Tailwind CSS** + **shadcn/ui**
- **Recharts** pour les graphiques
- **Supabase** : Postgres, Auth (magic link), Storage, Edge Functions, pg_cron
- **Resend** pour les e-mails transactionnels
- **Vitest** pour les tests
- **ESLint** + **Prettier**
- Migrations SQL versionnées dans `supabase/migrations`

## Démarrage

1. Copier `.env.example` vers `.env.local` et renseigner les clés Supabase
   (Project Settings > API dans le dashboard Supabase) et Resend.
2. Installer les dépendances : `npm install`
3. Lancer le serveur de développement : `npm run dev`
4. Ouvrir [http://localhost:3000](http://localhost:3000)

## Scripts

| Commande               | Description                             |
| ---------------------- | --------------------------------------- |
| `npm run dev`          | Serveur de développement                |
| `npm run build`        | Build de production                     |
| `npm run start`        | Démarre le build de production          |
| `npm run lint`         | ESLint                                  |
| `npm run test`         | Tests Vitest (une passe)                |
| `npm run test:watch`   | Tests Vitest en mode watch              |
| `npm run format`       | Formatage Prettier (écrit les fichiers) |
| `npm run format:check` | Vérifie le formatage sans écrire        |

## Base de données

Les migrations SQL sont dans `supabase/migrations`. La migration `0001_init.sql`
pose les fondations multi-tenant (organisations, rôles, RLS) : toute nouvelle
table métier doit suivre le même gabarit (`organization_id` + RLS + policy par
organisation), voir les règles absolues dans CLAUDE.md.

Pour appliquer les migrations, installez la [CLI Supabase](https://supabase.com/docs/guides/local-development)
puis liez le projet (`supabase link`) et exécutez `supabase db push`.

## Structure

```
src/
  app/                    routes App Router
    (auth)/connexion/     page de connexion (magic link)
    auth/callback/        échange du code magic link contre une session
  components/ui/          composants shadcn/ui
  lib/
    rendement.ts          formules métier du bilan d'eau
    supabase/              clients Supabase (browser, serveur, proxy)
  proxy.ts                 rafraîchissement de session à chaque requête
supabase/migrations/       migrations SQL versionnées
```
