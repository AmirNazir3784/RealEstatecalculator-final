-- Compatible Phase 6 feature-disable rollback. Review before applying.
-- This does not DELETE, UPDATE, TRUNCATE, reset preferences or narrow constraints.
-- Every historical notification and every user's preference/device row is preserved.
-- Retain the additive 13-type/route support, hardened claim and permission helper:
-- existing queued/history rows still require them and older workers tolerate the
-- additional service-only claim user_id field.
begin;
drop trigger if exists notify_new_crm_lead on public.contacts;
drop trigger if exists notify_crm_deal_assignment on public.deals;
drop function if exists automation_internal.notify_new_crm_lead();
drop function if exists automation_internal.notify_crm_deal_assignment();
drop function if exists public.realtoros_request_push_test(text);

-- Preserve the worker contract while disabling discovery of new task reminders.
-- Existing queued notifications remain governed by existing opt-outs, quiet hours,
-- recipient/workspace checks and leases. This function creates no rows.
create or replace function public.realtoros_scan_task_reminders(
  p_limit integer default 100,
  p_now timestamptz default now()
)
returns jsonb language sql security invoker set search_path = '' as $$
  select jsonb_build_object('summaries',0,'disabled',true);
$$;
revoke all on function public.realtoros_scan_task_reminders(integer,timestamptz) from public,anon,authenticated;
grant execute on function public.realtoros_scan_task_reminders(integer,timestamptz) to service_role;
commit;
