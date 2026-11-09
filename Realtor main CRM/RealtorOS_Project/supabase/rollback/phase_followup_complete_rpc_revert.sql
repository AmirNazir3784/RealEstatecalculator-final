-- Revert for 20261109120000_followup_complete_rpc_workspace.sql
--
-- Restores realtoros_complete_followup EXACTLY as defined by
-- 20260831114425_remove_sample_data_feature.sql (the pre-workspace
-- definition: no workspace_id on the activity insert, contact update
-- keyed on user_id). Only run this to back the 2026-11-09 change out;
-- understand that the restored definition is the one the fix replaced.

create or replace function public.realtoros_complete_followup(
  p_activity jsonb,
  p_contact_id text,
  p_last_contact date,
  p_next_follow_up date
)
returns jsonb
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_activity public.activities;
  v_contact public.contacts;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_activity->>'id' is null or p_activity->>'id' = '' then
    raise exception 'Activity id is required';
  end if;
  if p_contact_id is null or p_contact_id = '' then
    raise exception 'Contact id is required';
  end if;

  insert into public.activities (
    id, user_id, type, contact_id, property_id, deal_id, task_id, subject, notes, outcome, date
  ) values (
    p_activity->>'id', v_uid,
    coalesce(p_activity->>'type','Note'),
    nullif(p_activity->>'contact_id',''),
    nullif(p_activity->>'property_id',''),
    nullif(p_activity->>'deal_id',''),
    nullif(p_activity->>'task_id',''),
    coalesce(p_activity->>'subject',''),
    coalesce(p_activity->>'notes',''),
    coalesce(p_activity->>'outcome',''),
    coalesce((p_activity->>'date')::timestamptz, now())
  )
  returning * into v_activity;

  update public.contacts
  set last_contact = p_last_contact,
      next_follow_up = p_next_follow_up
  where id = p_contact_id and user_id = v_uid
  returning * into v_contact;

  if v_contact.id is null then
    raise exception 'Contact not found or not owned by current user';
  end if;

  return jsonb_build_object('activity', to_jsonb(v_activity), 'contact', to_jsonb(v_contact));
end;
$function$;

revoke all on function public.realtoros_complete_followup(jsonb, text, date, date) from public;
revoke all on function public.realtoros_complete_followup(jsonb, text, date, date) from anon;
grant execute on function public.realtoros_complete_followup(jsonb, text, date, date) to authenticated;
