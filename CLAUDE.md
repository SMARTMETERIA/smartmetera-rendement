@AGENTS.md

## Produit actif : Gardien de l'eau (plan version 2, depuis le 26 septembre 2026)
Source de vérité : docs/PLAN_GARDIEN.md ; avancement : docs/PROGRESS.md.
Offres Réseau et Immeuble en pause (docs/PLAN_IMMEUBLE.md) : ne pas les casser.
Règles supplémentaires :
- Marque « SmartMeteria » partout ; nom du produit « Gardien de l'eau by SmartMeteria » (titre, e-mails, rapports, pages preuve).
- Fenêtres de nuit, envois et rapports à l'heure locale du site (Europe/Paris, Africa/Casablanca, Africa/Kinshasa ou Africa/Lubumbashi).
- Montants dans la monnaie du site (EUR, MAD, USD ou CDF).
- Pertes et économies : toujours la méthode prudente, affichée à côté du montant.
- Aucune garantie de détection promise ; mention « surveillance fondée sur les données transmises par les capteurs ».
- Conversion automatique d'un pilote uniquement avec un consentement écrit horodaté.
- Seuils de température et délais réglementaires : paramétrables et TODO(RAYAN), jamais inventés.
- Aucun SMS, appel, WhatsApp ni e-mail réel en développement.
- Aucune couleur en dur : tout passe par les variables de thème.
- Aucun format de capteur ni contenu juridique inventé : paramétrable et TODO(RAYAN).
- Ne jamais envoyer directement sur main.
- Toujours expliquer à Rayan, en français simple et sans mot technique, ce qu'il doit tester.

## Offre Immeuble (en pause depuis le 25 septembre 2026)
Règles conservées pour ne pas casser l'offre en pause (organizations.kind = 'immeuble') :
- Les occupants n'accèdent aux données que par RPC, filtrées sur leur période
  d'occupation. Aucun SELECT direct sur readings.
- Aucun e-mail réel sans : EMAIL_SENDING_ENABLED=true, organisation 'actif',
  sending_enabled, dpa_signed_at renseigné.
- Le registre des envois (deliveries, delivery_events) est en ajout seul.
- Ne jamais écrire que l'eau froide est soumise à une obligation légale.
- Les tests des offres Réseau et Immeuble restent verts à chaque phase.
