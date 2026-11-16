# CRM notifications refinement

## Implemented locally

- `20261116070954_crm_notification_events.sql` adds immediate `new_lead` events for newly inserted New Lead contacts, `deal_assigned` events for newly assigned deals, a bounded daily `task_reminder` summary of upcoming (tomorrow), due and overdue tasks per active recipient/workspace, and an explicit `push_test` request.
- Lead recipients must be active workspace members with access to the contact: its creator, assigned member, assignment managers, or permitted members of the unassigned pool. Deal events reach the active assignee only, with deal view permission. Tasks reach their active assignee, or their creator when unassigned, with work view permission. Completed tasks and tasks due after tomorrow are excluded. The workspace-local daily summary covers tomorrow, today and overdue work. The legacy sample feature/columns were removed by an existing migration and are not referenced.
- New trigger functions use narrowly scoped private-schema definer rights because browser writes cannot insert notification rows. No new browser table write grants, RLS bypass endpoints, account-wide recipient parameters, or editable notification content are introduced. Every callable function explicitly revokes default public access.
- Fixed notification titles/bodies contain no customer names, addresses, phone numbers, email addresses, deal titles, or task titles. Notification metadata holds record IDs/counts or a subscription UUID. The worker sends only title, body and an internal route. Existing notifications remain the only delivery queue.
- Dedupe is per recipient: one lead event per contact/workspace, one deal assignment per assignment/transaction, and one task summary per local day/workspace. Harmless entity edits create no new immediate event. Task scans are capped at 100 recipient groups per worker call (500 server ceiling).
- The existing machine worker runs the new task scan before claiming push work. Scan failures are counted and do not interrupt automation/email processing. Existing retry, dead-endpoint pruning, quiet-hour deferral and two-minute claim leases remain in use.
- The push claim now also checks active recipient membership, matches subscriptions to the notification workspace, and suppresses stale deal-assignment pushes after reassignment. Per-person preferences preserve the user's opt-out across workspace moves. No workspace routing is derived from request parameters.
- Device status checks the existing server device list as well as browser permission. Missing registrations, expired/key-changed subscriptions, and repeatedly failing devices offer deliberate renewal. Lookup failures have an explicit unknown state. Opening Settings does not silently re-register a device removed elsewhere.
- Settings can queue a test for the current device. The guarded RPC derives user/workspace from the signed-in session, checks ownership of the endpoint, serializes against the caller's membership, and limits requests to one per minute across devices. An explicit test bypasses type filtering but honors master opt-out and quiet hours. `queued` means queued, never delivered.
- Browser notification routes include `/tasks` and `/pipeline[/id]`; both browser and service-worker allowlists must agree with the SQL constraint. The four new types have explicit UI labels. All 13 fixed system-event templates are localized in the browser through `App.i18n` and in actual push payloads through `_shared/notification-copy.ts` (English, Spanish, French, German, Italian, Portuguese and Arabic). The machine worker uses the service-only claim recipient ID to read that verified Auth user's `user_metadata.crm_preferences.language`, validates it against the seven-language allowlist, caches per recipient/batch and falls back to English on failure. This user-editable preference affects presentation only, never authorization. Payloads never reuse a stored free-text notification title/body.

## Dependencies and external configuration

These source changes do not apply a migration, deploy an Edge Function, create secrets, schedule a worker, or contact a hosted project. The owner must review and dry-run the additive migration locally, then apply it through the established SQL Editor workflow. Deploy the compatible worker/frontend only after the database functions exist.

Existing go-live requirements remain: HTTPS (or a trustworthy local origin), a registered service worker, browser permission granted by deliberate user action, a matching browser `vapidPublicKey` and server `VAPID_PUBLIC_KEY`, server-only `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`, and a scheduled authenticated `process-automation` invocation using the existing `AUTOMATION_WORKER_SECRET`. No values or secrets belong in this document. The browser public key alone cannot prove that the worker, server key, or schedule is configured.

On iPhone/iPad, install to the Home Screen and use iOS/iPadOS 16.4 or later. OS notification settings, focus modes, network access and push-service availability can delay or prevent display. A push service accepting a request is not proof that a person saw it. Offline local checks cannot verify physical-device delivery.

Before production sign-off, use disposable test accounts/workspaces on a separate test project: turn on notifications through Settings, send a device test, run the authorized worker, verify lock-screen display and tap routing, then repeat with the CRM closed, quiet hours, permission denied, master opt-out, type opt-out, renewed/removed devices, reassigned deals and removed workspace members. Check both Android/desktop and installed iOS. Use synthetic data only. No such hosted or physical-device verification was performed by this implementation task.

## Verification handoff

Targeted offline tests were run serially by the main agent; final counts are recorded in review/crm-device-refinement/IMPLEMENTATION.md. From `RealtorOS_Project/tests`, run one command at a time:

```powershell
node --import ./helpers/register.mjs --test --test-concurrency=1 sql/crm-notification-events.test.mjs
node --import ./helpers/register.mjs --test --test-concurrency=1 frontend/crm-push-renewal.test.mjs
node --import ./helpers/register.mjs --test --test-concurrency=1 edge/crm-task-reminders.test.mjs
node --import ./helpers/register.mjs --test --test-concurrency=1 edge/crm-notification-locales.test.mjs
node --import ./helpers/register.mjs --test --test-concurrency=1 sql/phase_3b_push.test.mjs
node --import ./helpers/register.mjs --test --test-concurrency=1 frontend/push-settings.test.mjs
node --import ./helpers/register.mjs --test --test-concurrency=1 edge/push-sending.test.mjs
```

Existing fixtures must reflect the new behavior: all_types now contains 13 entries, successful registration must add the endpoint to a fake device list, and newly inserted New Lead contacts now create an immediate notification. Preserve existing event-specific assertions by filtering their types, rather than disabling the new producer. The new SQL tests exercise real local migrations/RLS, not a network service. The new SQL regression also covers two-member permission denial, removed members, cross-workspace subscriptions and stale reassignment. Repeat those cases in the owner's staging smoke test before release.

The full suite is an owner-only optional follow-up: `npm run test:quiet`. Do not run it concurrently with targeted checks.

## Rollback

Review `supabase/rollback/crm_notification_events_revert.sql` as a **compatible feature-disable rollback**, not a schema rewind. It removes the immediate lead/deal producer triggers and their functions, removes the test RPC, and replaces the task scanner with a service-only no-op so the worker keeps its existing contract. It does not delete, rewrite or reset any notification, preference, device or CRM record.

The additive 13-type and route constraints, hardened push claim, permission helper and supporting index intentionally remain. They keep historical/new-type rows readable and queued work compatible. Existing queued rows can still be delivered under the preserved master opt-outs, type preferences, quiet hours, membership checks and leases. The extra service-only claim recipient ID is compatible with older workers, which ignore it. Keep the compatible notification renderer/copy module to display retained event types. The Test button will report that its request could not be queued after its RPC is removed; hide that action in a corresponding frontend rollback if desired.

To re-enable producers later, review and reapply the additive notification migration. Its idempotent definitions restore the scanner/test RPC/triggers without modifying stored preferences or historical rows. No rollback SQL was applied locally or to a hosted project in this task.

## English source messages for catalog extension

The main agent owns catalog changes. Add these source keys in every supported locale. The authoritative seven-language push translations are the `rows` table in `_shared/notification-copy.ts`; the browser source map is checked against it by `crm-notification-locales.test.mjs`. Messages already present in the English catalog at handoff are omitted below.

- Phone notifications are not configured for this app.
- Ask your workspace administrator to finish notification setup.
- This browser is registered. Delivery also depends on your preferences and device settings.
- A new lead arrives
- A new lead you can access is ready to review.
- Tasks need attention
- A daily summary of upcoming, due and overdue tasks.
- A deal is assigned to me
- A deal is assigned to your active team account.
- Test notification
- Sent only when you request a device test.
- This device needs notification renewal.
- Renew to register this browser again. This also replaces an expired subscription.
- Device registration could not be checked.
- Check your connection and refresh. Browser permission alone does not confirm delivery.
- Renew notifications on this device
- Send test notification
- A test is queued for this device. Delivery depends on the worker and your quiet hours.
- Refresh status
- Notification settings could not be loaded. Refresh before making changes.
- Notifications renewed for this device.
- Could not renew notifications. Check browser permission and try again.
- Test queued. It will arrive when the worker runs outside quiet hours.
- Wait a minute before sending another test notification.
- Turn on Send notifications to my devices before testing.
- Renew this device before sending a test notification.
- Could not queue the test notification. Try again.
- New lead
- Task reminder
- Deal assigned
- A new lead is ready
- Open Contacts to review the new lead.
- A deal was assigned to you
- Open the deal to review your next steps.
- You can receive RealtorCRM notifications on this device.
- Tasks need your attention
- A lead replied
- Open your inbox to review the reply.
- A lead showed strong interest
- Open your inbox and review your next steps.
- A contact unsubscribed
- Email follow-ups have stopped for this contact.
- A contact reported spam
- Review the contact's email preferences before following up.
- An email could not be delivered
- Review the contact's email address before sending again.
- A lead import finished
- Open import history to review the results.
- A follow-up needs attention
- Open your follow-up plans to review a failed step.
- A lead is waiting for contact
- Open Contacts to review leads that need a response.
- Follow-ups are overdue
- Open Contacts to review your overdue follow-ups.
- Open Tasks to review your upcoming, due and overdue work.
- A lead replies
- Somebody answers one of your emails.
- A reply looks hot
- A reply that reads like real interest.
- Somebody unsubscribes
- A contact opts out of your emails.
- An email is marked as spam
- Worth knowing quickly.
- An email bounces
- The address did not accept it.
- An import finishes
- A Google Sheet or file import is done.
- A sequence step fails
- Something in an automation could not run.
- A new lead goes untouched
- Nobody has replied to them yet.
- Your daily summary of what is late.

Documentation consulted: [Supabase trigger functions](https://supabase.com/docs/guides/database/postgres/triggers), [Edge Function authorization](https://supabase.com/docs/guides/functions/auth), and [CLI v3 local defaults](https://supabase.com/changelog/supabase-cli-v3). Existing machine authentication was preserved.
