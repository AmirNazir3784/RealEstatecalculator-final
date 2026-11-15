# RealtorCRM deployment migration review

Base: `7d6292670bf3547fcdf61679567cda2cb57aa08b` (`origin/main`).
Branch: `fix/realtorcrm-deployment-conflict`. No merge, publish or deployment performed.

Marketing moved from `/realtorcrm/` to `/real-estate-crm/`, preserving the entire
HTML except route references and preserving CSS byte-for-byte. All 19 public
pages use the new marketing links; CRM login/signup still target
`https://realtorcrm.everyrealestatecalculator.com/`. Canonical, Open Graph,
sitemap, page lists, browser checks and packaging contracts migrated too.
Repository search left old route references only in redirects, protection/tests,
migration documentation and historical review evidence; app names/hosts remain.

Main-host-only 301s include apex/www, HTTP/HTTPS, slashless/folder/index.html
forms, query preservation and legacy RealtorOS redirects. HTTP may normalize to
HTTPS before the migration redirect under the unchanged nested CRM config.
The hostname-scoped alias redirect survives child rewrite overrides. New route never
rematches. Nested CRM assets and app-subdomain auth/PWA URLs do not migrate.

## Local results

- All 13 existing website suites passed, covering ten calculator contracts,
  Resources articles, About/Contact, shared navigation/brand accessibility and links.
- Website package: 77 files; 1,069 relative asset/link references resolve; JS/CSP checks pass.
- CRM package: 69 files / 1,984,789 bytes. Every file matches the pre-edit local
  baseline; no app source, packager, CRM headers or Supabase configuration changed.
  See [artifact-integrity.json](artifact-integrity.json) for local manifest digest.
- Five deployment-isolation tests passed: clean/contaminated artifacts, both
  deployment orders and repeated updates, CRM extras, default-deny publishing,
  safe Git ownership handoff, unsafe tracked deletion and cleanup behavior,
  byte preservation and auth/PWA contracts.
- Targeted CRM tests: 88 passed, zero failed/skipped (10 auth, 17 PWA, 60 routes,
  one complete script-load smoke). Auth test prints jsdom's expected unsupported
  navigation diagnostic; assertions pass. Tests use offline stubs, no live Supabase.
- Real Chrome: 473 assertions across all 19 pages at 1440px and 390px;
  no overflow, HTTP failures or JavaScript errors; actual desktop/mobile navbar
  clicks, unchanged CRM destinations and new metadata verified. Desktop/mobile
  full-page marketing screenshots inspected locally; no design changes introduced.
  See [browser-results.json](browser-results.json).
- `git diff --check` passes. Apache/Python are unavailable on this Windows
  workstation; the added Linux CI job runs real Apache HTTP/TLS integration.
  Check the PR's **Deployment isolation / isolation** result for that evidence.

## Reproduce

From repository root (PowerShell):

```powershell
$suites = 'h1','resources','w2','w4','w5a','w6','w7','w8','w9','w9-resources','commission','brand-accessibility','about-editorial'
foreach ($suite in $suites) { node "website/tests/$suite.cjs"; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
node website/scripts/package-deploy.mjs
node deployment/package-crm.mjs
node --test --test-concurrency=1 deployment/tests/isolation.test.mjs
git diff --exit-code 7d6292670bf3547fcdf61679567cda2cb57aa08b -- 'Realtor main CRM/RealtorOS_Project/app' deployment/package-crm.mjs deployment/crm.htaccess
```

From `Realtor main CRM/RealtorOS_Project/tests`, sequentially:

```sh
node --test --test-concurrency=1 frontend/auth-signup.test.mjs
node --test --test-concurrency=1 frontend/pwa.test.mjs
node --test --test-concurrency=1 frontend/route-contract.test.mjs
node --test --test-concurrency=1 frontend/load-all-scripts.test.mjs
```

Optional owner full-suite command: `npm run test:quiet` (not run locally;
existing Deploy CRM CI retains its own complete suites).

Linux Apache check after both packages are built:
`python3 deployment/tests/apache-redirects.py`.

## Production dependency, order and rollback

Artifact guards run at assembly, after artifact download and before either
branch publisher. Website `.gitignore` reserves the app tree. Website publishing
requires `crm_preservation_verified=true`; default requests fail closed.
This gate is an operator attestation, not proof of external host behavior.

**The first Hostinger pull remains blocked until the owner verifies cleanup
behavior and completes a non-deleting parent Git ownership handoff.** Ordinary
ignored-file cleanup is safe after that handoff; tracked deletions, `clean -x`
or full-root replacement are not. The repository alone cannot guarantee permanent
host isolation. No live hosting behavior is claimed here.

Follow [REALTORCRM-MIGRATION.md](../../deployment/REALTORCRM-MIGRATION.md) for the
exact sequence: pause pulls → back up/verify ownership and cleanup → publish the
website branch with safe handoff prepared → mixed-reset/CRM-excluded website
materialization → verify app bytes and URLs → unchanged CRM-only deployment →
verify both subsequent orders before resuming automatic pulls.

Rollback restores only website-owned paths from a post-migration artifact and
restores the CRM independently if needed. Never restore the old parent index or
publish an old website artifact containing `realtorcrm/`.
