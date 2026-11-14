// Actual Chromium integration checks; playwright-core is supplied externally.
// Serve website/, then set RESOURCES_URL and optionally RESOURCES_ARTIFACT_DIR.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const fs = require('node:fs'), path = require('node:path');
const base = process.env.RESOURCES_URL || 'http://127.0.0.1:8130/after/';
const out = process.env.RESOURCES_ARTIFACT_DIR || path.resolve(__dirname, '../../review/resources-redesign');
fs.mkdirSync(out, { recursive: true });
const pages = ['resources/', 'resources/mortgage-payments/', 'resources/real-estate-commission/'];
const widths = [1440, 1024, 768, 390, 375];
const failures = [], measurements = [], errors = [], broken = [];
let assertions = 0;
function check(label, value) { assertions++; if (!value) failures.push(label); }
async function top(page) {
  await page.evaluate(() => { document.activeElement?.blur(); scrollTo({ top: 0, behavior: 'instant' }); });
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    for (const width of widths) {
      const mobile = width < 600;
      const context = await browser.newContext({ viewport: { width, height: mobile ? 844 : 1000 }, isMobile: mobile, hasTouch: mobile });
      const page = await context.newPage(); page.setDefaultTimeout(30000);
      page.on('pageerror', e => errors.push(e.message));
      page.on('response', r => { if (r.status() >= 400) broken.push({ url: r.url(), status: r.status() }); });
      for (const route of pages) {
        console.log('Review', width, route);
        const response = await page.goto(base + route, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        check(route + width + ' HTTP 200', response.status() === 200);
        check(route + width + ' one H1', await page.locator('h1').count() === 1);
        check(route + width + ' canonical', await page.locator('link[rel=canonical]').getAttribute('href') === 'https://everyrealestatecalculator.com/' + route);
        check(route + width + ' meta description', (await page.locator('meta[name=description]').getAttribute('content')).length > 40);
        const metrics = await page.evaluate(() => {
          const rect = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
          const grid = document.querySelector('.article-grid');
          const ids = [...document.querySelectorAll('[id]')].map(e => e.id);
          const missingRefs = [...document.querySelectorAll('[aria-labelledby],[aria-controls],[aria-describedby],label[for]')].flatMap(e => ['aria-labelledby', 'aria-controls', 'aria-describedby', 'for'].flatMap(k => (e.getAttribute(k) || '').split(' ').filter(Boolean))).filter(id => !ids.includes(id));
          return { viewport: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth, h1: rect(document.querySelector('h1')), displayFont: getComputedStyle(document.querySelector('h1')).fontFamily, duplicateIds: ids.length !== new Set(ids).size, missingRefs, gridColumns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : null, cards: [...document.querySelectorAll('.article-card')].map(rect), article: document.querySelector('.article-col') ? rect(document.querySelector('.article-col')) : null };
        });
        measurements.push({ route, width, ...metrics });
        check(route + width + ' no overflow', !metrics.overflow);
        check(route + width + ' unique IDs', !metrics.duplicateIds);
        check(route + width + ' valid ARIA references', metrics.missingRefs.length === 0);
        check(route + width + ' centralized display font', metrics.displayFont.includes('Source Serif 4'));
        if (route === 'resources/') {
          check(width + ' card grid columns', metrics.gridColumns === (width >= 1024 ? 3 : width >= 640 ? 2 : 1));
          check(width + ' exactly two guides', metrics.cards.length === 2);
          check(width + ' all ten directory links', await page.locator('.dir-links a').count() === 10);
          for (const id of ['mortgage-guide', 'commission-guide', 'calculators', 'available-title', 'mortgage-title', 'commission-title', 'reading-title']) {
            await page.goto(base + route + '#' + id, { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(id => {
              const e = document.getElementById(id), r = e.getBoundingClientRect();
              return r.top >= document.querySelector('header').getBoundingClientRect().bottom - 1 && r.top < innerHeight;
            }, id);
            check(width + ' legacy anchor ' + id, await page.locator('#' + id).isVisible());
          }
          await page.evaluate(() => history.replaceState(null, '', location.pathname));
          // Clicking the card title exercises the stretched link, away from its label.
          await top(page);
          const titleBox = await page.locator('.article-card h2').first().boundingBox();
          if (mobile) await page.touchscreen.tap(titleBox.x + 20, titleBox.y + 10);
          else await page.mouse.click(titleBox.x + 20, titleBox.y + 10);
          await page.waitForURL(base + pages[1], { waitUntil: 'load' });
          check(width + ' full card navigates', page.url() === base + pages[1]);
          await page.goto(base + route, { waitUntil: 'load' });
          const link = page.locator('.read-link').first();
          await link.focus();
          check(width + ' keyboard card focus', await page.locator('.article-card').first().evaluate(e => getComputedStyle(e).outlineStyle === 'solid'));
          await page.keyboard.press('Enter');
          await page.waitForURL(base + pages[1], { waitUntil: 'load' });
          check(width + ' keyboard opens article', page.url() === base + pages[1]);
          await page.goto(base + route, { waitUntil: 'load' });
        } else {
          check(route + width + ' reading column fits', metrics.article.width <= 816 && metrics.article.x >= 0);
          const toc = page.locator('.article-toc a');
          for (let i = 0; i < await toc.count(); i++) {
            const id = (await toc.nth(i).getAttribute('href')).slice(1);
            check(route + width + ' TOC target ' + id, await page.locator('[id="' + id + '"]').count() === 1);
          }
          await toc.first().click();
          await page.waitForFunction(() => Math.abs(document.getElementById('terms').getBoundingClientRect().top - 110) < 2);
          check(route + width + ' TOC clears header', await page.locator('#terms').evaluate(e => e.getBoundingClientRect().top >= document.querySelector('header').getBoundingClientRect().bottom));
          if (route.includes('mortgage-payments')) {
            const summary = page.locator('.article-formula summary');
            await summary.focus(); await page.keyboard.press('Enter');
            check(width + ' native formula disclosure', await page.locator('.article-formula').evaluate(e => e.open));
            await page.keyboard.press('Enter');
          }
          const cta = page.locator('.article-cta .btn');
          const destination = new URL(await cta.getAttribute('href'), page.url()).href;
          await cta.click();
          await page.waitForURL(destination, { waitUntil: 'load' });
          check(route + width + ' calculator CTA', page.url() === destination && destination.includes('/tools/'));
          await page.goto(base + route, { waitUntil: 'load' });
        }
        await top(page);
        if (width === 1440 || width === 390) {
          const slug = route.split('/').filter(Boolean).pop();
          await page.screenshot({ path: path.join(out, slug + (mobile ? '-mobile' : '-desktop') + '.png'), fullPage: true, animations: 'disabled' });
        }
        const nav = page.locator('.menu-toggle');
        if (await nav.isVisible()) { if (mobile) await nav.tap(); else await nav.click(); }
        const menu = page.locator('#tools-menu-toggle');
        await menu.focus();
        if (mobile) await menu.tap(); else await page.keyboard.press('Enter');
        check(route + width + ' menu expands', await menu.getAttribute('aria-expanded') === 'true');
        check(route + width + ' menu ten tools', await page.locator('[data-menu-tool]').count() === 10);
        check(route + width + ' menu visible', await page.locator('#tools-mega-menu').isVisible());
        if (width === 1440 && route === 'resources/') await page.screenshot({ path: path.join(out, 'resources-mega-menu-desktop.png'), animations: 'disabled' });
        await page.keyboard.press('Escape');
        check(route + width + ' menu Escape', await menu.getAttribute('aria-expanded') === 'false');
      }
      await context.close();
    }
    check('no browser JS errors', errors.length === 0);
    check('all page assets load', broken.length === 0);
    fs.writeFileSync(path.join(out, 'browser-results.json'), JSON.stringify({ assertions, failures, errors, broken, measurements }, null, 2) + '\n');
    if (failures.length) throw Error(failures.join('\n'));
    console.log(`PASS: ${assertions} Resources Chromium checks at five widths, including touch mobile, navigation, anchors, metadata, menu, formula disclosure and six full-page screenshots.`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
