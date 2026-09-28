-- Index couvrant les clés étrangères composites de 0030 (avis de
-- performance Supabase « unindexed_foreign_keys »).

drop index public.devices_meter_idx;
drop index public.devices_source_idx;
create index devices_meter_idx on public.devices (meter_id, organization_id) where meter_id is not null;
create index devices_source_idx on public.devices (source_id, organization_id) where source_id is not null;

create index leak_events_site_org_idx on public.leak_events (site_id, organization_id);
create index temperature_readings_point_org_idx on public.temperature_readings (point_id, organization_id);
