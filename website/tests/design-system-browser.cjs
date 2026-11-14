// Real Chromium QA for all ten calculators. No dependencies are shipped.
// Serve website/ and provide CALCULATOR_URL, PLAYWRIGHT_MODULE and optionally
// CHROME_PATH. BASELINE_URL enables comparison with pre-integration pages.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.env.CALCULATOR_URL || 'http://127.0.0.1:8129/after/';
const baseline=process.env.BASELINE_URL || 'http://127.0.0.1:8129/before/';
const out=path.resolve(__dirname,'../../review/calculator-design-system');
fs.mkdirSync(path.join(out,'screenshots'),{recursive:true});
const cases=[
 ['mortgage-calculator','monthly-total','$2,572.62'],
 ['commission-calculator','primary-result','$13,500.00'],
 ['home-affordability-calculator','afford-price','$330,118.43'],
 ['rent-vs-buy-calculator','rent-verdict','Renting wins for your 7-year stay'],
 ['cap-rate-calculator','cap-rate','4.45%'],
 ['bridge-loan-calculator','bridge-amount','$160,000.00'],
 ['property-investment-calculator','monthly-cash-flow','$177.00'],
 ['capital-gains-tax-calculator','net-proceeds','$551,346.00'],
 ['roi-calculator','total-roi','201.58%'],
 ['noi-calculator','noi-annual','$15,573.60']
];
let assertions=0;const problems=[],measurements=[],outputChecks=[];
function check(label,value){assertions++;if(!value)problems.push(label);}
async function metrics(page){return page.evaluate(()=>{
 const box=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect(),c=getComputedStyle(e);return{x:r.x,y:r.y,width:r.width,height:r.height,font:c.fontFamily,fontSize:c.fontSize,color:c.color,background:c.backgroundColor};};
 const duplicates=[],seen=new Set();for(const e of document.querySelectorAll('main p')){if(e.closest('.result,.panel,.faq,.sticky-result'))continue;const t=e.textContent.replace(/\s+/g,' ').trim();if(t.length>70){if(seen.has(t))duplicates.push(t);seen.add(t);}}
 return{viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,inputPanel:box('.calculator-layout .panel'),resultPanel:box('.calculator-layout .result'),input:box('.calculator-layout input[type=number]'),h1:box('h1'),result:box('.result .result-number,.rent-verdict'),duplicateParagraphs:duplicates,visibleInputs:[...document.querySelectorAll('main input[type=number]')].filter(e=>e.checkVisibility()).length,bodyWords:document.querySelector('main').innerText.split(/\s+/).length};
});}
async function settleTop(page){
 await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();scrollTo({top:0,behavior:'instant'});return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
 await page.waitForFunction(()=>{if(scrollY!==0){scrollTo({top:0,behavior:'instant'});return false;}return true;});
}
async function screenshot(page,slug,width){
 // Capture a fresh default view after interaction checks, avoiding focus rings,
 // copy notifications or a pending focus scroll in full-page screenshots.
 await page.waitForFunction(()=>scrollY===0);
 const box=await page.locator('.calculator-layout').boundingBox();
 await page.screenshot({path:path.join(out,'screenshots',slug+'-'+(width>760?'desktop':'mobile')+'.png'),fullPage:true,animations:'disabled',clip:{x:0,y:0,width,height:Math.ceil(box.y+box.height+100)}});
}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
 const context=await browser.newContext({permissions:['clipboard-read','clipboard-write'],viewport:{width:1440,height:1000}});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [slug,id,expected] of cases){
  await page.setViewportSize({width:1440,height:1000});await page.mouse.move(1400,950);
  await page.goto(baseline+'tools/'+slug+'/',{waitUntil:'domcontentloaded'});
  const oldValue=await page.locator('#'+(slug==='commission-calculator'?'commission-total':id)).textContent();
  const beforeMetadata=await page.evaluate(()=>({title:document.title,description:document.querySelector('meta[name=description]').content,canonical:document.querySelector('link[rel=canonical]').href}));
  const response=await page.goto(root+'tools/'+slug+'/',{waitUntil:'domcontentloaded'});await page.evaluate(()=>document.fonts.ready);
  check(slug+' HTTP 200',response.status()===200);
  const current=await page.locator('#'+id).textContent();check(slug+' independent expected result',current===expected);check(slug+' result parity',current===oldValue);
  outputChecks.push({slug,before:oldValue,after:current,expected});
  const currentMetadata=await page.evaluate(()=>({title:document.title,description:document.querySelector('meta[name=description]').content,canonical:document.querySelector('link[rel=canonical]').href}));
  check(slug+' metadata parity',JSON.stringify(beforeMetadata)===JSON.stringify(currentMetadata));
  check(slug+' exactly one H1',await page.locator('h1').count()===1);
  const labels=await page.locator('main input:not([type=hidden]),main select').evaluateAll(es=>es.every(e=>e.getAttribute('aria-label')||e.getAttribute('aria-labelledby')||document.querySelector('label[for="'+e.id+'"]')));
  check(slug+' all controls named',labels);
  check(slug+' no asset failures',await page.locator('img').evaluateAll(es=>es.every(e=>e.complete&&e.naturalWidth>0)));
  const first=page.locator('.calculator-layout input[type=number]:visible').first(),original=await first.inputValue();
  await first.fill('-1');
  check(slug+' invalid input changes primary result',(await page.locator('#'+id).textContent())!==current);
  await first.fill(original);check(slug+' valid result recovers',(await page.locator('#'+id).textContent())===current);
  const copy=page.getByRole('button',{name:/copy/i});
  if(await copy.count()){
    await copy.click();const text=await page.evaluate(()=>navigator.clipboard.readText());check(slug+' clipboard contains actual result',text.includes(current));
  }
  const print=page.getByRole('button',{name:/print/i});if(await print.count()){await page.evaluate(()=>{window.__printed=0;window.print=()=>window.__printed++;});await print.click();check(slug+' print action',await page.evaluate(()=>window.__printed)===1);}
  const faq=page.locator('.faq').first();await faq.locator('summary').focus();const wasOpen=await faq.evaluate(e=>e.open);await page.keyboard.press('Enter');check(slug+' keyboard FAQ toggles',await faq.evaluate(e=>e.open)!==wasOpen);await page.keyboard.press('Enter');
  await page.locator('#tools-menu-toggle').focus();await page.keyboard.press('Enter');check(slug+' mega menu retained',await page.locator('#tools-mega-menu').isVisible()&&await page.locator('[data-menu-tool]:visible').count()===10);await page.keyboard.press('Escape');
  check(slug+' results card remains inside the grid',await page.locator('.calculator-layout').evaluate(e=>e.children.length===2&&e.children[1].matches('.result')));
  check(slug+' all dark action links stay within the results card',await page.locator('.result-cta').evaluateAll(es=>es.every(e=>e.closest('.result'))));
  check(slug+' dark-panel explanatory text is light',await page.locator('.result .rent-verdict-detail,.result .disclaimer').evaluateAll(es=>es.every(e=>{const rgb=getComputedStyle(e).color.match(/[\d.]+/g).map(Number);return rgb[0]>140&&rgb[1]>140&&rgb[2]>140;})));
  for(const width of [1440,1024,768,390,375]){
    await page.setViewportSize({width,height:width>760?1000:844});
    // Responsive measurements use a fresh default view so previous keyboard
    // focus scrolling and sticky positioning cannot contaminate the layout.
    await page.goto(root+'tools/'+slug+'/',{waitUntil:'domcontentloaded'});await page.evaluate(()=>document.fonts.ready);
    const m=await metrics(page);measurements.push({slug,...m});check(slug+' no horizontal overflow '+width,!m.overflow);
    check(slug+' 16px inputs '+width,parseFloat(m.input.fontSize)>=16);check(slug+' 48px input height '+width,m.input.height>=48);
    check(slug+' shared local heading font '+width,m.h1.font.includes('Source Serif 4'));
    if(width<761)check(slug+' mobile summary starts the calculator',await page.locator('#sticky-result').evaluate(e=>e===document.querySelector('main').firstElementChild));
    if(width>900)check(slug+' desktop panels align '+width,Math.abs(m.inputPanel.y-m.resultPanel.y)<1);
    else check(slug+' panels stack '+width,m.resultPanel.y>=m.inputPanel.y+m.inputPanel.height);
    check(slug+' concise nonduplicate paragraphs '+width,m.duplicateParagraphs.length===0);
    const clipped=await page.locator('.calculator-layout input:visible,.calculator-layout select:visible').evaluateAll(es=>es.some(e=>{const r=e.getBoundingClientRect();return r.left<0||r.right>innerWidth;}));check(slug+' controls not clipped '+width,!clipped);
    if(width>900)check(slug+' sliders do not displace neighboring inputs '+width,await page.locator('.form-grid').first().evaluate(grid=>{
      const fields=[...grid.children].filter(e=>e.matches('.form-field')&&e.checkVisibility());
      if(fields.length<2)return true;
      const [a,b]=fields,al=a.querySelector('label'),bl=b.querySelector('label'),ai=a.querySelector('.input-unit,.field'),bi=b.querySelector('.input-unit,.field');
      if(!al||!bl||!ai||!bi||Math.abs(al.getBoundingClientRect().height-bl.getBoundingClientRect().height)>1)return true;
      return Math.abs(ai.getBoundingClientRect().top-bi.getBoundingClientRect().top)<1;
    }));
    if(width===1440||width===390)await screenshot(page,slug,width);
  }
  for(const link of await page.locator('.related-card').all()){const href=await link.getAttribute('href');const response=await context.request.get(new URL(href,page.url()).href);check(slug+' related link '+href,response.status()===200);}
  console.log('PASS '+slug);
 }
 for(const width of [1440,390]) {
  await page.setViewportSize({width,height:900});await page.goto(root+'tools/',{waitUntil:'domcontentloaded'});
  check('Tools directory still lists ten calculators '+width,await page.locator('.listing-card:visible').count()===10);
  await page.locator('#tool-search').fill('bridge');check('Tools search remains functional '+width,await page.locator('.listing-card:visible').count()===1);
  check('Tools page has no overflow '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 // Separate Chromium mobile context exercises touch, viewport metadata and
 // mobile browser behavior, beyond merely narrowing the desktop viewport.
 const mobileContext=await browser.newContext({isMobile:true,hasTouch:true,viewport:{width:390,height:844},deviceScaleFactor:1});
 const mobilePage=await mobileContext.newPage();mobilePage.on('pageerror',e=>errors.push(e.message));
 for(const [slug,id,expected] of cases) {
  await mobilePage.goto(root+'tools/'+slug+'/',{waitUntil:'domcontentloaded'});await mobilePage.evaluate(()=>document.fonts.ready);
  check(slug+' mobile browser expected result',await mobilePage.locator('#'+id).textContent()===expected);
  check(slug+' mobile browser no overflow',await mobilePage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const faq=mobilePage.locator('.faq').first(),wasOpen=await faq.evaluate(e=>e.open);await faq.locator('summary').tap();check(slug+' touch FAQ toggles',await faq.evaluate(e=>e.open)!==wasOpen);
  await mobilePage.locator('.menu-toggle').tap();await mobilePage.locator('#tools-menu-toggle').tap();check(slug+' touch mega-menu accordion opens',await mobilePage.locator('#tools-mega-menu').isVisible());
  await mobilePage.locator('.menu-toggle').tap();check(slug+' touch navigation close clears overlay',await mobilePage.locator('#tools-menu-overlay').isHidden());
  await mobilePage.goto(root+'tools/'+slug+'/',{waitUntil:'domcontentloaded'});await mobilePage.evaluate(()=>document.fonts.ready);await screenshot(mobilePage,slug,390);
 }
 await mobileContext.close();
 check('No browser JavaScript errors',errors.length===0);
 fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({assertions,problems,errors,outputChecks,measurements},null,2)+'\n');
 assert.deepEqual(problems,[],'Browser defects: '+problems.join('; '));
 console.log(`PASS: ${assertions} Chromium assertions across ten calculators and five widths; 20 desktop/mobile screenshots.`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
