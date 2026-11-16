Mobile theme preferences previously loaded late and native controls could use the
OS dark scheme on a light page. The header wrapped, profile menus could escape
the viewport, settings kept their whole navigation above the selected section,
and search filtered a capped client-side record list. This change fixes those
shared causes while retaining the existing RealtorCRM brand, architecture,
authentication, permissions and business calculations.

- Personal Light/Dark/System appearance and seven-language preferences, persisted
  locally and in presentation-only Auth metadata. Central catalogs cover 2,146
  source messages per language, with Arabic RTL and Intl formatting. User-entered
  records, names, custom labels and stored enums are kept opaque.
- Compact auth/laptop layouts, one-row mobile header, viewport-safe profile menu,
  themed keyboard-accessible search, compact pipeline statistics and grouped
  mobile settings with dedicated category/back navigation.
- Indexed token-prefix search for contacts/deals/properties/tasks, explicitly
  workspace-scoped under unchanged RLS, debounced and bounded to 20 per category.
- Reuses the real push queue/worker/service worker: new-lead and assigned-deal
  events, daily upcoming/due/overdue task summaries, device renewal, truthful
  permission/configuration status, guarded device tests, fixed localized payloads,
  membership/endpoint checks, deduplication and safe deep links.

Validation: **664/664 targeted tests across 55 serial file runs**, no skips;
**52 English + 120 locale/theme browser cases**, **557 assertions**, and **18 axe
audits with zero violations**. The 79-file production package and deployment
isolation checks pass. Existing tests were updated for new event types, actual
rendered text and persisted fake device registrations; authentication and RLS
assertions remain intact. Both new rollback paths preserve stored business data.

An older Windows historical rollback checksum check fails on CRLF checkout text;
its canonical LF body matches the embedded expected hash. That diagnostic and the
timed-out broad legacy rollback attempt are explicitly excluded from the passing
targeted totals. No historical migration/rollback SQL or checksum assertion was
rewritten. Canonical Linux CI runs separately on this PR.

**Owner release dependencies:** review/dry-run the two additive migrations on
staging, review advisors/index-build impact, configure VAPID and the existing
authenticated worker schedule, deploy compatible database/worker/frontend in the
documented order, review/install localized Auth email templates, and verify
Google/Supabase dashboard settings. Hosted OAuth/email/push delivery and physical
Android/iOS installed-PWA behavior were not verified and are not claimed working.
No live database/configuration change, merge or deployment was performed.

See `review/crm-device-refinement/IMPLEMENTATION.md` for root causes, the complete
requirement/status checklist, exact test commands, file inventory, rollout,
rollback and remaining external/device dependencies. Actual screenshots are
generated locally under that directory and deliberately ignored; the committed
browser harness and BROWSER-QA.md reproduce them without contacting Supabase.
