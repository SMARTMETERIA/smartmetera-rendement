-- Gardien de l'eau, phase G2 : rôles d'adhésion « directeur de site »
-- (portée : ses sites) et « technicien » (alertes et poses, portée
-- organisation ou site). Migration isolée : une valeur ajoutée à un enum
-- n'est utilisable qu'après validation de la transaction qui l'ajoute
-- (0034 s'en sert dans ses contraintes et politiques).
alter type public.role_utilisateur add value if not exists 'directeur_site';
alter type public.role_utilisateur add value if not exists 'technicien';
