-- Espace superadmin : checklist d'activation J0-J5 et journal d'audit
-- automatique (organisations, adhésions). La création d'organisation,
-- l'import de la fiche de collecte, l'invitation d'utilisateurs et
-- l'assignation des modèles de sources réutilisent les tables et policies
-- existantes (organizations, sectors, meters, sources, memberships,
-- import_templates) — RLS déjà permissive pour superadmin via has_role()/
-- is_member(), aucune nouvelle table métier nécessaire pour ces actions.

-- ---------------------------------------------------------------------------
-- Catalogue système des étapes d'activation (même convention que
-- catalogue_actions_types) : un seul catalogue global, pas de variante par
-- organisation — l'onboarding suit le même parcours pour tous les clients.
-- ---------------------------------------------------------------------------
create table public.checklist_activation_items (
  id uuid primary key default gen_random_uuid(),
  jour integer not null check (jour between 0 and 5),
  ordre integer not null,
  titre text not null,
  description text
);

alter table public.checklist_activation_items enable row level security;

create policy "lecture_checklist_activation_items" on public.checklist_activation_items for select
  using (auth.role() = 'authenticated');

insert into public.checklist_activation_items (jour, ordre, titre, description) values
(0, 1, 'Organisation créée', 'Nom, linéaire de réseau, nombre d''abonnés, ZRE, prix moyen du m³.'),
(0, 2, 'Fiche de collecte importée', 'Secteurs, compteurs et sources importés depuis /admin.'),
(1, 1, 'Utilisateurs invités', 'Au moins un admin_client côté client.'),
(1, 2, 'Rôles attribués', 'admin_client / agent / lecteur selon les responsabilités.'),
(2, 1, 'Sources configurées et testées', 'Webhooks LoRaWAN et/ou boîte mail entrante, testeur utilisé avec succès.'),
(3, 1, 'Modèles de mapping assignés', 'Chaque source email_entrant a un modèle d''import par défaut.'),
(3, 2, 'Premier import de données réalisé', 'Manuel (/import) ou automatique, sans erreur bloquante.'),
(4, 1, 'Moteur de calcul exécuté', 'Premier bilan calculé et vérifié avec le client.'),
(5, 1, 'Destinataires du rapport mensuel configurés', 'Au moins un destinataire actif dans rapport_destinataires.'),
(5, 2, 'Plan d''actions initial créé', 'Au moins une action du catalogue décret 2012-97 planifiée.'),
(5, 3, 'Formation utilisateur réalisée', 'Prise en main de l''application par le client.');

-- ---------------------------------------------------------------------------
-- Suivi par organisation. Lecture pour tous les membres (visibilité de leur
-- propre avancement), écriture réservée au superadmin (outil d'onboarding).
-- ---------------------------------------------------------------------------
create table public.checklist_activation_suivi (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  item_id uuid not null references public.checklist_activation_items (id) on delete cascade,
  fait boolean not null default false,
  fait_le timestamptz,
  fait_par uuid references auth.users (id),
  unique (organization_id, item_id)
);

create index checklist_activation_suivi_org_idx on public.checklist_activation_suivi (organization_id);
alter table public.checklist_activation_suivi enable row level security;

create policy "lecture_checklist_activation_suivi" on public.checklist_activation_suivi for select
  using (public.is_member(organization_id));
create policy "ecriture_checklist_activation_suivi" on public.checklist_activation_suivi for all
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- ---------------------------------------------------------------------------
-- Journal d'audit automatique : déclenché sur organizations et memberships,
-- quelle que soit la voie d'écriture (UI superadmin, script, RPC futur).
-- security definer : l'utilisateur qui crée une organisation n'a par
-- ailleurs aucun droit d'écriture directe sur audit_log.
-- ---------------------------------------------------------------------------
create function public.log_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if tg_table_name = 'organizations' then
    v_org_id := coalesce(new.id, old.id);
  else
    v_org_id := coalesce(new.organization_id, old.organization_id);
  end if;

  insert into public.audit_log (organization_id, user_id, action, entite, entite_id, avant, apres)
  values (
    v_org_id,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(new.id, old.id)::text,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger organizations_log_audit
  after insert or update on public.organizations
  for each row execute function public.log_audit();

create trigger memberships_log_audit
  after insert or update on public.memberships
  for each row execute function public.log_audit();
