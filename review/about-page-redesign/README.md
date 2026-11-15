# About page redesign

Starts from `origin/main` at `2f454b5e448fdc3754168dd0f8ecc1dcfbbe5443` on `feature/about-page-redesign`.

The About page now explains the platform's purpose, products, audiences and methods in six concise sections (354 rendered words). The compact two-column hero uses an original 2.3 KB SVG; two balanced product cards use a real, cropped mortgage-calculator capture and a conceptual CRM icon composition. No CRM screenshots were available: the existing product page contains placeholders. Methodology, worked examples, assumptions, exclusions and the required disclaimer are integrated into the trust section. The title and canonical are preserved; search and social descriptions now describe the About page.

All styling is scoped beneath `.about-page` and uses existing palette variables, fonts, 1200px container and buttons. Header, mega menu, footer and scripts are unchanged. No calculator, Resources, CRM functionality, legal, shared-style or deployment-workflow files changed. The only existing tests updated are obsolete About-copy expectations in W7 and the About content fingerprint in W8; every other frozen contract remains intact. [Scope audit](scope-audit.json).

## Verification

- All eleven existing website regression suites pass: h1, resources, w2, w4, w5a, w6, w7 (45), w8 (1460), w9 (187), w9-resources (65), commission (250). [Full outputs](regression-results.json).
- Actual headless Google Chrome: 217 checks at **1920, 1440, 1280, 1024, 768, 390 and 375px**, including touch-enabled mobile, overflow, clipped text, headings, images, CTA touch targets, all main links, CTA navigation, keyboard skip link, mega menu, Escape/focus behavior and all ten unauthenticated calculator outputs. No JavaScript or HTTP errors. Largest measured layout shift score: 0.0045; both mobile widths: 0. [Browser report](browser-results.json).
- axe-core 4.14.0, WCAG 2/2.1 A/AA and best-practice rules at all seven widths: **zero detected violations in the redesigned main content**. The unchanged shared header/footer retain two existing rule failures: contrast of the small brand tagline, and brand-link visible text not fully included in the accessible name. They are recorded, not suppressed. The screenshot itself requires visual review; the audit cannot assess text inside raster images. [Accessibility report](accessibility-results.json).
- Deployment packaging and CI-style output assembly pass: 75 packaged files; 1,014 internal references resolve; asset version stamps/source parity, JS parsing and CSP checks pass. The 76-file assembled output includes the unchanged `.htaccess`; no development URL or secret-marker matches. [Packaging report](packaging-results.json).
- All seven full-page screenshots were visually reviewed; narrow-screen highlight wrapping and calculator screenshot framing were refined before delivery.

## Actual full-page captures

These are local browser renders of the implementation, not mockups or a deployment.

| Width | Capture |
| --- | --- |
| 1920px | [Full page](about-1920.png) |
| 1440px | [Desktop](about-desktop.png) |
| 1280px | [Full page](about-1280.png) |
| 1024px | [Full page](about-1024.png) |
| 768px | [Tablet](about-768.png) |
| 390px | [Mobile](about-mobile.png) |
| 375px | [Full page](about-375.png) |

## Reproduce

Run each `website/tests/{suite}.cjs` listed above with Node.js, then `node website/scripts/package-deploy.mjs`. To repeat browser QA, serve `website/` and run `node website/tests/about-browser.cjs` with `ABOUT_URL` pointing at that server, `PLAYWRIGHT_MODULE` pointing at an installed `playwright-core` module and `CHROME_PATH` pointing at Chrome. Browser dependencies are QA-only and are not shipped. Screenshots and machine-readable reports are retained here.

## Limitations and release status

Automated browser checks use Chromium desktop and mobile emulation, not physical devices or Safari/Firefox. Automated accessibility checks do not establish complete conformance; the two shared-brand issues above remain outside this page-only scope. CRM imagery is conceptual and claims only features already described on the product page. No company identity, people, endorsements, customer statistics or product features were invented.

**Do not merge or deploy.** The Hostinger document-root conflict remains unresolved. No deployment workflow was dispatched and no deployment branch was changed.
