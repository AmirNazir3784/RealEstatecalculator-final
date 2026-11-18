import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertArtifact, assertHostPreservation } from '../assert-isolation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const website = path.join(root, 'website/dist-production');
const crm = path.join(root, 'deployment/dist-crm');
function manifest(dir, prefix = '') {
  return Object.fromEntries(fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name), rel = prefix + e.name;
    return e.isDirectory() ? Object.entries(manifest(full, rel + '/')) : [[rel, crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex')]];
  }).sort(([a], [b]) => a.localeCompare(b)));
}
function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-isolation-'));
  // Only remove the exact directory created above, within the OS temp root.
  t.after(() => { assert(path.dirname(dir) === os.tmpdir()); fs.rmSync(dir, { recursive: true, force: true }); });
  return dir;
}
function assemble(dir) {
  fs.cpSync(website, dir, { recursive: true });
  fs.copyFileSync(path.join(root, 'deployment/website.htaccess'), path.join(dir, '.htaccess'));
  fs.copyFileSync(path.join(root, 'deployment/website-deploy.gitignore'), path.join(dir, '.gitignore'));
}

test('production artifacts have disjoint ownership and downloaded-tree guards reject contamination', t => {
  const site = path.join(temp(t), 'website'); assemble(site);
  assertArtifact('website', site); assertArtifact('crm', crm);
  for (const reserved of ['realtorcrm', 'RealtorCRM', 'realtoros']) {
    fs.mkdirSync(path.join(site, reserved));
    assert.throws(() => assertArtifact('website', site), /reserved root/);
    fs.rmdirSync(path.join(site, reserved));
  }
  fs.unlinkSync(path.join(site, '.gitignore'));
  assert.throws(() => assertArtifact('website', site));
  const badCrm = path.join(temp(t), 'crm'); fs.cpSync(crm, badCrm, { recursive: true });
  fs.mkdirSync(path.join(badCrm, 'real-estate-crm'));
  assert.throws(() => assertArtifact('crm', badCrm), /reserved root/);
});

for (const order of [['website', 'crm'], ['crm', 'website']]) test(`non-destructive deployment: ${order.join(' then ')}, updates and CRM extras preserved`, t => {
  const host = temp(t), site = path.join(temp(t), 'website'); assemble(site);
  const appRoot = path.join(host, 'realtorcrm'); fs.mkdirSync(appRoot);
  fs.writeFileSync(path.join(appRoot, 'host-only-sentinel'), 'preserve me');
  // Existing CRM is present before either deployment, as on production.
  fs.cpSync(crm, appRoot, { recursive: true });
  for (const kind of [...order, ...order]) {
    if (kind === 'crm') {
      const before = fs.existsSync(path.join(host, 'real-estate-crm')) ? manifest(path.join(host, 'real-estate-crm')) : null;
      fs.cpSync(crm, appRoot, { recursive: true });
      if (before) assert.deepEqual(manifest(path.join(host, 'real-estate-crm')), before);
    } else {
      const before = manifest(appRoot);
      fs.cpSync(site, host, { recursive: true });
      assert.deepEqual(manifest(appRoot), before);
    }
  }
  const deployed = manifest(appRoot); delete deployed['host-only-sentinel'];
  assert.deepEqual(deployed, manifest(crm));
  assert.equal(fs.readFileSync(path.join(appRoot, 'host-only-sentinel'), 'utf8'), 'preserve me');
  assert(fs.existsSync(path.join(host, 'real-estate-crm/index.html')));
});

test('first migration refuses publishing without host preservation evidence; Git ignore cannot protect tracked deletions', t => {
  const repo = temp(t);
  const git = (...args) => execFileSync('git', ['-c', 'core.autocrlf=false', ...args], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q'); git('config', 'user.name', 'Isolation test'); git('config', 'user.email', 'test@example.invalid');
  fs.mkdirSync(path.join(repo, 'realtorcrm'));
  fs.writeFileSync(path.join(repo, 'realtorcrm/index.html'), 'old marketing');
  git('add', 'realtorcrm/index.html'); git('commit', '-qm', 'legacy');
  const legacy = git('rev-parse', 'HEAD').trim();
  fs.writeFileSync(path.join(repo, '.gitignore'), '/realtorcrm/\n');
  git('rm', 'realtorcrm/index.html'); git('add', '.gitignore'); git('commit', '-qm', 'migrate');
  const migrated = git('rev-parse', 'HEAD').trim();
  git('checkout', '-q', legacy);
  fs.writeFileSync(path.join(repo, 'realtorcrm/index.html'), 'live CRM index');
  fs.writeFileSync(path.join(repo, 'realtorcrm/sw.js'), 'untracked CRM worker');
  assert.throws(() => assertHostPreservation(undefined, repo), /Publishing blocked/);
  assert.throws(() => assertHostPreservation('false', repo), /Publishing blocked/);
  assertHostPreservation('true', repo);
  const beforeHandoff = manifest(path.join(repo, 'realtorcrm'));
  git('reset', '--mixed', migrated);
  git('restore', '--source=' + migrated, '--worktree', '--', '.', ':(top,exclude)realtorcrm');
  assert.deepEqual(manifest(path.join(repo, 'realtorcrm')), beforeHandoff, 'documented mixed-reset/restore handoff preserves every CRM byte');
  assert.equal(git('ls-files', '--', 'realtorcrm').trim(), '', 'parent index no longer owns CRM');
  git('clean', '-fd');
  assert.deepEqual(manifest(path.join(repo, 'realtorcrm')), beforeHandoff, 'ordinary post-handoff cleanup is safe');
  git('checkout', '-qf', legacy);
  fs.writeFileSync(path.join(repo, 'realtorcrm/index.html'), 'live CRM index');
  git('checkout', '-qf', migrated); // Demonstrates unsafe Hostinger reset/checkout behavior.
  assert(!fs.existsSync(path.join(repo, 'realtorcrm/index.html')), 'tracked app entry can be deleted despite ignore');
  assert(fs.existsSync(path.join(repo, 'realtorcrm/sw.js')));
  git('clean', '-fd'); assert(fs.existsSync(path.join(repo, 'realtorcrm/sw.js')), 'normal clean respects ignored root');
  git('clean', '-fdx'); assert(!fs.existsSync(path.join(repo, 'realtorcrm')), '-x ignores ignore rules; hosting dependency remains');
});

test('CRM artifact is the unchanged app plus existing production transform and headers; auth/PWA paths stay on app origin', () => {
  const app = path.join(root, 'Realtor main CRM/RealtorOS_Project/app');
  const expected = manifest(app);
  delete expected['.gitignore']; delete expected['.env.example'];
  expected['assets/js/config.js'] = crypto.createHash('sha256').update(fs.readFileSync(path.join(app, 'assets/js/config.js'), 'utf8').replace('websiteUrl: "http://localhost:5501"', 'websiteUrl: "https://everyrealestatecalculator.com"')).digest('hex');
  expected['.htaccess'] = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'deployment/crm.htaccess'))).digest('hex');
  // sw.js carries the packager's second declared transform: a unique per-build
  // VERSION stamp (crm-<date>-<sha>) so every deploy invalidates the previous
  // shell cache. Compare it separately with the VERSION value normalized;
  // every other byte must match the source worker.
  const actual = manifest(crm);
  const distSw = fs.readFileSync(path.join(crm, 'sw.js'), 'utf8');
  const srcSw = fs.readFileSync(path.join(app, 'sw.js'), 'utf8');
  const stamp = /const VERSION = "(crm-\d{8}-[^"]+)";/.exec(distSw);
  assert(stamp, 'packaged sw.js carries a per-build VERSION stamp');
  const normalizeSw = text => text.replace(/const VERSION = "[^"]+";/, 'const VERSION = "<stamp>";');
  assert.equal(normalizeSw(distSw), normalizeSw(srcSw), 'packaged sw.js differs from the source worker only in its VERSION stamp');
  delete actual['sw.js']; delete expected['sw.js'];
  assert.deepEqual(actual, expected);
  const auth = fs.readFileSync(path.join(app, 'assets/js/data/supabase-client.js'), 'utf8');
  assert(auth.includes('redirectTo: window.location.origin + window.location.pathname'));
  const pwa = JSON.parse(fs.readFileSync(path.join(crm, 'manifest.webmanifest')));
  assert.equal(pwa.scope, './'); assert.equal(pwa.start_url, './#/daily');
});
