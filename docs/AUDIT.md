# Audit de départ — offre Immeuble

Phase 0 du plan `docs/PLAN_IMMEUBLE.md`, réalisée le 25 septembre 2026 sur la
branche `feat/immeuble` (partie de `main` au commit `1b7b3d4`, « prompt 8 »).
Aucun code n'a été modifié pendant cette phase.

## 1. État des tests

| Vérification | Résultat |
|---|---|
| `npx tsc --noEmit` | OK |
| `npm run lint` | OK |
| `npm test` (Vitest) | OK : 27 fichiers, 134 tests |
| `npm run test:rls` (vrai Supabase) | OK : 1 fichier, 4 tests |

## 2. Environnement

- Un seul projet Supabase : `smartmetera-rendement` (`orskfdkvczrxwcdpvlaa`),
  région `eu-west-3` (Paris), Postgres 17. C'est la base de développement ;
  il n'existe pas encore de projet de production.
- Ni Docker ni CLI Supabase sur le poste : pas de base locale. Les
  migrations sont appliquées sur le projet de développement (outil MCP
  Supabase), comme pour les prompts 0 à 8.
- `.env.local` : URL, clé anon et clé `service_role` renseignées.
  `RESEND_API_KEY` et `RESEND_FROM_EMAIL` vides : aucun e-mail ne part en
  développement (comportement souhaité).
- Pas de Playwright installé.

## 3. Base de données

### Tables (schéma `public`)

| Domaine | Tables |
|---|---|
| Organisation et accès | `organizations` (nom, ZRE, linéaire, abonnés, `prix_m3_eur`), `memberships` (user, organisation, rôle) |
| Réseau | `sectors`, `sources`, `meters` (`type`, `sens`, `numero_serie` unique par organisation), `devices`, `raw_frames` |
| Relevés | `readings` partitionnée par mois sur `ts` (26 partitions, 2024-09 à 2026-10), unicité `(meter_id, ts, source_id)` ; ~140 000 lignes de démonstration |
| Import | `import_jobs`, `import_templates` (8 modèles système), bucket `imports` |
| Moteur | `daily_meter_volumes`, `sector_hourly_flows`, `nightlines`, `bilans_calcules`, `moteur_executions` |
| Bilan annuel | `balance_inputs`, `balances` (trigger `recalculer_balance`) |
| Alertes et actions | `alerts` (`notifie_le`), `interventions`, `action_plans`, `actions`, `catalogue_actions_types` |
| Rapports | `reports`, `rapport_destinataires`, bucket `rapports` |
| E-mails | `digest_hebdo_envois`, `inbound_emails` |
| Superadmin | `checklist_activation_items`, `checklist_activation_suivi`, `audit_log` (triggers `log_audit` sur `organizations` et `memberships`) |

Toutes les tables ont RLS activée. Les partitions de `readings` ont RLS
activée sans politique (accès uniquement par la table mère).

### Rôles et fonctions RLS

- Enum `role_utilisateur` : `superadmin`, `admin_client`, `agent`, `lecteur`.
- `superadmin` est un rôle **porté par une adhésion à une organisation**
  (`memberships.role`), pas une table de plateforme.
- Fonctions `security definer` : `is_superadmin()`, `is_member(org)`,
  `has_role(org, rôles[])`, `membres_organisation(org)`. Elles utilisent
  `set search_path = public` (pas `''`).
- Gabarit de politique : lecture `is_member(organization_id)`, écriture
  `has_role(organization_id, …)`.

### Fonctions du moteur et tâches planifiées

- Moteur nocturne `executer_moteur_nocturne()` : volumes journaliers (jour
  Europe/Paris), débits de secteur, DMN, baseline, alertes fuite, compteurs
  muets (48 h), débits inversés, index anormaux, bilans.
- pg_cron (UTC) avec auto-filtrage sur l'heure de Paris, toutes les 15 min :
  `moteur-nocturne-declencheur` (5 h), `notifications-alertes`,
  `notifications-digest-hebdo` (lundi 7 h), `rapport-mensuel-declencheur`
  (le 1er à 6 h), plus `readings-ensure-next-partition` (le 25 à 0 h UTC).
- Appels HTTP vers les Edge Functions par `pg_net`, avec URL et clé anon
  lues dans Supabase Vault (`functions_base_url`, `anon_key`).

### Edge Functions déployées

`process-import`, `ingest` (JWT désactivé, jeton dans l'URL),
`notifications`, `inbound-email` (JWT désactivé), `reports`.

### E-mails et PDF

- Gabarit HTML commun `src/lib/notifications/emailLayout.ts` (couleurs
  écrites en dur, nom « SmartMeteria » en dur), dupliqué en Deno dans chaque
  Edge Function. Envoi par l'API HTTP Resend (`fetch`), pas de SDK.
- PDF : `npm:pdf-lib` dans l'Edge Function `reports` uniquement
  (`pdfBuilder.ts`, police standard WinAnsi, neutraliseur `assainir()`).
  Côté application : impression navigateur (`window.print()`).

## 4. Compte `dev-superadmin` et contournements d'authentification

| Élément | Emplacement |
|---|---|
| Script qui crée le compte avec un **mot de passe écrit en clair dans le dépôt** | `scripts/create-dev-user.mjs`, commande `npm run dev:seed-user` dans `package.json` |
| Connexion automatique au chargement de chaque page (dev) | `src/components/DevAutoLogin.tsx`, monté dans `src/app/layout.tsx` |
| Variables de contournement | `NEXT_PUBLIC_DEV_AUTO_LOGIN_EMAIL`, `NEXT_PUBLIC_DEV_AUTO_LOGIN_PASSWORD` (`.env.example`, `.env.local`) |
| Compte en base | `auth.users` : `dev-superadmin@smartmeteria.test`, adhésion `superadmin` à « Régie des Sources » |
| Mentions | `README.md` (tableau de bord, jeu de démonstration), en-tête de `supabase/seed.sql` |

Le compte `raya.elhassani@gmail.com` existe dans `auth.users` sans aucune
adhésion.

## 5. Avis de sécurité Supabase (advisors)

- Partitions de `readings` : RLS sans politique (voulu, niveau INFO).
- `pg_net` installé dans le schéma `public` (WARN).
- `is_member`, `has_role`, `is_superadmin` exécutables par `anon` (voulu :
  les politiques en dépendent ; ils ne renvoient rien d'utile sans session).
- Protection contre les mots de passe divulgués désactivée : à activer dès
  que la connexion par mot de passe existe (phase 2, action manuelle dans le
  tableau de bord Supabase).

## 6. Écarts avec le plan et décisions

1. **Superadmin** : le plan prévoit une table `platform_admins`. Aujourd'hui
   c'est un rôle d'adhésion. Phase 2 : créer `platform_admins`, faire
   reposer `is_superadmin()` dessus (les politiques existantes restent
   valides), migrer puis retirer les adhésions `superadmin`.
2. **Nom du rôle admin** : le plan dit `admin` ; l'existant dit
   `admin_client`. On garde `admin_client` (renommer un enum casse toutes
   les politiques Réseau) ; il joue le rôle « admin » d'une organisation
   Immeuble. Nouveau rôle d'adhésion : `gestionnaire` (portée client).
3. **Nommage des colonnes** : l'existant mélange tables en anglais et
   colonnes en français (`nom`, `actif`). Le plan fixe explicitement les
   noms des nouvelles colonnes (en anglais) ; on les suit tels quels pour
   que le plan reste la source de vérité.
4. **Relevés = deltas, pas index** : `readings.volume_m3` stocke le volume
   de l'intervalle. Pour un import d'index, la première ligne de chaque
   compteur est ignorée faute d'index précédent. Pour l'offre Immeuble
   (un fichier de relève par mois), on perdrait un intervalle par compteur
   et par fichier. Décision : ajouter `readings.index_value` (index brut,
   dans l'unité du compteur) et calculer le delta à partir du dernier index
   connu en base (phases 1 et 3).
5. **Unités** : `readings.volume_m3` porte, pour les compteurs Immeuble,
   la consommation dans l'unité du compteur (`meters.measure_unit` : m³,
   kWh, MWh, unités). Le nom de colonne est conservé pour ne pas casser le
   moteur Réseau.
6. **Prix de l'eau** : `organizations.prix_m3_eur` (défaut 2 €) sert au
   Réseau. L'offre Immeuble lit `settings.water_price_eur_m3` (défaut
   4,50 €) puis `buildings.water_price_eur_m3`.
7. **Compteurs muets** : le moteur Réseau alerte à 48 h pour tous les
   compteurs. Pour les compteurs Immeuble (relevés souvent journaliers ou
   mensuels), il faut exclure ces compteurs de la règle Réseau et appliquer
   les seuils Immeuble (7 jours / 48 h selon la fréquence).
8. **Extension `citext`** absente : à créer (schéma `extensions`) pour
   `occupants.email`.
9. **Organisation courante** : `getCurrentOrganization()` suppose une seule
   adhésion ; suffisant pour la v1 (un partenaire = une organisation).
10. **Connexion** : uniquement lien magique envoyé par le service e-mail
    intégré de Supabase (`signInWithOtp`). Mot de passe, Google, inscription
    et liens à la marque : phase 2.
11. **Thème** : jetons shadcn gris neutres, couleurs en dur dans les e-mails
    et les PDF. Marque blanche : phases 6 et 8.

## 7. Risques

| Risque | Impact | Parade prévue |
|---|---|---|
| Limites des Edge Functions (temps CPU par requête) pour 850 000 lignes en un seul appel `process-import` | Import de 2 000 compteurs × 14 mois impossible en un appel | Phase 3 : découpage en lots traités par appels successifs, insertion par lots de 5 000 |
| Pas de base locale : les migrations touchent la base de développement partagée | Une migration fautive casse l'environnement de démonstration | Migrations additives uniquement, vérifiées par les tests RLS et unitaires après chaque application |
| Mot de passe `dev-superadmin` publié dans l'historique Git | Accès superadmin à la base de développement pour quiconque lit le dépôt | Phase 2 : suppression du compte en base et du code ; le mot de passe reste dans l'historique mais ne correspond plus à aucun compte |
| Formats d'export fabricants non vérifiés | Import raté sur un vrai fichier | Modèles paramétrables marqués `TODO(RAYAN)` |
| Contenu réglementaire (décret 2020-886) | Affirmation juridique erronée | Contenu paramétrable, `TODO(RAYAN)`, aucune mention d'obligation pour l'eau froide |
