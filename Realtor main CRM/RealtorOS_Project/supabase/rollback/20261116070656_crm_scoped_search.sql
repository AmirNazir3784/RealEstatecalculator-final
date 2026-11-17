-- Review and run only when rolling back the accompanying frontend search change.
alter table public.contacts drop column crm_search_document;
alter table public.deals drop column crm_search_document;
alter table public.properties drop column crm_search_document;
alter table public.tasks drop column crm_search_document;
