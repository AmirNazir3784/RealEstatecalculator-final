# Reproduce the local browser review

This harness renders the real HTML, CSS and application scripts in headless
Chrome. Only Supabase and the signed-in workspace data source are replaced with
synthetic fixtures. It never signs into a hosted project, writes customer data,
or verifies production OAuth/push delivery. Service-worker registration is stubbed
for isolated layout tests; the existing PWA unit tests exercise the real worker.

From the repository root, use an installed Chrome/Chromium (`CHROME_BIN` can
override its executable). Download the pinned, QA-only axe checker:

```powershell
curl.exe -fL https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.3/axe.min.js -o review/crm-device-refinement/axe.min.js
Get-FileHash review/crm-device-refinement/axe.min.js -Algorithm SHA256
# Expected: 880970C081707360E64F34CEA25FF91892F5BC95675B0776925B9709DD8A68BB
$env:QA_ADVANCED='1'
node review/crm-device-refinement/browser.cjs
```

This checks 120 combinations: English/German/Arabic, light/dark, 320/390/768/1280/
1440 widths, and signup/sign-in/pipeline/settings; then profile/search/preferences
interactions at 320/360/375/390/414/430. It records `advanced-browser.json` and
actual PNG captures. Axe checks sample auth, pipeline, settings and search states.
`AXE_PATH` can point to an existing copy of the same checker.

For the full English size matrix (52 screen cases including landscape):

```powershell
Remove-Item Env:QA_ADVANCED -ErrorAction SilentlyContinue
$env:QA_FULL='1'
node review/crm-device-refinement/browser.cjs
```

Screenshots, PDFs, checker downloads and optional baseline files are deliberately
ignored. Before captures were made from unchanged base `84a7b05`, using a `git
archive` copy of the app under `baseline/Realtor main CRM/RealtorOS_Project/app`.
Set `QA_MODE=before` for that optional baseline run.

Browser emulation does not establish real virtual-keyboard, OS safe-area,
installed Android/iOS PWA, screen-reader or background push behavior. Those need
the physical-device staging checklist in the implementation report.
