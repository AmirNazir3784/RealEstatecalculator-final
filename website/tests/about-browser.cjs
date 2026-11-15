// Real Chromium About QA. Serve website/; provide PLAYWRIGHT_MODULE and CHROME_PATH
// if not on PATH. No browser dependency is shipped with the website.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.env.ABOUT_URL||'http://127.0.0.1:8137/';
const out=path.resolve(__dirname,'../../review/about-editorial-refinement');
let passed=0;const measurements=[],errors=[],responses=[],accessibility=[];
function check(name,value){assert(value,name);passed++;}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
 for(const width of [1920,1440,1280,1024,768,390,375]){
  const context=await browser.newContext({viewport:{width,height:width<600?844:1000},isMobile:width<600,hasTouch:width<600,deviceScaleFactor:1});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)responses.push({url:r.url(),status:r.status()});});
  await page.addInitScript(()=>{window.aboutCLS=0;new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.aboutCLS+=e.value;}).observe({type:'layout-shift',buffered:true});});
  await page.goto(root+'about/');await page.evaluate(()=>document.fonts.ready);
  await page.locator('.about-closing').scrollIntoViewIfNeeded();await page.locator('.about-hero').scrollIntoViewIfNeeded();
  const m=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,h1:getComputedStyle(document.querySelector('h1')).fontSize,words:document.querySelector('main').innerText.trim().split(/\s+/).length,cls:window.aboutCLS,brokenImages:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src),clipped:[...document.querySelectorAll('main h1,main h2,main h3,main p,main a,main dt,main dd')].filter(e=>{const r=e.getBoundingClientRect();return r.left<0||r.right>innerWidth+1||e.scrollWidth>e.clientWidth+1;}).map(e=>e.textContent)}));
  measurements.push(m);if(m.clipped.length||m.words<225||m.words>400)console.log(m);check(width+' no horizontal overflow',m.scrollWidth===m.width);check(width+' no clipped text',!m.clipped.length);check(width+' images loaded',!m.brokenImages.length);check(width+' layout stability',m.cls<.05);check(width+' concise supplied copy (approximately 250 words)',m.words>=225&&m.words<=400);
  check(width+' one H1',await page.locator('h1').count()===1);check(width+' six sections',await page.locator('main > section').count()===6);check(width+' canonical',await page.locator('link[rel="canonical"]').getAttribute('href')==='https://everyrealestatecalculator.com/about/');
  check(width+' image descriptions',await page.locator('main img:not([alt]), main img[alt=""]').count()===0);
  check(width+' decorative icons hidden',await page.locator('main svg:not([aria-hidden="true"])').count()===0);
  check(width+' no decorative eyebrows or graphic icons',await page.locator('main .eyebrow, main svg, main .about-highlights, main .about-audience-card, main .about-principles').count()===0);
  check(width+' four plain audience rows',await page.locator('.about-directory > div').count()===4);
  check(width+' authentic product visual and text-first CRM',await page.locator('.about-product-figure img').count()===1&&await page.locator('.about-crm img').count()===0);
  check(width+' complete navy heading',await page.locator('h1').evaluate(e=>e.children.length===0&&getComputedStyle(e).color==='rgb(16, 33, 49)'));
  const photo=await page.locator('.about-hero-photo').boundingBox();check(width+' unstretched 4:3 photograph',Math.abs(photo.width/photo.height-4/3)<.01);
  if(width<=800){const intro=await page.locator('.about-product-intro').boundingBox(),figure=await page.locator('.about-product-figure').boundingBox(),cta=await page.locator('.about-product > .card-arrow').boundingBox();check(width+' product reading order',intro.y+intro.height<=figure.y+1&&figure.y+figure.height<=cta.y+1);}
  check(width+' matching brand names',await page.getByRole('link',{name:'Every Real Estate Calculator Tools · Software · Guides, homepage',exact:true}).count()===2);
  if(process.env.AXE_PATH){await page.addScriptTag({path:process.env.AXE_PATH});const audit=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']}}));accessibility.push({width,passes:audit.passes.length,violations:audit.violations,incomplete:audit.incomplete.map(v=>({id:v.id,description:v.description}))});check(width+' full-page axe audit',!audit.violations.length);}
  const links=await page.locator('main a').evaluateAll(els=>els.map(e=>({url:e.href,text:e.textContent})));for(const link of links){check(width+' link resolves '+link.text,(await page.request.get(link.url)).ok());}
  for(const locator of ['.about-hero .btn','.about-product > .card-arrow','.about-actions .btn']){
   for(const link of await page.locator(locator).all()){const b=await link.boundingBox();check(width+' CTA touch target',b.height>=44);}
  }
  const shot=width===1440?'about-desktop.png':width===390?'about-mobile.png':`about-${width}.png`;
  await page.screenshot({path:path.join(out,shot),fullPage:true,animations:'disabled'});
  if(width===1440){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,'after-desktop-viewport.png')});await page.locator('section[aria-labelledby="products-title"]').screenshot({path:path.join(out,'after-products.png')});}
  if(await page.locator('.menu-toggle').isVisible()){
   await page.locator('.menu-toggle').click();check(width+' mobile menu opens',await page.locator('#site-menu').isVisible());
  }
  await page.locator('#tools-menu-toggle').focus();await page.keyboard.press('Enter');check(width+' tools opens',await page.locator('#tools-mega-menu').isVisible());check(width+' ten tools',await page.locator('[data-menu-tool]:visible').count()===10);
  await page.keyboard.press('Escape');check(width+' Escape closes tools',await page.locator('#tools-mega-menu').isHidden());check(width+' focus returns to toggle',await page.locator('#tools-menu-toggle').evaluate(e=>e===document.activeElement));
  await page.goto(root+'about/');await page.keyboard.press('Tab');check(width+' keyboard skip link',await page.locator('.skip-link').evaluate(e=>e===document.activeElement));await page.keyboard.press('Enter');check(width+' skip to main',await page.evaluate(()=>location.hash==='#main'));
  for(const [selector,destination] of [['.about-hero .btn','tools/'],['.about-crm a[href="../real-estate-crm/"]','real-estate-crm/'],['.about-actions a[href="../resources/"]','resources/']]){
   await page.goto(root+'about/');await page.locator(selector).click();check(width+' CTA navigates '+destination,new URL(page.url()).pathname===new URL(root+destination).pathname);
  }
  await context.close();
 }
 const page=await browser.newPage();
 const cases=[['mortgage','monthly-total','$2,572.62'],['commission','primary-result','$13,500.00'],['home-affordability','afford-price','$330,118.43'],['rent-vs-buy','rent-verdict','Renting wins for your 7-year stay'],['cap-rate','cap-rate','4.45%'],['bridge-loan','bridge-amount','$160,000.00'],['property-investment','monthly-cash-flow','$177.00'],['capital-gains-tax','net-proceeds','$551,346.00'],['roi','total-roi','201.58%'],['noi','noi-annual','$15,573.60']];
 for(const [slug,id,value] of cases){await page.goto(root+'tools/'+slug+'-calculator/');check(slug+' calculates without account',await page.locator('#'+id).innerText()===value);}
 check('no JavaScript errors',!errors.length);check('no HTTP errors',!responses.length);
 fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({passed,measurements,errors,responses},null,2));fs.writeFileSync(path.join(out,'accessibility-results.json'),JSON.stringify({engine:'axe-core 4.14.0',reports:accessibility},null,2));console.log(JSON.stringify({passed,measurements,errors,responses,axeViolations:accessibility.reduce((a,r)=>a+r.violations.length,0)},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
