# Avancement — Gardien de l'eau

Copie de travail : `feat/gardien` (partie de `feat/immeuble`, commit
`5810423`). Plan : `docs/PLAN_GARDIEN.md` (version 2). Questions en
attente : `docs/BLOCKERS.md`. L'historique de l'offre Immeuble (en pause)
est conservé en bas de ce fichier.

## Phase G0 : point de situation — terminée

Plan : lire la section 0 du plan, `PROGRESS.md`, `AUDIT.md` et le code ;
déplacer le plan dans `docs/` ; marquer le plan Immeuble en pause ;
mettre à jour `CLAUDE.md` ; écrire la synthèse et la liste de rattrapage.

### Ce qui est fait avant le plan Gardien

- **Offre Réseau** (prompts 0 à 8, en pause) : import CSV universel,
  réception LoRaWAN, moteur de débit de nuit, alertes et e-mails, rapports
  PDF, espace superadmin, calculateur de retour sur investissement.
- **Offre Immeuble** (en pause) : phases 0 et 1 terminées, phase 2
  commencée puis arrêtée le 25 septembre 2026 à la demande de Rayan
  (détail en bas de ce fichier).
- **Plan Gardien, version 1** : aucune phase commencée (aucune trace dans
  ce fichier ni dans l'historique Git).

### Ce qui est réutilisable pour le Gardien

| Besoin du plan | Existant réutilisé |
|---|---|
| Offre, statut, essai, slug, réglages d'organisation (G1) | `organizations.kind`, `status`, `trial_ends_at`, `slug`, `settings` (migration `0024`) : ajouter la valeur `sites` |
| Clients d'un partenaire (G1) | table `clients` (`0024`) |
| Appareils (G1, G3) | table `devices` (`0015`) : DevEUI, décodeur, litres par impulsion, dernier index ; à compléter (IMEI, kit, pile, radio, stock) |
| Relevés d'eau (G1, G4) | table `readings` partitionnée par mois, `quality_flag`, idempotence (compteur + horodatage + source), `index_value` |
| Usage mensuel (G1, G6) | table `usage_monthly` (`0024`) : à compléter (points, monnaie, retenue à la source) |
| Superadmin de plateforme (G2) | `platform_admins`, `is_platform_admin()`, `scripts/grant-superadmin.sql` (`0027`) |
| `dev-superadmin` supprimé (G2) | compte supprimé en base (`0027`), `DevAutoLogin` et script retirés ; test de non-retour à écrire |
| Fonctions d'aide RLS (G2) | `is_member`, `has_role`, `org_role`, `peut_voir_organisation`, gabarit `security definer` + `search_path = ''` |
| Connexion (G2) | mot de passe, lien magique, Google (bouchon), mot de passe oublié, réinitialisation, `/compte`, aiguillage `/accueil`, quotas, Turnstile (bouchon) |
| Inscription autonome (G2) | `/inscription` (aujourd'hui : organisation `immeuble`) : à basculer vers `sites` |
| Invitations (G2) | invitations d'agents dans `/immeuble/equipe` et `/admin` |
| Réception des capteurs (G3) | Edge Function `ingest` : jeton par source, enveloppes ChirpStack, TTN, Live Objects et générique ; journal `raw_frames` ; décodeurs Adeunis PULSE v4, Milesight EM300-DI, Watteco, Dragino ; calcul de delta et idempotence |
| Moteur de nuit (G4) | `executer_moteur_nocturne()`, DMN, ligne de base, compteurs muets (en heure de Paris, par secteur) : à décliner par site et par fuseau |
| E-mails (G5) | envoi centralisé `src/lib/email/envoyer.ts` (journal `/dev/emails` en développement), gabarits à la marque, Edge Function `notifications` |
| Rapports PDF (G5) | Edge Function `reports` (`pdf-lib`), déclencheur mensuel pg_cron |
| Pré-diagnostic (G6) | calculateur `/roi` (`src/lib/roi/calculateurRoi.ts`) |
| Marque blanche (G7) | `org_branding`, mention « Propulsé par SmartMetera » protégée, `src/lib/marque.ts` |

### Rattrapage version 2 (règle de la section 0)

Aucune phase du plan Gardien n'était terminée avec la version 1 : la phase
de rattrapage « Phase V2 » est **vide**. Les compléments marqués **(v2)**
seront construits directement dans les phases G1 à G9, dans l'ordre du
plan. La phase 2 Immeuble interrompue n'est pas reprise pour elle-même :
ses restes utiles au Gardien (tests des modules d'envoi, test
« `dev-superadmin` introuvable », matrice RLS) sont intégrés à la phase G2.

Fait : plan déplacé dans `docs/PLAN_GARDIEN.md` ; ligne « En pause »
ajoutée en tête de `docs/PLAN_IMMEUBLE.md` ; bloc « Produit actif » de
`CLAUDE.md` remplacé par la section 7 du plan (les règles Immeuble utiles
aux offres en pause sont conservées dessous). Aucun code modifié.
Vérification de départ : typecheck, lint et tests unitaires verts.

Comment tester à l'écran : rien à tester, phase sans code.

## Phase G1 : modèle de données « Sites » — terminée

Plan :
1. Migration `0030_gardien_modele.sql` : offre `sites`, champs de facturation d'organisation (retenue à la source, remise fondateur, prix partenaire), réglages de plateforme (tarifs, seuils, délais) modifiables par le superadmin.
2. Tables `sites`, `temperature_points`, `temperature_readings` (jamais supprimées), `quiet_windows`, `activity_data`, `leak_events`, `pilots`, `proof_pages`, `site_reports` ; compléments de `meters`, `devices` (flotte), `alerts` et `usage_monthly`.
3. Clés étrangères composites (même organisation garantie), index sur chaque clé et sur `organization_id`, RLS de base dès la création ; `0031` pour les droits d'exécution.
4. Champs de facturation et tarifs protégés (superadmin seulement) ; liste des tables exportées complétée et vérifiée par un test.
5. Scénario SQL annulé en fin de transaction, avis de sécurité Supabase, tests existants verts.

Fait : migrations `0030` (modèle), `0031` (droits) et `0032` (index des
clés étrangères) appliquées sur la base de développement (toujours pas de
base vierge, voir `BLOCKERS.md`, point 1). Scénario SQL annulé en fin de
transaction, tout vérifié : prix de l'eau 4,89 € pour un site français et
« à renseigner » pour un site marocain ; référence vers une autre
organisation refusée ; appareil en stock ; DevEUI déduit de la référence ;
un appareil ne peut pas être dans deux organisations ; référence invalide
refusée ; relevé de température non supprimable ; pilote de 30 jours par
défaut, un seul en cours par site, conversion automatique refusée sans nom
ni horodatage ; une seule fuite ouverte par point et par type ; une fausse
alerte ne peut pas porter d'économies ; jeton de page preuve de 48
caractères ; usage mensuel en EUR et en MAD ; purge d'organisation
complète. Un utilisateur ordinaire ne peut modifier ni la retenue à la
source, ni les tarifs, ni les prix d'un site, mais peut modifier ses seuils
et son prix de l'eau. Aucun nouvel avis de sécurité Supabase. Liste des
tables exportées complétée et vérifiée par un test contre les migrations.
Typecheck, lint, 299 tests unitaires et 4 tests RLS verts.

Choix à signaler :
- Réglages de plateforme dans une table `platform_settings` (et non dans
  le code) pour que le superadmin puisse changer tarifs, seuils et délais
  sans nouvelle version. Les réglages Gardien d'une organisation vivent
  sous `settings.gardien` pour ne pas se mêler à ceux de l'offre Immeuble.
- Un appareil à deux voies (Adeunis PULSE) occupe deux lignes de
  `devices` (une par voie), comme dans l'existant Réseau.
- Les fuites vivent dans `leak_events` ; `alerts` porte les capteurs muets
  (type existant `compteur_muet`) et les températures.

Comment tester à l'écran : rien de visible dans cette phase ;
l'application doit fonctionner exactement comme avant (connexion, écrans
existants).

---

# Historique — offre Immeuble (en pause)

Branche d'origine : `feat/immeuble`. Plan : `docs/PLAN_IMMEUBLE.md`.

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

## Phase 2 : rôles, sécurité et connexion autonome — interrompue

Arrêt demandé par Rayan le 25 septembre 2026 (passage au plan Gardien).
Les restes utiles sont repris dans la phase G2.

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
- Typecheck, lint et 229 tests unitaires verts.

Non fait (repris ou abandonné) : matrice RLS occupants (offre en pause) ;
tests des modules d'envoi et test « `dev-superadmin` introuvable » (repris
en G2).
