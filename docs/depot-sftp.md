# Option dépôt SFTP

Topkapi, Sofrel S4W/PCWin2 et EWEBTEL proposent (ou proposent probablement,
voir les guides par éditeur) un dépôt de fichier sur un serveur SFTP comme
destination d'export planifié — c'est une option courante des plateformes
de télérelevé/télégestion du secteur, indépendamment de l'éditeur.

## État actuel côté SmartMeteria

**SmartMeteria n'a pas, à ce jour, de connecteur qui va récupérer
automatiquement un fichier déposé sur un serveur SFTP tiers** (ni le sien,
ni celui du client). Deux mécanismes d'ingestion automatisée existent
aujourd'hui :

- l'assistant d'import manuel (`/import`, upload direct dans le
  navigateur) ;
- la **boîte mail entrante** (`/parametres/boite-mail`) : une pièce jointe
  CSV/XLSX reçue par e-mail sur l'adresse dédiée d'une source est importée
  automatiquement, avec accusé de réception et signalement d'erreur.

Il n'existe pas de troisième mécanisme qui interroge périodiquement un
serveur SFTP pour en récupérer les nouveaux fichiers.

## Recommandation

**Préférez systématiquement l'option e-mail** quand le logiciel client la
propose : c'est la seule des deux qui soit entièrement automatisée côté
SmartMeteria (voir les guides par éditeur pour la marche à suivre).

Si le logiciel client ne propose que le dépôt SFTP (pas d'option e-mail) :

1. **Solution de contournement immédiate** : le client (ou l'équipe
   SmartMeteria en configuration initiale) doit surveiller manuellement le
   serveur SFTP et importer chaque nouveau fichier via l'assistant
   `/import`. Cette étape manuelle doit être documentée dans la procédure
   d'exploitation de l'organisation concernée (fréquence de vérification,
   responsable).
2. **Solution durable** : développer un connecteur de récupération SFTP
   planifiée (Edge Function + `pg_cron`, sur le modèle de
   `supabase/functions/notifications` pour la planification — mais un appel
   SFTP depuis Deno nécessite une bibliothèque cliente SFTP, une nouvelle
   dépendance à évaluer explicitement, voir CLAUDE.md). **Hors périmètre du
   présent travail** : à cadrer comme une phase dédiée si le besoin se
   confirme pour plusieurs clients (mutualiser le développement plutôt que
   le refaire par client).

## Ce qu'il faut demander au client s'il choisit malgré tout le SFTP

Pour que la solution de contournement (récupération + import manuels) soit
fiable, obtenez du client :

- l'hôte, le port, l'identifiant et le moyen d'authentification (mot de
  passe ou clé publique) du serveur SFTP ;
- le chemin de dépôt exact et la convention de nommage des fichiers
  (utile pour repérer les nouveaux fichiers sans les retraiter) ;
- la fréquence et l'heure de dépôt, pour caler la vérification manuelle.
