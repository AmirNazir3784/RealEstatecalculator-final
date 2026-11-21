const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('index.html'), css = read('assets/home.css');
const ctx = { window: {} }; vm.runInNewContext(read('assets/tool-registry.js'), ctx);
const registry = ctx.window.realEstateTools;
const published = registry.filter(t => t.status === 'published');
const fallback = [...html.matchAll(/data-home-tool="([^"]+)" href="([^"]+)"/g)];
// Homepage panel: the static fallback and the unfiltered panel show only the
// first two published tools; typing in the search covers all published tools.
assert.deepEqual(fallback.map(m => [m[1], m[2]]), Array.from(published.slice(0, 2), t => [t.slug, 'tools/' + t.publicUrl]));
class Element {
  constructor() { this.children = []; this.attributes = {}; this.value = ''; this.listeners = {}; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(k, v) { this.attributes[k] = v; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  focus() { this.focused = true; }
}
function render(tools) {
  const grid = new Element();
  const ids = { 'home-search': new Element(), 'home-search-results': new Element(), 'home-search-status': new Element() };
  const ctx = { window: { realEstateTools: tools }, document: { getElementById: id => ids[id], createElement: () => new Element() } };
  vm.runInNewContext(read('assets/tool-search.js'), ctx);
  vm.runInNewContext(read('assets/home.js'), ctx);
  grid.ids = ids;
  return grid;
}
const cards = render([...registry, { slug: 'draft', status: 'draft', publicUrl: 'draft/' }]).ids['home-search-results'].children;
assert.equal(cards.length, 2);
assert.deepEqual(cards.map(c => c.href), Array.from(published.slice(0, 2), t => 'tools/' + t.publicUrl));
assert.equal(render([]).ids['home-search-results'].children[0].textContent, 'No tools are published yet.');
assert.equal(render(undefined).children.length, 0);
const live = render([...registry, { slug:'draft', title:'Hidden draft', status:'draft', publicUrl:'draft/' }]);
const search = live.ids['home-search'], results = live.ids['home-search-results'], status = live.ids['home-search-status'];
assert.equal(results.children.length, 2);
search.value = ' MORTGAGE '; search.listeners.input();
assert.equal(results.children.length, 1); assert.equal(results.children[0].href, 'tools/mortgage-calculator/');
search.value = 'transaction fees'; search.listeners.input();
assert.equal(results.children[0].href, 'tools/commission-calculator/');
search.value = 'draft'; search.listeners.input(); assert.equal(status.textContent, '0 tools found');
assert(results.children[0].textContent.includes('No matching tools'));
search.value = ''; search.listeners.input(); assert.equal(status.textContent, '2 tools found');
assert.equal(render([]).ids['home-search-status'].textContent, '0 tools found');
search.value = 'Finance & numbers'; search.listeners.input();
assert.equal(status.textContent, '10 tools found');
search.value = 'NOI'; search.listeners.input();
assert.deepEqual(results.children.map(c => c.href), ['tools/cap-rate-calculator/', 'tools/noi-calculator/']);
search.value = 'cgt'; search.listeners.input();
assert.deepEqual(results.children.map(c => c.href), ['tools/capital-gains-tax-calculator/']);
search.value = 'net operating'; search.listeners.input();
assert.deepEqual(results.children.map(c => c.href), ['tools/cap-rate-calculator/', 'tools/noi-calculator/']);
search.value = 'vacancy'; search.listeners.input();
assert.deepEqual(results.children.map(c => c.href), ['tools/cap-rate-calculator/', 'tools/noi-calculator/']);
search.value = 'mort'; search.listeners.input();
assert.deepEqual(results.children.map(c => c.href), ['tools/mortgage-calculator/']);
search.value = 'how much house'; search.listeners.input();
assert.deepEqual(results.children.map(c => c.href), ['tools/home-affordability-calculator/']);
const section = html.match(/<section class="section home-calculators"[\s\S]*?<\/section>/)[0];
assert(section.includes('Explore Our Real Estate Calculators'));
for (const tab of ['All Calculators (10)', 'Buying &amp; Financing', 'Property Investment', 'Selling, Tax &amp; Agent Tools']) assert(section.includes('>' + tab + '</button>'), 'tab: ' + tab);
const calcCats = [...section.matchAll(/<article class="home-calc-card" data-category="([a-z]+)"/g)].map(m => m[1]);
assert.deepEqual(calcCats, ['buying', 'buying', 'buying', 'buying', 'investment', 'investment', 'investment', 'investment', 'selling', 'selling']);
assert(css.includes('.home .home-calc-grid {display:grid;grid-template-columns:repeat(3,minmax(0,1fr))'));
assert(css.includes('.home .home-calc-card[hidden] {display:none;}'));
assert(read('assets/home.js').includes("querySelectorAll('.home-tab')"));
assert(!html.includes('class="home-tool-grid"'), 'No duplicate large calculator cards');
assert(html.includes('class="home-product-overview"'));
assert(!/Screenshot placeholder|Genuine preview pending|home-screenshot/.test(html));
const footer = html.match(/<footer[\s\S]*?<\/footer>/)[0];
assert(!/Before launch|Working name|brand pending|Static demonstration|finalized before public launch/.test(footer));
assert(footer.includes('data-brand-name'));
for (const href of ['tools/', 'tools/commission-calculator/', 'tools/mortgage-calculator/', 'tools/home-affordability-calculator/', 'tools/rent-vs-buy-calculator/', 'real-estate-crm/', 'resources/', 'about/', 'contact/']) assert(footer.includes(`href="${href}"`));
assert(css.includes('.home .footer .brand {display:inline-flex'));
assert(css.includes('max-width:100%;white-space:normal'));
assert(css.includes('max-height:calc(100dvh - 68px);overflow-y:auto'));
assert(!/Sarah M\.|James C\.|Emily W\.|Illustrative sample|crm-line|small-insight/.test(html));
assert(html.indexOf('assets/tool-registry.js') < html.indexOf('assets/home.js'));
assert(html.includes('id="calculators"'));
for (const width of [1000,760,540]) assert(css.includes(`max-width:${width}px`));
assert(css.includes('grid-template-columns:minmax(0,1fr)'));
assert(css.includes('min-height:48px'));
const sections = [...html.matchAll(/<section class="([^"]+)"/g)].map(m => m[1]);
assert.deepEqual(sections, ['home-hero', 'home-value-strip', 'section home-calculators', 'home-product', 'section home-values', 'section home-guides', 'section home-faq', 'home-closing']);
const calcLinks = [...section.matchAll(/<h3><a href="([^"]+)"/g)].map(m => m[1]);
const publishedUrls = Array.from(published, t => 'tools/' + t.publicUrl);
assert.equal(calcLinks.length, 10);
for (const link of calcLinks) assert(publishedUrls.includes(link));
const guides = html.match(/<section class="section home-guides"[\s\S]*?<\/section>/)[0];
const guideLinks = [...guides.matchAll(/<h3><a href="([^"]+)"/g)].map(m => m[1]);
assert.deepEqual(guideLinks, ['resources/how-much-house-can-i-afford/', 'resources/what-is-a-good-cap-rate/', 'resources/should-i-rent-or-buy-a-house/', 'resources/mortgage-payments/', 'resources/real-estate-commission/']);
const faq = html.match(/<section class="section home-faq"[\s\S]*?<\/section>/)[0];
assert.equal((faq.match(/<details>/g) || []).length, 4);
assert.equal((faq.match(/<summary>/g) || []).length, 4);
assert(faq.includes('100% free to use with no limits'));
assert(faq.includes('No signup or account is required'));
for (const capability of ['Follow-ups', 'Contacts', 'Deals', 'Next Steps']) assert(html.includes(`<h3>${capability}</h3>`));
const theme = read('assets/theme.css');
assert(theme.includes("--font-body:'Inter'"));
assert(theme.includes("--font-display:'Source Serif 4'"));
assert(theme.includes('font-weight:500'));
console.log('PASS: homepage registry/static fallback alignment, draft exclusion, empty state, honest product overview, clean configurable footer, preserved links/anchor, script order, responsive safeguards and touch-target sizing.');
console.log('CSS checks are structural; desktop/tablet/Android browser rendering and reference matching still require visual review.');
