-- Réponses de Rayan du 3 octobre 2026 (docs/A_FAIRE_RAYAN.md, points D3 à
-- D9 et M4), saisies dans les réglages de plateforme. Tout reste modifiable
-- par le superadmin.
--
-- D4 Maroc (HT, dirhams) : mise en service 2 900 par point, 6 500 pour le
--    premier point avec passerelle ; abonnement 150 le premier point, 100 par
--    point supplémentaire, 80 par sonde ; retenue à la source 10 % par
--    défaut (TODO(RAYAN) : à confirmer par un conseil fiscal).
-- D6 RDC (HT, dollars seulement) : mise en service 450 par point, 900 pour le
--    premier point avec passerelle ; abonnement 29 le premier point, 19 par
--    point supplémentaire, 12 par sonde ; retenue 0 % (TODO(RAYAN) : à
--    confirmer). Pas de facturation en francs congolais : un site en CDF est
--    facturé en dollars (le prix de l'eau et les pertes restent en CDF).
-- D5, D7 : pas de prix de l'eau par défaut au Maroc ni en RDC (saisi site
--    par site).
-- D8 : capteur de niveau (option autonomie en eau) : mise en service 390 €,
--    4 500 MAD, 550 $ ; abonnement 15 €, 150 MAD, 25 $ par mois.
-- D9 : pendant un pilote, la mise en service est facturée et l'abonnement
--    est offert ; mise en service remboursée et capteur retiré si rien n'est
--    trouvé, quand l'option est cochée (tâche existante).
-- D3 : conservation du journal des messages 12 mois (TODO(RAYAN) : à
--    confirmer par le juriste).
-- M4 : capteur de niveau Milesight EM500-UDL, champ « distance » en mm.

update public.platform_settings
set value = (value - 'CDF') || jsonb_build_object(
  'EUR', (value -> 'EUR') || jsonb_build_object(
    'capteur_niveau_mise_en_service', 390,
    'capteur_niveau_mois', 15
  ),
  'MAD', jsonb_build_object(
    'mise_en_service_point', 2900,
    'mise_en_service_premier_point_passerelle', 6500,
    'abonnement_premier_point', 150,
    'abonnement_point_supplementaire', 100,
    'sonde_temperature_mois', 80,
    'capteur_niveau_mise_en_service', 4500,
    'capteur_niveau_mois', 150,
    'retenue_source_pct_defaut', 10
  ),
  'USD', jsonb_build_object(
    'mise_en_service_point', 450,
    'mise_en_service_premier_point_passerelle', 900,
    'abonnement_premier_point', 29,
    'abonnement_point_supplementaire', 19,
    'sonde_temperature_mois', 12,
    'capteur_niveau_mise_en_service', 550,
    'capteur_niveau_mois', 25,
    'retenue_source_pct_defaut', 0
  )
),
description = 'Tarifs HT par défaut, par monnaie de facturation (EUR, MAD, USD ; décisions de Rayan du 3 octobre 2026). Pas de facturation en francs congolais : un site en CDF est facturé en dollars. null : à paramétrer. Retenue à la source : MAD 10 %, USD 0 %, à confirmer par un conseil fiscal (TODO(RAYAN)).'
where key = 'tarifs';

update public.platform_settings
set description = 'Prix de l''eau par défaut au m³ d''un nouveau site, dans sa monnaie. EUR : moyenne française TTC au 1er janvier 2025. MAD, USD et CDF : pas de prix par défaut (décision de Rayan), à saisir site par site.'
where key = 'prix_eau_defaut';

update public.platform_settings
set value = value || '{"envois_mois": 12}'::jsonb,
    description = 'Durées de conservation. envois_mois : au-delà, destinataire et contenu des envois sont effacés (12 mois, décision de Rayan ; TODO(RAYAN) : à confirmer par le juriste). taches_jours : historique des tâches planifiées.'
where key = 'conservation';

update public.platform_settings
set value = value || '{"modele": "Milesight EM500-UDL", "champ": "distance", "unite": "mm", "a_verifier": false}'::jsonb,
    description = 'Capteur de niveau LoRaWAN (Milesight EM500-UDL, choix de Rayan) : nom du champ (chemin possible « a.b ») et unité (mm, cm ou m) de la mesure dans l''objet décodé par le serveur réseau (décodeur du fabricant).'
where key = 'capteur_niveau';

update public.platform_settings
set value = value || '{"abonnement_offert": true}'::jsonb,
    description = 'Pilotes : durée par défaut et jour d''envoi du résumé de fin de pilote. abonnement_offert : pendant un pilote, la mise en service est facturée et l''abonnement est offert jusqu''à la conversion (décision de Rayan).'
where key = 'pilotes';
