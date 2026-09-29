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
| Marque blanche (G7) | `org_branding`, mention « Propulsé par SmartMeteria » protégée, `src/lib/marque.ts` |

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

## Phase G2 : rôles, sécurité et connexion — terminée

Plan :
1. Migrations `0033` (rôles directeur de site et technicien) et `0034` : adhésions à portée « site », fonctions d'aide (`mes_sites`, `can_read_site`, `site_role`), politiques de toutes les tables Gardien, page preuve lisible par lien signé non expiré sans connexion ; `0035` pour les droits.
2. Contexte et aiguillage : offre `sites`, espace `/sites` minimal (sites accessibles), navigation filtrée par offre.
3. Inscription autonome en offre `sites` (France ou Maroc, retenue à la source par défaut), invitations d'agents, directeurs de site et techniciens (`/sites/equipe`).
4. Tests : matrice RLS d'intégration (2 organisations, chaîne de 3 sites, directeur limité à un site, technicien, page preuve expirée), test « `dev-superadmin` introuvable », tests des modules repris (envoi, liens, validation, aiguillage).
5. README, avis de sécurité Supabase.

Fait :
- Migrations `0033` à `0036` appliquées sur la base de développement :
  rôles `directeur_site` et `technicien`, adhésions à portée site, pays
  d'organisation, fonctions d'aide, politiques de toutes les tables
  Gardien, pilotes lisibles sans les notes internes (`pilotes_visibles`),
  page preuve publique par jeton non expiré (`page_preuve_publique`) ;
  le registre des températures ne se vide qu'avec l'organisation entière.
- Superadmin : `platform_admins` et `scripts/grant-superadmin.sql`
  (existant). `dev-superadmin` absent du code et de la base ; le test
  `src/test/sans-contournement.test.ts` échoue s'il réapparaît.
- Connexion (existant, repris) : mot de passe, lien magique, Google
  (bouchon tant que les identifiants manquent), mot de passe oublié.
- Inscription `/inscription` : établissement en France ou au Maroc,
  organisation `sites` en essai de 30 jours, rôle administrateur, retenue
  à la source de 10 % au Maroc. Vérifié en soumettant le vrai formulaire
  (France et Maroc), puis nettoyé.
- Espace `/sites` (liste des sites, ajout d'un site) et `/sites/equipe`
  (invitations de directeurs de site, techniciens, agents, lecteurs,
  administrateurs ; retrait d'accès). Aiguillage `/accueil` vers `/sites`,
  navigation filtrée par offre. Vérifié avec des comptes jetables :
  l'admin voit l'équipe, le directeur ne voit que son site et pas
  l'équipe.
- Tests : matrice RLS d'intégration (18 vérifications vertes), tests
  unitaires des modules repris (envoi, liens, validation, aiguillage) et
  nouveaux (invitations, sites, retenue). Typecheck, lint, 633 tests
  unitaires et 22 tests RLS verts. Nouveaux avis de sécurité Supabase :
  seulement des fonctions volontairement appelables (utilisateur connecté,
  page preuve sans connexion).

Point d'attention : la table des relevés est volumineuse ; les écrans d'un
directeur de site doivent toujours filtrer par compteur (une lecture sans
filtre est lente à cause des règles d'accès, comme pour l'offre Réseau).

Comment tester à l'écran :
1. Ouvrez la page « Créer un compte », choisissez la France, remplissez le
   formulaire avec une adresse de test.
2. Ouvrez la page du journal des e-mails (`/dev/emails`) et cliquez sur
   « Confirmer mon adresse » : vous arrivez sur « Mes sites ».
3. Ajoutez un site (par exemple « Hôtel du Port », Hôtel, Lyon).
4. Dans « Équipe », invitez une deuxième adresse comme « Directeur de site »
   de cet hôtel, puis ouvrez son invitation dans le journal des e-mails,
   dans une fenêtre de navigation privée.
5. Ce directeur ne voit que son hôtel, et pas l'onglet « Équipe ».

## Phase G3 : réception des capteurs, provisionnement et assistant de pose — terminée

Plan :
1. Migration `0037` : réception par la plateforme (jetons MQTT et LoRaWAN dans les réglages, source par organisation créée à la volée), décodeurs Adeunis MQTTS et « valeur décodée par le serveur réseau » (sondes), état radio et pile des appareils, trames d'appareils inconnus, sessions de pose et photos ; `0038` pour les droits.
2. Réception : point d'entrée `/ingest/mqtt` (kit A, format JSON officiel Adeunis), événements ChirpStack `up` et `status`, recherche de l'appareil par sa référence, contrôle de fréquence (« surveillance limitée »), températures ; déploiement de la fonction.
3. Provisionnement : import CSV vers le stock, attribution d'un lot à un site, planche d'étiquettes QR en PDF A4.
4. Assistant de pose sur téléphone (`/pose/[code]`) : zone, photo, index, poids d'impulsion, robinet test avec feu vert ou heure attendue ; vérification du poids d'impulsion.
5. `infra/chirpstack/` (guide pas à pas, alternative The Things Stack), guide du broker MQTT, tests (trames officielles, enveloppes, fréquence) et essai réel de chaque point d'entrée.

Sources des formats (aucun format inventé) : guide Adeunis « User Guide
PULSE MQTTS NB-IoT/LTE-M » v1.1 (ARF8420AA, APP 1.4.x, annexes 2 à 5) ;
documentation ChirpStack v4 (intégration HTTP, événements `up` et
`status`) ; décodeur officiel Milesight EM300-DI (déjà utilisé).

Fait :
- Migrations `0037` à `0040` appliquées sur la base de développement ;
  fonction `ingest` déployée (version 3, identique au dépôt).
- Réception : `/ingest/mqtt` (kit A : message JSON officiel Adeunis, avec
  historique, pile faible et qualité radio ; formes « broker » et Orange
  Live Objects), ChirpStack `up` et `status` (pile), The Things Stack
  (valeurs décodées et radio), générique ; jetons de la plateforme ;
  appareil retrouvé par sa référence (IMEI ou DevEUI) ; trame d'un
  appareil en stock gardée (« données reçues » avant la pose) ; appareil
  inconnu gardé 30 jours pour diagnostic ; températures inscrites au
  registre ; point en « surveillance limitée » sous un relevé par heure.
- Provisionnement : `/sites/appareils` — import CSV vers le stock (IMEI
  contrôlé, modèle reconnu, tout ou rien), attribution d'un lot à un site,
  planche d'étiquettes QR A4 (24 étiquettes 70 × 37 mm).
- Assistant de pose `/pose` : le QR code ouvre l'assistant pré-rempli ;
  site, entrée A/B, zone, photo (réduite avant envoi), index, poids
  d'impulsion, récapitulatif ; robinet test avec feu vert, heure attendue
  de la première donnée pour un capteur à intervalle fixe, notification
  sur le téléphone si la page reste ouverte ; vérification du poids
  d'impulsion quelques jours après, avec correction (relevés recalculés,
  marqués « corrigée », trace dans le journal d'audit).
- Superadmin : onglet « Réception des capteurs » (adresses à donner au
  broker et au serveur LoRaWAN, trames d'appareils inconnus).
- Guides : `infra/chirpstack/` (serveur LoRaWAN pas à pas, accès HTTPS,
  alternative The Things Stack Cloud) et `docs/reception-mqtt.md`.
- Tests : 81 tests des modules de réception et de pose (exemples
  officiels Adeunis recopiés tels quels ; la forme « broker » est signalée
  comme supposée) ; test de synchronisation des copies de la fonction ;
  test de bout en bout contre la fonction déployée (kit A, kit C, sonde,
  appareil inconnu, index reconstitué) : feu vert obtenu à chaque point
  d'entrée. Écrans vérifiés avec des comptes jetables (pose par code,
  appareils, planche PDF). Typecheck, lint, 739 tests unitaires et 29
  tests d'intégration verts.

Dépendances ajoutées (justification) : `pdf-lib` 1.17.1 (même
bibliothèque que la fonction de rapports, planche d'étiquettes et futurs
exports PDF), `qrcode-generator` 1.4.4 (encodage QR, sans dépendance).

Reste pour plus tard : SMS ou e-mail « première donnée reçue » quand la
page est fermée (phase G5, interface `notify()`) ; vue flotte complète
(phase G6).

Comment tester à l'écran :
1. Dans « Appareils », collez la ligne d'exemple proposée (en changeant
   l'IMEI si besoin) et cliquez « Importer dans le stock ».
2. Cochez le capteur, choisissez votre hôtel, cliquez « Attribuer au
   site », puis « Imprimer les étiquettes » : un PDF s'ouvre.
3. Scannez le QR code du PDF avec votre téléphone (ou tapez le code dans
   « Poser un capteur ») : l'assistant s'ouvre, une question par écran.
4. Répondez jusqu'à « Valider la pose » : l'écran « En attente »
   annonce l'heure de la première donnée.
5. Sans vrai capteur, l'écran reste en attente : c'est normal (le test
   automatique envoie de fausses trames et obtient bien le feu vert).

## Phase G4 : moteur fuites, températures et économies — terminée

Plan :
1. Modules purs `src/lib/moteur-gardien` (heure locale, débits horaires, plages calmes, ligne de base, règles, argent, températures, activité) et tests à valeurs connues du plan.
2. Migration `0041` : bilans quotidiens `meter_days`, économies prudentes en SQL, actions sur une fuite, anomalies des pilotes, registre des températures, détecteurs Réseau hors Gardien, tâche horaire ; `0042` pour les droits.
3. Fonction `gardien-moteur` (toutes les heures) : lecture, analyse d'un site (`analyse.ts`), écritures ; déploiement.
4. Test de bout en bout : fuite simulée détectée, chiffrée, prise en charge, réparée (18 m³, 81 €).
5. Affichage minimal : fuites en cours avec compteur de pertes en direct, boutons, économies ; README.

Fait :
- Moteur : fuite de nuit (2 h – 5 h heure du site, hors plages calmes,
  ligne de base + max(20 %, 5 L/h), 2 nuits de suite), ligne de base
  auto-calibrée (médiane sur 8 semaines, par jour de la semaine,
  apprentissage 7 à 14 nuits avec seuils doublés et 3 nuits), débit
  continu, rupture (dès la première heure connue), mode fermeture, fin de
  fuite automatique après 2 nuits normales, capteur muet (36 h ou 6 h,
  adressé au partenaire ou à SmartMeteria), température sous le seuil,
  rappel des analyses (seulement si le délai est renseigné), indicateur
  par activité (estimation signalée).
- Argent : compteur de pertes en direct (depuis la détection, par jour,
  par mois, par an) et économies prudentes, toujours avec le texte de la
  méthode ; même calcul en SQL et dans l'application (vérifié par test) ;
  sans prix de l'eau, seuls les volumes sont donnés.
- Base : migrations `0041` et `0042` appliquées ; fonction `gardien-moteur`
  déployée (version 1), tâche horaire planifiée. La fonction de
  notifications de l'offre Réseau et ses deux détecteurs SQL ne touchent
  plus les organisations Gardien (elles ont leur propre moteur et leurs
  propres envois en G5).
- Écran « Mes sites » : fuites en cours avec le compteur de pertes qui
  tourne, « Je m'en occupe », « C'est réparé », « Fausse alerte » (motif
  facultatif) selon le rôle, total des économies avec la méthode, mention
  « surveillance fondée sur les données transmises par les capteurs ». En
  développement seulement, un bouton « Simuler une fuite » pour essayer.
- Tests : 42 tests du moteur (valeurs connues du plan : 0,6 m³ et 2,93 €
  par jour, environ 1 071 € par an ; 12 m³ et 58,68 € par jour ; 18 m³ et
  81 € ; même cas au Maroc en dirhams et à l'heure de Casablanca ; mode
  fermeture ; température sous le seuil ; changements d'heure de mars et
  d'octobre ; arrosage de nuit déclaré sans fausse alerte) ; 9 tests de
  bout en bout contre la fonction déployée (détection, pas de doublon,
  prise en charge, réparation automatique avec 18 m³ et 81 €, capteur
  muet puis revenu, température basse, registre, fausse alerte retirant
  les économies et l'anomalie du pilote, refus sans connexion). Écran
  vérifié avec des comptes jetables (administrateur, lecteur). Typecheck,
  lint, 833 tests unitaires et 38 tests d'intégration verts.

Aucune dépendance ajoutée.

Reste pour plus tard : envoi des alertes (SMS, e-mail, appel) et
rapports (phase G5) ; courbes, fiches de site et registre imprimable
(phase G6) ; seuils de température et délai des analyses à confirmer
(`docs/BLOCKERS.md`, point 15).

Comment tester à l'écran (avec `npm run dev`) :
1. Connectez-vous et ouvrez « Mes sites » : en haut, « Aucune fuite en
   cours » et « Votre eau est sous surveillance jour et nuit ».
2. Dans l'encadré « Essai », choisissez votre hôtel et cliquez
   « Simuler une fuite ».
3. Une fuite de nuit apparaît : le montant « Perdu depuis la
   détection » augmente chaque seconde ; en dessous, le coût par mois si
   rien n'est fait et la méthode de calcul.
4. Cliquez « Je m'en occupe » : l'étiquette devient « Prise en charge ».
5. Cliquez « C'est réparé » : la fuite disparaît et la ligne
   « Économies grâce aux fuites réparées » affiche 18 m³ et le montant
   (88,02 € avec le prix par défaut de 4,89 €/m³).

## Phase G5 : alertes, rapports et moments de vente — terminée

Plan :
1. Migration `0043` : journal des envois (ajout seul), téléphone d'alerte des membres, tâches du superadmin, suivi d'ouverture des rapports, tâche planifiée ; `0044` pour les droits.
2. Modules purs : `notify()` (e-mail par Resend, SMS, appel et WhatsApp en attente de fournisseur, tout journalisé par défaut), destinataires et escalade (2 h, 12 h), messages ; contenus des rapports (première nuit, première semaine, mensuel, fin de pilote, groupe) et de la page preuve (coût du service, retour sur investissement).
3. Fonction `gardien-envois` (toutes les 15 minutes) : alertes et escalade, capteurs muets, températures, première donnée, rapports à 8 h heure du site, fin de pilote (J+25, J+30), rapports non ouverts.
4. Écrans : fiche d'une fuite, rapport (courbe, PDF, ouverture suivie), page preuve publique et PDF, journal des envois, téléphone d'alerte, tâches du superadmin.
5. Tests à valeurs connues et test de bout en bout contre la fonction déployée ; README.

Fait :
- Marque : « SmartMeteria » partout (décision de Rayan) — écrans,
  e-mails, documents, plan ; message de la base corrigé (migration `0045`).
- Base : migrations `0043` à `0045` appliquées ; fonction `gardien-envois`
  déployée (version 1), tâche toutes les 15 minutes. Mode « journal » :
  rien ne part réellement, tout est écrit dans le journal des envois.
- Alertes : fuite → e-mail et SMS au technicien avec le lieu, l'heure de
  début, le débit, le coût en cours et le coût par mois si rien n'est
  fait, bouton « Je m'en occupe » ; appel (France) ou WhatsApp (Maroc)
  après 2 h ; directeur après 12 h ; une fuite prise en charge n'est plus
  relancée. Capteur muet au partenaire ou à SmartMeteria. Température
  basse, rappel des analyses, première donnée après une pose.
- Rapports à 8 h, heure du site : première nuit (courbe de la nuit),
  première semaine, mensuel le 1er (économies depuis le début en grand,
  fuites du mois, comparaison au mois précédent et à l'an dernier,
  litres par nuitée, comparaison anonyme à partir de 5 sites, registre des
  températures, section Clef Verte, conseil, phrase « Aucune fuite ce
  mois… »), synthèse de groupe. Page web, PDF, ouverture suivie.
- Pilotes : à J+25 résumé « Ce que 30 jours de surveillance ont trouvé »
  et page preuve (lien sans connexion, PDF, coût du service par jour et
  par nuitée, retour sur investissement en jours), au client et à
  SmartMeteria ; à J+30 conversion seulement avec consentement écrit
  (message de confirmation), sinon tâche « appel de conversion » ; tâche
  « remboursement et retrait » si rien n'a été trouvé. Tâche « rapports
  non ouverts depuis 2 mois ».
- Écrans : fiche d'une fuite, rapport, page preuve, journal des envois,
  téléphone d'alerte dans « Mon compte », page preuve à la demande sur
  « Mes sites », onglet « Tâches » du superadmin.
- Tests : 70 tests des modules d'envoi et de rapport (escalade, messages
  en euros et en dirhams, coût du service, retour sur investissement,
  comparaison, vues, PDF, téléphone) ; 11 tests de bout en bout contre la
  fonction déployée (voir README) ; écrans vérifiés avec des comptes
  jetables. Typecheck, lint, 948 tests unitaires et 49 tests
  d'intégration verts ; types des deux fonctions Deno vérifiés.

Aucune dépendance ajoutée (PDF avec `pdf-lib`, déjà présent).

Reste pour plus tard : fournisseurs SMS, appel et WhatsApp, et activation
des vrais e-mails (`docs/BLOCKERS.md`, points 17 et 18) ; espaces
complets par rôle et vue groupe détaillée (phase G6).

Comment tester à l'écran (avec `npm run dev`) :
1. Dans « Mon compte », tapez votre numéro de portable et cliquez
   « Enregistrer le numéro ».
2. Dans « Mes sites », cliquez « Simuler une fuite » : la fuite apparaît
   avec son compteur de pertes.
3. Attendez un quart d'heure, puis ouvrez « Journal des envois » : vous
   y voyez l'e-mail et le SMS d'alerte qui seraient partis (rien n'est
   réellement envoyé pendant les essais).
4. Dans « Mes sites », cliquez « Créer une page preuve » : ouvrez le lien
   dans une fenêtre de navigation privée, il s'affiche sans connexion ;
   « Télécharger en PDF » donne la même page à imprimer.
5. Le lendemain matin d'une pose, un « Rapport » apparaît dans « Mes
   sites » : ouvrez-le, puis « Version à imprimer (PDF) ».

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
