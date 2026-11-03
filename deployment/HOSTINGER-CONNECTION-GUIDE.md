# Connecting GitHub to Hostinger — the two deployments

How Hostinger's Git feature actually works (verified against Hostinger's
current documentation and hPanel behaviour):

- Per website: hPanel → the site's Dashboard → **Advanced → Git**.
- You give it a **repository** and a **branch**, plus a **Directory**
  (the folder the branch's contents are copied into).
- It deploys the **entire branch contents** — there is no build step and
  no way to pick a subfolder of the branch. That is exactly why this
  repository publishes two purpose-built branches whose roots ARE the
  finished websites: `deploy-website` and `deploy-crm`.
- For this **private** repository, the Git page shows an **SSH key**:
  add it in GitHub under the repository's **Settings → Deploy keys**
  (read-only is enough). Newer hPanel versions may instead offer
  "Continue with GitHub" (OAuth) — either route is fine.
- **The destination directory must be empty** when you first connect, or
  the deployment fails.
- After connecting you get **Deploy** (manual, deploys the branch's
  current state) and **Continuous Deployment** (a webhook URL you add in
  GitHub → Settings → Webhooks; every later push to that branch then
  deploys automatically).

Nothing below has been done yet — each connection is created by the
owner during the launch sequence.

---

## Connection A — main website

**GitHub `deploy-website` → `everyrealestatecalculator.com`**

1. hPanel → Websites → `everyrealestatecalculator.com` → Dashboard →
   Advanced → Git.
2. Add the shown SSH key to GitHub → repo Settings → Deploy keys
   (or use the GitHub OAuth connect if offered).
3. Repository: this repository (`naveedaslammalik2580-cpu/Real-e-State`).
4. Branch: **`deploy-website`**.
5. Directory: leave as the site's root (**`public_html`** for the primary
   domain). Empty it first if it holds a placeholder you are replacing
   (download anything you need to keep).
6. Click **Deploy** for the first deployment.
7. Verify: the file list in File Manager → `public_html` should show
   `index.html`, `sitemap.xml`, `robots.txt`, `.htaccess` and the
   folders `assets`, `tools`, `about`, `contact`, `resources`,
   `realtoros` — and **no** CRM files, tests, or documentation.
8. SSL: hPanel → Security → SSL → **Lifetime SSL** for the domain →
   Install → wait for **Active**. The branch's `.htaccess` then enforces
   HTTPS and www→non-www redirects by itself.
9. Smoke checks: homepage loads over HTTPS;
   `www.everyrealestatecalculator.com` redirects to the apex;
   the mortgage calculator shows **$2,022.62**; the Contact form
   prepares a draft (it never sends).
10. Later updates: merge to `main`, then GitHub → Actions →
    "Deploy website" → Run workflow with **publish = true** (this is the
    gated publish), then in Hostinger either press **Deploy** again or
    enable **Continuous Deployment** (add its webhook in GitHub →
    Settings → Webhooks) so branch pushes deploy automatically.
11. Rollback: every publish is one commit on `deploy-website` whose
    message names the source commit. To roll back, re-run the
    "Deploy website" workflow from the earlier known-good `main` commit
    (Actions → Run workflow → choose that commit) with publish = true,
    then press Deploy in Hostinger (or let the webhook do it).

## Connection B — RealtorCRM CRM

**GitHub `deploy-crm` → `realtorcrm.everyrealestatecalculator.com`**

1. First create the subdomain if it does not exist: hPanel → Websites →
   Add Website / Domains → Subdomains → create
   **`realtorcrm.everyrealestatecalculator.com`**. It gets its **own document
   root** (typically `public_html/app` or a folder named for the
   subdomain — use whatever hPanel shows as that site's root).
2. Open the subdomain site's Dashboard → Advanced → Git.
3. Same repository; connect with the SSH key / OAuth as above.
4. Branch: **`deploy-crm`**.
5. Directory: the subdomain's document root (must be empty).
6. Click **Deploy**.
7. Verify: the folder should show `index.html`, `sw.js`,
   `manifest.webmanifest`, `unsubscribe.html`, `assets` — and **no**
   website pages (`tools/`, `resources/`, …).
8. SSL: Lifetime SSL for `realtorcrm.everyrealestatecalculator.com` → Active.
   The CRM `.htaccess` forces HTTPS.
9. Apply `SUPABASE-AUTH-CHECKLIST.md` in the Supabase Dashboard, then
   the owner signs in at `https://realtorcrm.everyrealestatecalculator.com`
   and tests sign up + password recovery before the website launch
   points public traffic at it.
10. Later updates and rollback: same pattern as Connection A, using the
    "Deploy CRM" workflow and the `deploy-crm` branch.

## Notes
- No IP addresses or nameserver values appear in this guide on purpose:
  the domain/DNS values are specific to your hPanel account and are
  shown on your own screens (Websites → Dashboard; Domains → DNS Zone).
- Keep Continuous Deployment **off** until the first controlled
  deployment of each site has been verified; manual Deploy is the
  safe default.
