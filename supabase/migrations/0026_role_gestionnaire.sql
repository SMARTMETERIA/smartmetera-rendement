-- Offre Immeuble, phase 2 : nouveau rôle d'adhésion « gestionnaire »
-- (portée : un client du partenaire). Migration isolée : une valeur
-- ajoutée à un enum n'est utilisable qu'après validation de la transaction
-- qui l'ajoute (0027 s'en sert dans ses contraintes et politiques).
alter type public.role_utilisateur add value if not exists 'gestionnaire';
