// RealtorOS CRM production packager.
//
// Copies the static CRM app (Realtor main CRM/RealtorOS_Project/app/) into
// deployment/dist-crm/ with the production configuration applied to the
// OUTPUT ONLY — the source tree keeps its local development values:
//   * assets/js/config.js  websiteUrl  http://localhost:5501
//                            -> https://everyrealestatecalculator.com
// Adds deployment/crm.htaccess as .htaccess and validates the result.
// Run from anywhere:  node deployment/package-crm.mjs

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'Realtor main CRM', 'RealtorOS_Project', 'app');
const out = join(root, 'deployment', 'dist-crm');

const EXCLUDED = new Set(['.gitignore', '.env.example']);
const DEV_URL = 'websiteUrl: "http://localhost:5501"';
const PROD_URL = 'websiteUrl: "https://everyrealestatecalculator.com"';

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(src, out, { recursive: true, filter: (p) => !EXCLUDED.has(basename(p)) });

// Production websiteUrl — output copy only.
const cfgPath = join(out, 'assets', 'js', 'config.js');
const cfg = readFileSync(cfgPath, 'utf8');
if (!cfg.includes(DEV_URL)) throw new Error('package-crm: expected development websiteUrl not found in config.js — source changed, review before packaging.');
writeFileSync(cfgPath, cfg.replace(DEV_URL, PROD_URL));

// Headers / caching for the subdomain host.
cpSync(join(root, 'deployment', 'crm.htaccess'), join(out, '.htaccess'));

// Validation.
for (const required of ['index.html', 'sw.js', 'manifest.webmanifest', 'unsubscribe.html', '.htaccess']) {
  if (!existsSync(join(out, required))) throw new Error(`package-crm: missing required file in output: ${required}`);
}
let files = 0, bytes = 0;
const stack = [out];
while (stack.length) {
  const dir = stack.pop();
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { stack.push(p); continue; }
    files++; bytes += statSync(p).size;
    const text = readFileSync(p, 'utf8');
    if (/http:\/\/(localhost|127\.0\.0\.1)/.test(text)) throw new Error(`package-crm: development URL leaked into output: ${p}`);
    if (/service[_-]?role/i.test(text) && !/never|do not|not/i.test(text)) throw new Error(`package-crm: possible service-role reference in output: ${p}`);
  }
}
if (!readFileSync(cfgPath, 'utf8').includes(PROD_URL)) throw new Error('package-crm: production websiteUrl missing from output config.');
console.log(`Packaged ${files} files (${bytes} bytes) into deployment/dist-crm`);
console.log('Verified: entry page, service worker, manifest present; production websiteUrl applied to output only; no development URLs; no service-role material.');
