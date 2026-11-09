-- Follow-up completion: make realtoros_complete_followup workspace-era
-- correct, so the Quick Log can use it as its single atomic write.
--
-- THE FUNCTION'S CONTRACT DOES NOT CHANGE. Same name, same signature,
-- same return shape ({activity, contact}), same grants, and the same
-- always-set date semantics the Daily View follow-up modal already
-- relies on: p_next_follow_up is written as given, so a date sets the
-- next follow-up and NULL clears it. Callers must resolve the value
-- explicitly (the frontend refuses an omitted/undefined value before
-- the RPC is ever called).
--
-- WHAT WAS WRONG WITH THE PREVIOUS DEFINITION (2026-08-31, pre-dating
-- the workspace backend):
--
-- 1. Its contact UPDATE was keyed on user_id = auth.uid(): the
--    pre-workspace ownership model. Under the workspace permission
--    model (Phase T2b2 RLS), a member who may legitimately edit a
--    contact — an admin, or the member the contact is assigned to —
--    was refused whenever somebody else created the contact.
-- 2. Its activity INSERT never set workspace_id (a NOT NULL column
--    since Phase T2a). It only worked because the Phase T2a compat
--    trigger silently derives the workspace from the activity's
--    user_id — the CREATOR's workspace. The contact's own workspace is
--    the correct source: it is the row being acted on, and deriving
--    from the actor is a coincidence of the single-active-workspace
--    model rather than a property of the data.
--
-- THE FIX, keeping SECURITY INVOKER so RLS remains the authority:
--
-- - The contact is resolved first, through RLS: a caller who cannot
--   see the contact gets the same 'not found' answer as for a contact
--   that does not exist.
-- - The activity is written into the CONTACT's workspace (never a
--   workspace id supplied by the client).
-- - The contact UPDATE no longer keys on user_id; RLS decides whether
--   the caller may update the row, and a refused update raises, which
--   rolls the activity insert back with it — the pair is atomic.
-- - An activity whose contact_id disagrees with p_contact_id is
--   refused, so a follow-up can never be logged against one contact
--   while advancing another.
--
-- Idempotent (create or replace, grants re-asserted). Additive: no
-- table, column, policy, or other function is touched.

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
  v_activity_contact text := nullif(p_activity->>'contact_id', '');
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
  if v_activity_contact is not null and v_activity_contact <> p_contact_id then
    raise exception 'Activity contact does not match the follow-up contact';
  end if;

  -- Resolve the contact first, through RLS. Its workspace — never
  -- anything the client sent — is where the activity belongs.
  select * into v_contact from public.contacts where id = p_contact_id;
  if v_contact.id is null then
    raise exception 'Contact not found or not owned by current user';
  end if;

  insert into public.activities (
    id, user_id, workspace_id, type, contact_id, property_id, deal_id, task_id, subject, notes, outcome, date
  ) values (
    p_activity->>'id', v_uid, v_contact.workspace_id,
    coalesce(p_activity->>'type','Note'),
    p_contact_id,
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
  where id = p_contact_id
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
