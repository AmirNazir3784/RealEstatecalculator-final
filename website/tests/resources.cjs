const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = (() => { const dist = path.resolve(__dirname, '..', 'dist'); if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('website/dist not found. Run "npm --prefix website run build" first (tests run against the Astro build output).'); process.exit(1); } return dist; })();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('resources/index.html');
// The three guides now live on standalone article pages; the worked examples
// are verified there, still against actual calculator execution.
const articles = { commission: read('resources/real-estate-commission/index.html'), mortgage: read('resources/mortgage-payments/index.html'), affordability: read('resources/how-much-house-can-i-afford/index.html') };
for (const name of ['commission', 'mortgage', 'home-affordability']) {
  const page = read(`tools/${name}-calculator/index.html`), nodes = {};
  for (const match of page.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
    nodes[match[1]] = { value: match[0].match(/\bvalue="([^"]*)"/)?.[1] || '', textContent: '', addEventListener() {} };
  }
  const inputs = [...page.matchAll(/<input[^>]+\bid="([^"]+)"/g)].map(m => nodes[m[1]]);
  const script = name === 'mortgage' ? read('tools/mortgage-calculator/calculator.js') : name === 'home-affordability' ? read('tools/home-affordability-calculator/calculator.js') : read('tools/commission-calculator/calculator.js');
  // The affordability article's worked example uses the guideline budget
  // ($2,333.33 from $100,000 income, $500 debts, 28/36), not the page default.
  if (name === 'home-affordability') nodes['monthly-budget'].value = '2333.33';
  vm.runInNewContext(script, { Intl, document: {
    querySelector: selector => selector === `#${name}-form` ? nodes[`${name}-form`] : null,
    querySelectorAll: selector => selector === `#${name}-form input` ? inputs : [],
    getElementById: id => nodes[id]
  } });
  const keys = name === 'commission' ? ['commission-total','commission-agent','commission-net'] : name === 'home-affordability' ? ['afford-price','afford-loan','afford-monthly','cash-to-close'] : ['loan-amount','monthly-payment'];
  const article = articles[name === 'home-affordability' ? 'affordability' : name];
  for (const key of keys) {
    const displayed = article.match(new RegExp(`data-example="${key}">([^<]+)`))?.[1];
    assert.equal(displayed, nodes[key].textContent, `Example differs from calculator: ${key}`);
  }
}
assert(html.includes('<h1>Real Estate Resources</h1>'));
assert(!html.includes('<span class="eyebrow">Resources</span>'));
assert(html.includes('Practical guides to buying, selling, financing and investing in real estate.'));
assert(articles.mortgage.includes('At 0% interest'));
assert(articles.mortgage.includes('HOA dues'));
assert(articles.commission.includes('taxes, referral payments'));
assert(!/No standalone guides|Before launch|Working name|Static demonstration/.test(html));
for (const slug of ['commission-calculator', 'mortgage-calculator']) assert(html.includes(`href="../tools/${slug}/"`));
const footer = html.match(/<footer[\s\S]*?<\/footer>/)[0];
assert(footer.includes('data-brand-name'));
assert(footer.includes('href="../about/"'));
assert(articles.mortgage.includes('<summary>See the payment formula</summary>'));
assert(read('assets/resources.css').includes('font-family:var(--font-display)'));
console.log('PASS: nine worked-example outputs match actual calculator execution; educational limitations, native formula disclosure, font tokens, branding and calculator links checked.');
console.log('Visual rendering and overflow require browser review; these are script/static checks.');
