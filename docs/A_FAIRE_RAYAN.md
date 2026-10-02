# À faire par Rayan

Ce fichier réunit **tout ce que vous seul pouvez faire** : vos décisions,
les comptes à ouvrir, le matériel, le juridique et les réglages de la mise
en ligne. Il remplace les deux anciens fichiers `docs/BLOCKERS.md`
(questions en attente) et `docs/MISE_EN_LIGNE.md` (pas à pas de la mise en
ligne).

Dans le code, chaque point qui vous attend est marqué `TODO(RAYAN)` : en
attendant votre réponse, l'application fonctionne avec une valeur prudente
ou un champ vide, jamais avec un chiffre inventé.

## Comment lire ce fichier

- Chaque point dit **pourquoi** il est nécessaire, **combien de temps** il
  prend, s'il **bloque la mise en ligne** ou s'il **peut attendre**, puis
  les **étapes clic par clic**.
- « Bloque la mise en ligne » : sans lui, on ne peut pas ouvrir
  l'application à de vrais clients en France. « Peut attendre » : à faire
  plus tard, ou seulement avant de vendre au Maroc, en RDC ou une option.
- Cochez au fur et à mesure : dans VS Code, remplacez `[ ]` par `[x]` puis
  enregistrez (Ctrl+S).
- Pour une **décision**, écrivez votre choix sous « Votre réponse », puis
  demandez à Claude : « applique mes réponses de A_FAIRE_RAYAN.md ». Il les
  saisira dans les réglages et vérifiera que tout fonctionne.

Mots utiles :
- **Base d'essai** : la base de données actuelle (projet Supabase
  `orskfdkvczrxwcdpvlaa`). Elle contient la démonstration ; rien n'y part
  vers de vrais clients.
- **Supabase** : la base de données, les comptes et les tâches automatiques.
- **Vercel** : l'hébergeur du site web.
- **Resend** : le service qui envoie les e-mails.
- **Twilio** : le service qui envoie les SMS, les appels et les WhatsApp.
- **Sentry** : le service qui vous prévient quand l'application plante.
- **Clé secrète** : un long code qui sert de mot de passe entre deux
  services. Ne la mettez jamais dans un e-mail, un document partagé ou le
  code.
- **DNS** : les lignes, chez le vendeur de votre nom de domaine, qui disent
  à Internet où trouver votre site et qui peut envoyer des e-mails en votre
  nom.

## Résumé

Temps total des points qui bloquent la mise en ligne : environ **2 jours
de travail**, plus les délais d'attente (vérification du domaine d'envoi :
quelques heures ; numéro de téléphone français : 1 à 3 jours ; relecture du
juriste : 1 à 3 semaines).

| N° | Point | Bloque la mise en ligne ? | Temps |
|---|---|---|---|
| 0 | Votre accès superadmin sur la base d'essai | Non, mais à faire en premier | 10 min |
| **Décisions** | | | |
| D1 | Adresse d'expédition des e-mails | Oui | 2 min |
| D2 | Fournisseur des SMS et des appels | Oui | 15 min |
| D3 | Durée de conservation des messages | Oui | 10 min |
| D4 | Tarifs au Maroc | Peut attendre (bloque la vente au Maroc) | 30 min |
| D5 | Prix de l'eau par défaut au Maroc | Peut attendre | 10 min |
| D6 | Tarifs en RDC (dollars et francs congolais) | Peut attendre (bloque la vente en RDC) | 30 min |
| D7 | Prix de l'eau par défaut en RDC | Peut attendre | 10 min |
| D8 | Tarif de l'option « autonomie en eau » | Peut attendre (avant de vendre l'option) | 15 min |
| D9 | Facturation pendant un pilote | Peut attendre (avant la première facture) | 10 min |
| D10 | Relance par WhatsApp en RDC | Peut attendre | 2 min |
| D11 | Erreurs du navigateur plus lisibles dans Sentry | Peut attendre | 5 min |
| **Comptes à créer** | | | |
| C1 | Gestionnaire de mots de passe | Oui | 15 min |
| C2 | Base de production (Supabase, Paris) | Oui | 20 min |
| C3 | Site web (Vercel) | Oui | 20 min |
| C4 | Envoi des e-mails (Resend) | Oui | 30 min + attente |
| C5 | Case anti-robot (Cloudflare Turnstile) | Oui | 10 min |
| C6 | Alertes de panne (Sentry) | Oui | 15 min |
| C7 | SMS, appels et WhatsApp (Twilio) | Oui (SMS et appel) | 1 h + 1 à 3 jours |
| C8 | Serveur LoRaWAN (kit C, sondes, niveau) | Oui | 1 à 3 h |
| C9 | Broker MQTT (kit A) | Peut attendre (bloque la pose d'un kit A) | 1 h |
| C10 | Connexion avec Google | Peut attendre | 30 min |
| **Matériel** | | | |
| M1 | Trames réelles de chaque capteur | Peut attendre (avant le premier client) | 30 min par modèle |
| M2 | Intervalle d'émission des EM300-DI | Peut attendre | 10 min |
| M3 | Modèle de sonde de température | Peut attendre (option eau chaude) | 1 h |
| M4 | Modèle de capteur de niveau | Peut attendre (option autonomie) | 1 h |
| **Juridique** | | | |
| J1 | Pages légales, registre et informations de la société | Oui | 2 h + juriste |
| J2 | Phrase d'accord pour continuer après un pilote | Oui | avec J1 |
| J3 | Radio et agréments au Maroc et en RDC | Peut attendre (bloque la pose dans ces pays) | 2 h + délais |
| J4 | Pages légales et retenue à la source en RDC | Peut attendre (bloque la vente en RDC) | 1 h + conseil |
| J5 | Températures d'eau chaude dans les textes | Peut attendre (option eau chaude) | 1 h |
| J6 | Critères eau de la Clef Verte | Peut attendre | 30 min |
| J7 | Dépôt de la marque | Peut attendre | 1 h |
| **Réglages** (dans l'ordre de la mise en ligne) | | | |
| R1 | Installer la structure de la base de production | Oui | 20 min |
| R2 | Adresse des fonctions pour les tâches automatiques | Oui | 5 min |
| R3 | Mettre en ligne les fonctions | Oui | 20 min |
| R4 | Réglages des comptes (connexion, mots de passe) | Oui | 15 min |
| R5 | Variables du site web | Oui | 20 min |
| R6 | Secrets des e-mails et des SMS | Oui | 15 min |
| R7 | Votre accès superadmin en production | Oui | 10 min |
| R8 | Activer les vrais envois, prudemment | Oui | 30 min |
| R9 | Test de fumée | Oui | 45 min |
| R10 | Mise en ligne : fusion vers `main` | Oui (c'est la mise en ligne) | 10 min |
| R11 | Prix de l'eau d'un site au Maroc ou en RDC | Peut attendre | 5 min par site |
| R12 | Seuils de détection, après les premiers pilotes | Peut attendre | 30 min |
| R13 | Seuils de l'autonomie en eau | Peut attendre | 15 min |
| R14 | Heure du Maroc sur le premier site marocain | Peut attendre | 10 min |
| R15 | Vérifier la base sur votre ordinateur (facultatif) | Peut attendre | 1 h |

---

## 0. Commencer ici : votre accès superadmin sur la base d'essai

- [ ] **Fait**

**Pourquoi :** aucun compte superadmin n'existe sur la base d'essai.
Sans lui, vous ne voyez pas l'espace « Superadmin » : stock des capteurs,
tarifs, surveillance des tâches automatiques, pré-diagnostic, message de
test.

**Temps :** 10 minutes. **Ne bloque pas la mise en ligne**, mais faites-le
en premier : vous en aurez besoin pour tester.

**Étapes :**
1. Allez sur [supabase.com](https://supabase.com), cliquez **Sign in** et
   connectez-vous.
2. Ouvrez le projet d'essai (identifiant `orskfdkvczrxwcdpvlaa`, le seul de
   la liste).
3. Menu de gauche : **Authentication**, puis **Users**. Cherchez votre
   adresse e-mail.
   - Si elle n'y est pas : bouton **Add user**, puis **Create new user**.
     Saisissez votre adresse et un mot de passe solide, cochez **Auto
     Confirm User**, puis **Create user**.
4. Dans VS Code, ouvrez le fichier `scripts/grant-superadmin.sql`. À la
   ligne `where lower(email) = lower('ADRESSE-A-REMPLIR@exemple.fr')`,
   remplacez `ADRESSE-A-REMPLIR@exemple.fr` par votre adresse (gardez les
   apostrophes autour).
5. Sélectionnez tout le fichier (Ctrl+A) et copiez-le (Ctrl+C).
6. Dans Supabase, menu de gauche : **SQL Editor**. Ouvrez une nouvelle
   requête (bouton **+** ou **New query**), collez (Ctrl+V), puis cliquez
   **Run** (ou Ctrl+Entrée).
7. Résultat attendu : une ligne avec un identifiant. Si le résultat est
   vide (« No rows returned »), soit vous étiez déjà superadmin, soit
   l'adresse ne correspond à aucun compte : vérifiez l'orthographe.
8. Dans VS Code, annulez votre modification du fichier (Ctrl+Z jusqu'à
   retrouver `ADRESSE-A-REMPLIR@exemple.fr`, puis Ctrl+S) : ce fichier ne
   doit pas garder votre adresse.
9. Vérifiez : dans le terminal de VS Code, tapez `npm run dev`, ouvrez
   `http://localhost:3000/connexion`, connectez-vous : l'onglet
   « Superadmin » apparaît.

---

## 1. Décisions

### D1. Adresse d'expédition des e-mails

- [ ] **Fait** — **Bloque la mise en ligne** · 2 minutes

**Pourquoi :** les alertes et les rapports partent d'une adresse à votre
nom de domaine. Elle doit être choisie avant d'ouvrir le compte d'envoi
(C4).

**Proposition :** `SmartMeteria <alertes@smartmeteria.com>`. Une autre
adresse, ou un sous-domaine réservé aux envois (par exemple
`alertes@envoi.smartmeteria.com`), est possible.

**Étapes :** écrivez « d'accord » ou l'adresse de votre choix.

Votre réponse :

### D2. Fournisseur des SMS, des appels et des WhatsApp

- [ ] **Fait** — **Bloque la mise en ligne** · 15 minutes

**Pourquoi :** une fuite est signalée par SMS au technicien, puis par un
appel (France) ou un WhatsApp (Maroc, RDC) si personne ne réagit en
2 heures. Le branchement est prêt avec **Twilio** (un seul compte pour les
trois). Un autre fournisseur (Brevo, OVH, Vonage…) se branche aussi, mais
demande un petit développement.

**Étapes :** lisez la page des tarifs SMS de Twilio pour la France, le
Maroc et la RDC, puis écrivez « Twilio » ou le nom d'un autre fournisseur.

Votre réponse :

### D3. Durée de conservation des messages

- [ ] **Fait** — **Bloque la mise en ligne** · 10 minutes (et l'avis du juriste, J1)

**Pourquoi :** le journal des envois garde le destinataire (adresse,
téléphone) et le texte de chaque message. La loi sur les données
personnelles demande une durée de conservation, écrite dans la politique
de confidentialité. Aujourd'hui rien n'est effacé. Au-delà de la durée
choisie, l'adresse, le téléphone et le texte seront effacés ; la ligne
restera (date, canal, résultat). Les relevés des compteurs ne sont jamais
supprimés.

**Étapes :** choisissez une durée en mois (par exemple 12 ou 24), après
avis du juriste si possible.

Votre réponse :

### D4. Tarifs au Maroc (dirhams)

- [ ] **Fait** — **Peut attendre** (bloque la vente au Maroc) · 30 minutes

**Pourquoi :** sans tarifs, l'export d'usage marque les lignes « à
paramétrer » et la page preuve n'affiche pas le coût du service.

**Étapes :** donnez, hors taxes, en dirhams :
1. mise en service d'un point ;
2. mise en service du premier point avec passerelle ;
3. abonnement mensuel du premier point ;
4. abonnement mensuel d'un point supplémentaire ;
5. abonnement mensuel d'une sonde de température ;
6. retenue à la source par défaut (en %), si un conseil fiscal l'a
   confirmée.

Votre réponse :

### D5. Prix de l'eau par défaut au Maroc

- [ ] **Fait** — **Peut attendre** · 10 minutes

**Pourquoi :** sans prix de l'eau, un site marocain affiche les fuites en
m³ seulement, sans montant. Un prix moyen de référence sert de valeur de
départ pour chaque nouveau site (chaque site peut ensuite avoir le sien,
voir R11).

**Étapes :** donnez un prix moyen du m³ en dirhams (avec sa source), ou
écrivez « pas de prix par défaut ».

Votre réponse :

### D6. Tarifs en RDC (dollars et francs congolais)

- [ ] **Fait** — **Peut attendre** (bloque la vente en RDC) · 30 minutes

**Pourquoi :** même raison que D4. Tous les tarifs en dollars (USD) et en
francs congolais (CDF) sont vides.

**Étapes :** donnez les mêmes six valeurs que D4, en dollars et, si vous
vendez aussi en francs congolais, en francs congolais.

Votre réponse :

### D7. Prix de l'eau par défaut en RDC

- [ ] **Fait** — **Peut attendre** · 10 minutes

**Pourquoi :** même raison que D5 (sites congolais : volumes seulement
tant qu'aucun prix n'est saisi).

**Étapes :** donnez un prix moyen du m³ en dollars et en francs congolais
(avec sa source), ou écrivez « pas de prix par défaut ».

Votre réponse :

### D8. Tarif de l'option « autonomie en eau »

- [ ] **Fait** — **Peut attendre** (avant de vendre l'option) · 15 minutes

**Pourquoi :** le capteur de niveau des citernes n'a aucun prix dans
l'export d'usage.

**Étapes :** donnez la mise en service et l'abonnement mensuel d'un
capteur de niveau, dans chaque monnaie où vous le vendrez.

Votre réponse :

### D9. Facturation pendant un pilote

- [ ] **Fait** — **Peut attendre** (avant la première facture d'un client en pilote) · 10 minutes

**Pourquoi :** l'export d'usage compte les abonnements des sites en pilote
et les signale (colonne « Sites en pilote »). Il faut savoir s'ils sont
facturés, offerts ou remboursés.

**Étapes :** écrivez « facturés », « offerts » ou « remboursés si… ».

Votre réponse :

### D10. Relance par WhatsApp en RDC

- [ ] **Fait** — **Peut attendre** · 2 minutes

**Pourquoi :** après 2 heures sans réaction à une fuite, la relance part
par WhatsApp au Maroc. Elle a été choisie aussi pour la RDC.

**Étapes :** écrivez « d'accord » ou « appel » (appel vocal comme en
France).

Votre réponse :

### D11. Erreurs du navigateur plus lisibles dans Sentry

- [ ] **Fait** — **Peut attendre** (à décider après quelques semaines) · 5 minutes

**Pourquoi :** les erreurs partent vers Sentry sans module supplémentaire.
Celles du navigateur y apparaissent dans un code compacté, plus difficile
à lire. Le module officiel de Sentry les rendrait lisibles, mais il est
lourd.

**Étapes :** après quelques semaines d'exploitation, écrivez « garder
ainsi » ou « ajouter le module Sentry ».

Votre réponse :

---

## 2. Comptes à créer

Avant de commencer, il vous faut l'accès au site où vous avez acheté le nom
de domaine `smartmeteria.com` (OVH, Gandi, Cloudflare…) : plusieurs comptes
demandent d'y ajouter des lignes DNS.

### C1. Gestionnaire de mots de passe

- [ ] **Fait** — **Bloque la mise en ligne** · 15 minutes

**Pourquoi :** vous allez créer une quinzaine de clés secrètes. Elles
doivent être rangées en lieu sûr, jamais dans un e-mail ou un document.

**Étapes :**
1. Ouvrez un compte [Bitwarden](https://bitwarden.com) (gratuit) ou
   1Password.
2. Installez l'extension pour votre navigateur.
3. Créez un dossier « SmartMeteria production ». Chaque clé des étapes
   suivantes y sera rangée, avec son nom (par exemple `RESEND_API_KEY`).

### C2. Base de production (Supabase, Paris)

- [ ] **Fait** — **Bloque la mise en ligne** · 20 minutes (et le paiement de l'offre Pro)

**Pourquoi :** la base d'essai contient la démonstration. Les vrais
clients doivent être dans une base séparée et propre, en France, avec une
sauvegarde chaque jour (offre Pro).

**Étapes :**
1. Sur [supabase.com](https://supabase.com), dans votre organisation,
   cliquez **New project**.
2. Nom : `smartmeteria-production`. Région : **West EU (Paris)**.
   Choisissez un mot de passe de base très long (bouton **Generate a
   password**) et rangez-le (C1).
3. Cliquez **Create new project** et attendez quelques minutes.
4. Passez le projet en offre **Pro** : **Project Settings**, puis
   **Billing** (ou **Subscription**), offre **Pro**.
5. Notez dans votre gestionnaire de mots de passe :
   - l'**URL du projet** (`https://xxxx.supabase.co`, visible avec le
     bouton **Connect** en haut de la page) ;
   - dans **Project Settings > API Keys**, onglet **Legacy API Keys** : la
     clé **anon** (publique) et la clé **service_role** (secrète : elle
     donne tous les droits). Prenez bien ces deux-là, pas les nouvelles
     clés « publishable » et « secret » : les tâches automatiques ont
     besoin des anciennes.
6. Dans VS Code, ouvrez le fichier `.env.local` et ajoutez la ligne
   `SUPABASE_URL_PRODUCTION=https://xxxx.supabase.co` (votre URL). Le
   script de démonstration refusera alors toujours de tourner sur la
   production.

**Vérifier :** le projet apparaît « Healthy » dans le tableau de bord.

### C3. Site web (Vercel)

- [ ] **Fait** — **Bloque la mise en ligne** · 20 minutes

**Pourquoi :** Vercel affiche l'application sur `app.smartmeteria.com`. La
région Paris est déjà réglée dans le projet.

**Étapes :**
1. Sur [vercel.com](https://vercel.com), créez un compte avec **Continue
   with GitHub** (le compte GitHub qui voit le dépôt
   `SMARTMETERIA/smartmetera-rendement`).
2. **Add New…**, puis **Project**. Choisissez le dépôt
   `smartmetera-rendement` et cliquez **Import**.
3. Laissez les réglages proposés (Next.js). Ne cliquez pas encore
   **Deploy** si Vercel vous laisse d'abord ajouter les variables : elles
   sont décrites en R5. Sinon, le premier déploiement échouera, c'est
   normal ; il sera relancé en R5.
4. **Settings**, puis **Domains** : ajoutez `app.smartmeteria.com`. Vercel
   affiche une ligne DNS (en général type `CNAME`, nom `app`, valeur
   `cname.vercel-dns.com`). Ajoutez-la chez le vendeur de votre domaine.
5. Vérifiez dans **Settings** (rubrique **Git** ou **Environments**) que
   la branche de production est `main` (réglage par défaut).

**Vérifier :** après R5 et R10, `https://app.smartmeteria.com` affiche la
page d'accueil avec le cadenas du navigateur.

### C4. Envoi des e-mails (Resend)

- [ ] **Fait** — **Bloque la mise en ligne** · 30 minutes, plus quelques heures d'attente

**Pourquoi :** pour que vos e-mails arrivent dans la boîte de réception et
pas dans les indésirables, il faut prouver que vous possédez le domaine.

**Étapes :**
1. Sur [resend.com](https://resend.com), créez un compte.
2. **Domains**, puis **Add Domain** : `smartmeteria.com` (ou le
   sous-domaine choisi en D1), région **Ireland (eu-west-1)** si elle est
   proposée.
3. Resend affiche 3 ou 4 lignes DNS. Copiez-les **exactement** chez le
   vendeur de votre domaine, puis cliquez **Verify** dans Resend.
4. Ajoutez aussi, chez le vendeur du domaine, une ligne de type `TXT`, nom
   `_dmarc`, valeur
   `v=DMARC1; p=none; rua=mailto:votre-adresse@smartmeteria.com`.
5. **API Keys**, puis **Create API Key**, droit **Sending access**. Rangez
   la clé (C1) sous le nom `RESEND_API_KEY`.

**Vérifier :** le domaine passe à « Verified » (parfois après quelques
heures). La clé sera saisie en R5 et R6.

### C5. Case anti-robot de l'inscription (Cloudflare Turnstile)

- [ ] **Fait** — **Bloque la mise en ligne** · 10 minutes

**Pourquoi :** sans elle, des robots peuvent créer des comptes en masse.
Aujourd'hui, la case est ignorée faute de clés.

**Étapes :**
1. Sur [dash.cloudflare.com](https://dash.cloudflare.com), créez un compte
   gratuit.
2. Menu **Turnstile**, puis **Add widget** (ou **Add site**). Nom
   `SmartMeteria`, domaine `app.smartmeteria.com`, mode **Managed**.
3. Rangez la **Site Key** (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`) et la
   **Secret Key** (`TURNSTILE_SECRET_KEY`). Elles seront saisies en R5.

**Vérifier :** après R5, la page `/inscription` affiche la case « Je ne
suis pas un robot » de Cloudflare.

### C6. Alertes de panne (Sentry)

- [ ] **Fait** — **Bloque la mise en ligne** · 15 minutes

**Pourquoi :** si une page plante chez un client, vous êtes prévenu. Les
adresses, téléphones et liens secrets sont masqués avant l'envoi.

**Étapes :**
1. Sur [sentry.io](https://sentry.io), créez un compte en choisissant la
   **région de données européenne**.
2. Créez un projet de type **Next.js** nommé `smartmeteria`.
3. Dans le projet : **Settings**, **Security & Privacy** : activez **Data
   Scrubber** et **Prevent Storing of IP Addresses**.
4. **Settings**, **Client Keys (DSN)** : rangez le DSN sous le nom
   `SENTRY_DSN`. Il sera saisi en R5.

**Vérifier :** en R9, une erreur de test apparaît dans Sentry en moins
d'une minute.

### C7. SMS, appels et WhatsApp (Twilio)

- [ ] **Fait** — **Bloque la mise en ligne** (SMS et appel ; WhatsApp peut attendre) · 1 heure, plus 1 à 3 jours pour le numéro et quelques jours pour WhatsApp

**Pourquoi :** sans fournisseur, les SMS, appels et WhatsApp sont
seulement écrits dans le journal des envois.

**Étapes :**
1. Ouvrez un compte [Twilio](https://www.twilio.com) et passez-le en
   compte payant (le compte d'essai n'écrit qu'aux numéros vérifiés).
2. Achetez un **numéro français** capable d'envoyer des SMS et d'appeler :
   **Phone Numbers**, **Buy a number**, pays France. Twilio demande un
   justificatif d'adresse et une pièce d'identité (1 à 3 jours).
3. Rangez l'**Account SID** (commence par `AC`) et l'**Auth Token**
   (page d'accueil de la console, rubrique **Account Info**).
4. Pour le Maroc et la RDC (peut attendre) : **Messaging**, **Senders**,
   **WhatsApp senders** (il faut un compte Meta Business vérifié), puis
   **Content Template Builder** : un modèle de catégorie **Utility**, en
   français, avec une seule variable `{{1}}` (le texte de l'alerte).
   Texte proposé, à faire valider par Meta : « {{1}} — Ouvrez votre espace
   SmartMeteria pour indiquer que vous vous en occupez. » Une fois
   approuvé, rangez son identifiant (commence par `HX`).

Les clés seront saisies en R6.

### C8. Serveur LoRaWAN (kit C, sondes de température, capteurs de niveau)

- [ ] **Fait** — **Bloque la mise en ligne** · 1 heure (The Things Stack Cloud) à 3 heures (ChirpStack)

**Pourquoi :** les capteurs du kit C, les sondes et les capteurs de niveau
parlent par radio à la passerelle posée sur le site ; un serveur LoRaWAN
reçoit leurs messages et les transmet à SmartMeteria.

**Étapes :** deux possibilités, décrites pas à pas dans
`infra/chirpstack/README.md` :
- **The Things Stack Cloud** (payant, rien à installer) : créez un compte
  région Europe, une application, déclarez la passerelle et les capteurs,
  puis un « webhook » vers l'adresse « LoRaWAN » de l'espace Superadmin
  (carte « Réception des capteurs »). Fin du guide.
- **ChirpStack** sur votre propre serveur (moins cher à l'usage) : louez
  un petit serveur dans l'Union européenne, puis suivez le guide du début
  (environ une heure).

**Vérifier :** un vrai capteur fait passer l'assistant de pose au feu vert,
ou sa trame apparaît dans **Superadmin > Réception des capteurs > trames
d'appareils inconnus**.

### C9. Broker MQTT (kit A, capteurs Adeunis par réseau mobile)

- [ ] **Fait** — **Peut attendre** (bloque la pose d'un kit A) · 1 heure

**Pourquoi :** le capteur Adeunis du kit A envoie ses relevés par le
réseau mobile à un « broker MQTT » (un relais de messages), qui les
transfère à SmartMeteria.

**Étapes :** suivez `docs/reception-mqtt.md` : choisir un broker hébergé
dans l'Union européenne (conditions dans le guide), créer l'accès des
capteurs, créer la règle de transfert vers l'adresse « MQTT » de l'espace
Superadmin, régler chaque capteur avec l'application Adeunis. Envoyez
ensuite une vraie trame pour confirmer les noms de champs (l'application
accepte déjà les formats courants).

### C10. Connexion avec Google

- [ ] **Fait** — **Peut attendre** · 30 minutes

**Pourquoi :** le bouton « Continuer avec Google » affiche pour l'instant
« pas encore disponible ». La connexion par e-mail fonctionne.

**Étapes :**
1. Sur [console.cloud.google.com](https://console.cloud.google.com), créez
   un projet `SmartMeteria`.
2. **APIs & Services** (ou **Google Auth Platform**) : remplissez l'écran
   de consentement (nom de l'application, adresse de contact, domaine
   `smartmeteria.com`).
3. **Credentials** (ou **Clients**), **Create OAuth client ID**, type
   **Web application**. Dans **Authorized redirect URIs**, ajoutez
   `https://xxxx.supabase.co/auth/v1/callback` (l'URL de la base de
   production, C2).
4. Copiez le **Client ID** et le **Client secret**.
5. Dans Supabase (production) : **Authentication**, **Sign In /
   Providers**, **Google** : activez, collez les deux valeurs, enregistrez.

**Vérifier :** sur `/connexion`, « Continuer avec Google » ouvre la page
de Google.

---

## 3. Matériel

### M1. Trames réelles de chaque capteur

- [ ] **Fait** — **Peut attendre** (à faire avant le premier client) · 30 minutes par modèle

**Pourquoi :** les décodeurs ont été écrits d'après les documentations des
fabricants. Quelques messages réels de chaque modèle permettent de le
confirmer et de les ajouter aux tests.

**Étapes :** posez un capteur de chaque modèle (EM300-DI, Adeunis, sonde,
capteur de niveau) sur un robinet d'essai. Ses messages apparaissent dans
**Superadmin > Réception des capteurs > trames d'appareils inconnus** s'il
n'est pas encore dans le stock. Copiez-en trois ou quatre et donnez-les à
Claude.

### M2. Intervalle d'émission des EM300-DI

- [ ] **Fait** — **Peut attendre** · 10 minutes

**Pourquoi :** l'assistant de pose annonce l'heure de la première donnée.
Il faut connaître l'intervalle réglé sur les capteurs livrés (60 minutes
au plus).

**Étapes :** regardez le réglage dans l'application Milesight ToolBox (ou
demandez-le au fournisseur) et écrivez-le ici.

Votre réponse :

### M3. Modèle de sonde de température

- [ ] **Fait** — **Peut attendre** (option eau chaude) · 1 heure

**Pourquoi :** son décodeur, fourni par le fabricant, est chargé dans le
serveur LoRaWAN et doit produire un champ `temperature` en °C.

**Étapes :** choisissez le modèle et donnez sa référence. Si son décodeur
nomme le champ autrement, indiquez le nom.

Votre réponse :

### M4. Modèle de capteur de niveau (citernes)

- [ ] **Fait** — **Peut attendre** (option autonomie en eau) · 1 heure

**Pourquoi :** il mesure soit la distance jusqu'à la surface de l'eau
(ultrason ou radar posé au-dessus), soit la hauteur d'eau (capteur de
pression posé au fond). Son décodeur est chargé dans le serveur LoRaWAN.
Par défaut, l'application attend un champ `distance` en millimètres.

**Étapes :** choisissez le modèle et donnez sa référence, le nom du champ
de mesure et son unité.

Votre réponse :

---

## 4. Juridique

### J1. Pages légales, registre des traitements et informations de la société

- [ ] **Fait** — **Bloque la mise en ligne** · 2 heures de votre temps, plus 1 à 3 semaines de relecture

**Pourquoi :** six modèles sont prêts mais marqués « Modèle à faire
valider » : mentions légales, conditions d'utilisation, conditions de
vente professionnelles (obligation de moyens), conditions du pilote,
confidentialité, accord de sous-traitance des données. S'y ajoute le
registre des traitements (`docs/REGISTRE_TRAITEMENTS.md`). Ils doivent
être relus par un juriste.

**Étapes :**
1. Rassemblez les informations de la société : raison sociale, forme,
   capital, siège, numéro d'immatriculation, numéro de TVA, directeur de
   la publication, contact, contact pour les données personnelles.
2. Ouvrez `/legal` dans l'application et imprimez les six pages (ou
   envoyez le lien au juriste), avec le registre.
3. Demandez au juriste de trancher les points ouverts : plafond de
   responsabilité, délai de paiement, reconduction et préavis, droit
   applicable (France et Maroc), retenue à la source, matériel vendu ou
   mis à disposition, sort du matériel après un pilote, garanties de
   transfert hors Union européenne de chaque sous-traitant, durée de
   conservation (D3).
4. Donnez à Claude les informations et les textes corrigés : il les
   saisira et retirera le bandeau « Modèle à faire valider ».

### J2. Phrase d'accord pour continuer après un pilote

- [ ] **Fait** — **Bloque la mise en ligne** · à faire avec J1

**Pourquoi :** sur la page de son site, le client peut cocher « J'accepte
que la surveillance continue avec l'abonnement à la fin du pilote… ». Un
pilote n'est converti automatiquement qu'avec cet accord écrit et daté.
La phrase doit être validée avec les conditions du pilote.

**Étapes :** faites relire la phrase par le juriste avec J1 et donnez la
version validée.

Votre réponse :

### J3. Radio et agréments au Maroc et en RDC

- [ ] **Fait** — **Peut attendre** (bloque la pose dans ces pays) · 2 heures, plus les délais des autorités

**Pourquoi :** les capteurs LoRaWAN et les passerelles émettent sur des
fréquences réglementées. Il faut vérifier la bande utilisable et les
agréments des appareils : au Maroc auprès de l'ANRT, en RDC auprès du
régulateur congolais.

**Étapes :** demandez aux fabricants (Milesight, passerelle) leurs
certificats pour ces pays, puis vérifiez auprès du régulateur ou d'un
intégrateur local.

### J4. Pages légales et retenue à la source en RDC

- [ ] **Fait** — **Peut attendre** (bloque la vente en RDC) · 1 heure, plus l'avis d'un conseil

**Pourquoi :** les pages légales contiennent des passages « à compléter »
pour la RDC (droit applicable, fiscalité, autorité de protection des
données). La retenue à la source est à 0 % tant qu'un conseil fiscal n'a
rien dit.

**Étapes :** posez ces questions au juriste (avec J1) et à un conseil
fiscal congolais, puis donnez les réponses.

Votre réponse :

### J5. Températures d'eau chaude dans les textes

- [ ] **Fait** — **Peut attendre** (option eau chaude) · 1 heure

**Pourquoi :** les seuils d'alerte viennent du plan (55 °C en sortie de
production, 50 °C sur la boucle de retour ; point éloigné : vide) et le
délai des analyses avant la réouverture d'un site fermé est vide (aucun
rappel n'est envoyé). Ils doivent être vérifiés dans les textes
réglementaires.

**Étapes :** vérifiez avec un bureau d'études ou les textes officiels,
puis donnez les seuils et le délai.

Votre réponse :

### J6. Critères eau de la Clef Verte

- [ ] **Fait** — **Peut attendre** · 30 minutes

**Pourquoi :** le rapport mensuel donne les litres par nuitée, sans seuil
ni jugement, tant que les critères eau du label ne sont pas confirmés.

**Étapes :** demandez les critères eau à Teragir (organisme du label) et
transmettez-les.

Votre réponse :

### J7. Dépôt de la marque

- [ ] **Fait** — **Peut attendre** (conseillé tôt) · 1 heure

**Pourquoi :** protéger le nom SmartMeteria.

**Étapes :** déposez la marque à l'INPI (France), puis à l'EUIPO (Union
européenne), et au Maroc si vous y vendez.

---

## 5. Réglages

À faire dans cet ordre, une fois les comptes de la partie 2 ouverts.

### R1. Installer la structure de la base de production

- [ ] **Fait** — **Bloque la mise en ligne** · 20 minutes

**Pourquoi :** la base de production est vide. Les fichiers du dossier
`supabase/migrations` créent toutes les tables, les règles d'accès entre
clients et les tâches automatiques. C'est aussi la vérification que la
structure s'installe sur une base vierge.

**Étapes :** dans le terminal de VS Code, à la racine du projet :

```
npx supabase login
npx supabase link --project-ref xxxx
npx supabase db push
```

`xxxx` est l'identifiant du projet de production (dans son URL). La
première commande ouvre le navigateur pour vous connecter ; la deuxième
demande le mot de passe de base (C2). **N'ajoutez jamais** l'option
`--include-seed` : elle installerait des données de démonstration.

**Vérifier :** dans Supabase (production), **Table Editor** montre les
tables `sites`, `meters`, `leak_events`… Dans **SQL Editor**, la requête
`select jobname, schedule from cron.job order by 1;` affiche une dizaine
de tâches, dont `gardien-moteur` et `gardien-envois`. Si une commande
échoue, copiez le message à Claude.

### R2. Adresse des fonctions pour les tâches automatiques

- [ ] **Fait** — **Bloque la mise en ligne** · 5 minutes

**Pourquoi :** toutes les 15 minutes et toutes les heures, la base lance
la détection des fuites et les envois. Elle doit connaître l'adresse des
fonctions et la clé publique.

**Étapes :** dans Supabase (production), **SQL Editor**, collez puis
lancez (en remplaçant `xxxx` et la clé **anon** de C2) :

```sql
select vault.create_secret('https://xxxx.supabase.co/functions/v1', 'functions_base_url');
select vault.create_secret('LA-CLE-ANON', 'anon_key');
```

**Vérifier :** après R3, l'onglet **Surveillance** de l'espace superadmin
affiche « À l'heure » pour la détection des fuites.

### R3. Mettre en ligne les fonctions

- [ ] **Fait** — **Bloque la mise en ligne** · 20 minutes

**Pourquoi :** les « fonctions » sont les programmes qui tournent côté
serveur : réception des capteurs, détection des fuites, envois.

**Étapes :**
1. Dans le terminal :

```
npx supabase functions deploy ingest --no-verify-jwt
npx supabase functions deploy gardien-moteur
npx supabase functions deploy gardien-envois
npx supabase functions deploy inbound-email --no-verify-jwt
npx supabase functions deploy notifications
npx supabase functions deploy reports
npx supabase functions deploy process-import
```

2. Dans Supabase (production), **Edge Functions**, puis **Secrets**,
   ajoutez :
   - `GARDIEN_ENVOIS_MODE` = `journal` (rien ne part tant que tout n'est
     pas vérifié) ;
   - `GARDIEN_URL_APP` = `https://app.smartmeteria.com`.

**Vérifier :** les 7 fonctions apparaissent dans **Edge Functions**.

### R4. Réglages des comptes (connexion, mots de passe)

- [ ] **Fait** — **Bloque la mise en ligne** · 15 minutes

**Pourquoi :** pour que les liens de connexion ramènent sur le bon site et
que les mots de passe trop connus soient refusés.

**Étapes :** dans Supabase (production), menu **Authentication** :
1. **URL Configuration** : *Site URL* = `https://app.smartmeteria.com` ;
   *Redirect URLs* : ajoutez `https://app.smartmeteria.com/**`.
2. **Sign In / Providers**, **Email** : laissez la confirmation d'adresse
   activée.
3. Activez **Prevent use of leaked passwords** (rubrique **Attack
   Protection**, ou **Sign In / Providers > Email** selon la version du
   tableau de bord). Cette option demande l'offre Pro : si elle est grisée
   sur la base d'essai, c'est normal.
4. **N'activez pas** « Enable Captcha protection » dans Supabase : la case
   anti-robot est vérifiée par l'application elle-même ; l'activer aussi
   dans Supabase bloquerait la connexion.
5. Après C4 : **Emails**, onglet **SMTP Settings**, activez *Custom SMTP*
   avec Host `smtp.resend.com`, Port `465`, Username `resend`, Password :
   votre clé Resend, Sender email : l'adresse de D1, Sender name
   `SmartMeteria`. L'application envoie elle-même ses e-mails ; ce réglage
   sert de secours pour les rares e-mails envoyés directement par Supabase.

**Vérifier :** en R9, l'inscription d'essai reçoit bien son e-mail.

### R5. Variables du site web (Vercel)

- [ ] **Fait** — **Bloque la mise en ligne** · 20 minutes

**Pourquoi :** le site a besoin des adresses et des clés des autres
services.

**Étapes :** dans Vercel, votre projet, **Settings**, **Environment
Variables**, environnement **Production**, ajoutez :

| Nom | Valeur |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL de production (C2) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé anon de production (C2) |
| `SUPABASE_SERVICE_ROLE_KEY` | clé service_role de production (C2) |
| `NEXT_PUBLIC_SITE_URL` | `https://app.smartmeteria.com` |
| `RESEND_API_KEY` | clé Resend (C4) |
| `RESEND_FROM_EMAIL` | l'adresse de D1, par exemple `SmartMeteria <alertes@smartmeteria.com>` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | C5 |
| `SENTRY_DSN` | C6 |

Ne mettez **jamais** `EMAIL_DEV_REDIRECT` ni `DEMO_MOT_DE_PASSE` en
production. Pour l'environnement **Preview** (versions d'essai), mettez
les clés de la base d'**essai**, jamais celles de production. Puis
**Deployments**, menu **…** du dernier déploiement, **Redeploy**.

**Vérifier :** le déploiement passe au vert.

### R6. Secrets des e-mails et des SMS (fonction d'envois)

- [ ] **Fait** — **Bloque la mise en ligne** · 15 minutes

**Pourquoi :** les alertes et les rapports sont envoyés par la fonction
`gardien-envois`, qui a ses propres secrets. Sans eux, tout reste dans le
journal.

**Étapes :** dans Supabase (production), **Edge Functions**, **Secrets**,
ajoutez :
- `RESEND_API_KEY` et `RESEND_FROM_EMAIL` (les mêmes qu'en R5) ;
- `GARDIEN_TELEPHONE_FOURNISSEUR` = `twilio` ;
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (C7) ;
- `TWILIO_SMS_FROM` et `TWILIO_APPEL_FROM` : votre numéro, format `+33…` ;
- plus tard, pour le Maroc et la RDC : `TWILIO_WHATSAPP_FROM` et
  `TWILIO_WHATSAPP_CONTENT_SID` (identifiant `HX…`).

Ne changez pas encore `GARDIEN_ENVOIS_MODE` (voir R8).

### R7. Votre accès superadmin en production

- [ ] **Fait** — **Bloque la mise en ligne** · 10 minutes

**Pourquoi :** comme le point 0, mais sur la base de production.

**Étapes :** refaites les étapes 3 à 8 du point 0 dans le projet de
production. Vous recevrez chaque matin à 7 h le récapitulatif quotidien
(après R8).

### R8. Activer les vrais envois, prudemment

- [ ] **Fait** — **Bloque la mise en ligne** · 30 minutes

**Pourquoi :** vérifier sur vous-même que les e-mails, SMS et appels
arrivent, avant de les envoyer aux clients.

**Étapes :**
1. **D'abord vers vous seul.** Dans Supabase (production), **Edge
   Functions**, **Secrets** : `GARDIEN_ENVOIS_MODE` = `redirection`,
   `GARDIEN_EMAIL_REDIRECT` = votre adresse, `GARDIEN_TELEPHONE_REDIRECT`
   = votre portable (`+33…`). Tous les messages partent alors vers vous
   seul, avec « [Test, pour …] » devant.
2. Espace superadmin, **Surveillance**, **Message de test** : cochez
   E-mail, SMS et Appel, saisissez votre numéro, cliquez **Envoyer le
   message de test**. Vous devez recevoir l'e-mail, le SMS, puis l'appel.
3. **Ensuite pour de vrai.** `GARDIEN_ENVOIS_MODE` = `reel`. Les clients
   reçoivent leurs alertes et leurs rapports.

### R9. Test de fumée

- [ ] **Fait** — **Bloque la mise en ligne** · 45 minutes

**Pourquoi :** une vérification rapide que tout fonctionne en vrai.

**Étapes :**
1. Créez à la racine du projet un fichier `.env.production.local` (il
   n'est jamais enregistré dans Git) avec `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` (production), `FUMEE_EMAIL` et
   `FUMEE_MOT_DE_PASSE` (votre compte superadmin de production).
2. Dans le terminal :
   `npm run fumee -- https://app.smartmeteria.com --env .env.production.local`.
   Il ne crée rien et n'envoie rien ; il doit finir par « 0 échec(s) ».
   Ajoutez `--sentry` pour envoyer une erreur de test à Sentry.
3. **Inscription d'essai** : dans une fenêtre privée, `/inscription`, avec
   une adresse de test. L'e-mail de confirmation arrive ; le lien ouvre
   « Mes sites ».
4. **Pose simulée** : ajoutez un site, un capteur dans « Appareils », et
   suivez l'assistant de pose jusqu'à « En attente ». Avec un vrai
   capteur : ouvrez un robinet 30 secondes, le feu vert s'affiche.
5. **Page preuve** : depuis « Mes sites », « Créer une page preuve »,
   ouvrez le lien dans une fenêtre privée : la page s'affiche sans
   connexion.
6. Supprimez ensuite l'organisation d'essai (espace superadmin).

### R10. Mise en ligne : fusion vers `main`

- [ ] **Fait** — **Bloque la mise en ligne** (c'est la mise en ligne) · 10 minutes

**Pourquoi :** Vercel publie la branche `main`. Tout le travail est sur la
branche `feat/gardien` ; c'est vous qui décidez quand le publier. Rien
n'est jamais envoyé directement sur `main`.

**Étapes :**
1. Sur GitHub, ouvrez le dépôt `SMARTMETERIA/smartmetera-rendement`.
2. Bouton **Compare & pull request** (ou **Pull requests**, **New pull
   request**, de `feat/gardien` vers `main`).
3. Relisez le résumé, cliquez **Create pull request**, puis **Merge pull
   request** et **Confirm merge**.
4. Vercel publie le site en quelques minutes (onglet **Deployments**).

### R11. Prix de l'eau d'un site au Maroc ou en RDC

- [ ] **Fait** — **Peut attendre** · 5 minutes par site

**Pourquoi :** sans prix de l'eau, un site affiche ses fuites en m³ sans
montant. L'application n'a pas encore d'écran pour le modifier.

**Étapes :**
1. Dans Supabase, **Table Editor**, table `sites`.
2. Trouvez la ligne du site (colonne `name`).
3. Double-cliquez la cellule `water_price_per_m3`, saisissez le prix du m³
   dans la monnaie du site (colonne `currency`), avec un point comme
   séparateur (par exemple `11.5`), puis **Save**.

Ou donnez les prix à Claude, qui les saisira.

### R12. Seuils de détection, après les premiers pilotes

- [ ] **Fait** — **Peut attendre** · 30 minutes

**Pourquoi :** les seuils viennent du plan (fuite de nuit, débit continu,
rupture, fermeture, capteur muet). Ils se règlent sans nouvelle version de
l'application, une fois les premiers pilotes observés.

**Étapes :** après un mois de pilotes, notez les fausses alertes et les
fuites manquées, et demandez à Claude d'ajuster les seuils.

### R13. Seuils de l'autonomie en eau

- [ ] **Fait** — **Peut attendre** · 15 minutes

**Pourquoi :** valeurs de départ : coupure après 2 heures sans arrivée
d'eau alors que les réserves baissent d'au moins 2 % ; niveau bas à 20 %
de l'eau utilisable ; alerte quand le niveau bas est prévu dans moins de
6 heures. À confirmer sur le terrain.

**Étapes :** confirmez ces valeurs ou donnez les vôtres.

Votre réponse :

### R14. Heure du Maroc sur le premier site marocain

- [ ] **Fait** — **Peut attendre** (au premier site marocain) · 10 minutes

**Pourquoi :** le Maroc est à l'heure GMT depuis le 20 septembre 2026.
L'application suit l'heure des serveurs ; il faut vérifier sur un vrai
site que la nuit de 2 h à 5 h correspond bien à l'heure locale.

**Étapes :** sur le premier site marocain, ouvrez le rapport de première
nuit et vérifiez que les heures affichées sont celles de la montre du
client.

### R15. Vérifier la base sur votre ordinateur (facultatif)

- [ ] **Fait** — **Peut attendre** · 1 heure

**Pourquoi :** R1 vérifie déjà que la structure s'installe sur une base
vierge. Une copie locale permet de le refaire sans toucher à aucun projet
en ligne.

**Étapes :** installez Docker Desktop, puis dans le terminal :
`npx supabase start`, puis `npx supabase db reset`.

---

## 6. Après la mise en ligne

- Chaque matin, lisez le récapitulatif quotidien (tâches en retard,
  messages en échec, pilotes et essais qui se terminent).
- En cas de problème : `docs/RUNBOOK.md` (guide d'exploitation).

## Bon à savoir

- **Base d'essai** : les tâches automatiques y tournent aussi. Les sites
  d'essai reçoivent leurs rapports et leurs alertes dans le journal des
  envois ; rien ne part réellement (mode « journal »).
- **Fonction d'envois de la base d'essai** : elle a une version de retard
  (deux formulations de message corrigées depuis : « Débit continu
  détecté », « Eau perdue depuis la détection »). La correction part avec
  le prochain déploiement (R3).
- **Déjà réglé** : orthographe de la marque (« SmartMeteria » partout) ;
  message au technicien à la première donnée reçue après une pose.
