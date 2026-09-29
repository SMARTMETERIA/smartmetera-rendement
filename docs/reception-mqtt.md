# Réception MQTT du kit A (Adeunis PULSE NB-IoT/LTE-M)

Guide pas à pas. Le capteur Adeunis PULSE du kit A envoie ses relevés par
le réseau mobile (NB-IoT ou LTE-M) à un **broker MQTT**. Le broker les
transfère à SmartMeteria par une règle d'envoi HTTP. Aucune passerelle
n'est nécessaire sur le site.

Source : guide Adeunis « User Guide PULSE MQTTS NB-IoT/LTE-M » v1.1
(référence ARF8420AA, version APP 1.4.x).

## 1. Choisir le broker

TODO(RAYAN) : choisir un broker MQTT managé hébergé dans l'Union
européenne. Il doit :

- accepter les connexions **MQTTS (TLS 1.2)** avec certificat du serveur,
  identifiant et mot de passe (le capteur ne sait pas utiliser de
  certificat client : les brokers qui l'exigent, comme ceux d'AWS ou
  d'Azure, ne conviennent pas) ;
- accepter la **qualité de service 1** ;
- savoir **transférer chaque message en HTTP** (règle de transfert,
  « webhook » ou « data integration »), en y joignant l'identifiant du
  client MQTT.

## 2. Créer l'accès des capteurs sur le broker

Dans la console du broker : créez un identifiant et un mot de passe pour
les capteurs, et téléchargez le **certificat du serveur** (fichier
`.pem`).

## 3. Créer la règle de transfert vers SmartMeteria

- Adresse : l'adresse « MQTT » de la carte « Réception des capteurs »
  (espace Superadmin), de la forme
  `https://<projet>.supabase.co/functions/v1/ingest/mqtt/<jeton>`.
- Méthode : POST, contenu JSON.
- Corps du message : l'identifiant du client dans `clientid` et le
  message du capteur dans `payload` (texte). Par exemple :
  `{ "clientid": "${clientid}", "topic": "${topic}", "payload": "${payload}" }`
  (la syntaxe exacte des variables dépend du broker).
- Sont aussi acceptés : le message seul, ou le format Orange Live Objects.

TODO(RAYAN) : une fois le broker choisi, envoyer une vraie trame reçue
pour confirmer les noms de champs.

## 4. Régler chaque capteur (application Adeunis, par NFC)

Application « IoT Configurator NB-IoT/LTE-M » (Android ou iOS), téléphone
posé contre le capteur :

1. **MQTT CONFIGURATION** : adresse du broker (sans `mqtts://`), port,
   identifiant, mot de passe, identifiant client `urn:imei:<IMEI>` (déjà
   rempli), certificat `.pem`, sujet de publication (par exemple
   `smartmetera/pulse`).
2. **NETWORK** : en France, limiter les bandes à la bande 20 raccourcit la
   connexion (recommandation Adeunis).
3. **APPLICATION** : voies actives (A, ou A et B), **échantillonnage
   900 secondes**, **émission 3 600 secondes**. Le réglage d'usine est une
   émission par jour : le Gardien demande au moins un relevé par heure,
   sinon le point passe en « surveillance limitée ».
4. **PRODUCT ACTIVATION** : mode PRODUCTION, puis « Apply ».

La diode verte reste allumée 5 secondes quand le capteur est connecté au
réseau.

## 5. Vérifier

L'IMEI du capteur doit être dans le stock SmartMeteria (écran « Appareils »,
import CSV). Posez le capteur avec l'assistant « Poser un capteur » :
l'écran annonce l'heure de la première donnée, puis passe à « Données
reçues » et au feu vert après le robinet test.

Maroc : utiliser le kit C (LoRaWAN), aucun réseau NB-IoT n'y étant connu.
