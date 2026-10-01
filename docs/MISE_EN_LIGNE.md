# Mise en ligne de SmartMeteria (Gardien de l'eau)

Ce guide liste **tout ce que vous devez faire vous-même** pour mettre
l'application en ligne sur `app.smartmeteria.com`. Tout le reste (code,
réglages, sécurité, scripts) est déjà prêt dans le projet.

Chaque étape dit **pourquoi**, **comment** et **comment vérifier**. Cochez
les cases au fur et à mesure (dans GitHub ou dans votre éditeur : remplacez
`[ ]` par `[x]`). Faites les étapes dans l'ordre : certaines ont besoin des
précédentes.

Durée estimée : une journée, plus le délai de validation des noms de
domaine (quelques heures) et des modèles WhatsApp (quelques jours).

---

## Avant de commencer

- [ ] **Un endroit sûr pour les clés.** Vous allez créer une quinzaine de
  « clés secrètes » (de longs codes qui servent de mot de passe entre les
  services). Rangez-les dans un gestionnaire de mots de passe (Bitwarden,
  1Password…), **jamais** dans un e-mail, un document partagé ou le code.
- [ ] **L'accès à votre nom de domaine** `smartmeteria.com` (le site où vous
  l'avez acheté : OVH, Gandi, Cloudflare…). Vous y ajouterez des
  « enregistrements DNS » : ce sont des lignes qui disent à Internet où
  trouver votre site et qui a le droit d'envoyer des e-mails en votre nom.
- [ ] **Un terminal** sur votre ordinateur, ouvert dans le dossier du
  projet (dans VS Code : menu Terminal > Nouveau terminal). Quelques
  commandes sont à copier-coller ; elles sont données telles quelles.

Mots utiles :
- **Supabase** : la base de données, les comptes et les tâches automatiques.
- **Vercel** : l'hébergeur du site web.
- **Resend** : le service qui envoie les e-mails.
- **Twilio** : le service qui envoie les SMS, appels et WhatsApp.
- **Sentry** : le service qui vous prévient quand l'application plante.

---

## Étape 1 — Créer la base de production (Supabase, Paris)

**Pourquoi :** la base actuelle sert aux essais (elle contient des données
de démonstration). La production doit être une base séparée et propre.

- [ ] Sur [supabase.com](https://supabase.com), dans votre organisation,
  cliquez **New project**. Nom : `smartmeteria-production`. Région :
  **West EU (Paris)**. Choisissez un mot de passe de base très long et
  rangez-le.
- [ ] Passez ce projet en offre **Pro** (Settings > Billing). C'est elle qui
  active les **sauvegardes quotidiennes** de la base (obligatoires pour la
  mise en ligne).
- [ ] Dans **Project Settings > API**, notez : l'URL du projet
  (`https://xxxx.supabase.co`), la clé **anon** (publique) et la clé
  **service_role** (secrète : elle donne tous les droits).
- [ ] Dans votre fichier local `.env.local`, ajoutez la ligne
  `SUPABASE_URL_PRODUCTION=https://xxxx.supabase.co` (l'URL de production).
  Ainsi, le script de démonstration refusera toujours de tourner sur la
  production.

**Vérifier :** le projet apparaît « Healthy » dans le tableau de bord, région
`eu-west-3`.

## Étape 2 — Installer la structure de la base

**Pourquoi :** la base est vide. Les « migrations » (fichiers du dossier
`supabase/migrations`) créent toutes les tables, les règles d'accès entre
clients et les tâches automatiques.

Dans le terminal, à la racine du projet :

```
npx supabase login
npx supabase link --project-ref xxxx
npx supabase db push
```

(`xxxx` est l'identifiant du projet, visible dans son URL. La première
commande ouvre votre navigateur pour vous connecter. La deuxième demande le
mot de passe de base de l'étape 1.)

- [ ] Les trois commandes se terminent sans erreur.
- [ ] **N'ajoutez jamais** l'option `--include-seed` : elle installerait des
  données de démonstration en production.

**Vérifier :** dans Supabase > **Table Editor**, vous voyez les tables
`sites`, `meters`, `leak_events`… Dans **SQL Editor**, la requête
`select jobname, schedule from cron.job order by 1;` affiche une dizaine de
tâches, dont `gardien-moteur` et `gardien-envois`.

## Étape 3 — Dire aux tâches automatiques où appeler

**Pourquoi :** toutes les 15 minutes et toutes les heures, la base lance la
détection des fuites et les envois. Elle doit connaître l'adresse des
fonctions et la clé publique.

- [ ] Dans Supabase > **SQL Editor**, collez puis exécutez (en remplaçant
  `xxxx` et la clé anon de l'étape 1) :

```sql
select vault.create_secret('https://xxxx.supabase.co/functions/v1', 'functions_base_url');
select vault.create_secret('LA-CLE-ANON', 'anon_key');
```

**Vérifier :** après l'étape 4, l'onglet **Surveillance** de l'espace
superadmin affiche « À l'heure » pour la détection des fuites.

## Étape 4 — Mettre en ligne les fonctions et leurs secrets

**Pourquoi :** les « fonctions » sont les programmes qui tournent côté
serveur : réception des capteurs, détection des fuites, envois.

- [ ] Dans le terminal :

```
npx supabase functions deploy ingest --no-verify-jwt
npx supabase functions deploy gardien-moteur
npx supabase functions deploy gardien-envois
npx supabase functions deploy inbound-email --no-verify-jwt
npx supabase functions deploy notifications
npx supabase functions deploy reports
npx supabase functions deploy process-import
```

- [ ] Dans Supabase > **Edge Functions > Secrets**, ajoutez pour commencer
  (les autres viendront aux étapes 6 et 12) :
  - `GARDIEN_ENVOIS_MODE` = `journal` (rien ne part tant que tout n'est pas vérifié) ;
  - `GARDIEN_URL_APP` = `https://app.smartmeteria.com`.

**Vérifier :** les 7 fonctions apparaissent dans **Edge Functions**, en vert.

## Étape 5 — Réglages des comptes (Supabase > Authentication)

**Pourquoi :** pour que les liens de connexion ramènent sur le bon site, et
que les mots de passe trop connus soient refusés.

- [ ] **URL Configuration** : *Site URL* = `https://app.smartmeteria.com` ;
  *Redirect URLs* : ajoutez `https://app.smartmeteria.com/**`.
- [ ] **Sign In / Providers > Email** : laissez la confirmation d'adresse
  activée ; activez **Prevent use of leaked passwords**.
- [ ] **Attention : n'activez pas** « Enable Captcha protection » dans
  Supabase. La case anti-robot est vérifiée par l'application elle-même
  (étape 8) ; l'activer aussi dans Supabase bloquerait la connexion.
- [ ] **SMTP Settings** (après l'étape 6) : activez *Custom SMTP* avec
  - Host : `smtp.resend.com`, Port : `465`,
  - Username : `resend`, Password : votre clé API Resend,
  - Sender email : `alertes@smartmeteria.com`, Sender name : `SmartMeteria`.

  L'application envoie elle-même ses e-mails de connexion par Resend ; ce
  réglage sert de secours pour les rares e-mails envoyés directement par
  Supabase (le service d'e-mail intégré de Supabase est limité à quelques
  messages par heure et réservé aux essais).

**Vérifier :** à l'étape 15, l'inscription d'essai reçoit bien son e-mail.

## Étape 6 — Envoi des e-mails (Resend)

**Pourquoi :** pour que vos e-mails arrivent dans la boîte de réception, et
pas dans les indésirables, il faut prouver que vous possédez le domaine.

- [ ] Sur [resend.com](https://resend.com), **Domains > Add domain** :
  `smartmeteria.com`, région **Ireland (eu-west-1)** si elle est proposée.
- [ ] Resend affiche 3 ou 4 lignes DNS (SPF, DKIM, parfois MX). Copiez-les
  **exactement** chez votre registraire de domaine, puis cliquez
  **Verify**. Ajoutez aussi une ligne DMARC (type TXT, nom `_dmarc`,
  valeur `v=DMARC1; p=none; rua=mailto:votre-adresse@smartmeteria.com`).
- [ ] **API Keys > Create** (droit : *Sending access*). Rangez la clé.
- [ ] Mettez la clé à deux endroits :
  - Vercel (étape 7) : `RESEND_API_KEY` et
    `RESEND_FROM_EMAIL` = `SmartMeteria <alertes@smartmeteria.com>` ;
  - Supabase > Edge Functions > Secrets : les mêmes `RESEND_API_KEY` et
    `RESEND_FROM_EMAIL`.

**Vérifier :** le domaine passe à « Verified » dans Resend (parfois après
quelques heures).

## Étape 7 — Le site web (Vercel, Paris)

**Pourquoi :** Vercel affiche l'application. La région Paris (`cdg1`) est
déjà réglée dans le fichier `vercel.json`.

- [ ] Sur [vercel.com](https://vercel.com), **Add New > Project**, importez
  le dépôt GitHub `smartmetera-rendement`. Laissez les réglages proposés
  (Next.js).
- [ ] **Settings > Environment Variables**, environnement **Production** :

| Nom | Valeur |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL de production (étape 1) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé anon de production |
| `SUPABASE_SERVICE_ROLE_KEY` | clé service_role de production |
| `NEXT_PUBLIC_SITE_URL` | `https://app.smartmeteria.com` |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | étape 6 |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | étape 8 |
| `SENTRY_DSN` | étape 9 |

  Ne mettez **jamais** `EMAIL_DEV_REDIRECT` ni `DEMO_MOT_DE_PASSE` en
  production. Pour l'environnement **Preview** (versions d'essai), mettez
  les clés de la base de **développement**, jamais celles de production.
- [ ] **Settings > Git** : la branche de production est `main`. La mise en
  ligne se fait en fusionnant `feat/gardien` dans `main` sur GitHub
  (bouton « Compare & pull request », puis « Merge »). C'est vous qui
  décidez quand : rien n'est jamais envoyé directement sur `main`.
- [ ] **Settings > Domains** : ajoutez `app.smartmeteria.com`. Vercel
  indique une ligne DNS (en général de type CNAME, nom `app`, valeur
  `cname.vercel-dns.com`) : ajoutez-la chez votre registraire.

**Vérifier :** `https://app.smartmeteria.com` affiche la page d'accueil avec
le cadenas du navigateur. Le test de fumée (étape 15) vérifie la région.

## Étape 8 — Case anti-robot de l'inscription (Cloudflare Turnstile)

**Pourquoi :** empêche les robots de créer des comptes en masse.

- [ ] Sur [dash.cloudflare.com](https://dash.cloudflare.com) (compte gratuit),
  **Turnstile > Add site** : nom `SmartMeteria`, domaine
  `app.smartmeteria.com`, mode *Managed*.
- [ ] Copiez la *Site Key* et la *Secret Key* dans Vercel
  (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`), puis
  redéployez (Vercel > Deployments > … > Redeploy).

**Vérifier :** la page `/inscription` affiche la case « Je ne suis pas un
robot » de Cloudflare.

## Étape 9 — Alertes en cas de panne (Sentry)

**Pourquoi :** si une page plante chez un client, vous êtes prévenu. Les
adresses e-mail, téléphones et liens secrets sont masqués avant l'envoi.

- [ ] Sur [sentry.io](https://sentry.io), créez un compte en choisissant la
  **région de données européenne** (Allemagne). Créez un projet de type
  *Next.js* nommé `smartmeteria`.
- [ ] Dans le projet : **Settings > Security & Privacy**, activez
  *Data Scrubber* et *Prevent Storing of IP Addresses*.
- [ ] **Settings > Client Keys (DSN)** : copiez le DSN dans Vercel
  (`SENTRY_DSN`), puis redéployez.

**Vérifier :** `npm run fumee -- https://app.smartmeteria.com --sentry`
envoie une erreur de test : elle apparaît dans Sentry en moins d'une minute.

## Étape 10 — Votre accès superadmin

- [ ] Dans Supabase > **Authentication > Users > Add user**, créez votre
  compte (votre adresse, un mot de passe solide, *Auto Confirm User*
  coché).
- [ ] Ouvrez le fichier `scripts/grant-superadmin.sql`, remplacez
  `ADRESSE-A-REMPLIR@exemple.fr` par votre adresse (aux deux endroits),
  copiez le tout dans Supabase > **SQL Editor** et exécutez.

**Vérifier :** connecté sur `app.smartmeteria.com`, vous voyez l'onglet
« Superadmin ». Vous recevrez chaque matin à 7 h le récapitulatif quotidien
(dès que les envois réels sont activés, étape 13).

## Étape 11 — Vos réglages (tarifs, seuils, durées)

**Pourquoi :** certains chiffres ne peuvent pas être inventés et attendent
votre décision (voir `docs/BLOCKERS.md`).

- [ ] Tarifs marocains manquants, prix de l'eau au Maroc, seuils de
  température, délai des analyses, durée de conservation des messages :
  donnez vos chiffres (points 7, 8, 15 et 24 de `docs/BLOCKERS.md`), ils
  seront saisis dans la table `platform_settings`.

## Étape 12 — Capteurs (broker MQTT et serveur LoRaWAN)

- [ ] **Kit A (NB-IoT)** : suivez `docs/reception-mqtt.md` (choix d'un
  broker dans l'Union européenne, règle de transfert vers l'adresse
  « MQTT » de l'onglet **Réception des capteurs** du superadmin).
- [ ] **Kit C et sondes (LoRaWAN)** : suivez `infra/chirpstack/README.md`
  (ou l'alternative The Things Stack Cloud décrite dans le même guide).

**Vérifier :** une trame d'un vrai capteur apparaît dans **Réception des
capteurs > trames d'appareils inconnus** (s'il n'est pas encore en stock),
ou fait passer l'assistant de pose au feu vert.

## Étape 13 — SMS, appels et WhatsApp (Twilio)

**Pourquoi :** les alertes de fuite partent par SMS, puis par appel
(France) ou WhatsApp (Maroc) si personne ne réagit en 2 heures.

- [ ] Ouvrez un compte [Twilio](https://www.twilio.com) et passez-le en
  compte payant (le compte d'essai n'écrit qu'aux numéros vérifiés).
- [ ] Achetez un **numéro français** capable d'envoyer des SMS et d'appeler
  (Twilio demande un justificatif d'adresse pour les numéros français).
- [ ] Pour le Maroc : **Messaging > Senders > WhatsApp senders** (il faut
  un compte Meta Business vérifié), puis créez un modèle de message de
  catégorie *Utility*, en français, avec une seule variable `{{1}}` (le
  texte de l'alerte). Proposition à faire valider :
  « {{1}} — Ouvrez votre espace SmartMeteria pour indiquer que vous vous en
  occupez. » Notez son identifiant `HX…` une fois approuvé.
- [ ] Dans Supabase > **Edge Functions > Secrets**, ajoutez :
  `GARDIEN_TELEPHONE_FOURNISSEUR` = `twilio`, `TWILIO_ACCOUNT_SID`,
  `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM` (votre numéro, format `+33…`),
  `TWILIO_APPEL_FROM` (le même numéro), et pour le Maroc
  `TWILIO_WHATSAPP_FROM` et `TWILIO_WHATSAPP_CONTENT_SID`.

Tant que ces secrets manquent, les SMS, appels et WhatsApp sont seulement
écrits dans le journal des envois : rien ne casse.

## Étape 14 — Activer les vrais envois, prudemment

1. - [ ] **D'abord vers vous seul.** Dans Supabase > Edge Functions >
   Secrets : `GARDIEN_ENVOIS_MODE` = `redirection`,
   `GARDIEN_EMAIL_REDIRECT` = votre adresse, `GARDIEN_TELEPHONE_REDIRECT` =
   votre portable (`+33…`). Tous les messages de tous les clients partent
   alors **vers vous seul**, avec « [Test, pour …] » devant.
2. - [ ] Espace superadmin > **Surveillance > Message de test** : cochez
   E-mail, SMS et Appel, saisissez votre numéro, cliquez **Envoyer le
   message de test**. Vous devez recevoir l'e-mail, le SMS, puis l'appel.
3. - [ ] **Ensuite pour de vrai.** `GARDIEN_ENVOIS_MODE` = `reel`. Les
   clients reçoivent leurs alertes et leurs rapports.

## Étape 15 — Test de fumée

**Pourquoi :** une vérification rapide que tout fonctionne en vrai.

- [ ] Dans le terminal (le fichier `.env.production.local`, jamais
  enregistré dans Git, contient `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `FUMEE_EMAIL` et `FUMEE_MOT_DE_PASSE`
  de votre compte superadmin) :

```
npm run fumee -- https://app.smartmeteria.com --env .env.production.local
```

  Le script ne crée rien et n'envoie rien. Il doit finir par
  « 0 échec(s) ».
- [ ] **Inscription d'essai** : dans une fenêtre privée, `/inscription`,
  avec une adresse de test. L'e-mail de confirmation arrive ; le lien ouvre
  « Mes sites ».
- [ ] **Pose simulée** : ajoutez un site, puis un capteur dans
  « Appareils », et suivez l'assistant de pose jusqu'à « En attente ».
  Avec un vrai capteur : ouvrez un robinet 30 secondes, le feu vert
  s'affiche.
- [ ] **Alerte de test** vers votre téléphone : étape 14, point 2.
- [ ] **Page preuve** : depuis « Mes sites », « Créer une page preuve »,
  ouvrez le lien dans une fenêtre privée : la page s'affiche sans
  connexion.
- [ ] Supprimez ensuite l'organisation d'essai (espace superadmin).

## Étape 16 — Juridique et marque

- [ ] Faites relire par un juriste les six modèles de `/legal` (mentions
  légales, conditions d'utilisation, conditions de vente, conditions du
  pilote, confidentialité, accord de sous-traitance) et le registre
  `docs/REGISTRE_TRAITEMENTS.md`. Donnez les informations de votre société
  (raison sociale, siège, immatriculation, TVA, contact) : elles seront
  saisies et le bandeau « Modèle à faire valider » retiré.
- [ ] Déposez la marque SmartMeteria (INPI, EUIPO).

## Étape 17 — Après la mise en ligne

- [ ] Chaque matin, lisez le récapitulatif quotidien (tâches en retard,
  messages en échec, pilotes et essais qui se terminent).
- [ ] En cas de problème : `docs/RUNBOOK.md` (guide d'exploitation).
