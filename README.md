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

| Commande               | Description                                          |
| ---------------------- | ---------------------------------------------------- |
| `npm run dev`          | Serveur de développement                             |
| `npm run build`        | Build de production                                  |
| `npm run start`        | Démarre le build de production                       |
| `npm run lint`         | ESLint                                               |
| `npm run test`         | Tests Vitest (une passe)                             |
| `npm run test:watch`   | Tests Vitest en mode watch                           |
| `npm run format`       | Formatage Prettier (écrit les fichiers)              |
| `npm run format:check` | Vérifie le formatage sans écrire                     |
| `npm run test:rls`     | Tests d'isolation RLS (vrai Supabase, voir plus bas) |

## Base de données

Les migrations SQL sont dans `supabase/migrations`, appliquées dans l'ordre :

- `0001_init.sql` — organisations, rôles (`superadmin`, `admin_client`, `agent`,
  `lecteur`), appartenances, fonctions RLS `is_member()` / `has_role()` /
  `is_superadmin()`. Toute nouvelle table métier doit suivre ce gabarit
  (`organization_id` + RLS + policies via ces fonctions).
- `0002_domain_schema.sql` — modèle métier complet : secteurs, sources,
  compteurs, relevés (`readings`, partitionnée par mois sur `ts`, jamais de
  suppression physique — voir CLAUDE.md), imports, bilan d'eau
  (`balance_inputs` + `balances` calculée par trigger selon les formules de
  CLAUDE.md), débit de nuit (`nightlines`), alertes, interventions, plans
  d'action, rapports, journal d'audit.
- `0003_security_hardening.sql`, `0004_revoke_execute_explicit.sql`,
  `0005_fix_set_updated_at_search_path.sql` — durcissements relevés par les
  advisors Supabase après coup (RLS sur les partitions, restriction des
  fonctions internes, `search_path` fixe).

Pour les appliquer sur un nouveau projet Supabase : installez la
[CLI Supabase](https://supabase.com/docs/guides/local-development), liez le
projet (`supabase link`) puis `supabase db push`. Sur ce projet elles sont
déjà appliquées.

### Jeu de données de démonstration

`supabase/seed.sql` crée une régie fictive « Régie des Sources » (20 000
abonnés, 800 km, hors ZRE, 3 secteurs, 8 compteurs, 24 mois de relevés
horaires avec une fuite de 3 m³/h démarrant au mois 20 dans le secteur
Centre, et le bilan annuel sur 2 exercices). Il est idempotent : le relancer
supprime et recrée les données de cette organisation.

Pour le rejouer : `supabase db push --include-seed`, ou collez son contenu
dans l'éditeur SQL du dashboard Supabase. Puis, dans cet ordre :

1. `npm run dev:seed-user` — rattache le compte superadmin de dev à la
   nouvelle organisation (le seed supprime et recrée l'organisation, donc
   les adhésions précédentes).
2. Peupler `daily_meter_volumes` sur toute la fenêtre glissante 12 mois
   (le bilan glissant agrège cette table sur 365 jours, pas seulement sur
   les nuits traitées par le moteur — voir plus bas) :
   ```sql
   do $$
   declare v_jour date;
   begin
     for v_jour in select generate_series((now() - interval '12 months')::date, (now() - interval '1 day')::date, interval '1 day')::date
     loop perform public.calculer_volumes_journaliers(v_jour); end loop;
   end $$;
   ```
3. Lancer `executer_moteur_nocturne()` sur au moins les 35-40 derniers
   jours (14 nuits de baseline + marge) pour peupler débits de nuit,
   alertes et bilans :
   ```sql
   do $$
   declare v_jour date;
   begin
     for v_jour in select generate_series((now() - interval '35 days')::date, (now() - interval '1 day')::date, interval '1 day')::date
     loop perform public.executer_moteur_nocturne(v_jour); end loop;
   end $$;
   ```

### Tests d'isolation RLS

`npm run test:rls` crée deux organisations et deux utilisateurs jetables sur
le **vrai** projet Supabase (clés dans `.env.local`), vérifie qu'aucun ne
peut lire ni écrire les données de l'autre, puis nettoie tout. Ces tests ne
tournent pas avec `npm run test` (ils ont leur propre config
`vitest.integration.config.ts`) car ils ont besoin du réseau et des clés.

### Import CSV/Excel

Page `/import` : assistant en 5 étapes (modèle → fichier → mapping → aperçu
→ suivi). Le parsing/mapping/calcul de delta (`src/lib/import/`) est partagé
entre l'aperçu client et l'exécution serveur — dupliqué en version Deno dans
`supabase/functions/process-import/lib/` (extensions `.ts` explicites et
imports `npm:`/CDN requis par le runtime Deno, incompatibles avec la
résolution de modules Next.js ; voir le commentaire en tête de chaque
fichier miroir). Les fichiers Excel sont convertis en CSV **côté client**
avant l'upload (voir `src/lib/import/toCsv.ts`) : la fonction Edge ne
traite que du CSV, pour éviter d'embarquer le volumineux bundle SheetJS
dans l'exécution serveur.

8 modèles système préremplis (générique, Topkapi, Sofrel S4W, EWEBTEL/Plum,
Kamstrup READy, Diehl IZAR@NET, Itron Temetra, export facturation JVS) sont
seedés par `0006_import_pipeline.sql`, avec un fichier d'exemple par modèle
dans `supabase/sample-imports/` — **mappings de départ plausibles, non
vérifiés contre une vraie spec éditeur** ; l'assistant (détection auto +
correction manuelle + sauvegarde en modèle d'organisation) est fait pour
absorber l'écart avec un vrai fichier client.

Gestion des index cumulés (rollover, remplacement de compteur, deltas
négatifs) : voir `src/lib/import/computeDeltas.ts` et ses tests. Idempotence
stricte via la contrainte unique `readings(meter_id, ts, source_id)` :
rejouer un import met à jour les lignes existantes, n'en duplique aucune
(vérifié par un test de bout en bout lors du développement).

### Moteur de calcul

Chaque nuit à 05:00 Europe/Paris (pg_cron, auto-gating DST-safe toutes les
15 min via `cron_declencheur_moteur_nocturne()` — pas de notion de fuseau
nommé côté cron, donc c'est la fonction elle-même qui vérifie l'heure locale
réelle), `executer_moteur_nocturne()` :

1. Agrège les relevés horaires en volumes journaliers par compteur
   (`daily_meter_volumes`, jour calendaire Europe/Paris).
2. Calcule le débit horaire net par secteur — entrées moins sorties selon
   `meters.sens` (`sector_hourly_flows`).
3. Calcule le DMN (minimum sur la fenêtre [2h,4h) heure locale, résolue
   heure-par-heure via `AT TIME ZONE` donc correcte lors des 2 nuits de
   changement d'heure par an), la baseline (médiane des 14 nuits
   précédentes) et la fuite estimée (`nightlines`), et déclenche une alerte
   `fuite_suspectee` si 3 nuits consécutives dépassent baseline + max(20 %,
   0,5 m³/h).
4. Détecte les compteurs muets (>48h sans relevé), les débits de secteur
   inversés et les volumes journaliers statistiquement anormaux (alertes
   `compteur_muet` / `debit_inverse` / `index_anormal`).
5. Calcule le bilan d'eau par organisation sur deux types de période
   (`bilans_calcules`) : année civile (exact, depuis `balance_inputs`) et
   glissant 12 mois (v_produit/importé/exporté mesurés en télérelève ;
   v_comptabilisé/sans comptage/service répartis au prorata des jours sur
   les exercices civils chevauchés — voir `repartirComposantesAnnuelles()`).

Relançable à la main : `select public.executer_moteur_nocturne('2026-06-15');`
(par défaut : hier). Journal d'exécution dans `moteur_executions` (lecture
superadmin uniquement).

Miroir TypeScript testable des formules (`src/lib/engine/`) : `bilan.ts`
(rendement/ILP/ILC/seuil/conformité/distance au seuil — voir aussi
`src/lib/rendement.ts`), `dmn.ts` (DMN/baseline/fuite/règle d'alerte),
`alertes.ts` (compteur muet/débit inversé/index anormal). Testé avec des
valeurs connues, dont l'exemple de référence : 2 000 000 m³ produits, 0
importé, 0 exporté, 1 220 000 comptabilisé, 10 000 sans comptage, 20 000
service, 800 km, hors ZRE → rendement 62,5 %, ILP 2,568, ILC 4,281, seuil
65,86 %, non conforme.

### Tableau de bord

Toutes les pages authentifiées vivent sous `src/app/(dashboard)/` (groupe de
routes, layout partagé avec navigation) et vérifient la session **côté
serveur** (`getCurrentOrganization()` → `redirect("/connexion")` si absente)
— contrairement à `/import` qui vérifie côté client. En dev, `DevAutoLogin`
tient compte de cette différence : après connexion automatique silencieuse,
il renvoie explicitement vers `/app` si l'utilisateur vient d'atterrir sur
`/connexion` (sinon il resterait sur l'écran de connexion malgré une session
valide).

- **`/app`** — vue d'ensemble : rendement/ILP/seuil/conformité (dernier
  bilan glissant 12 mois), tendance 12 mois (Recharts), top 3 secteurs à
  pertes, alertes ouvertes, compteur d'économies estimées, bouton PDF.
- **`/secteurs`** / **`/secteurs/[id]`** — classement par fuite estimée ;
  détail avec courbe de débit de nuit (jusqu'à 60 jours), alertes,
  interventions, formulaire de création d'intervention.
- **`/compteurs`** — liste, statut de remontée (réutilise
  `estCompteurMuet()` du moteur), dernier volume connu.
- **`/bilan`** — saisie/édition annuelle avec calcul immédiat (le formulaire
  appelle `calculerBilan()` du moteur TS à chaque frappe, avant tout envoi
  réseau) ; historique depuis `balances`.
- **`/alertes`** — file complète, actions Acquitter / Clôturer.
- **`/rapports`** — liste des rapports + export PDF (impression navigateur).
- **`/parametres`** — organisation (dont le prix €/m³ utilisé pour le
  compteur d'économies), secteurs, compteurs, sources, utilisateurs (rôles,
  via `membres_organisation()` — la seule façon d'exposer un e-mail
  `auth.users` en restant vérifié côté serveur).

**Compteur d'économies estimées** : valeur annualisée des fuites détectées
(dernière nuit connue par secteur × 365 × prix €/m³, réglable dans
Paramètres). C'est une estimation de la valeur détectable grâce à la
sectorisation, pas un montant déjà facturé — la formule est indiquée en
légende sous le chiffre.

**Bouton « Rapport PDF »** : utilise l'impression du navigateur
(`window.print()`, voir `src/components/BoutonImprimer.tsx`) — pas de
dépendance PDF supplémentaire. La navigation (`no-print`) est masquée à
l'impression (voir `globals.css`).

## Structure

```
src/
  app/
    (dashboard)/             pages authentifiées (layout + nav partagés)
      app/                    vue d'ensemble (/app)
      secteurs/, secteurs/[id]/
      compteurs/, bilan/, alertes/, rapports/, parametres/
    (auth)/connexion/         page de connexion (magic link)
    auth/callback/            échange du code magic link contre une session
    import/                   assistant d'import CSV/Excel
  components/
    ui/                       composants shadcn/ui
    charts/                    graphiques Recharts (tendance, débit de nuit)
  lib/
    rendement.ts              formules métier du bilan d'eau (bilan annuel déclaré)
    engine/                    moteur de calcul (bilan par période, DMN, alertes)
    organization.ts            résolution de l'organisation courante (serveur)
    supabase/                  clients Supabase (browser, serveur, proxy)
    import/                    parsing/mapping/deltas partagés (client + tests)
  proxy.ts                     rafraîchissement de session à chaque requête
  test/
    integration/               tests d'isolation RLS (vrai Supabase)
supabase/
  migrations/                   migrations SQL versionnées
  seed.sql                      jeu de données de démonstration
  sample-imports/                fichiers d'exemple par modèle d'import
  functions/process-import/      Edge Function : exécution des imports
```
