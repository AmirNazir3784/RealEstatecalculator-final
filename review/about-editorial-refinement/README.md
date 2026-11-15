# About editorial refinement and accessibility integration

Branch: `feature/about-editorial-refinement`, created in an isolated worktree from latest `origin/main` at `5fcfb0efd68d37d0e8dbba557d795e478edddfe6` (merged PR #31).

Commit `4df5c7ca6297427b011eae96e8760573a183ba4f` was cherry-picked as `487fb1e`. Before any editorial changes, its integrated source tree matched the previously tested accessibility commit exactly, and brand-accessibility, W4 and W8 all passed. [Integration evidence](integration-results.json).

## Actual changes

The About page now uses an editorial composition: a daylight residential photograph, plain serif headings, two explanatory paragraphs, an actual calculator capture beside its description, a text-first RealtorCRM row, a compact audience directory and a focused accuracy section. The short navy closing CTA uses the original shared buttons. The supplied copy is retained at 240 rendered words (approximately 250), without padding it with marketing language.

Removed the SVG house/calculator illustration, eyebrows, statistics, conceptual CRM graphics, enclosed product cards, audience icon cards, trust icon grid, coloured heading word and alternating section backgrounds. Retired illustration assets are removed. About-only CSS uses existing Inter and Source Serif 4 definitions, palette variables and container; no new fonts, runtime JavaScript, libraries or frameworks were added.

The integrated shared-brand fixes preserve 4.74:1 light-header and 4.80:1 dark-footer tagline contrast and complete accessible names across 36 brand links. Existing brand regression coverage remains in CI. The About head/metadata, header, mega menu, footer, scripts and shared styles match the integration baseline exactly. Calculator engines, Resources content/styles, RealtorCRM functionality and deployment configuration are unchanged. [Scope evidence](scope-audit.json).

## Imagery and provenance

- Hero: [Zac Gudakov's North Carolina residential photograph](https://unsplash.com/photos/white-and-brown-concrete-house-near-green-trees-during-daytime-wwqZ8CM21gg), reused under the [Unsplash License](https://unsplash.com/license). The official source identifies Pineville, NC, USA. Local 4:3 WebP variants are 1200 × 900 (204 KB) and 600 × 450 (66 KB), with explicit dimensions and responsive selection. No generated elements were added.
- Calculator: real Chrome capture of the unchanged Mortgage Calculator, showing functional inputs and results together at its illustrative defaults. Locally encoded as WebP at 1152 × 704 (approximately 55 KB).
- RealtorCRM: no verified screenshot or local demonstration mode was available; the permitted text-first fallback is used. No broken production-subdomain capture, fake interface or customer data is shown.

[Asset source and licensing record](../../website/about/IMAGE_SOURCES.md).

## Verification

- All eleven existing regression suites pass: h1, resources, w2, w4, w5a, w6, w7 (45), w8 (1460), w9 (187), w9-resources (65), commission (250). The existing brand suite adds 174 assertions, and the new editorial acceptance suite adds 26. [Outputs](regression-results.json).
- Real headless Chrome: **269 About assertions** at 1920, 1440, 1280, 1024, 768, 390 and 375px. Checks include overflow, clipped text, image loading/proportions, plain headings, absence of retired template elements, mobile product reading order, brand names, keyboard skip/menu/Escape/focus behavior, internal links, CTA destinations and ten unauthenticated calculator outputs. No JavaScript or HTTP errors. [Browser report](browser-results.json).
- Full About page: **zero detected axe-core 4.14.0 violations at all seven widths**, using WCAG 2/2.1 A/AA and best-practice tags. Incomplete checks remain recorded; automated tools cannot assess text inside the calculator screenshot. [Accessibility report](accessibility-results.json).
- Shared branding: **614 assertions across all 18 public pages**, 72 desktop/mobile cases, 36 axe audits and 36 native JavaScript-disabled checks of names/contrast/application-script absence. No detected brand violations, JS errors or HTTP errors. All 36 original-theme geometry/font comparisons match. [Shared-brand report](shared-brand-accessibility-results.json).
- Deployment packaging and CI-style assembly pass: **76 packaged files, 1,015 valid internal references**, content-hash asset stamping, source parity, JavaScript parsing and CSP readiness. The 77-file assembled output includes the unchanged `.htaccess`; no development URLs or secret-marker matches. Nothing was published. [Packaging report](packaging-results.json).
- Full-page review at all seven widths plus normal-scale desktop hero/product captures. Tablet CRM link spacing and the lower calculator crop were refined before final verification. The final page is 2769px tall at 1440px and 3846px at 390px, shorter than the previous composition. [Exact measurements](browser-results.json).

## Actual browser captures

Before captures show the integrated accessibility fixes before editorial changes. All captures are local browser renders, not mockups or deployments.

| View | Screenshot |
| --- | --- |
| Before desktop, 1440px | [Full page](before-desktop.png) |
| Before mobile, 390px | [Full page](before-mobile.png) |
| After desktop, 1440px | [Full page](about-desktop.png) |
| After desktop at normal scale | [Viewport](after-desktop-viewport.png) |
| After product rows at normal scale | [Product section](after-products.png) |
| After mobile, 390px | [Full page](about-mobile.png) |
| 1920px | [Full page](about-1920.png) |
| 1280px | [Full page](about-1280.png) |
| 1024px | [Full page](about-1024.png) |
| 768px | [Full page](about-768.png) |
| 375px | [Full page](about-375.png) |

## Reproduce and limitations

Run `node website/tests/{suite}.cjs` for the eleven suites listed above, `node website/tests/brand-accessibility.cjs`, `node website/tests/about-editorial.cjs`, then `node website/scripts/package-deploy.mjs`.

For browser QA, serve `website/`, set `ABOUT_URL`, `PLAYWRIGHT_MODULE`, `CHROME_PATH` and `AXE_PATH`, then run `node website/tests/about-browser.cjs`. For shared-brand QA, use `SITE_URL`, `BRAND_REVIEW_DIR` and the same browser/axe paths with `node website/tests/brand-accessibility-browser.cjs`. `BASELINE_THEME` enables the optional original-theme comparison. Dependencies are QA-only and are not shipped.

Browser coverage is Chromium desktop/mobile emulation, not physical devices or other browser engines; automated accessibility checks do not establish complete conformance. RealtorCRM intentionally has no screenshot for the reason above.

**Do not merge or deploy.** The Hostinger document-root conflict remains unresolved. No deployment workflow was dispatched and no deployment branch was changed.
