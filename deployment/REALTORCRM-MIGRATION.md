# RealtorCRM deployment ownership migration

Marketing: `https://everyrealestatecalculator.com/real-estate-crm/` →
`public_html/real-estate-crm/`. Application (unchanged):
`https://realtorcrm.everyrealestatecalculator.com/` → `public_html/realtorcrm/`.
Do not change document roots, DNS, SSL, Supabase settings, or the product name.

## What this repository guarantees

- Website source/package has no `realtorcrm/` or legacy `realtoros/` tree.
  All active marketing links, canonical/OG URLs and sitemap use the new route.
  `realtorcrm.css` and existing app host/product names deliberately retain their names.
- Website assembly ships `.htaccess` and a root `.gitignore` reserving `/realtorcrm/`.
  Build, downloaded-artifact and pre-publish checks reject ownership violations.
  CRM output stays byte-identical to the pre-migration package; its downloaded
  artifacts are checked for accidental marketing/nested CRM roots too.
- Main-host-only 301s take `/realtorcrm`, `/realtorcrm/` and
  `/realtorcrm/index.html` to the absolute new HTTPS marketing URL,
  preserving query strings. Prior `/realtoros/` aliases go there too. An HTTP
  request may first follow the unchanged child CRM's HTTPS normalization.
  A hostname-scoped `RedirectMatch` also handles Apache child rewrite overrides;
  the standard rewrite rule remains for the existing LiteSpeed configuration.
  Nested app files are excluded; the CRM subdomain never matches the migration rule.
- Website publishing refuses to push unless the manual input
  `crm_preservation_verified=true` is explicitly supplied. This is a host-side
  evidence attestation on **every publish**, not an automated hosting guarantee.

Both Actions workflows only publish GitHub branches (`deploy-website` and
`deploy-crm`). Hostinger's subsequent pull/webhook is outside their control.
Removing a previously tracked `realtorcrm/index.html` can delete the live CRM
entry page on the first pull. `.gitignore` does **not** protect tracked deletions,
nor cleanup with `git clean -x`, destructive mirrors, or recreating `public_html`.
Tests reproduce this failure and prove ordinary ignored-file cleanup differs.

**Remaining production dependency:** the owner must inspect the actual Hostinger
Git checkout and deployment command/logs, complete the tracked-file handoff below,
and verify future deployments preserve the ignored CRM subtree (including its
own Git metadata and host-only files). The existing two target directories must
also be confirmed. If Hostinger cannot support this preservation behavior, stop:
these branch publishers cannot guarantee permanent isolation on that host.
An exclusion-capable upload mechanism would be needed in a separately approved task.

## Exact first production deployment order (owner only, after manual merge)

1. Pause delivery of both GitHub-side deployment webhooks and coordinate no manual
   Hostinger pulls during this controlled handoff; leave hPanel settings unchanged.
   Do not run the historical first-launch instructions or empty/recreate
   either directory. Inspect the existing two connections and actual cleanup
   behavior without changing roots or other hosting/auth configuration. If there
   is no shell/Git metadata access, arrange the equivalent non-deleting handoff
   with Hostinger support **before** enabling a website publish.
2. Download a restorable backup of all `public_html/realtorcrm/` files, dotfiles,
   host-only files and its Git metadata; separately back up the parent website
   checkout metadata and `.htaccess`. Record current `deploy-website` and
   `deploy-crm` SHAs, parent tracked paths, and a CRM file hash manifest. Verify
   the backup can be read. Do not clear the production CRM directory.
3. Verify the actual website deploy command will not delete ignored/untracked
   CRM files, perform destructive directory replacement, or clean with `-x`.
   With GitHub-side webhook delivery still paused and a controlled, non-deleting handoff
   scheduled, run **Deploy website** on merged `main`, `publish=true`,
   `crm_preservation_verified=true`. Wait for all checks and branch publication
   to succeed. This updates GitHub only while the webhook is paused.
4. On the host's **confirmed parent website Git checkout**, fetch the new
   `deploy-website` commit. Transfer its index/HEAD without touching working files,
   then materialize only website-owned paths. A standard Git checkout can use:

   ```sh
   # Confirm pwd, git rev-parse --show-toplevel, remote and branch first.
   # Run only in the existing public_html website repository, never the CRM repo.
   git fetch origin deploy-website
   git reset --mixed origin/deploy-website
   git restore --source=origin/deploy-website --worktree -- . ':(top,exclude)realtorcrm'
   ```

   The mixed reset removes old marketing paths from the parent's index without
   removing CRM working files. The restore excludes the entire CRM tree.
   Do not substitute `reset --hard`, `checkout -f`, `clean`, a normal first pull,
   or a whole-root upload. If hPanel uses another layout/mechanism, these commands
   are **not** applicable; have Hostinger provide an equivalent preservation-safe
   procedure. Compare the full CRM hash manifest before/after this step.
5. Verify the new marketing page/assets and main-host 301 (including query and
   index.html forms). Verify the app entry, auth callback URL, sign-in/signup,
   worker and manifest still load from the unchanged subdomain. Test all ten
   calculators, Resources articles, About/Contact and navigation. Then run
   **Deploy CRM** on the same `main` with `publish=true` and let the existing
   CRM-only connection update **public_html/realtorcrm/**. It must leave
   **public_html/real-estate-crm/** unchanged. An already current CRM does not
   need republishing; publishing it is a verification step, not a repair for
   a destructive website deploy.
6. With backups retained, verify one subsequent website deployment preserves the
   complete CRM tree and one subsequent CRM deployment preserves marketing.
   Only resume automatic pulls after the actual mechanism and both orders have
   been demonstrated safe. Retain the cleanup evidence for future attestations.

## Rollback

Pause automatic pulls first. Restore the saved CRM files/metadata if damaged,
and compare their hashes. Restore only website-owned files from a known-good
**post-migration** artifact, leaving `realtorcrm/` untouched. Keep the new route
and hostname-restricted redirect. If rolling back unrelated website changes to
an older source SHA, rebuild that source with this migration and isolation guards
retained; never publish a pre-migration website artifact or revert the directory
move alone. Roll back CRM independently into its unchanged subdomain directory.
Do not restore the old parent Git index that tracked `realtorcrm/`; that would
reintroduce the next-deploy deletion hazard. Restore parent metadata only with
the same safe ownership handoff applied before any subsequent deployment.

## Verification and limits

Run from the repository root:

```sh
node website/scripts/package-deploy.mjs
node deployment/package-crm.mjs
node --test --test-concurrency=1 deployment/tests/isolation.test.mjs
python3 deployment/tests/apache-redirects.py # Linux with Apache 2 + OpenSSL
```

The isolation suite tests both non-destructive copy orders, repeated updates,
host-only CRM files, contaminated/downloaded artifacts, the first-pull deletion
hazard, default-deny publication, unchanged CRM bytes and auth/PWA paths.
The Apache suite exercises actual HTTP/TLS rewrite handling on temporary local
virtual hosts. Neither suite claims to reproduce unknown hPanel cleanup behavior.
CI runs both suites on every relevant PR/main change. Existing website regression
suites and targeted CRM commands/results are recorded in the PR review report.
Historical `review/` evidence is retained unchanged; it is not an active route registry.

References: [Hostinger Git deployment](https://www.hostinger.com/support/1583302-how-to-deploy-a-git-repository-in-hostinger/),
[Git ignore limitations](https://git-scm.com/docs/gitignore),
[Git clean](https://git-scm.com/docs/git-clean),
[Git reset](https://git-scm.com/docs/git-reset),
[Apache redirects](https://httpd.apache.org/docs/2.4/rewrite/remapping.html),
[Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
