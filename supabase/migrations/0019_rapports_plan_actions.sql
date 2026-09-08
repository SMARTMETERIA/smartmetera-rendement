-- Rapport PDF mensuel envoyé automatiquement, export CSV des indicateurs
-- RPQS/SISPEA, et module plan d'actions décret 2012-97 (catalogue d'actions
-- types, génération d'un plan daté, suivi, export PDF).
--
-- Génération PDF : Edge Function supabase/functions/reports (pdf-lib, seule
-- fonction à embarquer cette dépendance). Contenu structuré assemblé en
-- TypeScript testable dans src/lib/reports/ (voir son README).

-- ---------------------------------------------------------------------------
-- reports : mois (rapport mensuel seulement) + type 'plan_action'.
-- ---------------------------------------------------------------------------
alter table public.reports
  add column mois integer check (mois between 1 and 12);

alter table public.reports
  drop constraint reports_type_check,
  add constraint reports_type_check check (
    type in ('rpqs', 'sispea', 'rapport_mensuel', 'rapport_fuites', 'plan_action', 'autre')
  );

-- ---------------------------------------------------------------------------
-- Bucket de stockage privé pour les PDF générés. Écriture réservée au
-- service_role (Edge Function `reports`) : aucune policy insert/update/
-- delete pour les utilisateurs de l'app, lecture seule pour les membres
-- (même convention que le bucket "imports", 0006_import_pipeline.sql).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('rapports', 'rapports', false)
on conflict (id) do nothing;

create policy "lecture_rapports_storage" on storage.objects for select
  using (
    bucket_id = 'rapports'
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

-- ---------------------------------------------------------------------------
-- Destinataires du rapport mensuel : liste libre d'adresses par
-- organisation (élus, DDT, prestataires...), indépendante des comptes
-- utilisateurs SmartMeteria (contrairement aux alertes/digest qui visent
-- les membres applicatifs).
-- ---------------------------------------------------------------------------
create table public.rapport_destinataires (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  nom text,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, email)
);

create index rapport_destinataires_org_idx on public.rapport_destinataires (organization_id);
alter table public.rapport_destinataires enable row level security;

create policy "lecture_rapport_destinataires" on public.rapport_destinataires for select
  using (public.is_member(organization_id));
create policy "ecriture_rapport_destinataires" on public.rapport_destinataires for all
  using (public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]))
  with check (public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]));

-- ---------------------------------------------------------------------------
-- Catalogue d'actions types (décret 2012-97) : bibliothèque système
-- (organization_id null, visible par toutes les organisations, même
-- convention que import_templates système) + possibilité d'ajouts propres
-- à une organisation.
-- ---------------------------------------------------------------------------
create table public.catalogue_actions_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  is_system boolean not null default false,
  categorie text not null check (
    categorie in (
      'sectorisation', 'recherche_fuites', 'renouvellement',
      'gestion_pression', 'compteurs_sectorisation', 'telereleve'
    )
  ),
  titre text not null,
  description text,
  created_at timestamptz not null default now(),
  constraint catalogue_actions_types_org_or_system check (
    (is_system and organization_id is null) or (not is_system and organization_id is not null)
  )
);

create index catalogue_actions_types_org_idx on public.catalogue_actions_types (organization_id);
alter table public.catalogue_actions_types enable row level security;

create policy "lecture_catalogue_actions_types" on public.catalogue_actions_types for select
  using (is_system or public.is_member(organization_id));
create policy "ecriture_catalogue_actions_types" on public.catalogue_actions_types for all
  using (
    (is_system and public.is_superadmin())
    or (not is_system and public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]))
  )
  with check (
    (is_system and public.is_superadmin())
    or (not is_system and public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]))
  );

-- ---------------------------------------------------------------------------
-- actions : lien optionnel vers l'action type d'origine (traçabilité,
-- n'empêche pas la modification libre du titre/description une fois créée).
-- ---------------------------------------------------------------------------
alter table public.actions
  add column catalogue_action_type_id uuid references public.catalogue_actions_types (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Catalogue système : actions types standard du décret 2012-97, une base de
-- départ à ajuster (à compléter/adapter selon la doctrine régionale — voir
-- docs/).
-- ---------------------------------------------------------------------------
insert into public.catalogue_actions_types (is_system, categorie, titre, description) values
(true, 'sectorisation', 'Créer un nouveau secteur de comptage', 'Isoler une zone du réseau avec compteur(s) d''entrée dédié(s) pour affiner la localisation des pertes.'),
(true, 'sectorisation', 'Poser des vannes de sectorisation', 'Installer les vannes nécessaires pour isoler un secteur existant lors des recherches de nuit.'),
(true, 'recherche_fuites', 'Campagne de recherche de fuites par corrélation acoustique', 'Prestataire ou équipe interne, ciblée sur les secteurs à débit de nuit anormal.'),
(true, 'recherche_fuites', 'Pré-localisation systématique sur alerte fuite suspectée', 'Déclenchée automatiquement à chaque alerte SmartMeteria de type fuite suspectée.'),
(true, 'renouvellement', 'Renouveler les canalisations les plus anciennes/fuyardes', 'Prioriser selon l''historique d''interventions et le linéaire concerné.'),
(true, 'renouvellement', 'Renouveler les branchements plomb restants', 'Enjeu sanitaire en plus du rendement.'),
(true, 'gestion_pression', 'Installer un réducteur de pression', 'Réduit la casse et le débit de fuite proportionnellement à la pression.'),
(true, 'gestion_pression', 'Optimiser les consignes de pression existantes', 'Ajustement des points de consigne selon les profils de consommation par secteur.'),
(true, 'compteurs_sectorisation', 'Installer des compteurs de sectorisation télérelevés', 'Fiabilise le calcul du débit de nuit et réduit le délai de détection.'),
(true, 'compteurs_sectorisation', 'Vérifier/étalonner les compteurs de sectorisation existants', 'Dérive métrologique = fausses alertes ou fuites masquées.'),
(true, 'telereleve', 'Déployer la télérelève sur les compteurs de sectorisation restants', 'Voir /parametres/sources pour l''ingestion LoRaWAN.'),
(true, 'telereleve', 'Étendre la télérelève aux compteurs abonnés prioritaires', 'Gros consommateurs, ERP, secteurs sensibles.');
