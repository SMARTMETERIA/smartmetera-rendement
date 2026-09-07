# Documentation — export récurrent depuis les logiciels métier

Ces guides expliquent comment paramétrer, côté logiciel client (Topkapi,
Sofrel S4W, EWEBTEL), un export récurrent des relevés vers SmartMeteria,
ainsi que l'option de dépôt SFTP.

**Avertissement général** : ces trois outils sont des logiciels B2B dont la
documentation détaillée de configuration (noms d'écrans exacts, captures)
est le plus souvent réservée à l'espace client / support de l'éditeur, pas
publiée en ligne. Chaque guide ci-dessous distingue explicitement :

- ce qui est **confirmé** par une source publique (documentation officielle,
  fiche produit) ;
- ce qui est **plausible / générique** pour ce type de plateforme (pattern
  observé sur des outils comparables du secteur), à confirmer avant de s'y
  fier ;
- ce qui **reste à vérifier** directement avec l'éditeur ou l'intégrateur du
  client.

Ne configurez pas un export en production sur la seule foi de ces guides
sans une vérification côté client — ils servent de point de départ pour la
conversation avec le support de l'éditeur, pas de procédure garantie.

## Deux façons de faire arriver le fichier chez SmartMeteria

1. **E-mail vers une adresse dédiée** (recommandé) : SmartMeteria importe
   automatiquement la pièce jointe CSV/XLSX reçue sur l'adresse de la source
   (voir `/parametres/boite-mail` dans l'application) — accusé de réception
   et signalement d'erreur automatiques, sans intervention manuelle. C'est
   l'option à privilégier si le logiciel client sait envoyer un e-mail avec
   pièce jointe en sortie d'export planifié.
2. **Dépôt SFTP** : voir [depot-sftp.md](./depot-sftp.md) — SmartMeteria ne
   récupère pas encore automatiquement un fichier déposé sur un serveur
   SFTP tiers (aucun connecteur de récupération planifiée n'est implémenté
   à ce jour). Cette option reste documentée ci-dessous parce que certains
   logiciels ne proposent qu'elle, mais implique aujourd'hui une étape
   manuelle (téléchargement puis import via l'assistant `/import`) tant que
   ce connecteur n'existe pas.

## Guides par éditeur

- [Topkapi (AREAL)](./topkapi-export-recurrent.md)
- [Sofrel S4W / PCWin2 (Lacroix Sofrel)](./sofrel-s4w-export-recurrent.md)
- [EWEBTEL (Plum)](./ewebtel-export-recurrent.md)
- [Option dépôt SFTP](./depot-sftp.md)
