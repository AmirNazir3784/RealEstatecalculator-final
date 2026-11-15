# About editorial photography refinement

Base: `10d9217e744f0d73df68804813b7f791edc9010e` (latest origin/main at start).
Branch: `feature/about-editorial-photography`. Review only; no merge or deployment.

## Changes

- Retained the six existing sections, exact hero headline/supporting copy/CTA,
  purpose copy, four audience names/descriptions, accuracy/disclaimer copy and
  final CTA wording. RealtorCRM copy retains appointments and adds daily-workflow
  context; the approved `/real-estate-crm/` destination stays unchanged.
- Larger 58px desktop serif headline, approximately 46/54 hero composition,
  80px desktop spacing, tighter 34/66 editorial splits and 40/60 audience rows.
- Replaced the red-house photo and calculator screenshot with three genuine,
  locally hosted, licensed photographs. Both product rows use equal 16:10 images
  and alternating composition, without cards, UI screenshots or new sections.
- Added six WebP variants (1440px/720px), explicit dimensions, descriptive alt
  text, responsive image selection and lazy product loading. All image variants
  total 611,022 bytes; the three 720px images total 160,990 bytes. See
  [source/license notes](../../website/about/IMAGE_SOURCES.md).
- Increased the existing navy CTA's padding and heading size; retained shared
  button components, warm background, palette and fonts. All CSS is About-scoped.

## Verification

- All **13 website suites passed**, including all ten financial engine contracts,
  Resources, shared navigation/footer, brand contrast/names and About structure.
- **296 real-Chrome assertions passed** at 1920, 1440, 1280, 1024, 768, 390 and
  375px: desktop composition, equal product images, mobile reading order, no
  overflow/clipping/broken images, semantic structure, working links/CTAs,
  keyboard mega-menu/Escape/focus/skip link, touch targets and all ten calculator
  default-output smoke checks. Maximum observed CLS: **0.0076**.
- Full-page **axe-core 4.14.0** audit at every viewport: **zero violations**.
  Native lazy images were scrolled into view and decoded before screenshots;
  the capture starts at scroll position zero. Screenshots reviewed visually.
- Production package: **80 files**, **1,070 internal references resolved**;
  byte comparisons, JS parsing and CSP readiness passed. No new dependencies.
- Header/footer, SEO metadata and scripts compare unchanged against the base
  outside `<main>` (line endings normalized). Purpose, audience, accuracy and
  closing section markup also compare unchanged. Shared CSS, calculators,
  Resources, Contact, CRM app/marketing and deployment workflows/config have
  no changes. Only About source/assets, existing About-related tests and this
  review evidence are included.
- `git diff --check` passes. No live deployment or live-page result is claimed.

## Screenshots

- [Desktop — 1440px, full page](about-desktop.png)
- [Tablet — 768px, full page](about-768.png)
- [Mobile — 390px, full page](about-mobile.png)
- [Browser measurements](browser-results.json)
- [Accessibility results](accessibility-results.json)

## Reproduce

From the repository root, PowerShell:

```powershell
$suites = 'h1','resources','w2','w4','w5a','w6','w7','w8','w9','w9-resources','commission','brand-accessibility','about-editorial'
foreach ($suite in $suites) { node "website/tests/$suite.cjs"; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
node website/scripts/package-deploy.mjs
git diff --check
```

Serve `website/` on a local HTTP server. With existing Playwright/Chrome and axe
test tools available (they are not shipped with the website), set:

```powershell
$env:PLAYWRIGHT_MODULE = '<absolute path to existing playwright-core>'
$env:CHROME_PATH = '<Chrome executable>'
$env:AXE_PATH = '<absolute path to axe.min.js>'
$env:ABOUT_URL = 'http://127.0.0.1:8140/'
node website/tests/about-browser.cjs
```

Outputs default to `review/about-photography-refinement/`; optionally set
`ABOUT_REVIEW_DIR` to an alternate output directory. Existing CI also verifies
website packaging/artifact boundaries and deployment isolation without publishing.
