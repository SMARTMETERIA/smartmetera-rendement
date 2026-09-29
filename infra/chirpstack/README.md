# Serveur LoRaWAN ChirpStack (kit C et sondes de température)

Guide pas à pas, pour une personne qui n'a jamais installé de serveur. Il
suffit de suivre les étapes dans l'ordre. Durée : environ une heure.

Le serveur LoRaWAN reçoit les messages radio des capteurs Milesight
EM300-DI (kit C) et des sondes de température, via la passerelle 4G posée
sur le site, puis les transmet à SmartMetera. Un seul serveur sert tous
les clients.

> Alternative sans serveur à gérer : The Things Stack Cloud (payant),
> décrite à la fin de ce guide.

## Ce qu'il vous faut

- Un serveur virtuel (VPS) chez un hébergeur situé dans l'Union
  européenne, avec Ubuntu 24.04, 2 Go de mémoire, 20 Go de disque.
  TODO(RAYAN) : choisir l'hébergeur.
- Un nom de domaine qui pointe vers ce serveur, par exemple
  `lorawan.smartmeteria.com` (enregistrement DNS de type A vers l'adresse
  IP du serveur).
- L'adresse de réception de la plateforme, visible par le superadmin dans
  l'espace « Superadmin », carte « Réception des capteurs » (adresse
  « LoRaWAN »).

## 1. Installer Docker sur le serveur

Connectez-vous au serveur (commande `ssh` fournie par l'hébergeur), puis
copiez ces deux lignes (script d'installation officiel de Docker) :

```sh
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Déconnectez-vous puis reconnectez-vous pour que la deuxième ligne prenne
effet.

## 2. Récupérer ChirpStack

ChirpStack publie un paquet prêt à l'emploi (dépôt officiel
`chirpstack-docker`). La région par défaut est l'Europe (EU868).

```sh
git clone https://github.com/chirpstack/chirpstack-docker.git
cd chirpstack-docker
```

Copiez ensuite dans ce dossier les deux fichiers fournis ici :
`docker-compose.override.yml` et `Caddyfile` (remplacez
`lorawan.smartmeteria.com` par votre nom de domaine dans `Caddyfile`).
Ils ajoutent un accès sécurisé (HTTPS, certificat automatique) à
l'interface de ChirpStack.

> Maroc : TODO(RAYAN) — vérifier auprès de l'ANRT la bande de
> fréquences autorisée et l'agrément de la passerelle et des EM300-DI
> avant de changer la région (fichier
> `configuration/chirpstack/chirpstack.toml`, liste `enabled_regions`).

## 3. Démarrer

```sh
docker compose up -d
```

Ouvrez `https://lorawan.smartmeteria.com` dans votre navigateur.
Connectez-vous avec l'identifiant par défaut indiqué dans la documentation
de ChirpStack, puis **changez immédiatement le mot de passe** (menu en
haut à droite).

Ouvrez aussi, dans le pare-feu de l'hébergeur, le port **UDP 1700**
(passerelles « Semtech UDP ») ou **TCP 3001** (passerelles « Basics
Station ») selon ce que votre passerelle utilise, et les ports **80** et
**443** pour l'interface.

## 4. Déclarer la passerelle 4G

1. Menu « Gateways » → « Add gateway ».
2. Nom : le nom du site ; « Gateway ID » : l'identifiant imprimé sous la
   passerelle (16 caractères).
3. Dans l'interface de la passerelle, indiquez l'adresse du serveur
   (`lorawan.smartmeteria.com`) et le port 1700 (ou 3001).
4. Quelques minutes plus tard, la passerelle apparaît « en ligne ».

## 5. Créer le profil d'appareil

1. Menu « Device profiles » → « Add device profile ».
2. Région : EU868 ; version LoRaWAN et paramètres régionaux : ceux de la
   fiche technique du capteur ; activation : OTAA.
3. Onglet « Codec » :
   - EM300-DI : facultatif (SmartMetera décode lui-même les impulsions) ;
   - sonde de température : **obligatoire**. Collez le décodeur ChirpStack
     publié par le fabricant de la sonde. Il doit produire un champ
     `temperature` en °C. TODO(RAYAN) : modèle de sonde à choisir.

## 6. Créer l'application et ajouter les capteurs

1. Menu « Applications » → « Add application », nom : `SmartMetera`.
2. Pour chaque capteur : « Add device », DevEUI et AppKey (fournis par le
   fabricant avec le capteur), profil créé à l'étape 5.
3. Le DevEUI doit aussi être dans le stock SmartMetera (écran
   « Appareils », import CSV) : c'est lui qui relie le capteur au bon
   client.

## 7. Envoyer les données à SmartMetera

1. Dans l'application `SmartMetera` : onglet « Integrations » → « HTTP ».
2. « Payload encoding » : **JSON**.
3. « Event endpoint URL(s) » : l'adresse « LoRaWAN » de la carte
   « Réception des capteurs », en remplaçant `generic` par `chirpstack` :
   `https://<projet>.supabase.co/functions/v1/ingest/chirpstack/<jeton>`.
4. Enregistrez. ChirpStack envoie alors chaque message (« up ») et l'état
   des piles (« status ») ; les autres événements sont ignorés.

Vérification : posez un capteur avec l'assistant « Poser un capteur » ;
l'écran passe à « Données reçues » dès le premier message.

## Alternative : The Things Stack Cloud

1. Créez un compte et une application sur The Things Stack Cloud (région
   Europe).
2. Déclarez la passerelle et les capteurs (DevEUI, AppKey).
3. Sonde de température : onglet « Payload formatters » du capteur,
   formateur JavaScript du fabricant (champ `temperature` en °C).
4. « Integrations » → « Webhooks » → « Add webhook » → « Custom webhook » :
   format **JSON**, « Base URL » :
   `https://<projet>.supabase.co/functions/v1/ingest/ttn/<jeton>` (même
   jeton « LoRaWAN »), cochez « Uplink message ».

Le niveau de pile n'est alors connu que par les messages du capteur
lui-même (EM300-DI : oui).

## En cas de problème

- La passerelle n'apparaît pas : vérifiez le port ouvert (1700 ou 3001) et
  l'adresse saisie dans la passerelle.
- Les messages arrivent dans ChirpStack mais pas dans SmartMetera :
  vérifiez l'adresse de l'intégration HTTP (jeton complet, sans espace).
  Un capteur absent du stock est gardé côté SmartMetera dans les « trames
  d'appareils inconnus » (visible par le superadmin) pendant 30 jours.
