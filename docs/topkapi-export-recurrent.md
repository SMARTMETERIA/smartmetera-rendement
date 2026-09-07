# Export récurrent depuis Topkapi vers SmartMeteria

## ⚠️ À vérifier en priorité : de quel logiciel parle-t-on ?

Le modèle d'import système « Topkapi (export planifié) » déjà présent dans
SmartMeteria (`supabase/migrations/0006_import_pipeline.sql`) le décrit
comme venant de « Topkapi (Birdz) ». D'après nos recherches, **ce
rapprochement est probablement erroné** :

- **Topkapi** est un logiciel de supervision/télégestion (SCADA) édité par
  **AREAL** (areal-topkapi.com), utilisé pour la sectorisation et le
  rendement de réseau, communiquant nativement avec des automates de
  télégestion (souvent Sofrel).
- **Birdz** (filiale Veolia) est un tout autre éditeur, avec sa propre
  plateforme de télérelevé de compteurs d'eau communicants (portail web
  type « Birdz Fusion »), sans lien produit démontré avec Topkapi.

**Avant de suivre ce guide**, confirmez avec le client quel logiciel produit
réellement le fichier déjà reçu par le passé (colonnes `Identifiant
compteur` / `Date releve` / `Index (m3)`, `;`, ISO-8859-1) : Topkapi/AREAL,
Birdz, ou un troisième outil qui les combine (Topkapi consolidant des
données remontées par Birdz, par exemple). Le format de fichier documenté
ci-dessous reste valable quel que soit l'éditeur réel — seule la procédure
de configuration de l'export change.

## Ce qui est confirmé (documentation publique AREAL-Topkapi)

- Le **module Rapport** de Topkapi produit des exports aux formats **Excel,
  HTML, TXT, PDF** (le CSV n'est pas mentionné explicitement dans la
  documentation publique).
- Le **module Bilan** permet une extraction de données horodatées à pas
  fin, mais un retour d'intégrateur (forum) indique qu'il s'agit plutôt
  d'une extraction déclenchée manuellement ; l'automatisation observée en
  pratique passe par un **script externe lu par le planificateur de tâches
  Windows**, pas par une fonction native de planification dans l'IHM.
- Le module **Webserv2** est une interface de consultation web à distance
  (pas un mécanisme d'export).

Sources : [Documentations AREAL-Topkapi](https://www.areal-topkapi.com/documentations),
[Module Rapport](https://www.areal-topkapi.com/en/topkapi/product-range/report-module),
[Module Webserv2](https://www.areal-topkapi.com/en/topkapi/main-functions/webserv),
[Forum automatisme — extraction Topkapi](https://forum-automatisme.net/viewtopic.php?t=4132).

## Ce qui reste à vérifier avec le support AREAL

- L'existence d'une fonction native d'export planifié récurrent (quotidien)
  avec choix de format CSV.
- Les options de destination : dépôt SFTP, envoi par e-mail, ou uniquement
  écriture sur disque local (à relayer ensuite par un script/tâche
  planifiée, comme suggéré par le retour d'intégrateur ci-dessus).
- Le format exact (séparateur, encodage) du fichier produit si un export
  CSV natif existe.

## Si le fichier vient en réalité de Birdz

Contactez le support Birdz pour la configuration d'un export récurrent
depuis leur plateforme. Les plateformes de télérelevé B2B de ce type
proposent généralement (pattern générique du secteur, à confirmer) :

- un espace de configuration « export récurrent » avec destination **SFTP**
  (hôte, port, identifiant, mot de passe ou clé, chemin de dépôt) ou
  **e-mail** ;
- un format **CSV** avec choix d'encodage/délimiteur ;
- une fréquence **quotidienne**, souvent nocturne.

## Configurer l'envoi vers SmartMeteria une fois l'export automatisé

Quelle que soit la solution retenue côté éditeur :

1. **Par e-mail (recommandé)** : demandez que l'export planifié soit envoyé
   en pièce jointe à l'adresse dédiée affichée dans SmartMeteria
   (`/parametres/boite-mail`, source de type « Topkapi »/« Birdz » avec le
   modèle de mapping correspondant sélectionné par défaut). L'import, la
   confirmation et le signalement d'erreur sont alors automatiques.
2. **Par SFTP** : voir [depot-sftp.md](./depot-sftp.md) — étape manuelle de
   récupération et d'import tant que SmartMeteria ne propose pas de
   connecteur de récupération SFTP planifiée.
