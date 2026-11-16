-- Additive indexed search documents. No grants, policies, business columns or
-- customer records are removed/changed. Queries retain existing row-level
-- visibility and include the current workspace explicitly.
alter table public.contacts add column crm_search_document tsvector generated always as (
  to_tsvector('pg_catalog.simple'::regconfig, regexp_replace(coalesce(full_name,'') || ' ' || coalesce(email,'') || ' ' || coalesce(phone,''), '[^[:alnum:]]+', ' ', 'g'))
) stored;
alter table public.deals add column crm_search_document tsvector generated always as (
  to_tsvector('pg_catalog.simple'::regconfig, regexp_replace(coalesce(title,'') || ' ' || coalesce(stage,''), '[^[:alnum:]]+', ' ', 'g'))
) stored;
alter table public.properties add column crm_search_document tsvector generated always as (
  to_tsvector('pg_catalog.simple'::regconfig, regexp_replace(coalesce(address,'') || ' ' || coalesce(status,'') || ' ' || coalesce(mls,''), '[^[:alnum:]]+', ' ', 'g'))
) stored;
alter table public.tasks add column crm_search_document tsvector generated always as (
  to_tsvector('pg_catalog.simple'::regconfig, coalesce(title,'') || ' ' || coalesce(status,'') || ' ' || coalesce(extract(year from due_date)::integer::text,'') || ' ' || coalesce(extract(month from due_date)::integer::text,'') || ' ' || coalesce(extract(day from due_date)::integer::text,''))
) stored;
create index contacts_crm_search_gin on public.contacts using gin(crm_search_document);
create index deals_crm_search_gin on public.deals using gin(crm_search_document);
create index properties_crm_search_gin on public.properties using gin(crm_search_document);
create index tasks_crm_search_gin on public.tasks using gin(crm_search_document);
