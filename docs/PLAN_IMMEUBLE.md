# SmartMetera : plan de construction « Immeuble », marque blanche et mise en ligne

Version 1, 24 septembre 2026. Ce fichier est la source de vérité de la suite du projet. Il remplace les prompts A, B et C restants du guide A→Z.

## Mode d'emploi (Rayan)

1. Copie ce fichier dans le dépôt : `docs/PLAN_IMMEUBLE.md`.
2. Ajoute à la fin de `CLAUDE.md` le bloc de la section 7.
3. Dans Claude Code, colle cette phrase, et la même à chaque nouvelle session :

```
Lis CLAUDE.md, docs/PLAN_IMMEUBLE.md et docs/PROGRESS.md s'il existe. Applique le protocole de travail autonome (section 2) à partir de la première phase non terminée. Ne t'arrête que sur un blocage réel.
```

4. Après chaque phase, teste à l'écran ce que `docs/PROGRESS.md` t'indique. Si quelque chose cloche, décris-le à Claude Code avec le message d'erreur complet.

## 1. Contexte (pour Claude Code)

### Ce qui existe

Les prompts 0 à 8 du guide « SmartMetera Rendement » sont exécutés : application multi-tenant Next.js (App Router, TypeScript strict, Tailwind, shadcn/ui, Recharts) et Supabase (Postgres, Auth, Storage, Edge Functions, pg_cron), import CSV universel avec modèles de colonnes, webhooks LoRaWAN et décodeurs, moteur de bilan et de débit de nuit, alertes et e-mails Resend, boîte mail entrante, rapports PDF, RPQS, plan d'actions, espace superadmin, calculateur de ROI. Ce produit vise les régies d'eau : on l'appelle désormais l'offre **Réseau**.

### Ce qui change

SmartMetera ajoute une seconde offre, **Immeuble** : une plateforme en marque blanche pour des partenaires (installateurs, plombiers, petits prestataires de comptage, distributeurs) qui possèdent déjà des compteurs posés, leurs données et leurs clients (syndics, bailleurs, gestionnaires). Le partenaire importe ses données ; la plateforme produit l'information mensuelle des occupants, la note annuelle, le registre des envois (preuve de conformité), les alertes fuite et le bilan d'immeuble. Occupants et syndics voient la marque du partenaire, jamais SmartMetera (sauf la mention « Propulsé par SmartMetera »).

Un immeuble est un petit réseau : compteur général = entrée ; compteurs des logements = sorties ; écart = eau perdue de l'immeuble. Réutilise le moteur existant partout où c'est possible.

### Test d'acceptation du produit

> Un partenaire crée son compte, dépose l'export de son logiciel de relève, et en moins de 10 minutes il voit ses immeubles, ses logements, ses alertes et l'aperçu du relevé mensuel de chaque occupant, à son logo.

Tout arbitrage se fait en faveur de ce test.

### Modèle économique (pour l'écran d'usage)

0,30 € HT par compteur actif et par mois, minimum 99 € HT par mois et par partenaire. Compteur actif = au moins un relevé valide dans le mois. Pas de paiement en ligne en v1 : un export mensuel d'usage sert à facturer à la main.

## 2. Protocole de travail autonome (sessions de 2 heures)

1. Première session : crée la branche `feat/immeuble`. Sessions suivantes : continue sur cette branche.
2. Exécute les phases dans l'ordre. Pour chaque phase :
   a. écris ton plan en 5 lignes maximum dans `docs/PROGRESS.md` ;
   b. implémente (migrations SQL versionnées dans `/supabase/migrations`) ;
   c. lance typecheck, lint et tests, y compris les tests existants de l'offre Réseau ;
   d. commit `phase N : <résumé>` ;
   e. mets à jour `docs/PROGRESS.md` : fait, reste, et comment tester à l'écran en 5 étapes maximum.
3. Enchaîne la phase suivante sans attendre de validation tant que le critère de fin est atteint et que les tests sont verts.
4. Blocage réel (secret absent, action manuelle, décision métier ou juridique) : écris la question précise dans `docs/BLOCKERS.md`, contourne avec un bouchon clairement marqué `TODO(RAYAN)`, et continue sur ce qui n'en dépend pas.
5. N'invente jamais un contenu juridique ni un format de fichier fabricant : rends-le paramétrable et marque-le `TODO(RAYAN)`.
6. Avant la fin de la session (temps ou contexte), fais un commit propre et note dans `docs/PROGRESS.md` la prochaine action exacte.
7. Conserve les conventions du code existant (nommage, structure de dossiers, bibliothèques PDF et e-mail déjà en place). Aucune nouvelle dépendance lourde sans justification écrite dans `docs/PROGRESS.md`.
8. Ne modifie pas le comportement de l'offre Réseau. Ses tests doivent rester verts à chaque phase.

## 3. Décisions verrouillées

| Sujet | Décision |
|---|---|
| Une ou deux applications | Une seule. `organizations.kind` = `reseau` ou `immeuble` active la navigation et les fonctions de chaque offre. |
| Frontière de cloisonnement | `organization_id` = le partenaire (ou la régie). Tout le reste vit en dessous. |
| Hiérarchie Immeuble | organisation (partenaire) → clients (syndics, bailleurs, gestionnaires) → immeubles → logements → occupations (occupant + période) |
| Compteurs | Rattachés à un immeuble (compteur général, parties communes) ou à un logement (divisionnaire). Fluides : eau froide, eau chaude, chaleur, répartiteur, froid. |
| Rôles | superadmin (plateforme) ; admin, agent, lecteur (organisation, existants) ; gestionnaire (portée : un client) ; occupant (portée : ses logements, sur sa période d'occupation) |
| Connexion | Partenaires et gestionnaires : e-mail et mot de passe, Google, lien magique. Occupants : lien magique seulement, sur invitation, jamais d'inscription libre. |
| Accès occupant aux données | Aucun accès direct aux tables de relevés : uniquement des fonctions RPC qui filtrent sur sa période d'occupation. |
| E-mail mensuel | Il contient les chiffres essentiels : l'occupant est informé sans se connecter. Le portail est un bonus. |
| Déchiffrement radio | Hors v1. On lit des exports déjà déchiffrés par les logiciels fabricants, et les flux LoRaWAN existants. |
| Calendrier d'envoi | Génération le 1er du mois à 6 h (heure de Paris), fenêtre de contrôle de 48 h pour le partenaire, envoi le 3 à 9 h sauf annulation. Paramétrable par organisation. |
| Marque blanche v1 | Logo, couleurs, nom affiché, nom d'expéditeur, adresse de réponse, pied de page légal. URL par identifiant : `/p/[slug]`. E-mails envoyés depuis le domaine vérifié de SmartMetera avec le nom du partenaire. Domaines propres des partenaires : v2. |
| Essai | Inscription autonome d'un partenaire → statut `essai` de 30 jours. Envois aux occupants bloqués tant que le superadmin n'a pas activé l'organisation (accord de traitement des données signé). |
| Garde-fou d'envoi | Un e-mail part seulement si `EMAIL_SENDING_ENABLED=true` (production uniquement) ET organisation `actif` ET `sending_enabled` ET `dpa_signed_at` renseigné. Sinon : statut `bloque` avec motif. |
| Facturation | Table d'usage mensuel et export CSV. Pas de Stripe. |
| Hébergement | Supabase région Paris, Vercel région `cdg1`. Données dans l'Union européenne. |

## 4. Phases

### Phase 0 : audit (30 minutes maximum)

Objectif : savoir exactement d'où l'on part.

- Lis le code et toutes les migrations. Liste tables, colonnes, rôles, politiques RLS, Edge Functions, tâches pg_cron, modèles d'e-mail, bibliothèque PDF.
- Repère le compte de test `dev-superadmin` et tout contournement d'authentification (route de connexion de développement, variable de bypass, seed).
- Lance tous les tests.
- Écris `docs/AUDIT.md` : état, écarts avec ce plan, risques. Ne modifie aucun code dans cette phase.

Critère de fin : `docs/AUDIT.md` existe et l'état des tests est connu.

### Phase 1 : modèle de données Immeuble

RLS activée sur chaque nouvelle table dès sa création, avec des politiques de base pour les rôles d'organisation, élargies en phase 2.

- `organizations` : ajouter `kind` (`reseau` | `immeuble`, défaut `reseau` pour l'existant), `status` (`essai` | `actif` | `suspendu`), `trial_ends_at`, `sending_enabled` (booléen, défaut false), `dpa_signed_at`, `slug` (unique), `settings` (jsonb : prix de l'eau par défaut en €/m³ = 4,50 modifiable, seuils d'alerte, calendrier d'envoi, blocs actifs du relevé).
- `org_branding` : `organization_id`, `display_name`, `logo_path`, `primary_color`, `accent_color`, `sender_name`, `reply_to_email`, `support_email`, `support_phone`, `legal_footer`, `show_powered_by` (défaut true, modifiable par le superadmin seulement).
- `clients` : `organization_id`, `name`, `type` (`syndic_pro` | `syndic_benevole` | `bailleur` | `gestionnaire` | `autre`), coordonnées, `external_ref`.
- `buildings` : `organization_id`, `client_id`, `name`, adresse complète, `postal_code`, `city`, `country` (défaut FR), `water_price_eur_m3` (nullable, sinon défaut de l'organisation), `common_usage_m3_month` (défaut 0), `balance_config` (jsonb : fluides comptés dans la somme des logements, défaut eau froide et eau chaude), `external_ref`.
- `units` (logements) : `organization_id`, `building_id`, `label` (lot, porte), `floor`, `surface_m2` (nullable), `external_ref`, `active`.
- `occupants` : `organization_id`, `email` (citext), `first_name`, `last_name`, `phone`, `delivery_channel` (`email` | `papier`), `email_status` (`valide` | `rejete` | `inconnu`), `alerts_opt_in` (défaut true), `user_id` (nullable, lien vers l'authentification).
- `occupancies` : `organization_id`, `unit_id`, `occupant_id`, `role` (`locataire` | `proprietaire_occupant` | `proprietaire_bailleur`), `start_date`, `end_date` (nullable). Plusieurs occupants par logement autorisés.
- `meters` : ajouter `building_id`, `unit_id` (nullable), `fluid` (`eau_froide` | `eau_chaude` | `chaleur` | `repartiteur` | `froid`), `measure_unit` (`m3` | `kWh` | `MWh` | `unites`), et les rôles `general_immeuble`, `divisionnaire`, `parties_communes`.
- `readings` : ajouter `alarm_codes` (text[] : `fuite`, `retour_eau`, `fraude_magnetique`, `demontage`, `pile_faible`, `blocage`).
- `monthly_statements` : `organization_id`, `building_id`, `unit_id`, `occupancy_id`, `period` (1er jour du mois), `fluid`, `consumption`, `previous_month`, `same_month_last_year`, `building_average`, `is_estimated`, `status` (`brouillon` | `pret` | `annule` | `bloque` | `envoye`), `blocked_reason`, `content` (jsonb). Unicité (`occupancy_id`, `period`, `fluid`).
- `annual_notes` : `organization_id`, `building_id`, `unit_id`, `occupancy_id`, `year`, `content` (jsonb), `pdf_path`, `generated_at`.
- `deliveries` (registre, ajout seul) : `organization_id`, `building_id`, `occupant_id`, `statement_id` ou `annual_note_id`, `channel`, `to_email` (copie au moment de l'envoi), `subject`, `content_sha256`, `provider_message_id`, `status` (`en_file` | `envoye` | `delivre` | `rejete` | `plainte` | `papier_genere`), horodatages. Déclencheur SQL qui interdit la suppression et la modification des champs de contenu.
- `delivery_events` : événements reçus du webhook Resend, ajout seul.
- `building_balances` : `organization_id`, `building_id`, `period`, `fluid`, `v_general`, `v_units_sum`, `v_common_declared`, `gap_m3`, `gap_pct`, `gap_eur`, `completeness_pct`. Unicité (`building_id`, `period`, `fluid`).
- `alerts` : ajouter `building_id`, `unit_id`, et les types `fuite_logement`, `consommation_anormale`, `ecart_immeuble`, `retour_eau`, `alarme_fabricant`.
- `usage_monthly` : `organization_id`, `period`, `active_meters`, `amount_eur_ht`.
- Index sur chaque clé étrangère et sur `organization_id` combiné aux colonnes des requêtes principales.

Critère de fin : migrations appliquées sur une base vierge, tests existants verts.

### Phase 2 : rôles, sécurité et connexion autonome (ancien prompt A)

- `memberships` : ajouter `scope_type` (`organisation` | `client`) et `scope_id` ; rôle `gestionnaire` à portée client. Le lien occupant passe par `occupants.user_id` et `occupancies`.
- Superadmin : table `platform_admins` (`user_id`). Script `scripts/grant-superadmin.sql` avec une adresse à remplir par Rayan. Aucun compte superadmin dans les seeds.
- **Suppression du compte `dev-superadmin`** et de tout contournement repéré en phase 0 (route, variable, seed). Migration qui le retire des bases existantes. Test qui échoue si l'adresse réapparaît dans le code.
- Fonctions SQL d'aide (`security definer`, `set search_path = ''`) : `is_platform_admin()`, `org_role(org_id)`, `can_read_client(client_id)`, `can_read_building(building_id)`, `occupant_units(at_date)`. Les politiques RLS de chaque table s'appuient sur elles.
- Occupants : aucune politique SELECT sur `readings`, `meters` ni sur les relevés des autres. Accès par les RPC `occupant_home()` et `occupant_history(unit_id)`, qui ne renvoient que les données comprises dans la période d'occupation.
- Gestionnaire : lecture de ses immeubles, bilans, alertes, attestations et notes annuelles. Il voit les libellés de logement et les statuts d'envoi, pas les adresses e-mail des occupants (minimisation des données).
- Connexion : e-mail et mot de passe (avec confirmation d'adresse), Google OAuth, lien magique. Pages en français : connexion, inscription, mot de passe oublié, réinitialisation, changement d'adresse.
- Liens magiques à la marque du partenaire : route serveur `/api/auth/lien` qui génère le lien avec l'API admin de Supabase (`generateLink`) et l'envoie par Resend avec le logo du partenaire. Limitation de débit sur cette route.
- Inscription partenaire `/inscription` : raison sociale, nom, e-mail, téléphone, SIREN facultatif. Crée l'organisation (`kind = immeuble`, `status = essai`, `trial_ends_at` à 30 jours, `slug` généré) et le rôle admin. CAPTCHA Cloudflare Turnstile via les réglages CAPTCHA de Supabase Auth.
- Invitations : l'admin d'un partenaire invite agents et gestionnaires. Les occupants sont créés par import ; leur premier relevé mensuel sert d'invitation.
- Suppression de compte : chaque utilisateur peut supprimer son compte (sauf le dernier admin d'une organisation) ; le superadmin peut supprimer une organisation après export complet.
- Tests : matrice RLS avec 2 partenaires, 1 régie, 2 clients, 4 immeubles et des occupants, dont un qui a emménagé en cours d'année. Chaque rôle ne voit que ce qu'il doit voir, et l'occupant arrivé en cours d'année ne voit rien d'antérieur à son entrée.

Critère de fin : matrice RLS verte, `dev-superadmin` introuvable, inscription vers une organisation d'essai fonctionnelle en local.

### Phase 3 : import Immeuble et assistant « 10 minutes »

- Étends l'import existant avec la cible `immeuble`. Colonnes reconnues : référence ou adresse d'immeuble, lot ou logement, numéro de série du compteur, fluide, date et heure du relevé, index, unité, alarmes (texte converti en `alarm_codes`), volume facultatif.
- Création automatique : immeubles depuis les adresses ou références distinctes, logements depuis les lots, compteurs depuis les numéros de série. Déduction du fluide (kWh vers chaleur, unités vers répartiteur, en-têtes « EF » et « ECS »), toujours confirmée à l'écran.
- Modèles préremplis et modifiables : « Relève radio générique (walk-by) », Kamstrup READy, Diehl IZAR, EWEBTEL. Ne devine pas les formats exacts des fabricants : modèles paramétrables marqués `TODO(RAYAN) : valider sur un vrai fichier`.
- Import des occupants (CSV) : lot, nom, prénom, e-mail, téléphone, date d'entrée, rôle. Contrôle des adresses e-mail, doublons signalés.
- Compteur général : saisie mensuelle manuelle de l'index (souvent lu sur la facture du distributeur d'eau) ou import.
- Assistant en 5 écrans : 1. dépôt du fichier ; 2. colonnes détectées ; 3. aperçu des immeubles, logements et compteurs ; 4. import en tâche de fond avec progression ; 5. résultat : immeubles, part des compteurs avec données, alertes détectées, aperçu du relevé d'un occupant.
- Performance : insertion par lots de 5 000 lignes. Cible : 2 000 compteurs × 14 mois de relevés journaliers (environ 850 000 lignes) importés en moins de 10 minutes.
- Idempotence, remise à zéro d'index, remplacement de compteur et doublons : réutilise la logique existante.

Critère de fin : le fichier d'exemple de 2 000 compteurs s'importe en moins de 10 minutes en local ; un second import n'ajoute aucune ligne.

### Phase 4 : moteur Immeuble

- Consommations journalières et mensuelles par compteur à partir des index (moteur existant), dans l'unité du fluide.
- Relevé mensuel par occupation : consommation du mois, du mois précédent, du même mois l'an dernier (seulement si compris dans la période d'occupation, sinon « non disponible »), moyenne de l'immeuble (par logement ; par m² si au moins 80 % des surfaces sont renseignées). Marqué « estimé » si plus de 20 % des jours manquent.
- Bilan d'immeuble par mois et par fluide : volume du compteur général, moins la somme des logements (fluides définis par `balance_config`), moins l'usage déclaré des parties communes. Écart en m³, en % et en € (prix de l'immeuble, sinon de l'organisation). Pas de calcul si la complétude est inférieure à 90 % : afficher « données insuffisantes ».
- Fuite par logement :
  - données horaires : débit minimum entre 2 h et 5 h (heure de Paris) supérieur au seuil (défaut 3 L/h) pendant 3 nuits de suite ;
  - données journalières : consommation supérieure à 3 fois la médiane des 30 derniers jours et à 0,5 m³ par jour, pendant 3 jours de suite (type `consommation_anormale`) ;
  - alarme fabricant présente dans l'import : alerte immédiate du type correspondant.
- Compteur muet : aucun relevé depuis 7 jours (données journalières) ou 48 h (données horaires). Seuils paramétrables.
- Écart d'immeuble : plus de 10 % sur le mois (paramétrable), alerte au partenaire et au gestionnaire.
- Planification : pg_cron tourne en UTC. Crée une tâche horaire qui décide selon l'heure de Paris (robuste au changement d'heure). Calcul de nuit à 5 h, heure de Paris.
- Tests à valeurs connues, dont : immeuble de 40 logements, compteur général à 400 m³, somme des logements à 352 m³, parties communes à 8 m³ ; résultat attendu : écart de 40 m³, soit 10 %, soit 180 € à 4,50 €/m³.

Critère de fin : tests du moteur verts, alertes générées sur les données de test.

### Phase 5 : envois mensuels, note annuelle et registre

- Le 1er à 6 h (heure de Paris) : génération des relevés du mois écoulé. E-mail récapitulatif au partenaire : relevés prêts, relevés bloqués et motifs (adresse manquante, données insuffisantes, envois non activés).
- Fenêtre de contrôle de 48 h : le partenaire voit l'aperçu de chaque relevé et peut annuler par immeuble ou par logement.
- Le 3 à 9 h (heure de Paris) : envoi. API d'envoi par lots de Resend (100 par appel maximum), cadence limitée, reprises progressives, clé d'idempotence égale à l'identifiant du relevé. Jamais deux envois pour le même relevé.
- Modèle d'e-mail à la marque du partenaire (réutilise le système de modèles déjà en place ; React Email si aucun n'existe), avec des blocs activables sans code : consommation du mois et comparaisons, mention d'estimation, alerte fuite éventuelle, conseil court, bouton « Voir mon historique » (demande de lien magique), identité du partenaire, lien vers la politique de confidentialité, gestion des préférences.
- `TODO(RAYAN)` : le contenu réglementaire exact (décret n° 2020-886 et son arrêté d'application) sera validé par Rayan sur le texte officiel. Dans l'interface et les e-mails, n'affirme jamais que l'eau froide est soumise à une obligation, et ne cite aucun montant de sanction.
- Canal papier : occupants en `papier` ou adresse rejetée, un PDF par immeuble prêt à imprimer, statut de registre `papier_genere`.
- Registre : chaque envoi crée une ligne dans `deliveries` avec l'empreinte SHA-256 du contenu envoyé. Webhook Resend (signature vérifiée selon la documentation Resend) vers `delivery_events` et mise à jour du statut. Adresse rejetée : `email_status = rejete` et alerte au partenaire.
- Attestation d'envoi : PDF par immeuble et par mois (logements informés, date, canal, statut). C'est la preuve que le partenaire remet au syndic.
- Note annuelle : PDF par logement (consommations de l'année par fluide, évolution, moyenne de l'immeuble) et synthèse par immeuble. Générée en janvier pour l'année écoulée, ou à la demande. `TODO(RAYAN)` : contenu à valider.
- Garde-fou d'envoi de la section 3 appliqué partout. En développement, tous les e-mails vont vers une adresse de test ou un journal.

Critère de fin : en local, cycle complet vérifié : génération, aperçu, annulation d'un relevé, envoi en mode test, événement de webhook simulé, registre, attestation PDF.

### Phase 6 : marque blanche

- Thème dynamique : variables CSS calculées depuis `org_branding` (nuances dérivées de la couleur principale, couleur de texte choisie pour un contraste d'au moins 4,5:1, assombrissement automatique si besoin). Sans réglage : thème SmartMetera.
- Pages publiques à la marque : `/p/[slug]/connexion` et `/p/[slug]/lien` (demande de lien magique). Après connexion, l'interface prend la marque de l'organisation de l'utilisateur.
- E-mails : expéditeur `"{sender_name}" <releves@{MAIL_DOMAIN}>`, réponse vers `reply_to_email`, logo hébergé dans Storage. PDF à la marque.
- Mention « Propulsé par SmartMetera » en pied de page, active par défaut.
- Les écrans superadmin gardent l'identité SmartMetera.

Critère de fin : deux partenaires de démonstration aux marques différentes affichent chacun leur logo et leurs couleurs dans le portail, les e-mails et les PDF.

### Phase 7 : les espaces

- **Partenaire** : tableau de bord (immeubles, compteurs actifs, part des compteurs remontés sur 7 jours, alertes ouvertes, état des envois du mois : prêts, envoyés, bloqués ; eau perdue estimée du mois en m³ et en €) ; clients ; immeubles (fiche : bilan, logements, compteurs, alertes, envois) ; logement (compteurs, occupants, historique) ; import ; envois (calendrier, aperçu, fenêtre de contrôle, registre, attestations) ; paramètres (marque, expéditeur, prix de l'eau, seuils, calendrier) ; usage du mois.
- **Parcours de démarrage du partenaire**, visible tant qu'il n'est pas terminé : 1. importer les compteurs ; 2. importer les occupants ; 3. régler la marque ; 4. voir un relevé ; 5. accord de traitement des données ; 6. activation par SmartMetera.
- **Gestionnaire** : ses immeubles, bilans, alertes, attestations d'envoi, notes annuelles.
- **Occupant**, pensé d'abord pour le téléphone : une page avec le chiffre du mois et sa comparaison, l'historique sur 13 mois, la moyenne de l'immeuble, les alertes, les préférences (canal, alertes).
- **Superadmin** : organisations (offre, statut, fin d'essai, activation des envois, date de l'accord), usage mensuel et export CSV de facturation (0,30 € par compteur, minimum 99 €), consultation en lecture seule d'une organisation, journalisée dans `audit_log`.
- Navigation filtrée par `kind` : une organisation `immeuble` ne voit pas les écrans Réseau, et inversement.

Critère de fin : chaque rôle navigue sur les données de démonstration sans écran vide ni erreur.

### Phase 8 : passe de design (ancien prompt B)

- Commence par un plan de design dans `docs/DESIGN.md` : palette (4 à 6 couleurs nommées), typographies et leurs rôles, principe de mise en page, principes. Relis-le contre ce brief, corrige ce qui ressemble à un modèle générique, puis seulement implémente.
- Brief : outil de professionnels du comptage d'eau et d'énergie. Deux visages : SmartMetera (superadmin, pages d'inscription, e-mails système), avec bleu #1B4F8A, turquoise #0FA3A3, encre #0A2540, Fraunces pour les titres et Manrope pour le texte ; les partenaires, qui imposent leurs couleurs via les variables de la phase 6. Aucune couleur écrite en dur dans les composants.
- Occupant : calme, lisible, un grand chiffre, zéro jargon. Partenaire : dense et efficace, tableaux de données, statuts clairs.
- Un seul élément mémorable : la visualisation du bilan d'immeuble (eau entrée contre eau attribuée aux logements). Le reste reste sobre. Évite le kit de cartes SaaS identiques, les dégradés décoratifs et les étiquettes en majuscules.
- Chiffres : format français (espace insécable pour les milliers, virgule décimale, « m³ »), chiffres tabulaires dans les tableaux.
- Textes : phrases courtes, casse de phrase, verbes d'action sur les boutons, messages d'erreur qui disent quoi faire, écrans vides qui invitent à l'action.
- Qualité minimale : responsive jusqu'au téléphone, focus clavier visible, contraste AA, `prefers-reduced-motion` respecté, squelettes de chargement.
- Priorités : page occupant, tableau de bord partenaire, assistant d'import, fiche immeuble, e-mails, PDF.

Critère de fin : `docs/DESIGN.md` écrit, écrans prioritaires refaits, vérification AA faite.

### Phase 9 : données de démonstration et tests de bout en bout

- Seed réservé au développement et à la préproduction : il refuse de s'exécuter si l'URL Supabase est celle de production.
- Partenaire « Comptage Rhône Démo » (Lyon) : 3 syndics fictifs, 12 immeubles, 400 logements, eau froide et eau chaude, un compteur général par immeuble, 14 mois de relevés journaliers et un immeuble en relevés horaires ; l'immeuble « Les Tilleuls » avec 18 % d'écart ; 3 logements avec fuite ; 2 compteurs muets ; un emménagement en cours d'année ; occupants en `@example.com`.
- Second partenaire « Hydro Savoie Démo » avec une autre marque. La démonstration Réseau existante est conservée.
- Comptes de démonstration créés par script, mots de passe lus dans l'environnement, jamais committés.
- Fichiers d'exemple dans `/samples` : export de relève de 2 000 compteurs, fichier d'occupants.
- Commande `npm run demo:reset` qui recrée tout en moins de 5 minutes.
- Tests de bout en bout (Playwright s'il est déjà installé, sinon tests d'intégration) : import, alertes, envoi mensuel en mode test, registre, attestation ; connexion d'un occupant par lien magique, qui ne voit que sa période.

Critère de fin : `demo:reset` fonctionne, tests de bout en bout verts.

### Phase 10 : mise en ligne (ancien prompt 9 corrigé, prompt C)

Claude Code prépare tout et rédige `docs/MISE_EN_LIGNE.md` avec les étapes manuelles de Rayan, à cocher.

- Supabase production (Paris), distinct du développement : migrations, extensions `pg_cron` et `pg_net`, tâches planifiées créées par migration, sauvegardes, réglages Auth (URL du site `https://app.smartmeteria.com`, URL de redirection, confirmation d'adresse, Google, CAPTCHA Turnstile, **SMTP personnalisé via Resend**, car le service d'e-mail intégré de Supabase est limité et réservé aux tests).
- Vercel : projet, région `cdg1`, variables d'environnement (liste complète documentée dans `.env.example`), domaine `app.smartmeteria.com`, déploiements de prévisualisation branchés sur la préproduction.
- Resend : domaine d'envoi vérifié (SPF, DKIM, DMARC en `p=none` pour démarrer), point d'entrée du webhook et son secret.
- Sentry : `@sentry/nextjs`, envoi des source maps, `sendDefaultPii: false`, filtre qui masque e-mails et noms, étiquette `organization_id` seulement.
- Sécurité : en-têtes (CSP, HSTS, `frame-ancestors`, `Referrer-Policy`), limitation de débit sur `/inscription` et `/api/auth/lien`, vérification des signatures de webhooks, clé `service_role` côté serveur uniquement, audit des dépendances.
- Pages légales en modèles marqués « à faire valider » : mentions légales (`TODO(RAYAN)` : entité), CGU et CGV SaaS, politique de confidentialité, modèle d'accord de sous-traitance (article 28 du RGPD) entre le partenaire et SmartMetera, registre des traitements dans `docs/`.
- Données : durée de conservation paramétrable (`TODO(RAYAN)` : à valider) ; suppression des données personnelles d'un occupant après la fin de son occupation selon ce paramètre ; export complet d'une organisation étendu aux tables Immeuble.
- Surveillance : table d'état des tâches planifiées et récapitulatif quotidien au superadmin (tâches réussies, e-mails envoyés et en échec, essais qui se terminent).
- Guide d'exploitation `docs/RUNBOOK.md` : déployer, revenir en arrière, ajouter un partenaire, activer ses envois, incident e-mail, tâche planifiée en échec, restauration.
- Test de fumée en production : inscription d'essai, import d'exemple, aperçu, aucun e-mail envoyé ; puis activation d'une organisation de test vers l'adresse de Rayan, envoi, registre.

Critère de fin : `app.smartmeteria.com` en ligne, test de fumée réussi, aucune trace de `dev-superadmin` en production.

## 5. Hors périmètre v1 (ne pas construire)

Stripe ; déchiffrement Wireless M-Bus et coffre à clés ; domaines personnalisés des partenaires ; SMS ; application mobile native ; répartition des charges en euros ; facturation des occupants ; pilotage du chauffage ; API publique ; langues autres que le français. Les fonctions Réseau (RPQS, plan d'actions, ROI) restent en place, réservées aux organisations `reseau`.

## 6. Actions manuelles de Rayan (Claude Code les note dans BLOCKERS.md au bon moment)

1. Créer les identifiants Google OAuth (Google Cloud Console).
2. Vérifier le domaine d'envoi chez Resend (enregistrements DNS).
3. Créer les clés Cloudflare Turnstile.
4. Créer le projet Sentry.
5. Pointer `app.smartmeteria.com` vers Vercel.
6. Créer le projet Supabase de production (Paris).
7. Exécuter `scripts/grant-superadmin.sql` avec son adresse.
8. Fournir un vrai fichier d'export anonymisé d'un logiciel de relève, pour valider le modèle générique.
9. Valider le contenu du relevé mensuel et de la note annuelle sur le texte officiel.
10. Faire valider CGV, politique de confidentialité et accord de sous-traitance par un juriste ; renseigner l'entité juridique.

## 7. Bloc à ajouter à CLAUDE.md

```
## Offre Immeuble (depuis septembre 2026)
Deux offres dans une seule application : organizations.kind = 'reseau' (régies)
ou 'immeuble' (partenaires en marque blanche). La source de vérité de l'offre
Immeuble est docs/PLAN_IMMEUBLE.md ; l'avancement est dans docs/PROGRESS.md.
Règles supplémentaires :
- Les occupants n'accèdent aux données que par RPC, filtrées sur leur période
  d'occupation. Aucun SELECT direct sur readings.
- Aucun e-mail réel sans : EMAIL_SENDING_ENABLED=true, organisation 'actif',
  sending_enabled, dpa_signed_at renseigné.
- Le registre des envois (deliveries, delivery_events) est en ajout seul.
- Aucune couleur en dur : tout passe par les variables de thème (marque blanche).
- Aucun contenu juridique inventé : paramétrable et TODO(RAYAN).
- Ne jamais écrire que l'eau froide est soumise à une obligation légale.
- Les tests de l'offre Réseau restent verts à chaque phase.
```

## 8. Définition du terminé

- [ ] Le test d'acceptation (section 1) est tenu en production, chronomètre en main.
- [ ] Matrice RLS verte, `dev-superadmin` absent.
- [ ] Cycle mensuel complet vérifié, avec registre et attestation.
- [ ] Deux marques de démonstration distinctes partout.
- [ ] `demo:reset` et tests de bout en bout verts.
- [ ] `app.smartmeteria.com` en ligne, Sentry actif, sauvegardes actives.
- [ ] `docs/PROGRESS.md`, `BLOCKERS.md`, `MISE_EN_LIGNE.md`, `RUNBOOK.md` et `DESIGN.md` à jour.
