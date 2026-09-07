# Export récurrent depuis Sofrel S4W vers SmartMeteria

## Point d'attention : S4W est un poste local, pas le superviseur central

Le **SOFREL S4W** est un poste local de télégestion (RTU), configuré via
**S4W-Tools** et consultable via un écran local ou un serveur web embarqué.
Ce n'est généralement **pas lui** qui centralise l'historique multi-postes
et génère des rapports planifiés : c'est le rôle du superviseur central
compatible, **SOFREL PCWin2**. La configuration d'un export récurrent est
donc probablement à chercher côté **PCWin2**, pas côté S4W — à confirmer
avec le support Lacroix Sofrel ou l'intégrateur du client.

Sources : [Datasheet S4W](https://www.lacroix-environment.com/wp-content/uploads/3/2025/11/05/dc54-datasheet-s4w-fr-11-2025.pdf),
[SOFREL S4W RTU](https://www.lacroix-environment.com/telemetry-solutions/offers/rtus-data-loggers/sofrel-s4w-rtu/),
[SOFREL PCWin2](https://www.lacroix-sofrel.com/offer/centralization/sofrel-pcwin2-html5/).

## Ce qui est confirmé

- **PCWin2** propose des **rapports d'exploitation automatiquement générés
  au format Excel**, ainsi qu'une **fonction d'export CSV** des données
  sélectionnées à l'écran.
  ([Focus produit PCWin2](https://www.monreseaudeau.fr/focus-produit/sofrel-pcwin2/),
  [Revue EIN](https://www.revue-ein.com/actualite/pcwin2-poste-central-pour-reseaux-de-telegestion-sofrel))
- Le livret de formation S4W (09/2022) mentionne un onglet « Information »
  avec des fonctions d'import/export, sans détail de planification.
  ([Formation S4W](https://sofrel_s4w_automatisme.solutions-industrielles.com/livret/s4w-ecosyst/))

## Ce qui reste à vérifier avec le support Lacroix Sofrel

- Le menu exact permettant de planifier un export récurrent (quotidien) des
  rapports Excel/CSV côté PCWin2.
- Les paramètres d'une destination SFTP/FTP (hôte, port, identifiants,
  chemin) ou d'un envoi par e-mail depuis PCWin2.
- La confirmation que le format déjà documenté dans SmartMeteria (`;`,
  ISO-8859-1, colonnes `Ouvrage` / `Horodatage` / `Valeur`) correspond bien
  à un export PCWin2 standard plutôt qu'à une adaptation ponctuelle réalisée
  pour ce client.

## Pattern générique du secteur (à confirmer, pas garanti)

Pour ce type de superviseur de télégestion eau potable, les plateformes
comparables proposent en général :

- des **rapports planifiés** (quotidien / hebdomadaire / mensuel) plutôt
  qu'un « export » au sens fichier-à-fichier ;
- une **destination configurable** : dépôt FTP/SFTP, envoi par e-mail, ou
  écriture sur un dossier réseau local au poste central ;
- un **format CSV** avec séparateur `;` et encodage Windows-1252/
  ISO-8859-1, cohérent avec beaucoup d'outils français de cette génération.

## Configurer l'envoi vers SmartMeteria

1. **Par e-mail (recommandé)** : une fois le rapport planifié configuré
   côté PCWin2, faites-le envoyer en pièce jointe à l'adresse dédiée
   affichée dans `/parametres/boite-mail` (source « Sofrel S4W », modèle de
   mapping correspondant sélectionné par défaut).
2. **Par SFTP** : voir [depot-sftp.md](./depot-sftp.md).
