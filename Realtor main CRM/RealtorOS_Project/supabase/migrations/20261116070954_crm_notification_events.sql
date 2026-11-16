-- Local, additive Phase 6. No HTTP, scheduling, secrets, or historical-event backfill.
-- Existing notification rows remain the push queue; existing leases/retries/quiet hours apply.
create or replace function automation_internal.push_notification_types()
returns text[] language sql immutable set search_path = '' as $$
  select array['lead_replied','hot_reply','unsubscribed','spam_report','email_bounced',
    'import_finished','followup_failed','contact_untouched','overdue_followups',
    'new_lead','task_reminder','deal_assigned','push_test']::text[];
$$;
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any(automation_internal.push_notification_types()));
alter table public.notifications drop constraint if exists notifications_link_route_check;
alter table public.notifications add constraint notifications_link_route_check check (
  link_route is null or link_route ~ '^/(contacts(/[A-Za-z0-9_-]{1,120})?|pipeline(/[A-Za-z0-9_-]{1,120})?|tasks|settings/sheet-imports|automation|notifications)$');

-- The server-side equivalent of the existing scoped SELECT policies. Never grant this
-- to browser roles: it answers about another member. Fail closed on inactive members.
create or replace function automation_internal.notification_can_view(
  p_workspace uuid, p_user uuid, p_area text, p_creator uuid, p_assignee text
)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace and wm.user_id = p_user and wm.status = 'active'
      and (
        automation_internal.member_permissions(p_workspace,p_user) #>> array[p_area,'view'] = 'all'
        or (automation_internal.member_permissions(p_workspace,p_user) #>> array[p_area,'view'] = 'own'
          and (wm.user_id = p_creator or wm.team_member_id = p_assignee))
        or (p_area = 'contacts' and p_assignee is null
          and automation_internal.member_can(p_workspace,p_user,'unassigned_view'))
      )
  );
$$;
revoke all on function automation_internal.notification_can_view(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function automation_internal.notification_can_view(uuid,uuid,text,uuid,text) to service_role;

-- These trigger functions need narrowly scoped definer rights because browser table
-- writes must not acquire an INSERT grant on notifications. They accept no arguments,
-- run only after the normal entity RLS/assignment guards, derive recipients from active
-- memberships, and expose neither names nor user-entered titles in lock-screen copy.
create or replace function automation_internal.notify_new_crm_lead()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if new.status <> 'New Lead' then return null; end if;
  for r in select wm.user_id from public.workspace_members wm
    where wm.workspace_id = new.workspace_id and wm.status = 'active'
      and (wm.user_id = new.user_id or wm.team_member_id = new.assigned_to_id
        or automation_internal.member_can(new.workspace_id,wm.user_id,'contacts_assign')
        or (new.assigned_to_id is null and automation_internal.member_can(new.workspace_id,wm.user_id,'unassigned_view')))
  loop
    if automation_internal.notification_can_view(new.workspace_id,r.user_id,'contacts',new.user_id,new.assigned_to_id) then
      perform automation_internal.notify_many(array[r.user_id],new.workspace_id,'new_lead',
        'A new lead is ready','Open Contacts to review the new lead.',new.id,
        automation_internal.notification_contact_route(new.id),
        'new_lead:' || new.workspace_id::text || ':' || md5(new.id),
        jsonb_build_object('record_id',new.id));
    end if;
  end loop;
  return null;
exception when others then
  raise warning 'CRM new-lead notification failed (SQLSTATE %).', sqlstate;
  return null;
end;
$$;
revoke all on function automation_internal.notify_new_crm_lead() from public,anon,authenticated;
drop trigger if exists notify_new_crm_lead on public.contacts;
create trigger notify_new_crm_lead after insert on public.contacts
  for each row execute function automation_internal.notify_new_crm_lead();

create or replace function automation_internal.notify_crm_deal_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record; v_route text;
begin
  if new.assigned_to_id is null then return null; end if;
  if tg_op = 'UPDATE' then
    if new.assigned_to_id is not distinct from old.assigned_to_id then return null; end if;
  end if;
  v_route := case when new.id ~ '^[A-Za-z0-9_-]{1,120}$' then '/pipeline/' || new.id else '/pipeline' end;
  for r in select wm.user_id from public.workspace_members wm
    where wm.workspace_id = new.workspace_id and wm.status = 'active'
      and wm.team_member_id = new.assigned_to_id
  loop
    if automation_internal.notification_can_view(new.workspace_id,r.user_id,'deals',new.user_id,new.assigned_to_id) then
      perform automation_internal.notify_many(array[r.user_id],new.workspace_id,'deal_assigned',
        'A deal was assigned to you','Open the deal to review your next steps.',null,v_route,
        'deal_assigned:' || new.workspace_id::text || ':' || md5(new.id) || ':' || md5(new.assigned_to_id) || ':' || txid_current()::text,
        jsonb_build_object('record_id',new.id));
    end if;
  end loop;
  return null;
exception when others then
  raise warning 'CRM deal-assignment notification failed (SQLSTATE %).', sqlstate;
  return null;
end;
$$;
revoke all on function automation_internal.notify_crm_deal_assignment() from public,anon,authenticated;
drop trigger if exists notify_crm_deal_assignment on public.deals;
create trigger notify_crm_deal_assignment after insert or update of assigned_to_id on public.deals
  for each row execute function automation_internal.notify_crm_deal_assignment();

create index if not exists tasks_notification_due_idx on public.tasks(workspace_id,due_date)
  where due_date is not null and status <> 'Completed' and not completed;

-- One daily summary per recipient/workspace, not one buzz per task. Called by the
-- existing authenticated machine worker, before its existing push claim.
create or replace function public.realtoros_scan_task_reminders(p_limit integer default 100, p_now timestamptz default now())
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r record; v_count integer := 0;
begin
  for r in
    select wm.workspace_id,wm.user_id,
      (coalesce(p_now,now()) at time zone automation_internal.workspace_timezone(wm.workspace_id))::date as local_day,
      count(*) filter (where t.due_date = (coalesce(p_now,now()) at time zone automation_internal.workspace_timezone(wm.workspace_id))::date) as due_today,
      count(*) filter (where t.due_date < (coalesce(p_now,now()) at time zone automation_internal.workspace_timezone(wm.workspace_id))::date) as overdue,
      count(*) filter (where t.due_date > (coalesce(p_now,now()) at time zone automation_internal.workspace_timezone(wm.workspace_id))::date) as upcoming
    from public.workspace_members wm
    join public.tasks t on t.workspace_id = wm.workspace_id
      and t.due_date <= (coalesce(p_now,now()) at time zone automation_internal.workspace_timezone(wm.workspace_id))::date + 1
      and t.status <> 'Completed' and not t.completed
    where wm.status = 'active'
      -- Prefer the assignee; notify the creator only if a task is unassigned.
      and (wm.team_member_id = t.assigned_to_id or (t.assigned_to_id is null and wm.user_id = t.user_id))
      and automation_internal.notification_can_view(wm.workspace_id,wm.user_id,'work',t.user_id,t.assigned_to_id)
      and not exists (select 1 from public.notifications n where n.user_id = wm.user_id
        and n.dedupe_key = 'task_reminder:' || wm.workspace_id::text || ':' ||
          (coalesce(p_now,now()) at time zone automation_internal.workspace_timezone(wm.workspace_id))::date::text)
    group by wm.workspace_id,wm.user_id
    order by wm.workspace_id,wm.user_id
    limit greatest(1,least(coalesce(p_limit,100),500))
  loop
    v_count := v_count + automation_internal.notify_many(array[r.user_id],r.workspace_id,'task_reminder',
      'Tasks need your attention',format('Due tomorrow: %s. Due today: %s. Overdue: %s. Open Tasks to review.',r.upcoming,r.due_today,r.overdue),
      null,'/tasks','task_reminder:' || r.workspace_id::text || ':' || r.local_day::text,
      jsonb_build_object('due_today',r.due_today,'overdue',r.overdue,'upcoming',r.upcoming));
  end loop;
  return jsonb_build_object('summaries',v_count);
end;
$$;
revoke all on function public.realtoros_scan_task_reminders(integer,timestamptz) from public,anon,authenticated;
grant execute on function public.realtoros_scan_task_reminders(integer,timestamptz) to service_role;

-- User-initiated end-to-end test. The caller cannot choose a recipient, workspace,
-- text or route. A subscription UUID targets only this device without storing its
-- endpoint in notification metadata. Master opt-out and quiet hours still apply.
create or replace function public.realtoros_request_push_test(p_endpoint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid()); v_ws uuid; v_sub uuid; v_id uuid;
begin
  if v_user is null then return jsonb_build_object('outcome','not_signed_in'); end if;
  v_ws := authz.my_workspace_id();
  if v_ws is null then return jsonb_build_object('outcome','no_workspace'); end if;
  select s.id into v_sub from public.push_subscriptions s
    where s.user_id = v_user and s.workspace_id = v_ws and s.endpoint = p_endpoint;
  if v_sub is null then return jsonb_build_object('outcome','no_device'); end if;
  if exists (select 1 from public.notification_preferences p where p.user_id=v_user and not p.push_enabled) then
    return jsonb_build_object('outcome','notifications_off');
  end if;
  -- Serialize across all of this caller's devices, not just one endpoint.
  perform 1 from public.workspace_members where workspace_id = v_ws and user_id = v_user and status = 'active' for update;
  if not found then return jsonb_build_object('outcome','no_workspace'); end if;
  perform 1 from public.push_subscriptions where id=v_sub and user_id=v_user and workspace_id=v_ws for update;
  if not found then return jsonb_build_object('outcome','no_device'); end if;
  if exists (select 1 from public.notifications n where n.user_id=v_user and n.type='push_test'
    and n.created_at > now() - interval '1 minute') then
    return jsonb_build_object('outcome','rate_limited');
  end if;
  perform automation_internal.notify_many(array[v_user],v_ws,'push_test','Test notification',
    'You can receive RealtorCRM notifications on this device.',null,'/notifications',
    'push_test:' || gen_random_uuid()::text,jsonb_build_object('subscription_id',v_sub));
  return jsonb_build_object('outcome','queued');
end;
$$;
revoke all on function public.realtoros_request_push_test(text) from public,anon;
grant execute on function public.realtoros_request_push_test(text) to authenticated;

-- Preserve the existing quiet-hour deferral, SKIP LOCKED claim and two-minute lease.
create or replace function public.realtoros_claim_push_batch(
  p_limit integer default 20,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $fn$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 100));
  v_now timestamptz := coalesce(p_now, now());
  v_row record;
  v_prefs record;
  v_tz text;
  v_local timestamp;
  v_time time;
  v_quiet boolean;
  v_resume timestamptz;
  v_subs jsonb;
  v_out jsonb := '[]'::jsonb;
  v_skipped integer := 0;
  v_deferred integer := 0;
begin
  for v_row in
    select n.id, n.user_id, n.workspace_id, n.type, n.title, n.body, n.link_route, n.metadata
      from public.notifications n
     where n.push_status = 'pending'
       and (n.push_locked_until is null or n.push_locked_until < v_now)
     order by n.created_at
     limit v_limit
     for update skip locked
  loop
    -- Reject orphaned/workspace-moved recipients before any push service sees a payload.
    if not exists (select 1 from public.workspace_members wm
      where wm.workspace_id=v_row.workspace_id and wm.user_id=v_row.user_id and wm.status='active')
      or (v_row.type = 'deal_assigned' and not exists (
        select 1 from public.deals d join public.workspace_members wm
          on wm.workspace_id=d.workspace_id and wm.user_id=v_row.user_id and wm.status='active'
        where d.workspace_id=v_row.workspace_id and d.id=v_row.metadata->>'record_id'
          and d.assigned_to_id=wm.team_member_id
          and automation_internal.notification_can_view(d.workspace_id,wm.user_id,'deals',d.user_id,d.assigned_to_id)))
    then
      update public.notifications set push_status='skipped',push_locked_until=null where id=v_row.id;
      v_skipped := v_skipped+1;
      continue;
    end if;
    -- Preferences, or the defaults if this person has never opened the
    -- settings screen.
    select coalesce(p.push_enabled, true) as push_enabled,
           coalesce(p.push_types, automation_internal.push_notification_types()) as push_types,
           p.quiet_start, p.quiet_end
      into v_prefs
      from (select 1) one
      -- Preferences are per person: preserve their opt-out across workspace moves.
      left join public.notification_preferences p on p.user_id = v_row.user_id;

    -- Switched off, or this kind switched off.
    if not v_prefs.push_enabled or (v_row.type <> 'push_test' and not (v_row.type = any (v_prefs.push_types))) then
      update public.notifications
         set push_status = 'skipped', push_locked_until = null
       where id = v_row.id;
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- Quiet hours, in the workspace's own time zone. A window that wraps
    -- midnight (22:00 to 07:00, the normal case) is the OR; one that does
    -- not (09:00 to 17:00) is the AND.
    if v_prefs.quiet_start is not null then
      v_tz := automation_internal.workspace_timezone(v_row.workspace_id);
      v_local := v_now at time zone v_tz;
      v_time := v_local::time;
      v_quiet := case
        when v_prefs.quiet_start < v_prefs.quiet_end
          then v_time >= v_prefs.quiet_start and v_time < v_prefs.quiet_end
        when v_prefs.quiet_start > v_prefs.quiet_end
          then v_time >= v_prefs.quiet_start or v_time < v_prefs.quiet_end
        -- start = end is a zero-length window, not a whole day of silence.
        else false
      end;
      if v_quiet then
        -- Held, not dropped: it goes out when the window ends, which is
        -- the next time quiet_end comes round locally.
        v_resume := (case
          when v_time < v_prefs.quiet_end
            then date_trunc('day', v_local)::date + v_prefs.quiet_end
          else date_trunc('day', v_local)::date + 1 + v_prefs.quiet_end
        end) at time zone v_tz;
        update public.notifications
           set push_locked_until = v_resume
         where id = v_row.id;
        v_deferred := v_deferred + 1;
        continue;
      end if;
    end if;

    -- The devices. Ordered oldest first, and by endpoint under COLLATE
    -- "C" to break ties the same way on every server.
    select coalesce(jsonb_agg(jsonb_build_object(
             'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)
             order by s.created_at, s.endpoint collate "C"), '[]'::jsonb)
      into v_subs
      from public.push_subscriptions s
     where s.user_id = v_row.user_id and s.workspace_id = v_row.workspace_id
       and (v_row.type <> 'push_test' or s.id::text = v_row.metadata->>'subscription_id');

    if jsonb_array_length(v_subs) = 0 then
      update public.notifications
         set push_status = 'skipped', push_locked_until = null
       where id = v_row.id;
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- Leased for two minutes: long enough for a slow push service, short
    -- enough that a worker killed mid-batch costs one cycle.
    update public.notifications
       set push_locked_until = v_now + interval '2 minutes'
     where id = v_row.id;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', v_row.id,
      'user_id', v_row.user_id,
      'type', v_row.type,
      'title', v_row.title,
      'body', v_row.body,
      -- The app route, which is all the payload is allowed to carry
      -- besides the two lines of text.
      'url', v_row.link_route,
      'subscriptions', v_subs));
  end loop;

  return jsonb_build_object('claimed', v_out, 'skipped', v_skipped, 'deferred', v_deferred);
end;
$fn$;
revoke all on function public.realtoros_claim_push_batch(integer,timestamptz) from public,anon,authenticated;
grant execute on function public.realtoros_claim_push_batch(integer,timestamptz) to service_role;
