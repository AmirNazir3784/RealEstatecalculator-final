// Run from any directory: node path/to/website/tests/w6.cjs
// Footer consistency + launch-copy guard. Every public page must carry the
// approved footer (same brand paragraph, same closing line) and none of the
// pre-launch working wording that production shipped with.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]); }
const pages = walk(root).filter(f => f.endsWith('.html') && !f.split(path.sep).includes('dist-production'));
assert.equal(pages.length, 16, 'expected 16 website pages');
const BANNED = ['Working name, brand pending', 'Before launch', 'will be finalized before public launch', 'Connect support email, app login, pricing and approved legal policies'];
for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8');
  const label = path.relative(root, file);
  for (const phrase of BANNED) assert(!html.includes(phrase), `${label}: outdated launch wording remains: "${phrase}"`);
  const rawFooter = html.match(/<footer class="footer">[\s\S]*?<\/footer>/)?.[0] || '';
  assert(rawFooter, `${label}: footer missing`);
  // Compare wording, not source formatting: pretty-printed pages wrap the
  // same sentences across lines.
  const footer = rawFooter.replace(/\s+/g, ' ');
  assert(footer.includes('Practical tools for everyday decisions. RealtorCRM for the relationships behind them.'), `${label}: footer brand paragraph is not the approved wording`);
  assert(footer.includes('Tools for the work behind every property.'), `${label}: footer closing line is not the approved wording`);
  assert(footer.includes('Explore the CRM'), `${label}: footer RealtorCRM column missing`);
}
console.log(`PASS: ${pages.length} pages share the approved footer; no pre-launch wording remains.`);
