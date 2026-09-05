-- Pipeline d'import CSV/Excel : modèles de mapping (système + par organisation),
-- extension de import_jobs pour tracer fichier/mapping/rapport, bucket de
-- stockage dédié. L'exécution réelle (parsing, validation, upsert idempotent)
-- vit dans supabase/functions/process-import (Edge Function) + src/lib/import.

create table public.import_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  is_system boolean not null default false,
  source_type text not null check (
    source_type in (
      'generique', 'topkapi', 'sofrel_s4w', 'ewebtel_plum', 'kamstrup_ready',
      'diehl_izarnet', 'itron_temetra', 'jvs_facturation'
    )
  ),
  -- Table cible du mapping : la plupart des fournisseurs alimentent les
  -- relevés (readings) ; l'export facturation JVS alimente le bilan annuel
  -- (balance_inputs) via une agrégation par exercice.
  cible text not null default 'readings' check (cible in ('readings', 'balance_inputs')),
  nom text not null,
  description text,
  -- Forme de config selon `cible` :
  -- readings : { delimiter, encoding, header_row, date_format, value_type:
  --   'volume'|'index', unit: 'm3'|'L', rollover_digits?, column_mapping:
  --   { meter_ref, ts, value } }
  -- balance_inputs : { delimiter, encoding, header_row, column_mapping:
  --   { commune?, annee, volume_comptabilise, nb_abonnes? } }
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  constraint import_templates_org_or_system check (
    (is_system and organization_id is null) or (not is_system and organization_id is not null)
  )
);

create index import_templates_org_idx on public.import_templates (organization_id);
alter table public.import_templates enable row level security;

create trigger import_templates_set_updated_at
  before update on public.import_templates
  for each row execute function public.set_updated_at();

create policy "lecture_import_templates" on public.import_templates for select
  using (is_system or public.is_member(organization_id));

create policy "ecriture_import_templates" on public.import_templates for all
  using (
    (is_system and public.is_superadmin())
    or (not is_system and public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]))
  )
  with check (
    (is_system and public.is_superadmin())
    or (not is_system and public.has_role(organization_id, array['admin_client', 'superadmin']::public.role_utilisateur[]))
  );

-- ---------------------------------------------------------------------------
-- Extension de import_jobs : fichier source, mapping résolu (snapshot au
-- moment du lancement, indépendant d'une modification ultérieure du modèle),
-- rapport d'erreurs téléchargeable, lignes ignorées (deltas suspects, ex.
-- remplacement de compteur non explicable par un rollover).
-- ---------------------------------------------------------------------------
alter table public.import_jobs
  add column template_id uuid references public.import_templates (id),
  add column file_path text,
  add column mapping jsonb,
  add column rapport_erreurs_path text,
  add column nb_lignes_ignorees integer;

-- ---------------------------------------------------------------------------
-- Bucket de stockage privé pour les fichiers importés et leurs rapports
-- d'erreurs. Convention de chemin : imports/<organization_id>/<import_job_id>/...
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('imports', 'imports', false)
on conflict (id) do nothing;

create policy "lecture_imports_storage" on storage.objects for select
  using (
    bucket_id = 'imports'
    and public.is_member(((storage.foldername(name))[1])::uuid)
  );

create policy "ecriture_imports_storage" on storage.objects for insert
  with check (
    bucket_id = 'imports'
    and public.has_role(
      ((storage.foldername(name))[1])::uuid,
      array['admin_client', 'agent', 'superadmin']::public.role_utilisateur[]
    )
  );

create policy "suppression_imports_storage" on storage.objects for delete
  using (
    bucket_id = 'imports'
    and public.has_role(
      ((storage.foldername(name))[1])::uuid,
      array['admin_client', 'superadmin']::public.role_utilisateur[]
    )
  );

-- ---------------------------------------------------------------------------
-- Modèles système (organization_id null, visibles par toutes les
-- organisations). Mapping de départ plausible pour chaque fournisseur —
-- à ajuster via l'assistant de mapping avec un vrai fichier d'export du
-- client (voir README : formats non vérifiés contre une vraie spec éditeur).
-- ---------------------------------------------------------------------------
insert into public.import_templates (is_system, source_type, cible, nom, description, config) values
(
  true, 'generique', 'readings', 'Générique (CSV simple)',
  'Un compteur, un horodatage, un volume par ligne.',
  '{
    "delimiter": ",", "encoding": "utf-8", "header_row": 1,
    "date_format": "YYYY-MM-DD HH:mm:ss", "value_type": "volume", "unit": "m3",
    "column_mapping": {"meter_ref": "compteur", "ts": "date", "value": "volume_m3"}
  }'::jsonb
),
(
  true, 'topkapi', 'readings', 'Topkapi (export planifié)',
  'Export planifié Topkapi (Birdz) : index cumulé, points-virgules, ISO-8859-1.',
  '{
    "delimiter": ";", "encoding": "iso-8859-1", "header_row": 1,
    "date_format": "DD/MM/YYYY HH:mm", "value_type": "index", "unit": "m3",
    "rollover_digits": 8,
    "column_mapping": {"meter_ref": "Identifiant compteur", "ts": "Date releve", "value": "Index (m3)"}
  }'::jsonb
),
(
  true, 'sofrel_s4w', 'readings', 'Sofrel S4W',
  'Export supervision Lacroix Sofrel S4W : valeur déjà en volume par intervalle.',
  '{
    "delimiter": ";", "encoding": "iso-8859-1", "header_row": 1,
    "date_format": "DD/MM/YYYY HH:mm:ss", "value_type": "volume", "unit": "m3",
    "column_mapping": {"meter_ref": "Ouvrage", "ts": "Horodatage", "value": "Valeur"}
  }'::jsonb
),
(
  true, 'ewebtel_plum', 'readings', 'EWEBTEL (Plum)',
  'Export plateforme Plum eWebTel : index cumulé en litres.',
  '{
    "delimiter": ",", "encoding": "utf-8", "header_row": 1,
    "date_format": "YYYY-MM-DD HH:mm:ss", "value_type": "index", "unit": "L",
    "rollover_digits": 8,
    "column_mapping": {"meter_ref": "Device ID", "ts": "Timestamp", "value": "Reading"}
  }'::jsonb
),
(
  true, 'kamstrup_ready', 'readings', 'Kamstrup READy',
  'Export cloud Kamstrup READy : consommation par intervalle en m³.',
  '{
    "delimiter": ",", "encoding": "utf-8", "header_row": 1,
    "date_format": "YYYY-MM-DDTHH:mm:ss", "value_type": "volume", "unit": "m3",
    "column_mapping": {"meter_ref": "Meter Number", "ts": "Date/Time", "value": "Consumption (m3)"}
  }'::jsonb
),
(
  true, 'diehl_izarnet', 'readings', 'Diehl IZAR@NET',
  'Export IZAR@NET Diehl Metering : index cumulé en litres.',
  '{
    "delimiter": ";", "encoding": "utf-8", "header_row": 1,
    "date_format": "DD.MM.YYYY HH:mm", "value_type": "index", "unit": "L",
    "rollover_digits": 8,
    "column_mapping": {"meter_ref": "Serial Number", "ts": "Reading Date", "value": "Index Value"}
  }'::jsonb
),
(
  true, 'itron_temetra', 'readings', 'Itron Temetra',
  'Export plateforme Itron Temetra : index cumulé en litres.',
  '{
    "delimiter": ",", "encoding": "utf-8", "header_row": 1,
    "date_format": "YYYY-MM-DD HH:mm:ss", "value_type": "index", "unit": "L",
    "rollover_digits": 9,
    "column_mapping": {"meter_ref": "Device Reference", "ts": "Reading Date", "value": "Cumulative Volume (L)"}
  }'::jsonb
),
(
  true, 'jvs_facturation', 'balance_inputs', 'Export facturation JVS',
  'Export JVS Mairistem : consommations annuelles facturées par commune, agrégées dans le bilan de l''organisation.',
  '{
    "delimiter": ";", "encoding": "iso-8859-1", "header_row": 1,
    "column_mapping": {
      "commune": "Commune", "annee": "Exercice",
      "volume_comptabilise": "Volume facture (m3)", "nb_abonnes": "Nombre abonnes"
    }
  }'::jsonb
);
