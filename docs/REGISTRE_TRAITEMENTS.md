# Registre des traitements (modèle à faire valider)

Article 30 du RGPD. **Modèle du 1er octobre 2026, à faire valider par un
juriste** (`docs/A_FAIRE_RAYAN.md`). Les passages « à compléter » attendent les
informations de l'entité qui exploite SmartMeteria.

Responsable : [à compléter : raison sociale, adresse, représentant].
Contact pour les données : [à compléter].

## 1. Gestion des comptes et des accès

| Rubrique | Contenu |
|---|---|
| Rôle de SmartMeteria | Responsable de traitement |
| Finalité | Créer les comptes, se connecter, gérer les rôles et les invitations |
| Base légale | Exécution du contrat |
| Personnes | Utilisateurs des établissements et des partenaires, superadmins |
| Données | Nom, adresse e-mail, rôle, organisation, sites accessibles, dates de connexion |
| Destinataires | Administrateur de l'organisation ; sous-traitants : Supabase (Paris), Vercel (Paris), Resend, Google (connexion Google facultative), Cloudflare Turnstile |
| Durée | Durée du contrat ; [à compléter : délai après la fin du contrat] |
| Sécurité | Accès cloisonné par organisation (règles d'accès en base), mots de passe divulgués refusés, en-têtes de sécurité, limitation de débit |

## 2. Surveillance de l'eau et alertes

| Rubrique | Contenu |
|---|---|
| Rôle de SmartMeteria | Sous-traitant de l'établissement (ou sous-traitant ultérieur du partenaire en marque blanche) |
| Finalité | Repérer les fuites probables, alerter, produire les rapports, le registre des températures et les exports |
| Base légale | Exécution du contrat du client |
| Personnes | Techniciens, directeurs de site, contacts d'alerte |
| Données | Adresse e-mail, numéro de téléphone d'alerte, actions sur les alertes (qui, quand), journal des messages (destinataire, date, canal, contenu) |
| Données non personnelles | Relevés de consommation et de température des compteurs d'établissements |
| Destinataires | Utilisateurs de l'organisation ; sous-traitants : Supabase, Resend (e-mails), Twilio (SMS, appels, WhatsApp, une fois activé) |
| Durée | Journal des messages : contenu et destinataire effacés après une durée paramétrable (réglage `conservation`, [à compléter : durée]) ; relevés : jamais supprimés pendant le contrat |
| Transferts hors UE | [à compléter : garanties de Resend et Twilio] |

## 3. Pose des capteurs

| Rubrique | Contenu |
|---|---|
| Rôle de SmartMeteria | Sous-traitant de l'établissement |
| Finalité | Installer et vérifier les capteurs (assistant de pose) |
| Données | Nom du technicien, photo du compteur (peut montrer un local technique), index relevé, date |
| Durée | [à compléter] |

## 4. Pilotes et facturation

| Rubrique | Contenu |
|---|---|
| Rôle de SmartMeteria | Responsable de traitement |
| Finalité | Suivre les pilotes, recueillir l'accord écrit de conversion, facturer |
| Base légale | Exécution du contrat ; obligation légale (facturation) |
| Données | Nom de la personne qui donne l'accord, date et heure, organisation, usage mensuel |
| Durée | [à compléter : durée légale de conservation des pièces comptables] |

## 5. Sécurité et suivi des erreurs

| Rubrique | Contenu |
|---|---|
| Rôle de SmartMeteria | Responsable de traitement |
| Finalité | Détecter les pannes et les abus |
| Base légale | Intérêt légitime |
| Données | Adresse IP (compteurs de limitation de débit, effacés après 1 jour) ; erreurs techniques envoyées à Sentry **sans** adresse e-mail, téléphone, adresse IP ni jeton (masqués avant l'envoi) |
| Durée | Limitation de débit : 1 jour ; Sentry : [à compléter : réglage du projet] ; historique des tâches planifiées : 90 jours |
