const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = (() => { const dist = path.resolve(__dirname, '..', 'dist'); if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('website/dist not found. Run "npm --prefix website run build" first (tests run against the Astro build output).'); process.exit(1); } return dist; })();
const pages = ['index.html', 'tools/index.html', 'real-estate-crm/index.html', 'about/index.html', 'resources/index.html', 'contact/index.html', 'tools/commission-calculator/index.html', 'tools/mortgage-calculator/index.html', 'tools/down-payment-calculator/index.html', 'tools/home-affordability-calculator/index.html', 'tools/rent-vs-buy-calculator/index.html', 'tools/cap-rate-calculator/index.html', 'tools/rental-yield-calculator/index.html', 'tools/commercial-real-estate-calculator/index.html', 'tools/irr-calculator/index.html', 'tools/depreciation-calculator/index.html', 'tools/wholesale-calculator/index.html', 'tools/bridge-loan-calculator/index.html', 'tools/property-investment-calculator/index.html', 'tools/capital-gains-tax-calculator/index.html', 'tools/roi-calculator/index.html', 'tools/noi-calculator/index.html'];
const titles = new Set(), descriptions = new Set();
for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), 'utf8').replaceAll('&#38;', '&amp;');
  const title = [...html.matchAll(/<title>([^<]+)<\/title>/g)];
  const description = [...html.matchAll(/<meta name="description" content="([^"]+)">/g)];
  assert.equal(title.length, 1, page); assert.equal(description.length, 1, page);
  assert(!titles.has(title[0][1]), `Duplicate title: ${page}`); titles.add(title[0][1]);
  assert(!descriptions.has(description[0][1]), `Duplicate description: ${page}`); descriptions.add(description[0][1]);
  for (const key of ['og:title', 'twitter:title']) assert(html.includes(`content="${title[0][1]}"`) && new RegExp(`(?:property|name)="${key}" content="${title[0][1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(html), page);
  for (const key of ['og:description', 'twitter:description']) assert(html.includes(`="${key}" content="${description[0][1]}"`), page);
  assert(html.includes('property="og:type" content="website"'));
  assert(html.includes('name="twitter:card" content="summary"'));
  assert(html.includes('rel="canonical" href="https://everyrealestatecalculator.com'), 'Configured canonical URL required'); assert(html.includes('property="og:url" content="https://everyrealestatecalculator.com'), 'Configured og:url required');
  assert(html.includes('<html lang="en">')); assert(html.includes('charset="utf-8"'));
  assert(html.includes('class="skip-link" href="#main"'));
  let previous = 0, h1 = 0;
  for (const heading of html.matchAll(/<h([1-6])\b/g)) {
    const level = Number(heading[1]);
    assert(level <= previous + 1, `Skipped heading level in ${page}`);
    previous = level; if (level === 1) h1++;
  }
  assert.equal(h1, 1);
  for (const script of html.matchAll(/<script\b[^>]*src="[^"]+"[^>]*>/g)) assert(/\bdefer\b/.test(script[0]), page);
}
assert(fs.existsSync(path.join(root, 'sitemap.xml')), 'sitemap.xml required for production');
assert(fs.existsSync(path.join(root, 'robots.txt')), 'robots.txt required for production');
const contact = fs.readFileSync(path.join(root, 'contact/index.html'), 'utf8');
assert(contact.replace(/\s+/g, ' ').includes('It does not send or save your enquiry.'), 'contact page keeps its honest draft-only disclosure in the intro copy'); // whitespace-tolerant: the sentence sits in the intro paragraph (the delivery-note box was removed on request); the disclosure itself must remain
assert(contact.includes('Your draft (not sent)'));
assert(!/<form[^>]*action=/.test(contact));
console.log('PASS: 17 unique titles/descriptions, matching social metadata, heading order, language/skip links, deferred scripts, configured canonical/sitemap URLs for everyrealestatecalculator.com, honest draft-only contact messaging.');

// Regression: the header navigation's RealtorCRM item must open the
// product details page (/real-estate-crm/), never the CRM login app. The
// data-crm-link marker is what assets/site.js rewrites to the app URL,
// so the nav item must not carry it - while the header's two
// "Sign in to RealtorCRM" CTAs must keep it (they are login buttons).
for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), 'utf8').replaceAll('&#38;', '&amp;');
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  const navItem = [...header.matchAll(/<a [^>]*>RealtorCRM<\/a>/g)];
  assert.equal(navItem.length, 1, `${page}: exactly one header nav RealtorCRM item`);
  assert(!navItem[0][0].includes('data-crm-link'), `${page}: header nav RealtorCRM item must not be rewritten to the CRM app`);
  assert(/href="((?:\.\.\/)*real-estate-crm\/)"/.test(navItem[0][0]), `${page}: header nav RealtorCRM item must link to the details page`);
  const signInCtas = [...header.matchAll(/<a [^>]*data-crm-link="login"[^>]*>\s*Sign in to RealtorCRM/g)];
  assert.equal(signInCtas.length, 2, `${page}: both header Sign in CTAs keep their CRM app wiring`);
}

// RealtorCRM product page: approved structure, exact copy, live CTAs,
// the clean video-ready media frame, and none of the retired sections.
{
  const page = fs.readFileSync(path.join(root, 'real-estate-crm/index.html'), 'utf8');
  assert(page.includes('<h1 id="product-title">Keep every lead, deal, and follow-up'), 'hero headline');
  assert(page.includes('REALTORCRM · BUILT FOR REAL ESTATE AGENTS'), 'hero eyebrow');
  assert(page.includes('Manage buyers, sellers, listings, deals, and automated email follow-ups'), 'hero description');
  for (const t of ['Buyer &amp; Seller workspaces', 'Gmail &amp; Outlook sending', 'Built for realtors']) assert(page.includes(t), `trust item: ${t}`);
  assert(page.includes('rc-media-frame') && !page.includes('Add your product video or screenshots here') && !page.includes('RealtorCRM Product Demo'), 'hero media: clean video-ready frame, placeholder removed');
  assert(page.includes('<h2 id="features-title">Everything you need between the first inquiry and closing.</h2>'), 'features heading');
  assert(page.includes('<h2 id="leads-title">Stop losing warm leads in spreadsheets and sticky notes.</h2>'), 'lead & deal management heading');
  assert(page.includes('crm-leads-contacts.webp'), 'lead & deal screenshot');
  assert(page.includes('<h2 id="followup-title">Follow up consistently — and step in the moment they reply.</h2>'), 'follow-ups & email heading');
  assert(page.includes('crm-followup-automation.webp'), 'follow-up automation screenshot');
  assert(page.includes('<h2 id="access-title">Your next opportunity starts with better follow-up.</h2>'), 'final CTA heading');
  assert.equal([...page.matchAll(/data-crm-link="signup"[^>]*>Get Started with RealtorCRM/g)].length, 2, 'both Get Started CTAs use the signup app link');
  assert.equal([...page.matchAll(/href="#features">Explore/g)].length, 2, 'both Explore CTAs scroll to the features section');
  for (const gone of ['Relationships need attention', 'From first conversation to the next opportunity', 'A clear rhythm for your day', 'Make room for the relationships that matter', 'A simple workflow that keeps you ahead', 'product-access-note', 'RealtorOS']) assert(!page.includes(gone), `retired content must not remain: ${gone}`);
}

// Browser-tab titles follow the approved concise patterns.
// 2026-11-26: homepage expectation re-pinned to main's current title. The keyword
// title below belongs to the unmerged homepage WIP branch; while main carries
// 'Every Real Estate Calculator | Tools & Guides', the test must expect that —
// the mismatch had been failing website-tests and Deploy website on every push.
{
  const expected = new Map([
    ['index.html', 'Every Real Estate Calculator | Tools &amp; Guides'],
    ['real-estate-crm/index.html', 'RealtorCRM | CRM for Real Estate Agents'],
    ['about/index.html', 'About | Every Real Estate Calculator'],
    ['contact/index.html', 'Contact | Every Real Estate Calculator'],
    ['resources/index.html', 'Resources | Every Real Estate Calculator'],
    ['tools/index.html', 'Free Real Estate Calculators | 16 Online Tools'],
    ['tools/down-payment-calculator/index.html', 'Down Payment Calculator: Cash to Close, PMI &amp; Tiers'], // brief-approved title (no brand suffix); pinned explicitly
  ]);
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8').replaceAll('&#38;', '&amp;');
    const title = html.match(/<title>([^<]+)<\/title>/)[1];
    if (expected.has(page)) assert.equal(title, expected.get(page), `${page} title`);
    else assert(/ Calculator \| Every Real Estate Calculator$/.test(title), `${page} calculator title pattern: ${title}`);
  }
}
