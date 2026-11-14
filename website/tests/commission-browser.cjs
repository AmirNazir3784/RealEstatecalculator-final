// Real Chromium integration/visual checks. Install playwright-core externally,
// set NODE_PATH to that node_modules directory, and set CHROME_PATH if needed.
// Serve website/ locally; COMMISSION_URL may override the default preview URL.
const {chromium} = require('playwright-core');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const url = process.env.COMMISSION_URL || 'http://127.0.0.1:8127/after/tools/commission-calculator/';
const out = process.env.COMMISSION_ARTIFACT_DIR || path.resolve(__dirname,'../../review/commission');
fs.mkdirSync(out,{recursive:true});
let assertions=0;
const eq=(a,b,label)=>{assert.equal(a,b,label);assertions++;};
const ok=(value,label)=>{assert(value,label);assertions++;};
async function metrics(page) {
  return page.evaluate(()=>{
    const box=s=>{const e=document.querySelector(s),c=getComputedStyle(e),b=e.getBoundingClientRect();return {width:b.width,height:b.height,font:c.fontFamily,fontSize:c.fontSize,lineHeight:c.lineHeight,padding:c.padding,gap:c.gap,radius:c.borderRadius};};
    return {viewport:innerWidth,visibleInputs:[...document.querySelectorAll('#commission-form input:not([type=range]), #commission-form select')].filter(e=>e.checkVisibility()).length,wrap:box('.calculator-layout'),inputPanel:box('.panel'),resultPanel:box('.result'),h1:box('h1'),result:box('.result-number'),input:box('#sale-price'),h2:box('.guide-section h2'),content:box('.calculator-guide'),overflow:document.documentElement.scrollWidth>innerWidth};
  });
}
async function calculatorScreenshot(page, file) {
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
  const box=await page.locator('.page-hero').boundingBox();
  await page.screenshot({path:path.join(out,file),animations:'disabled',fullPage:true,clip:{x:0,y:0,width:page.viewportSize().width,height:Math.ceil(box.y+box.height)}});
}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try {
 const context=await browser.newContext({viewport:{width:1440,height:900},permissions:['clipboard-read','clipboard-write']});
 const page=await context.newPage();
 const errors=[];page.on('pageerror',err=>errors.push(err.message));
 const response=await page.goto(url);eq(response.status(),200);
 await page.evaluate(()=>document.fonts.ready);
 const value=()=>page.locator('#primary-result').textContent();
 const visibleInputs=()=>page.locator('#commission-form input:not([type=range]):visible, #commission-form select:visible').count();
 eq(await value(),'$13,500.00');eq(await visibleInputs(),2);
 eq(await page.locator('#mode-quick').getAttribute('aria-pressed'),'true');
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'})); await page.screenshot({path:path.join(out,'quick-1440.png'),fullPage:true});
 await calculatorScreenshot(page,'quick-calculator.png');
 await page.locator('#sale-price').fill('400000');await page.locator('#commission-rate').fill('5');
 eq(await value(),'$20,000.00','published simple example');
 await page.locator('#copy-results').click();let copy=await page.evaluate(()=>navigator.clipboard.readText());
 ok(copy.includes('Quick Commission')&&copy.includes('Total commission: $20,000.00'));ok(!copy.includes('Transaction fee:')&&!copy.includes('Mortgage payoff:'));
 await page.locator('#mode-agent').focus();await page.keyboard.press('Enter');
 eq(await value(),'$13,705.00');eq(await visibleInputs(),4);eq(await page.locator('#advanced-fees').getAttribute('open'),null);
 await page.locator('#reset-calculator').click();await page.locator('#mode-agent').click();
 eq(await value(),'$9,155.00');await page.evaluate(()=>scrollTo({top:0,behavior:'instant'})); await page.screenshot({path:path.join(out,'agent-1440.png'),fullPage:true});
 await calculatorScreenshot(page,'agent-calculator.png');
 await page.locator('#agent-role').selectOption('listing');eq(await value(),'$4,430.00');eq(await visibleInputs(),5);
 await page.locator('#advanced-fees summary').focus();await page.keyboard.press('Space');
 eq(await visibleInputs(),8);
 await page.locator('#referral-fee').fill('10');await page.locator('#franchise-fee').fill('6');eq(await value(),'$3,674.00');
 await page.locator('#listing-share').fill('40');eq(await value(),'$2,880.20');
 await page.locator('#agent-role').selectOption('buyer');eq(await value(),'$4,467.80');
 await page.locator('#agent-role').selectOption('both');eq(await value(),'$7,643.00');eq(await page.locator('#listing-share').isVisible(),false);
 await page.locator('#agent-role').selectOption('listing');await page.locator('#listing-share').fill('50');
 await page.locator('#calculation-breakdown summary').click();
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'})); await page.screenshot({path:path.join(out,'agent-fees-1440.png'),fullPage:true});
 await calculatorScreenshot(page,'agent-fees-calculator.png');
 const sum=await page.locator('.breakdown-track > div').evaluateAll(es=>es.reduce((s,e)=>s+parseFloat(e.style.width||0),0));ok(Math.abs(sum-100)<0.00001,'one-side graphic sums to 100 including other side');
 await page.locator('#advanced-fees summary').click();eq(await page.locator('#fee-indicator').isVisible(),true);eq(await page.locator('#fee-indicator').textContent(),'Custom fees applied');
 await page.locator('#copy-results').click();copy=await page.evaluate(()=>navigator.clipboard.readText());
 ok(copy.includes('Your estimated net commission: $3,674.00'));ok(copy.includes('Referral fee (10% of total): $1,350.00'));ok(!copy.includes('Mortgage payoff:'));
 await page.locator('#mode-seller').click();eq(await value(),'$436,500.00');eq(await visibleInputs(),4);
 await page.locator('#other-closing-costs').fill('1.5');await page.locator('#mortgage-payoff').fill('200000');eq(await value(),'$229,750.00');
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'})); await page.screenshot({path:path.join(out,'seller-1440.png'),fullPage:true});
 await calculatorScreenshot(page,'seller-calculator.png');
 await page.locator('#copy-results').click();copy=await page.evaluate(()=>navigator.clipboard.readText());
 ok(copy.includes('Estimated seller proceeds: $229,750.00'));ok(!copy.includes('Agent split:')&&!copy.includes('Transaction fee:'));ok(copy.includes('entire entered commission'));
 await page.locator('#mode-quick').click();eq(await value(),'$13,500.00');
 await page.locator('#mode-agent').click();eq(await value(),'$3,674.00');
 await page.locator('#advanced-fees summary').click();await page.locator('#referral-fee').fill('101');eq(await value(),'—');eq(await page.locator('#copy-results').isDisabled(),true);
 await page.locator('#advanced-fees summary').click();ok((await page.locator('#validation-note').textContent()).includes('Referral fee must be 0–100%.'));
 await page.locator('#mode-quick').click();eq(await value(),'$13,500.00','invalid hidden agent field isolated');
 await page.locator('#mode-seller').click();eq(await value(),'$229,750.00','invalid hidden agent field isolated for seller');
 await page.locator('#other-closing-costs').fill('');await page.locator('#mortgage-payoff').fill('');eq(await value(),'$436,500.00');
 await page.locator('#sale-price').fill('');eq(await value(),'—');eq(await page.locator('#print-results').isDisabled(),true);
 await page.locator('#sale-price').fill('-1');ok((await page.locator('#validation-note').textContent()).includes('0 or more'));
 await page.locator('#reset-calculator').click();eq(await value(),'$13,500.00');eq(await page.locator('#referral-fee').inputValue(),'0');eq(await page.locator('#transaction-fee').inputValue(),'295');
 await page.locator('#sale-price-slider').evaluate(e=>{e.value='500000';e.dispatchEvent(new Event('input',{bubbles:true}));});eq(await page.locator('#sale-price').inputValue(),'500000');eq(await value(),'$15,000.00');
 await page.locator('#sale-price').fill('600000');eq(await page.locator('#sale-price-slider').inputValue(),'600000');
 await page.locator('#commission-rate-slider').evaluate(e=>{e.value='5';e.dispatchEvent(new Event('input',{bubbles:true}));});eq(await page.locator('#commission-rate').inputValue(),'5');eq(await value(),'$30,000.00');
 await page.locator('#commission-rate').fill('12');eq(await page.locator('#commission-rate-slider').inputValue(),'12');eq(await page.locator('#commission-rate').inputValue(),'12');eq(await value(),'$72,000.00','numeric rate beyond initial slider range retained');
 await page.locator('#sale-price').fill('2500000');eq(await page.locator('#sale-price-slider').inputValue(),'2500000');eq(await value(),'$300,000.00');
 await page.locator('#sale-price').fill('450123.45');eq(await page.locator('#sale-price-slider').inputValue(),'450123.45');
 await page.locator('#commission-rate').fill('4.25');eq(await page.locator('#commission-rate-slider').inputValue(),'4.25');eq(await value(),'$19,130.25');
 await page.locator('#reset-calculator').click();
 for(const mode of ['quick','agent','seller']) {
  await page.locator('#mode-'+mode).click();
  if(mode==='agent') {await page.locator('#advanced-fees summary').click();await page.locator('#referral-fee').fill('10');await page.locator('#advanced-fees summary').click();}
  const report=await page.locator('#print-report').textContent();ok(report.includes({quick:'Quick Commission',agent:'Agent Earnings',seller:'Seller Proceeds'}[mode]));
  await page.emulateMedia({media:'print'});eq(await page.locator('#print-report').isVisible(),true);eq(await page.locator('#commission-form').isVisible(),false);
  eq(await page.locator('.calculator-guide').isVisible(),false);
  await page.pdf({path:path.join(out,'print-'+mode+'.pdf'),format:'A4',printBackground:true});
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'})); await page.screenshot({path:path.join(out,'print-'+mode+'.png'),fullPage:true});
  await page.emulateMedia({media:'screen'});
 }
 await page.evaluate(()=>{window.__printed=0;window.print=()=>window.__printed++;});await page.locator('#print-results').click();eq(await page.evaluate(()=>window.__printed),1);
 for(const faq of await page.locator('.faq-list details').all()) {
  await faq.locator('summary').focus();const was=await faq.evaluate(e=>e.open);await page.keyboard.press('Enter');eq(await faq.evaluate(e=>e.open),!was);await page.keyboard.press('Space');eq(await faq.evaluate(e=>e.open),was);
 }
 await page.locator('#worked-examples').screenshot({path:path.join(out,'education-1440.png')});
 await page.locator('#commission-faq').screenshot({path:path.join(out,'faq-1440.png')});
 for(const link of await page.locator('#related-calculators a').all()) {const href=await link.getAttribute('href');const res=await context.request.get(new URL(href,url).href);eq(res.status(),200,'related '+href);}
 const measurements=[];
 for(const [width,height] of [[1920,1080],[1440,900],[1280,800],[1024,900],[768,1024],[390,844],[375,812]]) {
  await page.setViewportSize({width,height});await page.locator('#reset-calculator').click();
  const m=await metrics(page);measurements.push(m);eq(m.overflow,false,'overflow quick '+width);eq(m.input.fontSize,'16px');ok(parseFloat(m.input.height)>=48);
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'})); await page.screenshot({path:path.join(out,`quick-${width}.png`),fullPage:true});
  if(width===390) await calculatorScreenshot(page,'mobile-calculator.png');
  for(const mode of ['agent','seller']) {
   await page.locator('#mode-'+mode).click();
   if(mode==='agent'){await page.locator('#agent-role').selectOption('buyer');await page.locator('#advanced-fees summary').click();await page.locator('#calculation-breakdown summary').click();}
   eq((await metrics(page)).overflow,false,'overflow '+mode+' '+width);
   const clipped=await page.locator('#commission-form .field:visible').evaluateAll(es=>es.some(e=>e.getBoundingClientRect().right>innerWidth || e.getBoundingClientRect().left<0));eq(clipped,false,'clipped fields '+mode+' '+width);
   if(width<=390) { await page.evaluate(()=>scrollTo({top:0,behavior:'instant'})); await page.screenshot({path:path.join(out,`${mode}-${width}.png`),fullPage:true}); }
  }
 }
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#mode-agent').click();
 eq(await page.locator('#mode-agent').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
 // Reflow at the 720 CSS pixels available when a 1440px browser is zoomed 200%.
 await page.setViewportSize({width:720,height:450});eq((await metrics(page)).overflow,false,'200% equivalent reflow');
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'})); await page.screenshot({path:path.join(out,'zoom-reflow-720.png'),fullPage:true});
 // Set real browser zoom through Chromium's settings UI API in a fresh,
 // task-only profile. This changes the layout viewport and devicePixelRatio;
 // neither CSS zoom nor a CDP pinch-scale approximation is used.
 const zoomContext=await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(),'commission-zoom-')),
  {executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,viewport:null,args:['--window-size=1440,900']});
 const zoomMeasurements=[];
 try {
  const zoomPage=await zoomContext.newPage();await zoomPage.goto('chrome://settings/appearance');
  await zoomPage.evaluate(()=>new Promise(resolve=>chrome.settingsPrivate.setDefaultZoom(2,resolve)));
  await zoomPage.goto(url);await zoomPage.evaluate(()=>document.fonts.ready);
  for(const mode of ['quick','agent','seller']) {
   await zoomPage.locator('#mode-'+mode).click();
   if(mode==='agent'){await zoomPage.locator('#advanced-fees summary').click();await zoomPage.locator('#calculation-breakdown summary').click();}
   const m=await zoomPage.evaluate(()=>({outerWidth,innerWidth,dpr:devicePixelRatio,overflow:document.documentElement.scrollWidth>innerWidth,result:document.querySelector('#primary-result').textContent}));
   eq(m.dpr,2,'native browser zoom 200%');eq(m.overflow,false,'native zoom '+mode);eq(m.result,{quick:'$13,500.00',agent:'$9,155.00',seller:'$436,500.00'}[mode]);
   zoomMeasurements.push({mode,...m});await zoomPage.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
   await zoomPage.screenshot({path:path.join(out,'zoom-native-'+mode+'.png'),fullPage:true});
  }
 } finally {await zoomContext.close();}
 fs.writeFileSync(path.join(out,'zoom-native.json'),JSON.stringify({method:'Fresh Chromium profile; chrome.settingsPrivate.setDefaultZoom(2) through chrome://settings/appearance; no device emulation or CSS zoom.',assertions:9,measurements:zoomMeasurements},null,2)+'\n');
 fs.writeFileSync(path.join(out,'after-measurements.json'),JSON.stringify(measurements,null,2)+'\n');
 eq(errors.length,0,'JavaScript browser errors');
 fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({assertions,viewports:measurements.map(m=>m.viewport),errors,zoom:'Real native browser zoom 200% passes all three modes; see zoom-native.json. Additional reflow check at 720 CSS px.'},null,2)+'\n');
 console.log(`PASS: ${assertions} real Chromium assertions; all modes at seven widths, keyboard, FAQ, clipboard, print PDFs, examples, validation, sliders, reset and reflow. Screenshots: ${out}`);
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
