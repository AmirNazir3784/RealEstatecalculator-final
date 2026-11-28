import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';

const SITE_URL = 'https://everyrealestatecalculator.com';

function autoSitemap() {
  return {
    name: 'auto-sitemap',
    hooks: {
      'astro:build:done': ({ dir }) => {
        const distDir = fileURLToPath(dir);
        const routes = [];
        function walk(current) {
          for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
              walk(full);
            } else if (entry.name === 'index.html') {
              const rel = path.relative(distDir, current).replace(/\\/g, '/');
              routes.push(rel ? `/${rel}/` : '/');
            }
          }
        }
        walk(distDir);
        routes.sort((a, b) => (a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b)));
        const xml = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          ...routes.map((route) => `  <url><loc>${SITE_URL}${route}</loc></url>`),
          '</urlset>',
          '',
        ].join('\n');
        fs.writeFileSync(path.join(distDir, 'sitemap.xml'), xml, 'utf8');
      },
    },
  };
}

export default defineConfig({
  site: SITE_URL,
  output: 'static',
  outDir: './dist',
  trailingSlash: 'always',
  integrations: [autoSitemap()],
  build: {
    format: 'directory',
    inlineStylesheets: 'never',
  },
  devToolbar: {
    enabled: false,
  },
});
