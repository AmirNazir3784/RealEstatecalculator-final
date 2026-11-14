// W9 — Centralized calculator design-system guards (2026-11-14).
// Locks the design-system implementation: all ten calculators load the shared
// tools.css, use one mobile summary bar, one FAQ accordion, related cards and
// a how-to note; calculator.js is untouched except for the two CGT sticky-value
// display lines; the dead per-page classes from the audit are gone from the
// per-page CSS; no inline panel-heading styles remain.
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const ROOT = path.join(__dirname, '..');
let passed = 0; const failures = [];
function check(name, cond) { if (cond) { passed++; } else { failures.push(name); } }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
const SLUGS = ['mortgage-calculator', 'commission-calculator',
  'home-affordability-calculator', 'rent-vs-buy-calculator',
  'cap-rate-calculator', 'bridge-loan-calculator',
  'property-investment-calculator', 'capital-gains-tax-calculator',
  'roi-calculator', 'noi-calculator'];
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '');
const count = (s, sub) => s.split(sub).length - 1;

// 1. Every calculator page loads the shared design-system stylesheet.
for (const slug of SLUGS) {
  const html = read(`tools/${slug}/index.html`);
  check(`${slug} loads tools.css`, html.includes('tools.css'));
}

// 2. One mobile summary bar per page, with a live value target.
for (const slug of SLUGS) {
  const html = read(`tools/${slug}/index.html`);
  check(`${slug} has exactly one .sticky-result`, count(html, 'class="sticky-result"') === 1);
  check(`${slug} has exactly one #sticky-value`, count(html, 'id="sticky-value"') === 1);
}

// 3. Shared results + FAQ accordion + related cards + how-to note.
for (const slug of SLUGS) {
  const html = read(`tools/${slug}/index.html`);
  // Rent vs buy shows a verdict box instead of a numeric hero (its genuine quirk).
  if (slug === 'rent-vs-buy-calculator') {
    check('rent-vs-buy keeps its .rent-verdict verdict box', html.includes('class="rent-verdict"'));
  } else {
    check(`${slug} has a shared .result-number hero`, html.includes('class="result-number"'));
  }
  const faqCount = count(html, '<details class="faq">');
  check(`${slug} has ${slug === 'mortgage-calculator' ? 8 : 6} FAQ accordions (got ${faqCount})`,
    faqCount === (slug === 'mortgage-calculator' ? 8 : 6));
  check(`${slug} has 3 related cards`, count(html, 'class="related-card"') === 3);
  check(`${slug} has a how-to note`, html.includes('How to use:'));
}
for (const slug of ['mortgage-calculator', 'commission-calculator',
  'home-affordability-calculator', 'rent-vs-buy-calculator',
  'cap-rate-calculator', 'bridge-loan-calculator', 'roi-calculator',
  'noi-calculator']) {
  check(`${slug} has a formula box`, read(`tools/${slug}/index.html`).includes('class="formula-box"'));
}

// 4. No inline styles on calculator pages (panel headings used to carry one).
for (const slug of SLUGS) {
  check(`${slug} has no inline style attributes`,
    !read(`tools/${slug}/index.html`).includes('style="'));
}

// 5. calculator.js is byte-identical to main, except CGT's two sticky lines.
function mainJs(slug) {
  return execSync(`git -C ${path.join(ROOT, '..')} show main:website/tools/${slug}/calculator.js`,
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
for (const slug of SLUGS) {
  let main;
  try {
    main = mainJs(slug);
  } catch (e) {
    check(`${slug} calculator.js readable from main`, false);
    continue;
  }
  const current = read(`tools/${slug}/calculator.js`);
  if (slug === 'capital-gains-tax-calculator') {
    const mainLines = main.split('\n');
    const curLines = current.split('\n');
    const added = curLines.filter(l => !mainLines.includes(l));
    const removed = mainLines.filter(l => !curLines.includes(l));
    check('CGT calculator.js differs only by sticky-value lines',
      removed.length === 0 && added.length === 2
      && added.every(l => l.includes('sticky-value')));
  } else {
    check(`${slug} calculator.js byte-identical to main`, current === main);
  }
}

// 6. Dead per-page classes from the audit are gone from calculator.css.
const DEAD = {
  'mortgage-calculator': ['.mortgage-breakdown', '.mortgage-total-row', '.mortgage-saved-row'],
  'commission-calculator': ['.commission-breakdown', '.commission-total-row', '.commission-seller-row'],
  'rent-vs-buy-calculator': ['.rent-bar-track', '.afford-total-row'],
  'cap-rate-calculator': ['.cap-tiles', '.cap-bottom-bar', '.cap-note', '.cap-group', '.cap-strip', '.cap-faq'],
  'roi-calculator': ['.roi-verdict', '.roi-tiles', '.roi-tile-', '.roi-row', '.roi-track',
    '.roi-seg-appreciation', '.roi-seg-paydown', '.roi-btn', '.roi-sticky', '.roi-copy-row'],
  'property-investment-calculator': ['.inv-tiles', '.inv-row', '.inv-track', '.inv-seg-',
    '.inv-btn', '.inv-bottom-bar', '.inv-sticky', '.inv-negative-note'],
  'capital-gains-tax-calculator': ['.cgt-tile', '.cgt-verdict', '.sale-bar', '.gain-bar',
    '.seg-costs', '.cgt-legend', '.cgt-btn', '.cgt-bottom-bar', '.cgt-note', '.cgt-copy-row',
    '.cgt-row span', '.cgt-row b', '.cgt-row-total'],
  'noi-calculator': ['.noi-verdict', '.noi-tiles', '.noi-tile', '.noi-row', '.noi-track',
    '.noi-seg-', '.noi-sticky', '.noi-results', '.noi-btn', '.noi-validation',
    '.results-heading', '.live-badge', '.reset-button', '.title-accent',
    '.input-panel', 'var(--noi-'],
};
for (const [slug, names] of Object.entries(DEAD)) {
  const css = stripComments(read(`tools/${slug}/calculator.css`));
  for (const name of names) {
    check(`${slug} css has no ${name}`, !css.includes(name));
  }
}

// 7. Kept hooks and guards survive the trim.
check('mortgage keeps .mortgage-current-term (JS-added, w2 asserts it)',
  read('tools/mortgage-calculator/calculator.css').includes('.mortgage-current-term'));
check('property keeps the .inv-verdict JS hook element',
  read('tools/property-investment-calculator/index.html').includes('class="inv-verdict"'));
check('CGT keeps .cgt-row[hidden] (shared [hidden] also covers it)',
  read('tools/capital-gains-tax-calculator/calculator.css').includes('.cgt-row[hidden]'));
for (const slug of ['roi-calculator', 'property-investment-calculator']) {
  check(`${slug} keeps the .calculator-layout > * min-width guard (w6)`,
    read(`tools/${slug}/calculator.css`).includes('.calculator-layout > *'));
}
check('NOI keeps its .panel-heading (bespoke hero/panel typography)',
  read('tools/noi-calculator/calculator.css').includes('.panel-heading'));
check('NOI has no var(--noi- references left (tokens inlined)',
  !read('tools/noi-calculator/calculator.css').includes('var(--noi-'));

// 8. The shared design-system file carries the components.
const tools = read('assets/tools.css');
for (const token of ['.calculator-layout > *', '.result-number', '.result-tiles',
  '.faq', '.formula-box', '.related-cards', '.sticky-result', '.tool-btn',
  '.breakdown-track', '.breakdown-legend', '[hidden]']) {
  check(`tools.css defines ${token}`, tools.includes(token));
}
// 9. The shared layout collapses to one column on mobile (shared rule must
// live in tools.css, after site.css, or the two-column grid persists at 390px).
check('tools.css collapses .calculator-layout to 1fr at <=760px',
  tools.includes('@media (max-width: 760px)')
  && tools.includes('grid-template-columns: minmax(0, 1fr)'));
// 10. Three-across tile values stay on one line ($194,670.00 broke mid-number).
check('tools.css shrinks .tiles-3 values so 11-char currency fits',
  tools.includes('.result-tiles.tiles-3 .result-tile > b'));

console.log(`W9: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(` - FAIL: ${f}`);
  process.exit(1);
}
