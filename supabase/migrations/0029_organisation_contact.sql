-- Inscription autonome d'un partenaire (phase 2) : SIREN facultatif et
-- téléphone de contact, pour le suivi commercial par le superadmin.
alter table public.organizations
  add column siren text check (siren is null or siren ~ '^[0-9]{9}$'),
  add column contact_phone text;
