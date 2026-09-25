# Avancement — offre Immeuble

Branche : `feat/immeuble`. Plan : `docs/PLAN_IMMEUBLE.md`. Questions en
attente : `docs/BLOCKERS.md`.

## Phase 0 : audit — terminée

Plan : lire code et migrations, repérer `dev-superadmin`, lancer les tests,
écrire `docs/AUDIT.md`.

Fait : `docs/AUDIT.md` (état, écarts, risques). Typecheck, lint, 134 tests
unitaires et 4 tests RLS verts.

Comment tester à l'écran : rien à tester, phase sans code.

## Phase 1 : modèle de données Immeuble — terminée

Plan :
1. Migration `0024_immeuble_modele.sql` : colonnes d'organisation (offre, statut, slug, réglages), marque, clients, immeubles, logements, occupants, occupations.
2. Compteurs (immeuble, logement, fluide, unité), relevés (codes d'alarme, index brut), alertes (immeuble, logement, nouveaux types).
3. Relevés mensuels, notes annuelles, registre des envois en ajout seul (déclencheurs), bilans d'immeuble, usage mensuel.
4. Clés étrangères composites (même organisation garantie), index, RLS de base sur chaque table ; `0025` pour les révocations.
5. Test statique « chaque table a sa RLS » + vérifications SQL, tests existants verts.

Fait : migrations `0024` et `0025` appliquées sur la base de développement
(pas de base vierge disponible, voir `BLOCKERS.md`). Scénario SQL annulé
en fin de transaction : slugs uniques, e-mail insensible à la casse,
immeuble déduit du logement, référence vers une autre organisation
refusée, codes d'alarme contrôlés, un seul envoi par relevé et par canal,
registre non modifiable et non supprimable (sauf purge d'organisation),
relevé déjà envoyé non supprimable. Aucun nouvel avis de sécurité
Supabase. 217 tests unitaires et 4 tests RLS verts.

Écart assumé : `readings.index_value` ajouté (non prévu au plan) pour ne
pas perdre le premier intervalle de chaque compteur à chaque import
d'index mensuel (voir `AUDIT.md`, point 4).

Comment tester à l'écran : rien de visible, l'application Réseau doit
fonctionner exactement comme avant (connexion, vue d'ensemble, secteurs).

## Phase 2 : rôles, sécurité et connexion autonome — en cours

Plan :
1. Migrations : rôle `gestionnaire` à portée client, `platform_admins`, fonctions d'aide (`is_platform_admin`, `org_role`, `can_read_client`, `can_read_building`, `occupant_units`), politiques élargies, RPC occupant, quotas, suppression de `dev-superadmin`.
2. Envoi d'e-mails centralisé (Resend en production, journal consultable en développement) et gabarits à la marque du partenaire.
3. Pages : connexion (mot de passe, lien, Google), inscription partenaire, mot de passe oublié, réinitialisation, compte (adresse, mot de passe, suppression), aiguillage après connexion.
4. Invitations d'agents et de gestionnaires par l'admin du partenaire ; export puis suppression d'organisation par le superadmin.
5. Tests : matrice RLS (2 partenaires, 1 régie, 2 clients, 4 immeubles, occupants dont un arrivé en cours d'année), test « `dev-superadmin` introuvable ».

État à l'arrêt de la session (25 septembre 2026, arrêt demandé par Rayan) :

Fait :
- Migrations `0026` à `0029` appliquées sur la base de développement :
  rôle `gestionnaire` à portée client, `platform_admins`, fonctions d'aide,
  politiques élargies, RPC occupant et gestionnaire, champs de plateforme
  protégés, quotas, suppression de compte et d'organisation, SIREN et
  téléphone. **Le compte `dev-superadmin` est supprimé de la base.**
- Code : envoi d'e-mails centralisé (`src/lib/email/envoyer.ts`, journal
  `/dev/emails` en développement), gabarits à la marque, connexion (mot de
  passe, lien, Google), inscription partenaire, mot de passe oublié,
  réinitialisation, `/compte`, aiguillage `/accueil`, espaces minimaux
  `/immeuble`, `/immeuble/equipe`, `/gestion`, `/mon-logement`, export et
  suppression d'organisation dans `/admin`. `DevAutoLogin` et
  `scripts/create-dev-user.mjs` retirés ; `scripts/grant-superadmin.sql`
  ajouté.
- Typecheck, lint et 229 tests unitaires verts. Non vérifié à l'écran.

Reste :
- Tests unitaires des nouveaux modules (envoi, gabarits, garde-fou,
  validation, liens, aiguillage, liste des tables exportées).
- Test « `dev-superadmin` introuvable dans le code ».
- Matrice RLS d'intégration (`src/test/integration/`).
- Vérification à l'écran : inscription → lien dans `/dev/emails` →
  arrivée sur `/immeuble`.
- README (section « Connexion et comptes ») et avis de sécurité Supabase.

Prochaine action exacte : écrire `src/lib/email/envoyer.test.ts`
(`choisirModeEnvoi`, `formaterExpediteur`), puis les autres tests listés.
