# SmartMetera : plan de construction « Gardien de l'eau »

Version 1, 25 septembre 2026. Ce fichier est la nouvelle source de vérité du projet. Il **remplace** `docs/PLAN_IMMEUBLE.md`, qui est mis en pause (rien n'est supprimé).

## 1. Contexte (pour Claude Code)

### Ce qui existe
- Les prompts 0 à 8 du guide « SmartMetera Rendement » : application multi-tenant Next.js (App Router, TypeScript strict, Tailwind, shadcn/ui, Recharts) et Supabase (Postgres, Auth, Storage, Edge Functions, pg_cron), import CSV universel, webhooks LoRaWAN et décodeurs de capteurs d'impulsions, moteur de débit de nuit et d'alertes, e-mails Resend, rapports PDF, espace superadmin. C'est l'offre **Réseau** (régies d'eau) : **en pause**.
- Éventuellement une partie de `docs/PLAN_IMMEUBLE.md` (voir `docs/PROGRESS.md` et `docs/AUDIT.md`). L'offre **Immeuble** est **en pause**. Tout ce qui a déjà été construit est conservé et réutilisé quand c'est utile.

### Le nouveau produit
Le **Gardien de l'eau** surveille la consommation d'eau des sites qui paient eux-mêmes leur facture : hôtels, campings, centres commerciaux, restaurants, laveries. Un capteur est posé en 10 minutes sur le compteur existant. Il transmet ses données par le réseau mobile (NB-IoT ou LTE-M) ou par LoRaWAN. La plateforme :
1. détecte les fuites (débit la nuit, débit continu, rupture brutale) et prévient par SMS et e-mail ;
2. envoie chaque mois un rapport avec **les euros économisés depuis le début** ;
3. suit un indicateur par activité : litres par nuitée (hôtel), par emplacement (camping), par couvert (restaurant) ;
4. compare les sites d'une même chaîne ou d'un même type.

Deux façons de vendre :
- **en direct** à un site ou à une chaîne ;
- **via des partenaires en marque blanche** (exemple : un fabricant de systèmes pour campings qui revend le Gardien à ses clients sous sa marque).

France (euros) et Maroc (dirhams) dès la v1.

### Tests d'acceptation
> 1. Un technicien pose un capteur, suit l'assistant de pose sur son téléphone, et voit « données reçues » en moins de 10 minutes.
> 2. Une fuite simulée sur le site de démonstration déclenche une alerte SMS le matin suivant, puis apparaît dans le compteur d'économies une fois réparée.

Tout arbitrage se fait en faveur de ces deux tests.

### Modèle économique (pour l'écran d'usage)
Par point de comptage surveillé : frais de mise en service uniques (défaut 290 € HT) + abonnement mensuel (défaut 29 € HT). Option de facturation annuelle avec deux mois offerts. Montants paramétrables, avec un équivalent en dirhams réglé par le superadmin. Pas de paiement en ligne en v1 : un export d'usage mensuel sert à facturer à la main.

## 2. Protocole de travail autonome (sessions de 2 heures)

1. Première session : crée la copie de travail `feat/gardien` à partir de `feat/immeuble` si elle existe, sinon à partir de `main`. Sessions suivantes : continue sur `feat/gardien`.
2. N'envoie jamais rien directement sur `main`.
3. Exécute les phases dans l'ordre. Pour chaque phase :
   a. écris ton plan en 5 lignes maximum dans `docs/PROGRESS.md` ;
   b. implémente (migrations SQL versionnées dans `/supabase/migrations`) ;
   c. lance typecheck, lint et tests, y compris les tests existants ;
   d. enregistre ton travail avec un message `phase GN : <résumé>` ;
   e. mets à jour `docs/PROGRESS.md` : fait, reste, et comment tester à l'écran en 5 étapes maximum, écrites pour un débutant.
4. Enchaîne la phase suivante sans attendre tant que le critère de fin est atteint et que les tests sont verts.
5. Blocage réel (secret absent, action manuelle, décision métier ou juridique) : écris la question précise dans `docs/BLOCKERS.md`, contourne avec un bouchon marqué `TODO(RAYAN)`, et continue sur ce qui n'en dépend pas.
6. N'invente jamais un format de trame, un protocole de capteur ou un contenu juridique : rends-le paramétrable et marque-le `TODO(RAYAN)`.
7. Avant la fin de la session, sauvegarde tout sur GitHub (copie `feat/gardien`) et explique à Rayan, en français simple et sans mot technique, ce qu'il doit tester.
8. Conserve les conventions du code existant. Aucune nouvelle dépendance lourde sans justification écrite dans `docs/PROGRESS.md`.
9. Ne casse pas les offres en pause : leurs tests existants restent verts.

## 3. Décisions verrouillées

| Sujet | Décision |
|---|---|
| Une seule application | `organizations.kind` : `reseau` (pause), `immeuble` (pause), `sites` (actif). La navigation dépend de `kind`. |
| Hiérarchie | organisation (partenaire, chaîne ou client direct) → clients (facultatif, pour les partenaires) → sites → points de comptage (compteurs) |
| Fuseau horaire | Par site : `Europe/Paris` ou `Africa/Casablanca`. Toutes les fenêtres de nuit et tous les envois se calculent à l'heure locale du site. |
| Monnaie | Par site : EUR ou MAD. Le prix de l'eau au m³ est saisi dans la monnaie du site. |
| Rôles | superadmin (plateforme) ; admin, agent, lecteur (organisation) ; directeur de site (portée : ses sites) ; technicien (reçoit les alertes, fait les poses) |
| Connexion | E-mail et mot de passe, Google, lien magique. Inscription autonome possible en essai de 30 jours. |
| Transmission des capteurs | v1 : webhooks LoRaWAN existants + webhook HTTP générique (plateformes des fabricants ou des opérateurs qui renvoient les données) + import CSV planifié depuis un portail fabricant. Pas de serveur UDP ou CoAP en v1. |
| Fréquence minimale | Relevés au moins horaires (même s'ils arrivent en lot une fois par jour). En dessous, pas de détection de nuit : le point est marqué « surveillance limitée ». |
| Alertes | E-mail + SMS (fournisseur couvrant France et Maroc, à confirmer par Rayan). Escalade au directeur si l'alerte n'est pas prise en compte en 12 h. |
| Économies | Toujours prudentes, toujours expliquées. Jamais de chiffre gonflé. Méthode affichée à côté de chaque montant. |
| Marque blanche | Pour les partenaires : logo, couleurs, nom d'expéditeur (réutilise le travail du plan Immeuble s'il existe). Clients directs : identité SmartMetera. |
| Facturation | Table d'usage mensuel et export CSV. Pas de Stripe. |
| Hébergement | Supabase région Paris, Vercel région `cdg1`. |

## 4. Phases

### Phase G0 : point de situation (30 minutes maximum)
- Lis `docs/PROGRESS.md`, `docs/AUDIT.md` et le code. Liste ce qui a été fait du plan Immeuble et ce qui est réutilisable ici (clients, rôles, marque blanche, connexion, suppression de `dev-superadmin`).
- Si `PLAN_GARDIEN.md` se trouve à la racine du projet, déplace-le dans `docs/`.
- Ajoute en tête de `docs/PLAN_IMMEUBLE.md` la ligne : « En pause depuis le 25 septembre 2026, remplacé par docs/PLAN_GARDIEN.md ».
- Dans `CLAUDE.md` (ou le fichier qu'il importe, par exemple `AGENTS.md`), remplace le bloc « Offre Immeuble » s'il existe par le bloc de la section 7 de ce plan. Sinon, ajoute ce bloc à la fin.
- Écris la synthèse dans `docs/PROGRESS.md`. Ne modifie aucun code dans cette phase.

Critère de fin : synthèse écrite, `CLAUDE.md` à jour.

### Phase G1 : modèle de données « Sites »
RLS activée sur chaque nouvelle table dès sa création.
- `organizations` : ajouter la valeur `sites` à `kind` ; ajouter si absents `status` (`essai` | `actif` | `suspendu`), `trial_ends_at`, `slug`, `settings` (jsonb : tarifs par défaut, seuils).
- `clients` : réutilise la table du plan Immeuble si elle existe, sinon crée-la (`organization_id`, `name`, coordonnées, `external_ref`).
- `sites` : `organization_id`, `client_id` (nullable), `name`, `type` (`hotel` | `camping` | `centre_commercial` | `restaurant` | `laverie` | `autre`), adresse, `country`, `timezone`, `currency` (`EUR` | `MAD`), `water_price_per_m3`, `activity_unit` (`nuitee` | `emplacement` | `couvert` | `m2` | `aucune`), `capacity`, `active`.
- `meters` : ajouter `site_id`, `zone` (texte libre avec suggestions : général, cuisine, laverie, piscine, spa, espaces verts), `pulse_weight_l` (litres par impulsion), `install_index_m3`, `installed_at`, `device_ref` (numéro de série, DevEUI ou IMEI), `device_model`, `transmission` (`lorawan` | `cellulaire` | `import`), `surveillance` (`complete` | `limitee`).
- `quiet_windows` : plages où une consommation de nuit est normale (arrosage, remplissage de piscine) : `meter_id`, jours, heure de début, heure de fin.
- `activity_data` : `site_id`, `date`, `quantity` (nuitées occupées, emplacements occupés, couverts). Saisie mensuelle ou import CSV.
- `leak_events` : `meter_id`, `site_id`, `type` (`fuite_nuit` | `debit_continu` | `rupture`), `detected_at`, `excess_flow_lph`, `status` (`ouverte` | `prise_en_compte` | `reparee` | `fausse_alerte`), `acknowledged_by`, `acknowledged_at`, `repaired_at` (auto-détecté ou déclaré), `saved_m3`, `saved_amount`, `currency`, `method` (texte expliquant le calcul).
- `site_reports` : `site_id`, `period`, `content` (jsonb), `pdf_path`, `sent_at`, `opened_at`.
- `usage_monthly` : `organization_id`, `period`, `active_points`, `setup_points`, `amount_ht`, `currency`.
- Index sur chaque clé étrangère et sur `organization_id`.

Critère de fin : migrations appliquées sur une base vierge, tests existants verts.

### Phase G2 : rôles, sécurité et connexion
Réutilise tout ce qui a déjà été fait dans la phase 2 du plan Immeuble, sans la partie occupants.
- Superadmin via une table `platform_admins` et un script `scripts/grant-superadmin.sql` à remplir par Rayan.
- **Suppression du compte `dev-superadmin`** et de tout contournement d'authentification, si ce n'est pas déjà fait. Test qui échoue si l'adresse réapparaît dans le code.
- Portée « site » pour les directeurs de site (`scope_type = site`). Rôle technicien.
- Fonctions SQL d'aide (`security definer`, `set search_path = ''`) et politiques RLS pour chaque table.
- Connexion : e-mail et mot de passe, Google, lien magique. Pages en français.
- Inscription autonome `/inscription` : crée une organisation `kind = sites` en essai de 30 jours, avec le rôle admin. CAPTCHA Cloudflare Turnstile via Supabase Auth.
- Invitations par l'admin (agents, directeurs de site, techniciens).
- Tests : matrice RLS avec 2 organisations, 1 chaîne de 3 sites, 1 directeur limité à un site, 1 technicien.

Critère de fin : matrice RLS verte, `dev-superadmin` introuvable.

### Phase G3 : réception des capteurs et assistant de pose
- Webhook HTTP générique `/ingest/generic` (existant ou à créer) avec jeton secret par source, et registre `device_ref` → compteur.
- Décodeurs : réutilise ceux des capteurs d'impulsions existants. Ajoute des emplacements de décodeurs pour les modèles réseau mobile choisis par Rayan, marqués `TODO(RAYAN) : format de trame à fournir`. Chaque décodeur a des tests sur des trames d'exemple.
- Import CSV planifié depuis un portail fabricant (réutilise la boîte mail entrante ou le dépôt existant).
- Conversion impulsions → litres avec `pulse_weight_l`, index reconstitué depuis `install_index_m3`.
- Contrôle de fréquence : si les relevés sont moins fréquents qu'horaires, le point passe en `surveillance = limitee`, avec un message clair.
- **Assistant de pose sur téléphone** (`/pose`) : choisir le site ; saisir ou scanner le numéro du capteur ; indiquer la zone ; photographier le compteur (Storage) ; saisir l'index affiché et le poids d'impulsion (avec valeurs courantes proposées) ; écran d'attente « en attente des premières données », qui passe à « données reçues » automatiquement. Conçu pour une personne non technique, gros boutons, une question par écran.

Critère de fin : une trame d'exemple envoyée au webhook fait passer l'assistant de pose à « données reçues ».

### Phase G4 : moteur fuites et économies
Réutilise le moteur de débit de nuit existant, calculé à l'heure locale de chaque site.
- **Fuite de nuit** : débit minimum entre 2 h et 5 h (heure du site), hors `quiet_windows`, supérieur à la ligne de base (médiane des 14 dernières nuits saines) + max(20 %, 5 L/h), pendant 2 nuits de suite. Seuils paramétrables par point.
- **Débit continu** : le débit ne descend jamais sous un seuil (défaut 5 L/h) pendant 24 h, hors `quiet_windows`.
- **Rupture** : débit horaire supérieur à 3 fois le maximum observé sur 30 jours et à un plancher absolu (défaut 500 L/h). Alerte immédiate.
- **Compteur muet** : aucune donnée depuis 36 h (réseau mobile) ou 6 h (LoRaWAN horaire). Paramétrable.
- **Fin de fuite** : réparation détectée automatiquement quand le débit de nuit revient à la ligne de base 2 nuits de suite, ou déclarée par l'utilisateur.
- **Économies (méthode prudente)** : volume économisé = excès de débit × 24 h × délai de découverte évité. Délai par défaut : 30 jours, paramétrable par le superadmin. Montant = volume × prix du m³ du site. Le texte de la méthode est enregistré dans `leak_events.method` et affiché partout où apparaît le montant. Une alerte marquée « fausse alerte » ne compte jamais.
- **Indicateur par activité** : litres consommés ÷ `activity_data.quantity` sur le mois.
- Tests à valeurs connues, dont : fuite de 25 L/h, prix 4,50 €/m³, délai 30 jours ; attendu : 18 m³ économisés, soit 81 €. Même cas au Maroc, avec prix en dirhams et fuseau `Africa/Casablanca`.

Critère de fin : tests verts, fuite simulée détectée puis réparée sur les données de test.

### Phase G5 : alertes et rapports
- Alerte fuite : SMS et e-mail au technicien, avec le site, la zone, le débit estimé en L/h, le coût estimé par mois si rien n'est fait, et un bouton « Je m'en occupe ». Escalade au directeur si rien n'est fait en 12 h.
- SMS : intégration d'un fournisseur couvrant la France et le Maroc, derrière une interface simple (`sendSms`), pour pouvoir en changer. `TODO(RAYAN)` : choix du fournisseur et clés. En développement, les SMS sont seulement journalisés.
- Rapport mensuel le 1er du mois à 8 h (heure du site), en e-mail et en PDF :
  1. le **compteur d'économies cumulées depuis l'arrivée**, en grand ;
  2. les fuites du mois (détectées, réparées, économies) ;
  3. la consommation du mois, comparée au mois précédent et à l'an dernier ;
  4. l'indicateur par activité ;
  5. la comparaison avec les sites du même type, uniquement à partir de 5 sites comparables, anonymisée ;
  6. un conseil court.
  Un mois sans fuite affiche : « Aucune fuite ce mois : votre eau est sous surveillance jour et nuit. »
- Suivi d'ouverture des rapports (événements Resend). Si aucun rapport n'est ouvert depuis 2 mois : signal dans l'espace superadmin (et chez le partenaire concerné).
- Vue groupe pour les chaînes : classement des sites par indicateur d'activité et par alertes ouvertes.

Critère de fin : alerte simulée reçue par e-mail (et SMS journalisé), rapport mensuel généré avec le compteur d'économies.

### Phase G6 : les espaces
- **Site (directeur)** : en haut, le compteur d'économies et l'état « sous surveillance » ou « fuite en cours » ; courbe des 30 derniers jours avec la bande de nuit visible ; fuites et leur historique ; points de comptage ; saisie simple des nuitées ou emplacements du mois.
- **Groupe (siège d'une chaîne)** : tous ses sites, classement, alertes.
- **Partenaire** : ses clients et leurs sites, assistant de pose, usage du mois.
- **Technicien** : ses alertes, le bouton « Je m'en occupe », l'assistant de pose.
- **Superadmin** : organisations (statut, essai), usage mensuel et export CSV de facturation (mise en service + abonnement, EUR et MAD), rapports non ouverts, consultation en lecture seule journalisée.
- Navigation filtrée par `kind`.

Critère de fin : chaque rôle navigue sur les données de démonstration sans écran vide ni erreur.

### Phase G7 : marque blanche
Réutilise la phase 6 du plan Immeuble si elle a été faite ; sinon, implémente-la ici : `org_branding` (nom affiché, logo, couleurs, nom d'expéditeur, adresse de réponse, mention « Propulsé par SmartMetera » active par défaut) ; thème par variables CSS avec contraste d'au moins 4,5:1 ; pages `/p/[slug]/connexion` ; e-mails, SMS (nom d'expéditeur quand le fournisseur le permet) et PDF à la marque du partenaire.

Critère de fin : deux partenaires de démonstration affichent chacun leur marque partout.

### Phase G8 : passe de design
- Commence par un plan de design dans `docs/DESIGN.md` (palette de 4 à 6 couleurs, typographies, mise en page, principes), relis-le contre ce brief et corrige ce qui fait générique, puis implémente.
- Identité SmartMetera : bleu #1B4F8A, turquoise #0FA3A3, encre #0A2540, Fraunces pour les titres, Manrope pour le texte. Les partenaires imposent leurs couleurs via les variables. Aucune couleur en dur.
- Un seul élément mémorable : **le compteur d'économies**. Le reste sobre. La courbe de débit avec la bande de nuit doit se lire en 3 secondes.
- Technicien et directeur de site : pensés d'abord pour le téléphone.
- Chiffres au format français (espace insécable, virgule décimale, « m³ », « € », « MAD »), chiffres tabulaires dans les tableaux.
- Textes : phrases courtes, casse de phrase, verbes d'action sur les boutons, erreurs qui disent quoi faire.
- Qualité minimale : responsive, focus clavier visible, contraste AA, `prefers-reduced-motion`, squelettes de chargement.

Critère de fin : `docs/DESIGN.md` écrit, écrans principaux refaits.

### Phase G9 : démonstration et tests de bout en bout
- Seed réservé au développement : il refuse de s'exécuter si l'URL Supabase est celle de production.
- Organisation « Hôtels Atlas Démo » (chaîne fictive, Maroc, MAD) : 3 hôtels, 3 à 5 points chacun, 6 mois de relevés horaires, une fuite de chasse d'eau détectée et réparée, un compteur muet.
- Organisation « Camping Partenaire Démo » (France, EUR), en marque blanche : 2 campings, dont un avec arrosage de nuit déclaré (aucune fausse alerte), une rupture détectée.
- Nuitées et emplacements renseignés pour l'indicateur d'activité.
- Commande `npm run demo:reset` (moins de 5 minutes).
- Tests de bout en bout : pose, réception, fuite simulée, alerte, prise en charge, réparation, économies, rapport mensuel.

Critère de fin : `demo:reset` et tests de bout en bout verts.

### Phase G10 : mise en ligne
Reprends la phase 10 du plan Immeuble, avec ces ajouts : fournisseur SMS (clés côté serveur uniquement) et `docs/MISE_EN_LIGNE.md` avec les étapes manuelles de Rayan, à cocher, expliquées pour un débutant. Domaine `app.smartmeteria.com`, Vercel `cdg1`, Supabase de production à Paris, SMTP personnalisé via Resend, Sentry sans données personnelles, en-têtes de sécurité, limitation de débit, guide d'exploitation `docs/RUNBOOK.md`, pages légales en modèles « à faire valider » (CGU et CGV B2B, confidentialité, accord de sous-traitance).

Critère de fin : `app.smartmeteria.com` en ligne, test de fumée réussi (inscription d'essai, pose simulée, alerte de test vers le téléphone de Rayan).

## 5. Hors périmètre v1 (ne pas construire)
Stripe ; serveur UDP ou CoAP ; électrovanne de coupure automatique (bonne extension future) ; suivi de l'électricité ; application mobile native ; WhatsApp ; API publique ; langues autres que le français. Les offres Réseau et Immeuble restent en pause.

## 6. Actions manuelles de Rayan
1. Choisir les 2 modèles de capteurs (réseau mobile et LoRaWAN) et savoir comment leurs données sont renvoyées (plateforme du fabricant, opérateur, fichier).
2. Fournir quelques trames ou fichiers réels de ces capteurs.
3. Choisir le fournisseur SMS et créer le compte.
4. Vérifier la couverture NB-IoT et LTE-M au Maroc.
5. Créer les identifiants Google OAuth, les clés Turnstile, le projet Sentry, le domaine chez Resend, le projet Supabase de production, et pointer `app.smartmeteria.com` vers Vercel.
6. Exécuter `scripts/grant-superadmin.sql` avec son adresse.
7. Faire valider CGV, confidentialité et accord de sous-traitance par un juriste ; renseigner l'entité juridique.

## 7. Bloc pour CLAUDE.md
```
## Produit actif : Gardien de l'eau (depuis le 25 septembre 2026)
Source de vérité : docs/PLAN_GARDIEN.md ; avancement : docs/PROGRESS.md.
Offres Réseau et Immeuble en pause (docs/PLAN_IMMEUBLE.md) : ne pas les casser.
Règles supplémentaires :
- Fenêtres de nuit et envois calculés à l'heure locale du site (Europe/Paris ou Africa/Casablanca).
- Montants dans la monnaie du site (EUR ou MAD).
- Les économies affichées sont toujours prudentes et accompagnées de leur méthode.
- Aucun SMS ni e-mail réel en développement.
- Aucune couleur en dur : tout passe par les variables de thème.
- Aucun format de capteur ni contenu juridique inventé : paramétrable et TODO(RAYAN).
- Ne jamais envoyer directement sur main.
- Toujours expliquer à Rayan, en français simple et sans mot technique, ce qu'il doit tester.
```

## 8. Définition du terminé
- [ ] Les deux tests d'acceptation (section 1) sont tenus en production.
- [ ] Matrice RLS verte, `dev-superadmin` absent.
- [ ] Fuite simulée : détection, alerte, prise en charge, réparation, économies, rapport.
- [ ] Un site marocain en MAD et à l'heure de Casablanca fonctionne comme un site français.
- [ ] Deux marques partenaires distinctes partout.
- [ ] `demo:reset` et tests de bout en bout verts.
- [ ] `app.smartmeteria.com` en ligne, Sentry actif, sauvegardes actives.
