# Export récurrent depuis EWEBTEL vers SmartMeteria

## Ce qui est confirmé

eWebtel est la plateforme d'acquisition de données de mesure de **Plum**
(compteurs d'eau/gaz communicants), utilisée pour la facturation, le suivi
réseau et le reporting. Elle prend en charge l'export aux formats **CSV,
PDF, Excel**, avec possibilité de « définir la plage et le type de données
transmises ».
([Fiche produit eWebtel — Plum Water](https://water.plum.pl/en/product/ewebtel-2/))

La plateforme actuelle est accessible via `ewebtel.com` (v2.x) ; l'ancienne
(`old.ewebtel.com`) a été fermée le 31/10/2021.

## Ce qui n'a pas pu être confirmé publiquement

Aucune documentation officielle publique détaillée n'a été trouvée sur :

- le menu exact et la terminologie pour créer un **export planifié
  récurrent** (quotidien) ;
- l'existence d'options de destination **SFTP/FTP**, **webhook** ou **envoi
  par e-mail** pour ces exports automatiques ;
- la structure précise du CSV (séparateur, encodage) — le modèle déjà
  documenté dans SmartMeteria (`,`, UTF-8, colonnes `Device ID` /
  `Timestamp` / `Reading` en index cumulé litres) n'a pas pu être
  recoupé avec une source officielle ;
- l'existence d'une API REST documentée en alternative à l'export fichier.

Le manuel utilisateur eWebtel 2.0 existerait (référencé sur des plateformes
de partage de documents) mais son contenu n'a pas pu être consulté.

## Contact éditeur

Le contact technique identifié pour les exports est **export@plummac.com**.
Demandez explicitement :

1. une capture d'écran (ou description précise) du menu « export
   planifié » ;
2. la liste des destinations disponibles (SFTP, e-mail, API) ;
3. la spécification exacte du CSV produit ;
4. l'existence d'une API REST, si une intégration plus directe est
   souhaitée.

Joignez si possible un export déjà reçu par le passé, pour confirmer que le
format documenté dans SmartMeteria n'a pas changé.

## Pattern générique du secteur (à confirmer, pas garanti)

Les plateformes IoT de télérelevé comparables proposent en général un
module « Rapports »/« Exports » avec planification (fréquence quotidienne/
hebdomadaire/mensuelle) et un choix de canal de remise (e-mail en pièce
jointe, dépôt FTP/SFTP, parfois webhook).

## Configurer l'envoi vers SmartMeteria

1. **Par e-mail (recommandé)** : si eWebtel sait envoyer l'export planifié
   en pièce jointe, utilisez l'adresse dédiée affichée dans
   `/parametres/boite-mail` (source « EWEBTEL », modèle de mapping
   correspondant sélectionné par défaut).
2. **Par SFTP** : voir [depot-sftp.md](./depot-sftp.md).
3. **Par API** : si Plum confirme une API REST documentée, une intégration
   directe (nouvelle Edge Function dédiée, hors périmètre de ce guide)
   serait préférable à un export fichier — à évaluer séparément si
   confirmée.
