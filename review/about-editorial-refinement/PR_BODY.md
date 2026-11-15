## Change

The merged About page still used generic illustrations, statistics and repeated cards. This follow-up replaces that composition with an editorial page: a licensed residential photograph, restrained serif headings, natural prose, an actual mortgage form/results capture, a text-first CRM row, audience directory and concise accuracy section. Removes decorative eyebrows, icon grids, statistics and alternating backgrounds; keeps the compact navy CTA and existing shared buttons. Supplied copy is retained at approximately 250 words.

Also integrates the previously unmerged accessibility commit `4df5c7ca6297427b011eae96e8760573a183ba4f` from latest main (`5fcfb0e`). Its cherry-pick (`487fb1e`) was verified tree-identical and tested before About edits. Header/footer tagline contrast remains 4.74:1/4.80:1; complete brand names work with and without JavaScript across 18 pages.

Metadata/canonical, navigation, footer and shared typography/styles are preserved after integration. No calculator, Resources or CRM functionality changed, and no new runtime dependencies were added.

## Imagery

[Zac Gudakov's North Carolina residential photograph](https://unsplash.com/photos/white-and-brown-concrete-house-near-green-trees-during-daytime-wwqZ8CM21gg), under the [Unsplash License](https://unsplash.com/license), is locally optimized to responsive WebP. The calculator image is an actual local browser capture using illustrative defaults. Verified CRM/demo imagery is unavailable, so its row uses the permitted factual text-first fallback. [Source and licensing record](https://github.com/AmirNazir3784/RealEstatecalculator-final/blob/feature/about-editorial-refinement/website/about/IMAGE_SOURCES.md).

## Validation

- All 11 existing regression suites, 174 existing brand assertions and 26 editorial acceptance checks pass. Accessibility coverage is preserved in CI.
- 269 About browser assertions across 1920, 1440, 1280, 1024, 768, 390 and 375px; full-page axe audits have zero detected violations. Mobile reading order, image proportions, links, keyboard navigation and all ten calculator defaults checked.
- 614 shared-brand assertions across 18 pages: desktop/mobile axe audits and native JavaScript-disabled names/contrast checks. All 36 brand geometry/font comparisons match; no JS/HTTP errors.
- Production packaging and CI-style artifact assembly pass: 76 files, 1,015 internal references, asset stamps/source parity, JS syntax and CSP checks; unchanged `.htaccess` included.
- Actual full-page and normal-scale visual review completed; tablet spacing and calculator framing refined internally.

[Before desktop](https://github.com/AmirNazir3784/RealEstatecalculator-final/blob/feature/about-editorial-refinement/review/about-editorial-refinement/before-desktop.png) · [After desktop](https://github.com/AmirNazir3784/RealEstatecalculator-final/blob/feature/about-editorial-refinement/review/about-editorial-refinement/about-desktop.png) · [Full-page mobile](https://github.com/AmirNazir3784/RealEstatecalculator-final/blob/feature/about-editorial-refinement/review/about-editorial-refinement/about-mobile.png) · [All captures and evidence](https://github.com/AmirNazir3784/RealEstatecalculator-final/tree/feature/about-editorial-refinement/review/about-editorial-refinement)

Coverage uses Chromium emulation; physical-device and other-engine checks are not included. Automated accessibility testing cannot establish complete conformance.

**Do not merge or deploy.** The Hostinger document-root conflict remains unresolved; no deployment workflow dispatched or deployment branch changed.
