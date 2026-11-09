const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const pages = ['index.html', 'tools/index.html', 'realtorcrm/index.html', 'about/index.html', 'resources/index.html', 'contact/index.html', 'tools/commission-calculator/index.html', 'tools/mortgage-calculator/index.html', 'tools/home-affordability-calculator/index.html', 'tools/rent-vs-buy-calculator/index.html', 'tools/cap-rate-calculator/index.html', 'tools/bridge-loan-calculator/index.html', 'tools/property-investment-calculator/index.html', 'tools/capital-gains-tax-calculator/index.html', 'tools/roi-calculator/index.html', 'tools/noi-calculator/index.html'];
const titles = new Set(), descriptions = new Set();
for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
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
console.log('PASS: 16 unique titles/descriptions, matching social metadata, heading order, language/skip links, deferred scripts, configured canonical/sitemap URLs for everyrealestatecalculator.com, honest draft-only contact messaging.');

// Regression: the header navigation's RealtorCRM item must open the
// product details page (/realtorcrm/), never the CRM login app. The
// data-crm-link marker is what assets/site.js rewrites to the app URL,
// so the nav item must not carry it - while the header's two
// "Sign in to RealtorCRM" CTAs must keep it (they are login buttons).
for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
  const navItem = [...header.matchAll(/<a [^>]*>RealtorCRM<\/a>/g)];
  assert.equal(navItem.length, 1, `${page}: exactly one header nav RealtorCRM item`);
  assert(!navItem[0][0].includes('data-crm-link'), `${page}: header nav RealtorCRM item must not be rewritten to the CRM app`);
  assert(/href="((?:\.\.\/)*realtorcrm\/)"/.test(navItem[0][0]), `${page}: header nav RealtorCRM item must link to the details page`);
  const signInCtas = [...header.matchAll(/<a [^>]*data-crm-link="login"[^>]*>\s*Sign in to RealtorCRM/g)];
  assert.equal(signInCtas.length, 2, `${page}: both header Sign in CTAs keep their CRM app wiring`);
}

// RealtorCRM product page: approved structure, exact copy, live CTAs,
// media placeholders, and none of the retired sections.
{
  const page = fs.readFileSync(path.join(root, 'realtorcrm/index.html'), 'utf8');
  assert(page.includes('<h1 id="product-title">Keep every lead, deal, and follow-up'), 'hero headline');
  assert(page.includes('REALTORCRM · BUILT FOR REAL ESTATE AGENTS'), 'hero eyebrow');
  assert(page.includes('Manage contacts, track deals, plan follow-ups, and stay organized'), 'hero description');
  for (const t of ['All-in-one workspace', 'Simple and easy to use', 'Built for realtors']) assert(page.includes(t), `trust item: ${t}`);
  assert(page.includes('RealtorCRM Product Demo') && page.includes('Add your product video or screenshots here'), 'hero media placeholder');
  assert(page.includes('<h2 id="features-title">The essential tools to run your real estate business.</h2>'), 'features heading');
  for (const c of ['Keep your clients and leads organized with their details and history.', 'Track opportunities, monitor progress, and manage your pipeline.', 'Plan your next actions and keep conversations moving.', 'Review your activity and understand what needs attention.']) assert(page.includes(c), `feature copy: ${c}`);
  assert(page.includes('<h2 id="workflow-title">A simple workflow that keeps you ahead.</h2>'), 'workflow heading');
  for (const s of ['Add a Contact', 'Plan a Follow-up', 'Move the Deal Forward']) assert(page.includes(`<h3>${s}</h3>`), `step: ${s}`);
  assert(page.includes('<h2 id="mobile-title">Your workspace, wherever your day takes you.</h2>'), 'mobile heading');
  assert(page.includes('RealtorCRM Mobile Preview') && page.includes('Add your real mobile screenshot here'), 'mobile placeholder');
  assert(page.includes('href="#access">View access availability'), 'access link kept');
  assert(page.includes('<h2 id="access-title">Your next opportunity starts with better follow-up.</h2>'), 'final CTA heading');
  assert.equal([...page.matchAll(/data-crm-link="signup"[^>]*>Get Started with RealtorCRM/g)].length, 2, 'both Get Started CTAs use the signup app link');
  assert.equal([...page.matchAll(/href="#features">Explore/g)].length, 2, 'both Explore CTAs scroll to the features section');
  for (const gone of ['Relationships need attention', 'From first conversation to the next opportunity', 'A clear rhythm for your day', 'Make room for the relationships that matter', 'product-access-note', 'RealtorOS']) assert(!page.includes(gone), `retired content must not remain: ${gone}`);
}

// Browser-tab titles follow the approved concise patterns.
{
  const expected = new Map([
    ['index.html', 'Every Real Estate Calculator | Tools &amp; Guides'],
    ['realtorcrm/index.html', 'RealtorCRM | CRM for Real Estate Agents'],
    ['about/index.html', 'About | Every Real Estate Calculator'],
    ['contact/index.html', 'Contact | Every Real Estate Calculator'],
    ['resources/index.html', 'Resources | Every Real Estate Calculator'],
    ['tools/index.html', 'Real Estate Calculators | Free Online Tools'],
  ]);
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const title = html.match(/<title>([^<]+)<\/title>/)[1];
    if (expected.has(page)) assert.equal(title, expected.get(page), `${page} title`);
    else assert(/ Calculator \| Every Real Estate Calculator$/.test(title), `${page} calculator title pattern: ${title}`);
  }
}
