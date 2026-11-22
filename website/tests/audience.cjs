// Audience section (homepage redesign WIP): structure, card order,
// destinations, media attributes and the scoped CSS contract.
// Static checks in the style of h1.cjs; browser rendering is verified
// separately by screenshot review.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('index.html'), css = read('assets/home.css');

const section = html.match(/<section class="section home-audience"[\s\S]*?<\/section>/);
assert(section, 'audience section exists');
const s = section[0];
assert(s.includes('aria-labelledby="audience-title"'));
assert(s.includes('<h2 id="audience-title">Built for Every Role in Real Estate</h2>'), 'current H2 preserved');

const cards = [...s.matchAll(/<article class="home-audience-card">[\s\S]*?<\/article>/g)].map(m => m[0]);
assert.equal(cards.length, 4, 'four audience cards');

const expected = [
  ['Real Estate Agents', 'tools/commission-calculator/', 'real-estate-agent-tools'],
  ['Homebuyers', 'tools/mortgage-calculator/', 'homebuyers-mortgage-planning'],
  ['Property Investors', 'tools/property-investment-calculator/', 'property-investment-analysis'],
  ['Real Estate Teams', 'real-estate-crm/', 'real-estate-brokerage-team'],
];
cards.forEach((card, i) => {
  const [title, href, img] = expected[i];
  assert(card.includes(`<h3>${title}</h3>`), `card ${i + 1} title and order`);
  assert(card.includes(`href="${href}"`), `card ${i + 1} destination`);
  assert(card.includes('class="audience-card-media"'), `card ${i + 1} media wrapper`);
  assert(card.includes('class="audience-card-badge"'), `card ${i + 1} floating badge`);
  assert(card.includes('class="audience-card-body"'), `card ${i + 1} body wrapper`);
  assert(card.includes(`src="assets/homepage/${img}.webp"`), `card ${i + 1} image file`);
  assert(card.includes(`${img}-480.webp 480w`), `card ${i + 1} srcset small variant`);
  assert(card.includes('width="800" height="450" loading="lazy" decoding="async"'), `card ${i + 1} image attributes`);
  assert(/<a class="text-link" href="[^"]+">[^<]*<span class="link-arrow" aria-hidden="true">&rarr;<\/span><\/a>/.test(card), `card ${i + 1} CTA with arrow span`);
});

// Scoped CSS contract (home.css audience layer).
for (const rule of [
  '.home .home-audience {background:var(--paper);}',
  '.home .home-audience-card img {width:100%;height:auto;aspect-ratio:16/9;',
  '.home .audience-card-badge {position:absolute;bottom:12px;left:12px;width:42px;height:42px;',
  '.home .home-audience-card .text-link {margin-top:auto;',
  'min-height:44px',
  '.home .home-audience-card .text-link:focus-visible {',
  '@media (prefers-reduced-motion:reduce){.home .home-audience-card,',
  '@media(max-width:640px){.home .home-audience-grid {grid-template-columns:minmax(0,1fr);gap:20px;}',
]) assert(css.includes(rule), `CSS contract: ${rule.slice(0, 60)}`);

console.log('PASS: audience section — 4 cards in order, destinations, badges, image attributes, CTA structure, scoped CSS contract (16:9, focus-visible, reduced motion, mobile stacking).');
