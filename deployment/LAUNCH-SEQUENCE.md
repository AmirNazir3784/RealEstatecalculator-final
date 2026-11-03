# Launch Sequence — avoiding a broken sign-in experience

The website's "Sign in to RealtorCRM" links point at
`https://realtorcrm.everyrealestatecalculator.com` (PR #9 configuration). That
subdomain must be **live and verified before the website goes public**,
otherwise the first thing visitors hit is a dead login link.

The workflows and Hostinger connections are therefore used in this order.
Nothing here is automatic until each gated publish is started manually.

## Order of operations

1. **Merge PR #9** (production domain configuration) — owner.
2. **Merge the deployment-infrastructure PR** and add the two workflow
   files via the GitHub web UI if the PR could not carry them
   (`.github/workflows/deploy-website.yml`, `deploy-crm.yml`).
   Optionally add required reviewers to the `production-website` and
   `production-crm` environments (Settings → Environments) for a second
   approval gate on every publish.
3. **Publish the CRM output:** GitHub → Actions → "Deploy CRM" →
   Run workflow → set **publish = true**. This runs the CRM suites,
   packages the app, and commits the verified output to `deploy-crm`.
4. **Connect Hostinger Connection B** (see HOSTINGER-CONNECTION-GUIDE.md):
   subdomain `realtorcrm.everyrealestatecalculator.com` ← branch `deploy-crm`.
   Install its SSL certificate.
5. **Apply the Supabase authentication checklist**
   (SUPABASE-AUTH-CHECKLIST.md) — owner, in the Supabase Dashboard.
6. **Owner verifies the CRM live:** open
   `https://realtorcrm.everyrealestatecalculator.com`, sign in, sign up,
   password recovery. Production login is PENDING until this step is
   actually done by the owner — it cannot be pre-verified.
7. **Publish the website output:** Actions → "Deploy website" →
   Run workflow → **publish = true** → output lands on `deploy-website`.
8. **Connect Hostinger Connection A:** `everyrealestatecalculator.com`
   ← branch `deploy-website`. Install SSL. Run the smoke checks in the
   connection guide (including the $2,022.62 mortgage default and the
   Contact draft).

## Why this is safe
- Until step 8, the website is not public at all — no visitor can ever
  meet the not-yet-live sign-in link.
- The RealtorCRM page's existing copy ("Explore the CRM and check access
  availability") stays accurate at every stage; nothing advertises the
  CRM as available before step 6 proves it.
- Every step is reversible: each deployment branch keeps one commit per
  publish (message records the source commit), so any release can be
  rolled back by re-publishing an earlier output or reverting on main.
- `crmBaseUrl` remains a single configuration value in
  `website/assets/site-config.js` if plans ever change.
