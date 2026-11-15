// Validate the actual tree shipped by either publisher, including dotfiles.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

export function assertArtifact(kind, dir) {
  assert(['website', 'crm'].includes(kind), 'Unknown artifact kind');
  const paths = [];
  function walk(folder, prefix = '') {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const rel = prefix + entry.name;
      assert(!entry.isSymbolicLink(), `Artifact must not contain symlinks: ${rel}`);
      assert(entry.isDirectory() || entry.isFile(), `Unsupported artifact entry: ${rel}`);
      paths.push(rel);
      if (entry.isDirectory()) walk(path.join(folder, entry.name), rel + '/');
    }
  }
  walk(dir);
  const protectedRoots = kind === 'website' ? ['realtorcrm', 'realtoros'] : ['real-estate-crm', 'realtorcrm'];
  for (const rel of paths) assert(!protectedRoots.includes(rel.split('/')[0].toLowerCase()), `${kind} artifact touches a reserved root: ${rel}`);
  const required = kind === 'website'
    ? ['index.html', 'real-estate-crm/index.html', 'real-estate-crm/realtorcrm.css', 'sitemap.xml', '.htaccess', '.gitignore']
    : ['index.html', 'sw.js', 'manifest.webmanifest', '.htaccess'];
  for (const rel of required) assert(fs.statSync(path.join(dir, rel)).isFile(), `${kind} artifact missing ${rel}`);
  if (kind === 'website') {
    assert(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8').split(/\r?\n/).includes('/realtorcrm/'), 'Missing CRM preservation ignore rule');
    for (const rel of paths.filter(p => /\.(html|xml)$/.test(p))) {
      assert(!fs.readFileSync(path.join(dir, rel), 'utf8').includes('everyrealestatecalculator.com/realtorcrm/'), `Old marketing URL: ${rel}`);
    }
  }
  return paths.length;
}

export function assertHostPreservation(verified, repo) {
  // Branch publication can trigger Hostinger's webhook immediately. Neither
  // clean artifacts nor .gitignore prevent deletion of previously tracked CRM
  // files on that external host. Require explicit host-side evidence FIRST.
  assert.equal(verified, 'true', 'Publishing blocked: verify Hostinger preserves public_html/realtorcrm/, including previously tracked files and cleanup behavior. Follow deployment/REALTORCRM-MIGRATION.md; then set crm_preservation_verified=true.');
  const tracked = execFileSync('git', ['ls-files', '--', 'realtorcrm'], { cwd: repo, encoding: 'utf8' }).trim();
  if (tracked) console.log('Legacy CRM paths are tracked in deploy-website. Host-side ownership handoff MUST already be verified before this branch push.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [kind, dir] = process.argv.slice(2);
  if (kind === 'handoff') assertHostPreservation(process.env.CRM_PRESERVATION_VERIFIED, dir);
  else console.log(`Isolation verified: ${kind}, ${assertArtifact(kind, dir)} entries`);
}
