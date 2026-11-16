# RealtorCRM device, preferences and notification refinement

Base: `84a7b05` (latest main at task start). Branch: `feature/crm-device-refinement`.

## Initial audit

- Vanilla JavaScript static SPA; hash routes in app.js, async store facade over the Supabase data service, workspace membership/RLS policies and server-owned automation. Existing design tokens, fonts, modal/toast, mobile navigation, search, push and settings components will be reused.
- Appearance was a two-state workspace setting, updated via an owner/admin-protected workspace write. It loaded after initial paint, did not listen for system appearance changes, and did not synchronize browser-native control color-scheme. A `light dark` meta preference allowed a dark OS to paint bare controls dark on an otherwise light application.
- Header CSS explicitly wrapped below 640px, with a text Search button and duplicate New action. Brand flex shrink and the avatar consumed competing space. The profile popup was only absolute/right-aligned, without visual-viewport collision handling; long identity values were clipped.
- All statistics were forced to a single column below 480px, including the pipeline summary. Mobile settings kept the full horizontal/wrapped category navigation visible above every section.
- Global search performed one fresh but unpaginated `select(*)` per entity, then filtered in the browser. PostgREST's row limit can truncate that read, so the existing large-workspace warning is legitimate. Reads use RLS; the replacement must preserve permission/context invalidation and never load records into another workspace's cache.
- Existing notification infrastructure already includes subscription RPCs, own-user RLS, preferences, cryptographic Web Push, notification leases, deduplication, expired-endpoint cleanup, worker dispatch, service-worker push/click events and real automation reminder scans. Frontend VAPID key is empty. Production keys, provider settings, scheduler/deployment status and physical-device delivery cannot be established from the repository.
- No localization layer exists; English literals are spread through renderers and shared feedback helpers. User-entered data must remain separate from message resources. Presentation preferences must be personal, not workspace-wide authorization fields.
- The eight referenced screenshots are not present in the available attachments. Reproducible browser captures will supply before/after evidence; no physical-device results will be claimed.

## Completed implementation

- Reused the existing tokens, fonts, app/store/Supabase boundaries, auth gate,
  modal/toast, navigation, settings and push queue. No framework, runtime
  dependency, competing component system, hosting change or website change.
- Personal Light/Dark/System appearance applies before CSS paint, follows OS
  changes in System mode, sets native `color-scheme`, and persists across reloads.
  A shared control rule fixes bare inputs/selects/search/date/textarea surfaces,
  placeholder/autofill contrast, focus and disabled states. Secondary text tokens
  were darkened/lightened to address actual axe contrast findings.
- Compact laptop auth layout keeps the existing property image and panel order,
  Google-first controls, five live password rules, recovery and confirmation.
  Full name/email share a row on desktop signup; mobile remains full-width.
  The English signup fits at 1280×720 without a clipped fixed-height form.
- Mobile header is one 58px row: menu, brand where it fits, search icon, theme,
  notifications, avatar. Duplicate top New is hidden; bottom New and unique
  contextual actions remain. Below 360px the redundant header wordmark is hidden
  rather than displaying a truncated brand. Bottom navigation/safe-area behavior
  and desktop navigation remain intact.
- Profile menu clamps to the visual viewport, wraps long identity values,
  scrolls internally when needed, preserves account/logout actions, supports
  outside tap, Escape, arrow/Home/End keys and focus restoration. Search uses the
  shared accessible modal, an inset icon, proper light/dark controls, a softer
  backdrop, a keyboard listbox and visual-viewport resize handling.
- Pipeline figures use a compact two-column mobile grid, with one column below
  360px. Formulas, stages, drag/drop and financial values are unchanged.
- Mobile settings use grouped full-width rows and a dedicated category view with
  Back navigation. Desktop retains an organized sidebar/content panel. Business
  Profile, appearance/language, notifications, pipeline, team/access, Sheets,
  import history, email sending, modules, dashboard, custom fields and data safety
  remain available with their existing permission and unsaved-change guards.
- Existing loading indicators and action-oriented contact/deal/task/follow-up
  empty states are retained, localized and styled consistently. Existing toast,
  error, busy and duplicate-submit safeguards remain in use.

## Localization architecture

`core/i18n.js` supplies a centralized gettext-style message API over the native
Intl APIs, appropriate to this dependency-free vanilla application. Seven JSON
catalogs contain **2,146 matching source keys** each: English, Deutsch, Français,
Español, Italiano, Português and العربية. Browser detection is used initially;
manual selection wins. Auth/desktop headers expose a globe control; mobile uses
profile > Language & Appearance. Language changes update marked text/attributes
without rebuilding the user's form or losing input values/event handlers.

Only source-authored messages are localized. Dynamic names, notes, addresses,
business records, custom labels/stages and canonical stored enum values stay
opaque. Placeholder identity/order, Unicode integrity, reserved-marker attacks
and entity handling have regression coverage. Arabic sets `lang=ar`/`dir=rtl`
with logical alignment and corrected drawer direction. Intl formats currency,
dates, relative times and counts while preserving configured currencies and
underlying values; no exchange-rate conversion occurs.

`core/preferences.js` caches only normalized theme/language/manualLanguage in
`realtorcrm.presentation.v1`. Authenticated preferences synchronize to the existing
verified user's `user_metadata.crm_preferences`. Saves serialize and recheck the
signed-in identity. Metadata is presentation only: it never grants a role,
workspace, approval or record permission. Restricted/private storage still allows
preferences for the current visit; failed account sync retains the device choice.

Reviewed seven-language confirmation/reset email templates are supplied in
`docs/auth-email-templates/`. Hosted template installation and delivery remain
manual. Unknown provider/backend error text safely falls back to its existing
English wording; customer content is never translated to imitate full coverage.
Native-language editorial review remains advisable before a multilingual release.

## Search and database changes

1. `20261116070656_crm_scoped_search.sql` adds generated search documents and GIN
   indexes to contacts, deals, properties and tasks. The client explicitly scopes
   workspace, retains existing RLS and permissions, sanitizes prefix terms,
   debounces requests and bounds results to 20 per category. Stale identity/
   workspace responses are rejected and never cached into another workspace.
   Large-workspace results no longer depend on a limited client-side record list.
   This is indexed token-prefix search, not arbitrary substring/fuzzy search;
   bounded results ask users to refine the query rather than promise every match.
2. `20261116070954_crm_notification_events.sql` extends the existing notification
   queue with new-lead, deal-assignment, daily task-summary and user-requested
   device-test events. Task summaries cover tomorrow, today and overdue work on
   the workspace's local calendar. Completed/later tasks are excluded. Existing
   lead replies, follow-up reminders and integration events remain connected.

No applied migration was edited. Both additions have rollback files, and local
SQL tests verify that rolling them back preserves business records. Generated
search columns/indexes are removable. Notification rollback deliberately disables
new producers/test requests and retains compatible event history, preferences,
subscriptions, constraints, queue safety and worker contracts.

## Notifications and security

Existing Web Push encryption/VAPID, subscription RPCs, own-user RLS, queue claims,
leases, deduplication, retries, quiet hours, service-worker push/click handling and
expired-endpoint cleanup are reused. Devices can be deliberately enabled,
renewed, removed and tested. Settings distinguish configuration required,
unsupported, permission required/blocked, enabled, disabled, renewal required and
unknown registration status. Permission is requested only after user action.
Queued or push-service-accepted is never described as verified device delivery.

The existing authenticated automation worker runs bounded task scans and dispatches
push. New lead/deal triggers use private, narrowly scoped definer functions; the
test RPC derives recipient/workspace from the session and validates ownership of
the registered endpoint, active membership, master opt-out and a per-user rate
limit. Claims check recipient/workspace membership, subscription scope and stale
deal reassignment. Search does not weaken any policy or use service credentials.
Lock-screen payloads use fixed seven-language, PII-free messages and safe internal
deep links. A verified recipient lookup supplies language only. Private VAPID and
worker secrets remain backend-only; no new secrets were generated or committed.

Detailed operational instructions: [notification runbook](../../Realtor%20main%20CRM/RealtorOS_Project/docs/crm-notifications-refinement.md).

## Verification and screenshots

Final local result: **664/664 tests passed across 55 targeted file runs**, zero skips; **52 English + 120 locale/theme screen cases**, **557 browser assertions**, and **18 axe audits with zero violations**. Production packaging/isolation passed. The historical Windows rollback diagnostic below is excluded from those passing targeted totals.


Final machine-readable results and exact commands are recorded beside this report
in `test-results.json`, `browser-results.json` and `packaging-results.json`.
The local browser harness and reproduction instructions are in
[BROWSER-QA.md](BROWSER-QA.md). Checks run serially, as required by AGENTS.md.
The project has no separate lint/typecheck build script; all 53 frontend scripts
are parsed, Edge modules are imported by the existing Node test loader, and the
actual production packager validates the emitted static app.

English screen matrix: 1024×768, 1280×720, 1366×768, 1440×900, 1920×1080;
320×700, 360×800, 375×812, 390×844, 414×896, 430×932; 768×1024 tablet and
844×390 landscape. Both auth modes, pipeline and settings are reviewed. Additional
English/German/Arabic × light/dark checks cover 120 screen combinations; profile
and search interaction checks cover all six requested phone widths. Automated
axe checks sample auth, pipeline, settings and open-search states. Browser
automation uses real application renderers with synthetic offline data, not a
hosted account or a fabricated product screenshot.

Actual local captures (ignored generated files):

- `final-1280-en-light-auth-create.png` and `final-1280-en-light-auth-sign-in.png`
- `final-390-en-light-auth-create.png` and `final-390-en-light-auth-sign-in.png`
- `final-390-en-light-pipeline.png`, `final-390-en-light-settings.png`
- `final-390-ar-dark-pipeline.png`, `final-390-ar-dark-settings.png`
- `final-390-de-search.png`; matching `before-1280-*` / `before-390-*` captures

All are Chrome emulation, **not physical-device evidence**. Android/iOS installed
PWA delivery, real virtual keyboards, hardware safe areas and screen readers need
staging/device verification. No database, OAuth provider, email provider or push
service was contacted by the application tests. No live production claim is made.

## Manual release configuration and order

Owner review/merge and a staging dry-run come first; this task does not merge or
deploy. Before any later production release:

1. Back up the database and dry-run the two additive migrations on a separate
   staging project with representative data. Measure generated-column/index
   creation and plan a migration window: table/index builds can lock large tables.
   Review database advisors against that staging database; hosted advisors were
   unavailable in this no-live-access task. Apply search, then notification SQL
   through the established owner SQL Editor process.
2. Configure matching VAPID public keys in the browser config/server environment;
   configure server-only `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and the existing
   `AUTOMATION_WORKER_SECRET`. Deploy the compatible `process-automation` function
   and arrange its authenticated scheduled invocation using the existing worker
   mechanism. Never expose either secret to browser code.
3. Review/install the confirmation/reset email templates in the existing Supabase
   Dashboard. Check SMTP, subjects, expiry and URL allowlist with synthetic users.
   Google Cloud's OAuth Web client must authorize the existing project callback
   `https://yanasorwmaybnabfuepn.supabase.co/auth/v1/callback`; enable Google in
   Supabase and set its client ID/secret there. Confirm the production CRM URL in
   Site URL/redirect allowlist. Existing OAuth redirects to the app's own URL;
   no temporary callback host was added. These dashboard settings were not changed
   or live-verified.
4. Only after database/worker compatibility and staging auth/CRUD checks pass,
   publish the CRM through its existing manually approved deployment workflow.
   The packager already substitutes the production Back to website URL in output
   only; source config/deployment workflows stay unchanged. Allow the existing
   PWA update prompt to replace the shell; do not force reload over unsaved work.
5. On physical Android and installed iOS/iPadOS 16.4+ devices, test themes, RTL,
   keyboard/forms, safe areas, account transitions, permissions, renewed/removed
   subscriptions, quiet hours, all event opt-outs, closed-app lock-screen delivery
   and notification-click routes. Confirm real OAuth, confirmation and recovery.

Rollback: retain backups and the last verified artifact. Roll the frontend search
back before dropping its derived search columns. Use the notification feature-
disable rollback to stop new producers while retaining compatible renderer/worker
support for history and queued events. It is intentionally not a destructive
schema rewind. Revert public templates via their saved Dashboard versions. No
rollback or release instruction was executed against hosted services.

## Requirement completion checklist

“Verified” below means the local unit/SQL/Edge/browser evidence described here.
External status explicitly excludes production and hardware verification.

| Requirement | Status | Evidence / remaining dependency |
|---|---|---|
| Initial architecture/root-cause audit | Completed and verified | Findings above; reused SPA/store/RLS/auth/PWA infrastructure |
| Brand/tokens/fonts, compact consistent components | Completed and verified | Existing brand retained; shared control and secondary-text corrections |
| 1. Light/Dark/System, persistence, pre-paint/native controls | Completed and verified | Preference tests, browser OS changes/reload and light/dark matrix |
| 2. Inputs, selects, filters, search, date/textarea/autofill | Completed and verified | Shared theme correction; native scheme and browser samples |
| 3. Sizes, spacing, focus, disabled/busy/error feedback | Completed and verified | Shared tokens/components; relevant form/navigation regressions |
| 4–5. Signup/sign-in, compact laptop/mobile, password rules | Completed and verified | Both modes/size matrix; existing email/password/auth tests |
| Hosted Google, real confirmation/recovery/session behavior | Implemented but awaiting external configuration or physical-device testing | Code-side integration/regressions pass; provider/dashboard/staging auth verification required |
| 6. Mobile header/brand/search icon/no duplicate New | Completed and verified | Six phone widths, one row; desktop retained |
| 7. Bottom nav/active states/no overlapping content | Completed and verified | Browser samples and existing PWA/header tests; hardware safe areas below |
| 8. Profile bounds/long identity/outside/Escape/actions | Completed and verified | Real browser at six phone widths and keyboard checks |
| 9. Search modal/focus/listbox/scoped indexed search | Completed and verified | Browser/axe + frontend/SQL isolation and bounded-result tests |
| 10. Compact pipeline stats/filters/unchanged calculations | Completed and verified | Responsive screenshots + deals/commission/finance regressions |
| Physical touch drag/drop and installed PWA navigation | Implemented but awaiting external configuration or physical-device testing | Existing handlers preserved; no physical device available |
| 11. Grouped settings/dedicated category/back/all controls | Completed and verified | Settings/nav/save and permission tests; desktop/mobile browser review |
| 12. Seven languages/full system message catalogs/selector | Completed and verified | 2,146 keys per language; parity/placeholders/Unicode/live binding tests |
| Browser detection/manual override/local/account language | Completed and verified | Preferences tests and locale reload checks; hosted account sync smoke test still required |
| Arabic RTL/long German/Intl dates,numbers,currency | Completed and verified | Additional locale/theme browser matrix; currencies preserved |
| Localized Auth emails/provider-owned or unknown errors | Implemented but awaiting external configuration or physical-device testing | Reviewable templates provided; Dashboard/email-client delivery and native editorial review remain |
| 13. Push registration/renewal/removal/status/user action | Completed and verified | Existing RPC/worker + new device-status/renewal/test regressions |
| Real scoped events/preferences/dedupe/retries/expiry/deep links | Completed and verified | Local SQL/Edge crypto, authorization, reminder and locale tests |
| Production VAPID/scheduler/background Android/iOS delivery | Implemented but awaiting external configuration or physical-device testing | Keys/scheduler/deployment and installed physical devices are required |
| 14. Relevant empty states/actions | Completed and verified | Existing entity actions retained; localized empty/filter states |
| 15. Responsive overflow/grids/dropdowns/modals | Completed and verified | Listed desktop/mobile/tablet/landscape browser matrices |
| 16–17. Loading and clear error/success feedback | Completed and verified | Existing loaders/toasts/busy guards retained and localized |
| 18. Names/labels/keyboard/focus/contrast/reduced motion | Completed and verified | Auth/header/search/modal tests and sampled axe audits |
| Physical screen-reader/virtual-keyboard/OS behavior | Implemented but awaiting external configuration or physical-device testing | Emulation cannot establish hardware or assistive-technology compatibility |
| Data/RLS/permissions/auth/integrations/calculations safety | Completed and verified | Existing targeted regressions + new cross-workspace/permission/rollback tests; no live writes |
| Production build/packaging/PWA/deployment isolation | Completed and verified | 79-file package; isolation validator; real worker unit tests |
| Eight attached screenshot comparisons | Blocked | The referenced eight attachments were unavailable; base-branch before/after evidence supplied instead |
| Production-ready release approval | Blocked | Await owner review, hosted staging/configuration/advisors and real-device verification; nothing merged/deployed |

## Historical Windows test limitation

A broad run of the legacy rollback-file checks was attempted and hit its 240-second per-file runner limit. A focused reproduction of the old T2c rollback fails its embedded function-body MD5 check on CRLF checkout text. The unchanged file hashes to `033003d98ecc970317971ca5f538a3eb` locally; converting that body to canonical LF produces its embedded expected `1bfcaf5fa10f7013a8c0193a9ab988cb`. No historical SQL or checksum assertion was edited. This is documented in `windows-rollback-diagnostic.json`; these legacy Windows checks are not reported as passing. The new feature rollback tests and rollback-file coverage check pass. Canonical Linux CI is reported separately in the final delivery.

## Git delivery and test commands

Branch: `feature/crm-device-refinement`, based on `84a7b05`. Focused implementation,
backend/migration and QA/report commits are listed in the final delivery message. Implementation: `cdc24e7`; additive backend: `c36d260`.
Generated screenshots, local test dependencies, database caches, downloaded CLI
and checker binaries are excluded from Git. No unrelated branch or local main was
reset. See `files-changed.txt` for the exact reviewed file inventory.

Each entry in `test-results.json` contains its exact serial command. All targeted
commands run from `Realtor main CRM/RealtorOS_Project/tests` in this form:

```powershell
node --import ./helpers/register.mjs --test --test-concurrency=1 <listed-file>
```

Packaging runs from the repository root:

```powershell
node deployment/package-crm.mjs
node deployment/assert-isolation.mjs crm deployment/dist-crm
git diff --check
```

Optional owner-only full-suite follow-up, not run locally by this task:
`npm run test:quiet`. Do not run it concurrently with other checks.
