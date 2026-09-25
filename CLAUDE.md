@AGENTS.md

## Offre Immeuble (depuis septembre 2026)
Deux offres dans une seule application : organizations.kind = 'reseau' (régies)
ou 'immeuble' (partenaires en marque blanche). La source de vérité de l'offre
Immeuble est docs/PLAN_IMMEUBLE.md ; l'avancement est dans docs/PROGRESS.md.
Règles supplémentaires :
- Les occupants n'accèdent aux données que par RPC, filtrées sur leur période
  d'occupation. Aucun SELECT direct sur readings.
- Aucun e-mail réel sans : EMAIL_SENDING_ENABLED=true, organisation 'actif',
  sending_enabled, dpa_signed_at renseigné.
- Le registre des envois (deliveries, delivery_events) est en ajout seul.
- Aucune couleur en dur : tout passe par les variables de thème (marque blanche).
- Aucun contenu juridique inventé : paramétrable et TODO(RAYAN).
- Ne jamais écrire que l'eau froide est soumise à une obligation légale.
- Les tests de l'offre Réseau restent verts à chaque phase.
