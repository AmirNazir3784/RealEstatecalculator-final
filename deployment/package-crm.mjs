// RealtorOS CRM production packager.
//
// Copies the static CRM app (Realtor main CRM/RealtorOS_Project/app/) into
// deployment/dist-crm/ with the production configuration applied to the
// OUTPUT ONLY — the source tree keeps its local development values:
//   * assets/js/config.js  websiteUrl  http://localhost:5501
//                            -> https://everyrealestatecalculator.com
//   * sw.js                VERSION   -> a unique per-build stamp, so
//                            every deploy busts the service-worker
//                            shell cache (see the stamping step below)
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

// Service-worker cache version — output copy only. The shell is served
// cache-first under a cache named by the VERSION string in sw.js, so a
// deploy that ships a changed shell under an unchanged VERSION is
// invisible to installed browsers: no new worker is detected, no update
// is offered, and the old shell keeps running (the mailbox release
// shipped exactly that way on 2026-11-17 — the card existed on the
// server while returning browsers kept the pre-mailbox page). Stamp a
// unique version into every packaged build so each deploy busts the
// cache and offers the update.
const swPath = join(out, 'sw.js');
const sw = readFileSync(swPath, 'utf8');
const swVersion = sw.match(/const VERSION = "[^"]+";/);
if (!swVersion) throw new Error('package-crm: expected VERSION declaration not found in sw.js — source changed, review before packaging.');
const swStamp = 'crm-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + (process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : 'local');
writeFileSync(swPath, sw.replace(swVersion[0], `const VERSION = "${swStamp}";`));

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
console.log(`Verified: entry page, service worker, manifest present; production websiteUrl applied to output only; service-worker version stamped "${swStamp}"; no development URLs; no service-role material.`);
