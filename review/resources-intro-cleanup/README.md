# Resources introduction cleanup

Based on main 289ce4dc29bb2ebf5ea5112d5944b556b2a2ac23 after PR #29.

Removed the hub's uppercase Resources label and the breadcrumbs, category badge and reading time above both article headings. All articles use the same 32px top spacing from assets/resources.css. Removed unused article-header rules and updated the existing article authoring template instructions. Category badges and reading times on hub cards remain unchanged.

A strict source comparison confirms that the hub changed only by removal of the label, and article HTML changed only by removal of the breadcrumb and metadata blocks. Article content, all SEO metadata, header/footer navigation, all ten calculators, shared fonts/styles/scripts, sitemap and workflows are unchanged. [Scope audit](scope-audit.json).

## Verification

- All eleven website script suites pass: h1, resources, w2, w4, w5a, w6, w7 (45), w8 (1460), calculator w9 (187), Resources w9 (65), commission (250). [Outputs](regression-results.json).
- Actual Chrome: 377 checks across the hub and both articles at 1440, 1024, 768, 390 and 375px. Touch-enabled mobile, article top spacing, absence of header metadata, preserved card metadata, overflow, anchors, menu, links, formula disclosure and assets verified. No JS or HTTP errors. [Results](browser-results.json).
- Packaging passes: 73 files, 2,030,101 bytes, 1,013 valid internal references, asset stamps/source parity, JS parsing and CSP compatibility.

| Page | Desktop (1440px) | Mobile (390px) |
| --- | --- | --- |
| Resources | [Screenshot](resources-desktop.png) | [Screenshot](resources-mobile.png) |
| Mortgage article | [Screenshot](mortgage-payments-desktop.png) | [Screenshot](mortgage-payments-mobile.png) |
| Commission article | [Screenshot](real-estate-commission-desktop.png) | [Screenshot](real-estate-commission-mobile.png) |

Screenshots are local browser captures, not a deployment. No merge or deployment was performed.
