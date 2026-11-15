## Change

The About page repeated the homepage's product pitch. It now explains who the platform serves, why it exists and how its estimates work through six sections: a two-column illustrated hero, purpose and verified access facts, two product cards, four audiences, transparent methods and a compact navy closing CTA. Main content is 354 words.

Uses existing design tokens, fonts, container and button components with About-only CSS. Includes an original lightweight SVG, an actual cropped mortgage-calculator capture and conceptual CRM icons because verified CRM screenshots are unavailable. Preserves the branding, navigation, `/about/` canonical and title; refines the meta/social descriptions.

Also fixes the two shared-brand accessibility findings across all 18 public pages: small tagline colour adjustments meet AA contrast, and accessible names include the complete visible brand/tagline with a proper text separator. Static markup and the configurable brand script agree, including without JavaScript. Brand typography, logo geometry, text and destinations remain unchanged. No unrelated product changes.

## Validation

- All 11 existing website regression suites and the new 174-assertion brand suite pass. W4 verifies configurable brand names; W8 normalizes only the exact approved brand name/separator migration before preserving the original frozen contracts. The brand suite is included in CI.
- 217 real Chrome assertions at 1920, 1440, 1280, 1024, 768, 390 and 375px; full-page visual review, navigation and keyboard checks; all ten calculators work without an account; no overflow, clipped text, missing assets, JS errors or HTTP errors.
- axe-core at all seven widths: zero detected violations on the full About page. Shared branding passes 72 additional browser cases across all 18 pages at desktop/mobile widths (614 assertions): 36 axe audits with JavaScript enabled, plus 36 native JavaScript-disabled checks for accessible names, rendered contrast and absence of application scripts. All 36 original-theme comparisons preserve brand/logo geometry and font metrics. Tagline contrast: header 4.74:1, footer 4.80:1. Both previously reported issues are resolved.
- Production package validates: 75 files, 1,014 internal references; asset stamping, source parity, JS syntax and CSP checks. CI-style assembly with unchanged `.htaccess` also validates.

[Desktop full-page screenshot](https://github.com/AmirNazir3784/RealEstatecalculator-final/blob/feature/about-page-redesign/review/about-page-redesign/about-desktop.png) · [Mobile full-page screenshot](https://github.com/AmirNazir3784/RealEstatecalculator-final/blob/feature/about-page-redesign/review/about-page-redesign/about-mobile.png) · [All screenshots and test evidence](https://github.com/AmirNazir3784/RealEstatecalculator-final/tree/feature/about-page-redesign/review/about-page-redesign)

Browser testing uses Chromium emulation; physical-device and other-engine verification are not included. No team/company claims, reviews or unverified product features were added.

**Do not merge or deploy: the Hostinger document-root conflict remains unresolved.** No deployment workflow dispatched or deployment branch changed.
