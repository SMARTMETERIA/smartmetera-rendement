-- Prix moyen de l'eau (€/m³), utilisé pour valoriser les fuites détectées
-- (tableau de bord "économies estimées"). Réglable par organisation dans
-- /parametres. Valeur par défaut plausible (moyenne France ~2 €/m³ TTC),
-- à ajuster par le client selon son tarif réel.
alter table public.organizations
  add column prix_m3_eur numeric(6, 3) not null default 2.000;
