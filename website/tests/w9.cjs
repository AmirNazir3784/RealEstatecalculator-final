// W9 — Resources redesign guards.
// Locks the CaptionX-style Resources hub and the standalone guide articles:
// exactly two real guide cards (no invented dates), the legacy hub anchors
// still resolve, both articles exist with correct canonicals and matching
// reading times, the calculator directory is intact, and the shared
// stylesheet lives in assets/. Dependency-free. Run: node website/tests/w9.cjs
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
let passed = 0;
function check(name, value) { assert(value, name); passed++; }
function equal(name, actual, expected) { assert.deepEqual(actual, expected, name); passed++; }

const hub = read('resources/index.html');
const mortgage = read('resources/mortgage-payments/index.html');
const commission = read('resources/real-estate-commission/index.html');
const css = read('assets/resources.css');

// Hub: intro + exactly two real cards, no dates, no extra features.
check('hub H1', hub.includes('<h1>Real Estate Resources</h1>'));
check('hub intro copy', hub.includes('Practical guides to buying, selling, financing and investing in real estate.'));
equal('exactly two article cards', (hub.match(/class="article-card"/g) || []).length, 2);
check('mortgage card title', hub.includes('<h2>Understanding Mortgage Payments</h2>'));
check('commission card title', hub.includes('<h2>Understanding Real Estate Commission</h2>'));
check('mortgage card link', hub.includes('href="mortgage-payments/"'));
check('commission card link', hub.includes('href="real-estate-commission/"'));
check('no dates on cards', !hub.includes('card-date') && !/<time[\s>]/.test(hub));
check('no search/filter/newsletter on hub', !/article-search|category-filter|newsletter/.test(hub));
for (const [name, card] of [['mortgage', hub.match(/<article class="article-card" id="mortgage-guide">[\s\S]*?<\/article>/)[0]],
                            ['commission', hub.match(/<article class="article-card" id="commission-guide">[\s\S]*?<\/article>/)[0]]]) {
  const desc = card.match(/<p class="article-card-desc">([\s\S]*?)<\/p>/)[1].replace(/<[^>]+>/g, '');
  const words = desc.trim().split(/\s+/).length;
  check(`${name} card description 25-40 words (${words})`, words >= 25 && words <= 40);
  check(`${name} card single link`, (card.match(/<a\s/g) || []).length === 1);
}

// Legacy anchors still resolve on the hub.
for (const id of ['mortgage-guide', 'commission-guide', 'calculators']) check(`hub anchor #${id}`, hub.includes(`id="${id}"`));

// Calculator directory intact: all ten tools linked from the hub.
for (const slug of ['mortgage-calculator', 'home-affordability-calculator', 'rent-vs-buy-calculator', 'bridge-loan-calculator',
  'cap-rate-calculator', 'noi-calculator', 'roi-calculator', 'property-investment-calculator',
  'capital-gains-tax-calculator', 'commission-calculator']) {
  check(`hub directory links ${slug}`, hub.includes(`href="../tools/${slug}/"`));
}

// Standalone articles: identity, SEO and template wiring.
for (const [name, page, slug, title] of [
  ['mortgage', mortgage, 'mortgage-payments', 'Understanding Mortgage Payments'],
  ['commission', commission, 'real-estate-commission', 'Understanding Real Estate Commission']]) {
  equal(`${name} exactly one H1`, (page.match(/<h1>/g) || []).length, 1);
  check(`${name} H1 text`, page.includes(`<h1>${title}</h1>`));
  check(`${name} canonical`, page.includes(`rel="canonical" href="https://everyrealestatecalculator.com/resources/${slug}/"`));
  check(`${name} shared stylesheet`, page.includes('href="../../assets/resources.css"'));
  check(`${name} breadcrumbs`, page.includes('aria-label="Breadcrumb"') && page.includes('href="../">Resources</a>'));
  check(`${name} no inline scripts`, !/<script(?![^>]*\bsrc=)/i.test(page));
  check(`${name} no inline handlers`, !/<[^>]*\son[a-z]+\s*=/i.test(page));
  check(`${name} no invented date`, !/<time[\s>]/.test(page) && !page.includes('Last updated'));
}
check('mortgage article links its calculator', mortgage.includes('href="../../tools/mortgage-calculator/"'));
check('commission article links its calculator', commission.includes('href="../../tools/commission-calculator/"'));
check('articles cross-link', mortgage.includes('href="../real-estate-commission/"') && commission.includes('href="../mortgage-payments/"'));
// The mortgage guide now states the calculator's real model (tax, insurance,
// HOA dues and PMI are added when entered); the old false exclusion is gone.
check('mortgage fix: added when entered', mortgage.includes('plus property tax, homeowner insurance, HOA dues and PMI whenever you enter them'));
check('mortgage fix: old exclusion removed', !mortgage.includes('The result excludes property taxes') && !mortgage.includes('It does not model rate changes, extra payments'));

// Reading times agree between each hub card and its article page.
for (const [name, page, id] of [['mortgage', mortgage, 'mortgage-guide'], ['commission', commission, 'commission-guide']]) {
  const card = hub.match(new RegExp(`<article class="article-card" id="${id}">[\\s\\S]*?</article>`))[0];
  const cardMin = card.match(/(\d+) min read/)[1], pageMin = page.match(/(\d+) min read/)[1];
  equal(`${name} reading time consistent`, cardMin, pageMin);
}

// Sitemap carries both articles; 18 URLs in total.
const sm = read('sitemap.xml');
equal('sitemap 18 URLs', (sm.match(/<loc>/g) || []).length, 18);
check('sitemap mortgage article', sm.includes('<loc>https://everyrealestatecalculator.com/resources/mortgage-payments/</loc>'));
check('sitemap commission article', sm.includes('<loc>https://everyrealestatecalculator.com/resources/real-estate-commission/</loc>'));

// Centralized stylesheet: shared file exists, page-local copy is gone.
check('shared resources.css in assets', fs.existsSync(path.join(root, 'assets/resources.css')));
check('page-local resources.css removed', !fs.existsSync(path.join(root, 'resources/resources.css')));
check('grid tokens in shared css', css.includes('grid-template-columns: repeat(3, minmax(0, 1fr))') && css.includes('border-radius: 15px'));

console.log(`W9: ${passed} passed, 0 failed (Resources hub cards, standalone articles, anchors, sitemap, shared stylesheet).`);
