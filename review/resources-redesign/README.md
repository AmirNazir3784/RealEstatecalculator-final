# Resources redesign integration review

Integrated Muse's Resources redesign into main after calculator-system PR #28. No merge into main or production deployment was performed.

## Provenance

- Base: 07ffc7915778fdd987dd91802024805baaa570a7 (PR #28 merge).
- Muse: 4a9acfc7abc8b33966b2ac05d9fcfac3b06c031b; bundle branch feature/resources-redesign, original base 0c43cddf7455cfcbe2260fccf83f4e2a62f47844.
- Download size: 5,550,103 bytes, exactly as supplied.
- Calculated bundle SHA-256: aab013302409f46bb06e4c9f3b0ec63bb128f50803efd25d9615aa279179b9f9. No expected SHA-256 was supplied; Git bundle verification and the full imported commit identity were verified independently of this calculated digest.
- Integration branch: integration/resources-redesign. Existing checkouts and untracked work were preserved.

## Result and integration fixes

- Preserved Muse's hub design and shared assets/resources.css for the hub and two existing guides moved to standalone pages. The shared Resources CSS is byte-identical to Muse's version. No new article was authored.
- All ten calculator directories, financial JavaScript, mode controls, metadata, shared website styles, fonts, registry and mega-menu behavior are unchanged from main. See [source audit](integration-audit.json) for the ten SHA-256 values over Git-stored LF source bytes.
- Every old hub ID survives, including the main mortgage-guide, commission-guide and calculators anchors, plus available-title, commission-title, mortgage-title and reading-title. All original sitemap URLs remain, with two article URLs added (18 total).
- Commission example now identifies Agent Earnings, Both sides and zero percentage fees so readers can reproduce the example in the current UI. Its split definition accounts for the applicable side after fees. Card links have distinct accessible names.
- Kept calculator W9 at website/tests/w9.cjs and moved Muse's full Resources W9 coverage to website/tests/w9-resources.cjs. Calculator source checks use existing fixed contracts instead of a moving Git ref, so they work after merge and in shallow CI. Website CI now runs all eleven script suites.

## Verification

All eleven website script suites pass: h1, resources (5 worked examples), w2 (143 calculator assertions and internal-reference checks), w4, w5a, w6, w7 (45/45), w8 (1460/1460), calculator w9 (187/187), Resources w9 (63/63), commission (250 assertions, 22 numerical scenarios). [Full output](regression-results.json).

Actual Chrome browser verification:

- Resources: 332 checks at 1440, 1024, 768, 390 and 375 CSS pixels. Real touch-enabled mobile contexts, 3/2/1 card columns, no horizontal overflow, readable article column, unique IDs and ARIA references, legacy anchors clear the header, card mouse/touch and keyboard navigation, calculator CTAs, native formula disclosure, mega-menu expansion/Escape, metadata and all assets. No JavaScript errors or HTTP failures. [Results](browser-results.json).
- All ten calculators: 635 checks at five widths, expected outputs and metadata parity against main; 20 fresh desktop/mobile screenshots captured in local QA output. Existing committed calculator screenshots remain unchanged. [Results](calculator-browser-results.json).
- Commission: 156 browser checks across all three modes, seven widths, clipboard, validation, reset, print and genuine 200% browser zoom. [Results](commission-browser-results.json), [native zoom evidence](commission-native-zoom.json).
- Packaging: 73 files, 2,031,974 bytes, 1,017 internal references resolve. Source parity, deterministic asset-version stamps, JS parsing, excluded development files and CSP rules pass. [Result](packaging-result.json).

Review screenshots were captured from the actual local browser and visually inspected. Desktop is 1440px; touch mobile is 390px. They are local source previews, not production screenshots.

| Page | Desktop | Mobile |
| --- | --- | --- |
| Resources hub | [Screenshot](resources-desktop.png) | [Screenshot](resources-mobile.png) |
| Mortgage guide | [Screenshot](mortgage-payments-desktop.png) | [Screenshot](mortgage-payments-mobile.png) |
| Commission guide | [Screenshot](real-estate-commission-desktop.png) | [Screenshot](real-estate-commission-mobile.png) |

[Desktop mega menu](resources-mega-menu-desktop.png). [Screenshot dimensions and hashes](screenshots.json).

## Production blocker

The previously confirmed Hostinger document-root conflict remains unresolved and is outside this integration. The CRM hostname served the /realtorcrm/ marketing index with missing shared assets in the preceding production verification. This branch does not alter hosting, the CRM application, deployment workflows or deployment branches. Production publication must wait for independent website/CRM document roots and a verified restored CRM application.
