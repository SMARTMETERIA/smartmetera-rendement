# SmartMeteria : plan de construction « Gardien de l'eau » (version 2)

Version 2, 26 septembre 2026. Ce fichier remplace la version 1 du 25 septembre. Il est la source de vérité du projet. `docs/PLAN_IMMEUBLE.md` reste en pause (rien n'est supprimé).

## 0. Changements de la version 2 (à lire en premier)

**Règle de rattrapage.** Si une phase est déjà terminée (voir `docs/PROGRESS.md`), ne la refais pas. Termine la phase en cours, puis crée une phase de rattrapage « Phase V2 » qui ajoute uniquement les compléments de la version 2 des phases déjà terminées (dans des migrations séparées), avant de reprendre la suite du plan.

| Sujet | Changement | Phases concernées |
|---|---|---|
| Positionnement | Le produit devient le « registre eau » de l'établissement : fuites, relevés de température d'eau chaude (suivi légionelles), exports Clef Verte et BREEAM, mode fermeture | G1, G4, G5, G6 |
| Prix par défaut | Mise en service 349 € HT par point, 590 € HT pour le premier point d'un site avec passerelle ; abonnement 19 € HT pour le premier point d'un site, 12 € HT par point supplémentaire ; sonde de température +9 € HT par mois ; prix partenaire en marque blanche de 6 à 9 € par point ; Maroc 2 500 MAD de mise en service et 120 MAD par mois. Tout reste paramétrable. | G1, G6 |
| Capteurs | Kit A : Adeunis PULSE NB-IoT/LTE-M (France, 1 à 2 compteurs, sans passerelle), reçu en MQTTS. Kit C : Milesight EM300-DI LoRaWAN + passerelle 4G + serveur réseau ChirpStack (grands sites et Maroc). Sonde de température LoRaWAN pour l'eau chaude (modèle `TODO(RAYAN)`). | G3, G10 |
| Flotte | Table des appareils, provisionnement en masse par QR code, état des piles et de la radio, alerte « capteur muet » distincte d'une alerte fuite | G1, G3, G6 |
| Moteur | Ligne de base auto-calibrée (jour de la semaine, saison), plages d'exclusion, mode fermeture, règles de température, compteur de pertes en direct | G4 |
| Vente | Pilotes de 30 jours suivis dans l'outil, rapports de première nuit et de première semaine, page preuve partageable, pré-diagnostic, conversion par défaut uniquement avec consentement écrit | G1, G5, G6 |
| Alertes | Escalade SMS, e-mail, puis appel vocal ou WhatsApp (fournisseur `TODO(RAYAN)`) | G5 |
| Maroc | Champ « retenue à la source (%) » par organisation, repris dans l'export de facturation | G1, G6 |
| Prix de l'eau par défaut | 4,89 €/m³ (moyenne française TTC au 1er janvier 2025), modifiable par site | G1, G4 |
| Nouvelle phase | G11 « Autonomie en eau » (niveau des réserves) : ne commencer que sur instruction explicite de Rayan | G11 |

## 1. Contexte (pour Claude Code)

### Ce qui existe
- Les prompts 0 à 8 du guide « SmartMeteria Rendement » : application multi-tenant Next.js (App Router, TypeScript strict, Tailwind, shadcn/ui, Recharts) et Supabase (Postgres, Auth, Storage, Edge Functions, pg_cron), import CSV universel, webhooks LoRaWAN (dont ChirpStack) et décodeurs de capteurs d'impulsions, moteur de débit de nuit et d'alertes, e-mails Resend, rapports PDF, espace superadmin. C'est l'offre **Réseau** (régies d'eau) : **en pause**.
- Une partie de `docs/PLAN_IMMEUBLE.md` (voir `docs/PROGRESS.md` et `docs/AUDIT.md`). L'offre **Immeuble** est **en pause**. Tout ce qui a déjà été construit est conservé et réutilisé quand c'est utile.
- Les phases déjà réalisées de la version 1 de ce plan (voir `docs/PROGRESS.md`).

### Le produit
Le **Gardien de l'eau** est le registre eau des établissements qui paient eux-mêmes leur eau : hôtels, campings, villages vacances, résidences de tourisme, centres commerciaux, salles de sport. Il :
1. détecte les fuites (débit la nuit, débit continu, rupture brutale, consommation pendant une fermeture) et prévient par SMS et e-mail, puis par appel ou WhatsApp si personne ne réagit ;
2. tient le registre des températures d'eau chaude sanitaire (suivi légionelles) ;
3. envoie chaque mois un rapport avec **les euros économisés depuis le début**, les litres par nuitée ou par emplacement, et les exports Clef Verte ;
4. compare les sites d'une même chaîne ou d'un même type ;
5. se revend en marque blanche par des partenaires (fabricants de systèmes pour campings, installateurs, distributeurs).

Matériel (acheté à des fabricants, jamais fabriqué par SmartMeteria) :
- **Kit A** : Adeunis PULSE NB-IoT/LTE-M, pour les compteurs à sortie impulsion en France, sans passerelle ;
- **Kit C** : Milesight EM300-DI LoRaWAN + passerelle 4G, pour les grands sites et pour tout le Maroc (pas de NB-IoT connu au Maroc) ;
- **Sonde de température** LoRaWAN sur l'eau chaude sanitaire ;
- compteur sans sortie impulsion : un plombier pose un sous-compteur privé à sortie impulsion (hors logiciel).

France (EUR, `Europe/Paris`) et Maroc (MAD, `Africa/Casablanca`) dès la v1.

### Tests d'acceptation
> 1. **Pose** : un technicien scanne le QR code, pose le capteur, ouvre un robinet 30 secondes et voit « données reçues » en moins de 10 minutes. Si le capteur ne transmet qu'à intervalle fixe, l'assistant affiche le délai attendu et prévient dès la première donnée.
> 2. **Fuite** : une fuite simulée déclenche une alerte le matin suivant avec son coût en cours, puis entre dans le compteur d'économies une fois réparée.
> 3. **Vente** : un pilote de 30 jours produit automatiquement un rapport de première nuit, un rapport de première semaine, un résumé de fin de pilote et une page preuve partageable.

Tout arbitrage se fait en faveur de ces trois tests.

### Modèle économique (paramètres par défaut, tous modifiables)

| Élément | France | Maroc |
|---|---|---|
| Mise en service, par point | 349 € HT | 2 500 MAD |
| Mise en service du premier point d'un site avec passerelle | 590 € HT | à paramétrer |
| Abonnement, premier point d'un site | 19 € HT par mois | 120 MAD par mois |
| Abonnement, point supplémentaire du même site | 12 € HT par mois | à paramétrer |
| Sonde de température (registre légionelles) | +9 € HT par mois | à paramétrer |
| Prix partenaire en marque blanche | 6 à 9 € par point, fixé par partenaire | à paramétrer |
| Engagement | 24 mois ; option annuelle avec deux mois offerts | idem |
| Remise fondateur | pourcentage paramétrable par organisation (défaut 0) | idem |
| Retenue à la source | 0 % par défaut | 10 % par défaut pour une organisation marocaine facturée depuis l'étranger |

Pas de paiement en ligne en v1 : un export d'usage mensuel sert à facturer à la main.

## 2. Protocole de travail autonome (sessions de 2 heures)

1. Continue sur la copie de travail `feat/gardien`. N'envoie jamais rien directement sur `main`.
2. Lis d'abord la section 0 et applique la règle de rattrapage.
3. Exécute les phases dans l'ordre. Pour chaque phase :
   a. écris ton plan en 5 lignes maximum dans `docs/PROGRESS.md` ;
   b. implémente (migrations SQL versionnées dans `/supabase/migrations`) ;
   c. lance typecheck, lint et tests, y compris les tests existants ;
   d. enregistre ton travail avec un message `phase GN : <résumé>` ;
   e. mets à jour `docs/PROGRESS.md` : fait, reste, et comment tester à l'écran en 5 étapes maximum, écrites pour un débutant.
4. Enchaîne la phase suivante sans attendre tant que le critère de fin est atteint et que les tests sont verts.
5. Blocage réel (secret absent, action manuelle, décision métier ou juridique) : écris la question précise dans `docs/BLOCKERS.md`, contourne avec un bouchon marqué `TODO(RAYAN)`, et continue sur ce qui n'en dépend pas.
6. N'invente jamais un format de trame, un protocole de capteur, un seuil réglementaire ou un contenu juridique : rends-le paramétrable et marque-le `TODO(RAYAN)`.
7. Avant la fin de la session, sauvegarde tout sur GitHub (copie `feat/gardien`) et explique à Rayan, en français simple et sans mot technique, ce qu'il doit tester.
8. Conserve les conventions du code existant. Aucune nouvelle dépendance lourde sans justification écrite dans `docs/PROGRESS.md`.
9. Ne casse pas les offres en pause : leurs tests existants restent verts.

## 3. Décisions verrouillées

| Sujet | Décision |
|---|---|
| Une seule application | `organizations.kind` : `reseau` (pause), `immeuble` (pause), `sites` (actif). La navigation dépend de `kind`. |
| Hiérarchie | organisation (partenaire, chaîne ou client direct) → clients (facultatif, pour les partenaires) → sites → points de comptage et points de température |
| Fuseau horaire | Par site : `Europe/Paris` ou `Africa/Casablanca` ; RDC (ajout du 2 octobre 2026) : `Africa/Kinshasa` ou `Africa/Lubumbashi`. Fenêtres de nuit, envois et rapports à l'heure locale du site. |
| Monnaie | Par site : EUR ou MAD ; RDC : USD ou CDF. Le prix de l'eau au m³ est saisi dans la monnaie du site. |
| Rôles | superadmin (plateforme) ; admin, agent, lecteur (organisation) ; directeur de site (portée : ses sites) ; technicien (alertes et poses) |
| Connexion | E-mail et mot de passe, Google, lien magique. Inscription autonome possible en essai de 30 jours. |
| Réception NB-IoT (kit A) | MQTTS via un broker MQTT managé hébergé dans l'Union européenne (`TODO(RAYAN)` : choix du broker), avec transfert HTTP vers un point d'entrée `/ingest/mqtt` protégé par jeton. Pas de LwM2M ni de CoAP en v1. |
| Réception LoRaWAN (kit C, sondes) | ChirpStack auto-hébergé dans l'Union européenne (fichiers `infra/chirpstack/` + guide pas à pas pour Rayan). Alternative acceptée : The Things Stack Cloud. Dans les deux cas, via les webhooks existants. |
| Import de secours | Import CSV planifié depuis un portail fabricant, déjà existant. |
| Fréquence minimale | Relevés au moins horaires (même s'ils arrivent en lot). En dessous : point marqué « surveillance limitée ». |
| Alertes | SMS + e-mail, puis appel vocal ou WhatsApp après 2 h sans prise en charge, derrière une interface `notify()`. Escalade au directeur après 12 h. |
| Pertes et économies | Toujours la méthode prudente, affichée à côté de chaque montant. Jamais de chiffre gonflé. Une « fausse alerte » ne compte jamais. |
| Températures | Seuils paramétrables par point. Défauts : 55 °C en sortie de production, 50 °C sur la boucle de retour. `TODO(RAYAN)` : vérifier les seuils et les fréquences exactes dans les textes. |
| Pilotes | 30 jours par défaut. Passage automatique en abonnement uniquement si le client l'a accepté par écrit au début du pilote (case cochée, horodatée, avec son nom). Sinon, une tâche d'appel est créée pour Rayan. |
| Promesses | Aucune garantie de détection. Mention « surveillance fondée sur les données transmises par les capteurs » dans les rapports, les alertes et les pages preuve. |
| Marque blanche | Pour les partenaires : logo, couleurs, nom d'expéditeur (réutilise le travail du plan Immeuble s'il existe). Clients directs : identité SmartMeteria. |
| Facturation | Table d'usage mensuel et export CSV. Pas de Stripe. |
| Hébergement | Supabase région Paris, Vercel région `cdg1`, broker MQTT et serveur LoRaWAN dans l'Union européenne. |

## 4. Phases

Les ajouts de la version 2 sont marqués **(v2)**.

### Phase G0 : point de situation (30 minutes maximum)
- Lis la section 0, `docs/PROGRESS.md`, `docs/AUDIT.md` et le code. Liste ce qui est fait (plan Immeuble et version 1 de ce plan) et ce qui est réutilisable.
- Si `PLAN_GARDIEN.md` se trouve à la racine du projet, déplace-le dans `docs/`.
- En tête de `docs/PLAN_IMMEUBLE.md`, la ligne « En pause depuis le 25 septembre 2026, remplacé par docs/PLAN_GARDIEN.md » doit être présente.
- Dans `CLAUDE.md` (ou le fichier qu'il importe, par exemple `AGENTS.md`), remplace le bloc « Produit actif » par celui de la section 7 de ce plan.
- Écris la synthèse et la liste des compléments v2 à rattraper dans `docs/PROGRESS.md`. Ne modifie aucun code dans cette phase.

Critère de fin : synthèse écrite, liste de rattrapage écrite, `CLAUDE.md` à jour.

### Phase G1 : modèle de données « Sites »
RLS activée sur chaque nouvelle table dès sa création.
- `organizations` : valeur `sites` pour `kind` ; si absents : `status` (`essai` | `actif` | `suspendu`), `trial_ends_at`, `slug`, `settings` (jsonb : tarifs, seuils). **(v2)** `withholding_tax_pct` (défaut 0), `founder_discount_pct` (défaut 0), `partner_price_per_point` (marque blanche).
- `clients` : réutilise la table du plan Immeuble si elle existe, sinon crée-la.
- `sites` : `organization_id`, `client_id` (nullable), `name`, `type` (`hotel` | `camping` | `village_vacances` | `residence_tourisme` | `centre_commercial` | `salle_sport` | `restaurant` | `laverie` | `autre`), adresse, `country`, `timezone`, `currency` (`EUR` | `MAD`), `water_price_per_m3` (défaut 4,89), `activity_unit` (`nuitee` | `emplacement` | `couvert` | `m2` | `aucune`), `capacity`, `active`. **(v2)** `closed_periods` (jsonb : périodes de fermeture), `occupancy_rate_default`, surcharges de prix facultatives.
- `meters` : `site_id`, `zone`, `pulse_weight_l`, `install_index_m3`, `installed_at`, `device_ref`, `device_model`, `transmission` (`lorawan` | `cellulaire` | `import`), `surveillance` (`complete` | `limitee`).
- **(v2)** `devices` : `organization_id`, `site_id` (nullable), `meter_id` (nullable), `device_ref` (DevEUI ou IMEI), `model`, `kit` (`A` | `C` | `sonde` | `autre`), `transmission`, `sim_ref`, `battery_pct`, `rssi`, `snr`, `last_seen_at`, `firmware`, `provisioning_status` (`en_stock` | `attribue` | `pose` | `actif` | `retire`), `qr_code`.
- **(v2)** `temperature_points` : `organization_id`, `site_id`, `label`, `type` (`sortie_production` | `retour_boucle` | `point_eloigne`), `device_id`, `threshold_c`.
- **(v2)** `temperature_readings` : `point_id`, `ts`, `value_c`. Même règles que les relevés d'eau (UTC, jamais de suppression physique).
- `quiet_windows` : plages où une consommation de nuit est normale (arrosage, remplissage de piscine).
- `activity_data` : `site_id`, `date`, `quantity` (nuitées, emplacements occupés, couverts).
- `leak_events` : `meter_id`, `site_id`, `type` (`fuite_nuit` | `debit_continu` | `rupture` | `fuite_fermeture`), `detected_at`, `excess_flow_lph`, `status` (`ouverte` | `prise_en_compte` | `reparee` | `fausse_alerte`), `acknowledged_by`, `acknowledged_at`, `repaired_at`, `saved_m3`, `saved_amount`, `currency`, `method`.
- **(v2)** `pilots` : `organization_id`, `site_id`, `started_at`, `ends_at` (défaut +30 jours), `status` (`en_cours` | `converti` | `retire` | `prolonge`), `auto_convert_consent` (booléen), `consent_at`, `consent_by_name`, `setup_refund_if_nothing_found` (booléen), `anomalies_found`, `next_action`, `notes`.
- **(v2)** `proof_pages` : `organization_id`, `site_id`, `period_start`, `period_end`, `content` (jsonb figé), `token` (lien signé), `expires_at`, `views`.
- `site_reports` : `site_id`, `period`, `kind` (`mensuel` | `premiere_nuit` | `premiere_semaine` | `fin_pilote`), `content`, `pdf_path`, `sent_at`, `opened_at`.
- `usage_monthly` : `organization_id`, `period`, `active_points`, `setup_points`, `amount_ht`, `currency`. **(v2)** `withholding_tax_amount`, `gross_amount`.
- Index sur chaque clé étrangère et sur `organization_id`.

Critère de fin : migrations appliquées sur une base vierge, tests existants verts.

### Phase G2 : rôles, sécurité et connexion
Réutilise ce qui a été fait dans la phase 2 du plan Immeuble, sans la partie occupants.
- Superadmin via `platform_admins` et `scripts/grant-superadmin.sql`.
- Suppression du compte `dev-superadmin` et de tout contournement d'authentification, si ce n'est pas déjà fait. Test qui échoue si l'adresse réapparaît.
- Portée « site » pour les directeurs de site, rôle technicien.
- Fonctions SQL d'aide (`security definer`, `set search_path = ''`) et politiques RLS pour chaque table, y compris les tables v2. Les pages preuve sont lisibles uniquement par lien signé non expiré, sans connexion, et n'exposent aucune donnée personnelle.
- Connexion : e-mail et mot de passe, Google, lien magique. Pages en français.
- Inscription autonome `/inscription` : organisation `kind = sites` en essai de 30 jours, rôle admin, CAPTCHA Turnstile via Supabase Auth.
- Invitations par l'admin (agents, directeurs de site, techniciens).
- Tests : matrice RLS avec 2 organisations, 1 chaîne de 3 sites, 1 directeur limité à un site, 1 technicien, 1 page preuve expirée.

Critère de fin : matrice RLS verte, `dev-superadmin` introuvable.

### Phase G3 : réception des capteurs, provisionnement et assistant de pose
- Webhook générique `/ingest/generic` et webhook ChirpStack existants, avec jeton secret par source, et registre `device_ref` → appareil → compteur.
- **(v2)** Réception MQTTS pour le kit A : point d'entrée `/ingest/mqtt` qui reçoit les messages transférés par le broker (règle de transfert HTTP), vérifie le jeton, décode et enregistre. `TODO(RAYAN)` : choix du broker et identifiants.
- **(v2)** Serveur LoRaWAN : fournis `infra/chirpstack/` (fichiers de déploiement + guide pas à pas pour débutant, en français) et branche son intégration HTTP sur le webhook existant. Documente aussi l'alternative The Things Stack Cloud.
- Décodeurs : réutilise ceux des capteurs d'impulsions existants. **(v2)** Ajoute Milesight EM300-DI et Adeunis PULSE NB-IoT/LTE-M à partir de leurs documentations publiques, et un emplacement pour la sonde de température (`TODO(RAYAN)` : modèle). Tests sur trames d'exemple ; toute trame d'exemple inventée est marquée comme telle.
- Conversion impulsions → litres avec `pulse_weight_l`, index reconstitué depuis `install_index_m3`. Contrôle de fréquence et « surveillance limitée ».
- **(v2)** Provisionnement en masse : import CSV (`device_ref`, modèle, kit) vers le stock ; attribution d'un lot à un site ; génération d'une planche d'étiquettes QR en PDF A4 ; le QR ouvre l'assistant de pose déjà pré-rempli.
- **Assistant de pose sur téléphone** (`/pose`) : scan du QR code ; choix de la zone ; photo du compteur ; saisie de l'index affiché et du poids d'impulsion (valeurs courantes proposées). **(v2)** Étape « robinet test » : l'assistant demande d'ouvrir un robinet 30 secondes, détecte la montée des impulsions et affiche un grand feu vert. Si le capteur ne transmet qu'à intervalle fixe, l'assistant affiche l'heure attendue de la première donnée et envoie une notification dès qu'elle arrive. Le poids d'impulsion est vérifié en comparant l'index photographié et l'index calculé après quelques jours.
- Conçu pour une personne non technique : gros boutons, une question par écran.

Critère de fin : une trame d'exemple envoyée à chaque point d'entrée fait passer l'assistant de pose au feu vert ; une planche QR se génère.

### Phase G4 : moteur fuites, températures et économies
Réutilise le moteur de débit de nuit existant, calculé à l'heure locale de chaque site.
- **Fuite de nuit** : débit minimum entre 2 h et 5 h (heure du site), hors `quiet_windows`, au-dessus de la ligne de base + max(20 %, 5 L/h), 2 nuits de suite. **(v2)** Ligne de base auto-calibrée par site, par jour de la semaine et par saison ; période d'apprentissage de 7 à 14 jours avec des seuils prudents ; la détection de rupture est active dès la première heure.
- **Débit continu** : jamais sous 5 L/h pendant 24 h, hors `quiet_windows`.
- **Rupture** : débit horaire supérieur à 3 fois le maximum observé sur 30 jours et à 500 L/h. Alerte immédiate.
- **(v2) Mode fermeture** : pendant `closed_periods`, toute consommation au-dessus de 2 L/h pendant 2 h déclenche une alerte immédiate de type `fuite_fermeture` (seuils paramétrables).
- **Compteur muet** : aucune donnée depuis 36 h (réseau mobile) ou 6 h (LoRaWAN horaire). **(v2)** Alerte distincte d'une fuite, envoyée au partenaire ou à SmartMeteria, jamais au client en premier.
- **Fin de fuite** : réparation détectée quand le débit de nuit revient à la ligne de base 2 nuits de suite, ou déclarée par l'utilisateur.
- **(v2) Compteur de pertes en direct** : pour chaque fuite ouverte, coût cumulé depuis la détection et coût projeté par mois si rien n'est fait, avec la même méthode prudente, affichée.
- **Économies (méthode prudente)** : excès de débit × 24 h × délai de découverte évité (défaut 30 jours, paramétrable par le superadmin) × prix du m³ du site. Texte de méthode enregistré et affiché partout.
- **(v2) Températures** : alerte si la température passe sous le seuil du point ; conservation d'un relevé mensuel horodaté par point pour le registre ; rappel des analyses avant la réouverture d'un site fermé (délai paramétrable, `TODO(RAYAN)` : vérifier le délai légal).
- **Indicateur par activité** : litres consommés ÷ `activity_data.quantity` sur le mois ; à défaut, estimation avec `capacity` × `occupancy_rate_default`, signalée comme estimation.
- Tests à valeurs connues, dont :
  - fuite de 25 L/h, prix 4,89 €/m³ : 0,6 m³ et 2,93 € par jour, environ 1 071 € par an ;
  - fuite enterrée de 500 L/h : 12 m³ et 58,68 € par jour ;
  - économies prudentes : fuite de 25 L/h, prix 4,50 €/m³, délai 30 jours : 18 m³, soit 81 € ;
  - même cas au Maroc, en dirhams et à l'heure de Casablanca ;
  - mode fermeture ; température sous le seuil ; changement d'heure.

Critère de fin : tests verts ; fuite simulée détectée, chiffrée en direct, puis réparée.

### Phase G5 : alertes, rapports et moments de vente
- **Alerte fuite** : SMS et e-mail au technicien avec le site, la zone, l'heure de début, le débit, **le coût en cours et le coût mensuel projeté**, et un bouton « Je m'en occupe ». **(v2)** Sans prise en charge après 2 h : appel vocal ou WhatsApp (Maroc) via l'interface `notify()` ; après 12 h : escalade au directeur. `TODO(RAYAN)` : fournisseurs SMS, appel et WhatsApp. En développement, tout est seulement journalisé.
- **(v2) Rapport de première nuit** (le lendemain matin de la pose) et **rapport de première semaine** (J+7), automatiques pour tout nouveau site et tout pilote : courbe de la nuit, « rien à signaler » ou anomalies avec leur coût.
- **Rapport mensuel** le 1er du mois à 8 h (heure du site), e-mail et PDF : compteur d'économies cumulées en grand ; fuites du mois ; consommation comparée au mois précédent et à l'an dernier ; indicateur par activité ; comparaison avec les sites du même type (seulement à partir de 5 sites comparables, anonymisée) ; **(v2)** registre des températures du mois ; section Clef Verte (litres par nuitée) ; conseil court. Un mois sans fuite affiche : « Aucune fuite ce mois : votre eau est sous surveillance jour et nuit. »
- **(v2) Page preuve** : une page d'une minute, par lien signé et en PDF, pensée pour être transférée au patron ou au siège : fuites trouvées, euros évités, coût du service par jour et par nuitée, retour sur investissement en jours, mention de la méthode.
- **(v2) Fin de pilote** : à J+25, résumé « Ce que 30 jours de surveillance ont trouvé » envoyé au client et à Rayan, avec la page preuve. À J+30 : si `auto_convert_consent` est vrai, passage en abonnement et message de confirmation au client ; sinon, tâche « appel de conversion » dans l'espace superadmin. Si `setup_refund_if_nothing_found` est vrai et qu'aucune anomalie n'a été trouvée, tâche « remboursement et retrait du capteur ».
- Suivi d'ouverture des rapports ; signal au superadmin si aucun rapport n'est ouvert depuis 2 mois.
- Vue groupe pour les chaînes.

Critère de fin : alerte simulée reçue par e-mail (SMS et appel journalisés), rapports de première nuit, première semaine, fin de pilote et mensuel générés, page preuve accessible par lien.

### Phase G6 : les espaces
- **Site (directeur)** : en haut, le compteur d'économies et l'état « sous surveillance » ou « fuite en cours » avec le compteur de pertes qui tourne ; courbe des 30 derniers jours avec la bande de nuit ; fuites et historique ; points de comptage et de température ; saisie simple des nuitées ou emplacements du mois.
- **Groupe (siège)** : tous ses sites, classement par litres par nuitée, alertes.
- **Partenaire** : clients et sites, assistant de pose, stock d'appareils, usage du mois.
- **Technicien** : ses alertes, « Je m'en occupe », assistant de pose.
- **Superadmin** : organisations, usage mensuel et export CSV de facturation (mise en service, abonnements, sondes, remise fondateur, retenue à la source ; EUR et MAD), rapports non ouverts, consultation en lecture seule journalisée.
- **(v2) Pré-diagnostic** (superadmin et partenaire) : saisie du prix de l'eau, de la facture annuelle, de la capacité, du taux d'occupation et du nombre de points ; affiche le coût d'une chasse d'eau qui fuit (par jour et par an), celui d'une fuite enterrée, le coût du service par jour et par nuitée, et une phrase de synthèse ; export PDF à la marque.
- **(v2) Suivi des pilotes** (superadmin) : pilotes en cours, jours restants, anomalies trouvées, consentement de conversion, prochaine action.
- **(v2) Flotte** (superadmin et partenaire) : appareils, piles, radio, dernier message, capteurs muets, stock.
- **(v2) Exports** : registre des températures en PDF (« fichier sanitaire ») ; Clef Verte (litres par nuitée par mois, CSV et PDF) ; fiche BREEAM Wat 03 (système en place et journal des alertes).
- Navigation filtrée par `kind`.

Critère de fin : chaque rôle navigue sur les données de démonstration sans écran vide ni erreur ; le pré-diagnostic produit son PDF.

### Phase G7 : marque blanche
Réutilise la phase 6 du plan Immeuble si elle a été faite ; sinon : `org_branding` (nom affiché, logo, couleurs, nom d'expéditeur, adresse de réponse, mention « Propulsé par SmartMeteria » active par défaut) ; thème par variables CSS avec un contraste d'au moins 4,5:1 ; pages `/p/[slug]/connexion` ; e-mails, SMS, PDF, pages preuve et pré-diagnostics à la marque du partenaire. **(v2)** Prix partenaire par point appliqué dans l'export d'usage.

Critère de fin : deux partenaires de démonstration affichent chacun leur marque partout.

### Phase G8 : passe de design
- Commence par un plan de design dans `docs/DESIGN.md` (palette de 4 à 6 couleurs, typographies, mise en page, principes), relis-le contre ce brief, corrige ce qui fait générique, puis implémente.
- Identité SmartMeteria : bleu #1B4F8A, turquoise #0FA3A3, encre #0A2540, Fraunces pour les titres, Manrope pour le texte. Les partenaires imposent leurs couleurs via les variables. Aucune couleur en dur.
- **(v2) Les trois moments forts** à soigner en priorité : le feu vert de la pose ; l'alerte avec le compteur de pertes qui tourne ; le compteur d'économies. La page preuve doit se comprendre en 10 secondes : un grand chiffre, une phrase, une courbe.
- Technicien et directeur de site : d'abord pour le téléphone.
- Chiffres au format français (espace insécable, virgule décimale, « m³ », « € », « MAD »), chiffres tabulaires dans les tableaux.
- Textes : phrases courtes, casse de phrase, verbes d'action sur les boutons, erreurs qui disent quoi faire.
- Qualité minimale : responsive, focus clavier visible, contraste AA, `prefers-reduced-motion`, squelettes de chargement.

Critère de fin : `docs/DESIGN.md` écrit, écrans principaux refaits.

### Phase G9 : démonstration et tests de bout en bout
- Seed réservé au développement : il refuse de s'exécuter si l'URL Supabase est celle de production.
- « Hôtels Atlas Démo » (chaîne fictive, Maroc, MAD, kit C) : 3 hôtels, 3 à 5 points chacun, 6 mois de relevés horaires, une fuite de chasse d'eau détectée et réparée, un compteur muet, **(v2)** une sonde de température qui passe sous le seuil.
- « Camping Partenaire Démo » (France, EUR), en marque blanche : 2 campings, dont un avec arrosage de nuit déclaré (aucune fausse alerte) et une rupture détectée ; **(v2)** un camping fermé l'hiver avec une fuite de gel détectée en mode fermeture.
- **(v2)** Un hôtel lyonnais en pilote à J+20 (kit A), avec une fuite ouverte et son compteur de pertes, et une page preuve.
- Nuitées et emplacements renseignés.
- Commande `npm run demo:reset` (moins de 5 minutes).
- Tests de bout en bout : provisionnement QR, pose, robinet test, réception, fuite simulée, alerte, prise en charge, réparation, économies, rapports, fin de pilote, page preuve.

Critère de fin : `demo:reset` et tests de bout en bout verts.

### Phase G10 : mise en ligne
Reprends la phase 10 du plan Immeuble, avec ces ajouts : broker MQTT et serveur LoRaWAN en production (Union européenne), fournisseurs SMS, appel et WhatsApp (clés côté serveur uniquement), et `docs/MISE_EN_LIGNE.md` avec les étapes manuelles de Rayan, à cocher, expliquées pour un débutant. Domaine `app.smartmeteria.com`, Vercel `cdg1`, Supabase de production à Paris, SMTP personnalisé via Resend, Sentry sans données personnelles, en-têtes de sécurité, limitation de débit, guide d'exploitation `docs/RUNBOOK.md`, pages légales en modèles « à faire valider » (CGU et CGV B2B avec obligation de moyens, confidentialité, accord de sous-traitance, conditions de pilote avec consentement de conversion).

Critère de fin : `app.smartmeteria.com` en ligne, test de fumée réussi (inscription d'essai, pose simulée, alerte de test vers le téléphone de Rayan, page preuve).

### Phase G11 (v2, optionnelle) : autonomie en eau
**Ne pas commencer sans instruction explicite de Rayan.** Capteur de niveau LoRaWAN sur les réserves d'eau (citernes, bâches) ; volume utile par réserve ; heures d'autonomie restantes selon la consommation en cours ; alertes de seuil ; mode « coupure du réseau public » ; section dédiée dans les rapports.

## 5. Hors périmètre v1 (ne pas construire)
Stripe ; LwM2M, CoAP et serveur UDP ; électrovanne de coupure automatique ; suivi de l'électricité ; reporting CSRD complet ; application mobile native ; API publique ; langues autres que le français. Les offres Réseau et Immeuble restent en pause.

## 6. Actions manuelles de Rayan
1. Commander les premiers appareils : 5 Adeunis PULSE NB-IoT/LTE-M, 5 Milesight EM300-DI, 1 à 2 passerelles LoRaWAN 4G, et les cartes SIM IoT.
2. Choisir le modèle de sonde de température LoRaWAN.
3. Choisir le broker MQTT (Union européenne) et héberger ChirpStack (ou ouvrir un compte The Things Stack Cloud), avec le guide fourni.
4. Fournir quelques trames réelles de chaque capteur.
5. Choisir les fournisseurs SMS, appel et WhatsApp.
6. Vérifier dans les textes les seuils de température et le délai des analyses avant réouverture.
7. Vérifier les critères eau de la Clef Verte auprès de Teragir.
8. Au Maroc : tester le réseau avec deux cartes SIM ; vérifier sur PortNet si l'EM300-DI et la passerelle sont déjà agréés par l'ANRT.
9. Créer les identifiants Google OAuth, les clés Turnstile, le projet Sentry, le domaine chez Resend, le projet Supabase de production, et pointer `app.smartmeteria.com` vers Vercel.
10. Exécuter `scripts/grant-superadmin.sql` avec son adresse.
11. Faire valider CGV, conditions de pilote, confidentialité et accord de sous-traitance par un juriste ; renseigner l'entité juridique.
12. Déposer la marque auprès de l'INPI et de l'EUIPO.

## 7. Bloc pour CLAUDE.md
```
## Produit actif : Gardien de l'eau (plan version 2, depuis le 26 septembre 2026)
Source de vérité : docs/PLAN_GARDIEN.md ; avancement : docs/PROGRESS.md.
Offres Réseau et Immeuble en pause (docs/PLAN_IMMEUBLE.md) : ne pas les casser.
Règles supplémentaires :
- Fenêtres de nuit, envois et rapports à l'heure locale du site (Europe/Paris, Africa/Casablanca, Africa/Kinshasa ou Africa/Lubumbashi).
- Montants dans la monnaie du site (EUR, MAD, USD ou CDF).
- Pertes et économies : toujours la méthode prudente, affichée à côté du montant.
- Aucune garantie de détection promise ; mention « surveillance fondée sur les données transmises par les capteurs ».
- Conversion automatique d'un pilote uniquement avec un consentement écrit horodaté.
- Seuils de température et délais réglementaires : paramétrables et TODO(RAYAN), jamais inventés.
- Aucun SMS, appel, WhatsApp ni e-mail réel en développement.
- Aucune couleur en dur : tout passe par les variables de thème.
- Aucun format de capteur ni contenu juridique inventé : paramétrable et TODO(RAYAN).
- Ne jamais envoyer directement sur main.
- Toujours expliquer à Rayan, en français simple et sans mot technique, ce qu'il doit tester.
```

## 8. Définition du terminé
- [ ] Les trois tests d'acceptation (section 1) sont tenus en production.
- [ ] Matrice RLS verte, `dev-superadmin` absent, pages preuve protégées par lien signé.
- [ ] Fuite simulée : détection, compteur de pertes, alerte, escalade, prise en charge, réparation, économies, rapport.
- [ ] Pilote simulé : rapports de première nuit et de première semaine, fin de pilote, page preuve, conversion avec consentement.
- [ ] Registre des températures et export Clef Verte générés.
- [ ] Un site marocain en MAD, à l'heure de Casablanca et en LoRaWAN fonctionne comme un site français.
- [ ] Deux marques partenaires distinctes partout.
- [ ] `demo:reset` et tests de bout en bout verts.
- [ ] `app.smartmeteria.com` en ligne, Sentry actif, sauvegardes actives.
