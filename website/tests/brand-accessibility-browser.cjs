// Serve website/ and provide PLAYWRIGHT_MODULE, AXE_PATH and optionally SITE_URL,
// CHROME_PATH and BASELINE_THEME (original theme CSS for visual geometry checks).
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=(() => { const dist = path.resolve(__dirname, '..', 'dist'); if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('website/dist not found. Run "npm --prefix website run build" first (tests run against the Astro build output).'); process.exit(1); } return dist; })(),out=path.resolve(process.env.BRAND_REVIEW_DIR||path.resolve(root,'../review/about-page-redesign'));
const url=process.env.SITE_URL||'http://127.0.0.1:8136/';
function pages(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()&&!['tests','reference','dist-production'].includes(e.name)?pages(path.join(dir,e.name)):e.isFile()&&e.name==='index.html'?[path.relative(root,path.join(dir,e.name)).replaceAll('\\','/').replace(/index.html$/,'')]:[]);}
const routes=pages(root),reports=[],problems=[],httpErrors=[];let assertions=0;
function check(name,value){assert(value,name);assertions++;}
const label='Every Real Estate Calculator Tools · Software · Guides, homepage';
async function geometry(page){return page.locator('.brand').evaluateAll(els=>els.map(e=>{const round=v=>Math.round(v*100)/100;const rect=n=>{const r=n.getBoundingClientRect();return {x:round(r.x),y:round(r.y+scrollY),width:round(r.width),height:round(r.height)};};const t=e.querySelector('em'),s=getComputedStyle(t);return {brand:rect(e),tagline:rect(t),font:s.font,fontSize:s.fontSize,lineHeight:s.lineHeight,letterSpacing:s.letterSpacing,logo:rect(e.querySelector('img'))};}));}
async function auditWithTimeout(page){let timer;try{return await Promise.race([page.evaluate(()=>axe.run({include:['.brand']},{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']}})),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Accessibility audit exceeded 30 seconds')),30000);})]);}finally{clearTimeout(timer);}}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
 for(const width of [1440,390])for(const javaScriptEnabled of [true,false]){
  const context=await browser.newContext({viewport:{width,height:1000},javaScriptEnabled,isMobile:width<600,hasTouch:width<600});
  for(const route of routes){
   const page=await context.newPage();page.on('pageerror',e=>problems.push({route,width,error:e.message}));page.on('response',r=>{if(r.status()>=400)httpErrors.push({route,width,url:r.url(),status:r.status()});});
   await page.goto(url+route);await page.evaluate(()=>document.fonts.ready);
   check(route+' has two brand links',await page.getByRole('link',{name:label,exact:true}).count()===2);
   check(route+' no overflow',await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth));
   const after=await geometry(page);
   for(const link of await page.locator('.brand').all()){
    check(route+' brand points home',new URL(await link.getAttribute('href'),page.url()).pathname===new URL(url).pathname);
    check(route+' visible tagline',await link.locator('em').isVisible());
   }
   const report={route:'/'+route,width,javaScriptEnabled};
   if(javaScriptEnabled){
    await page.evaluate(fs.readFileSync(process.env.AXE_PATH,'utf8'));
    const result=await auditWithTimeout(page);
    Object.assign(report,{passes:result.passes.length,violations:result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:result.incomplete.map(v=>v.id)});
    if(report.violations.length)console.log(JSON.stringify(report,null,2));
    check(route+' no shared brand accessibility violations',!report.violations.length);
   }else{
    // Keep page scripting disabled. Axe needs timers; verify the actual static
    // names above and computed text contrast directly in this native no-JS mode.
    check(route+' application scripts skipped',await page.evaluate(()=>typeof window.siteConfig==='undefined'));
    report.nativeContrast=await page.locator('.brand em').evaluateAll(els=>{
     const lum=s=>s.match(/[\d.]+/g).slice(0,3).map(Number).map(c=>c/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((a,c,i)=>a+c*[.2126,.7152,.0722][i],0);
     return els.map(e=>{const bg=e.closest('footer')?getComputedStyle(e.closest('footer')).backgroundColor:'rgb(255, 255, 255)',fg=getComputedStyle(e).color,a=lum(fg),b=lum(bg);return {foreground:fg,background:bg,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};});
    });
    for(const entry of report.nativeContrast)check(route+' no-JS tagline meets AA contrast',entry.ratio>=4.5);
   }
   if(javaScriptEnabled&&process.env.BASELINE_THEME){
    const beforePage=await context.newPage();await beforePage.route('**/assets/theme.css',r=>r.fulfill({status:200,contentType:'text/css',body:fs.readFileSync(process.env.BASELINE_THEME,'utf8')}));
    await beforePage.goto(url+route);await beforePage.evaluate(()=>document.fonts.ready);
    const before=await geometry(beforePage);report.geometryUnchanged=JSON.stringify(before)===JSON.stringify(after);check(route+' original geometry and fonts unchanged',report.geometryUnchanged);
    if(['','about/','tools/mortgage-calculator/'].includes(route)){
     for(const [which,target] of [['before',beforePage],['after',page]]){
      const name=route===''?'home':route==='about/'?'about':'mortgage';
      await target.locator('.header').screenshot({path:path.join(out,`brand-${name}-${width}-${which}-header.png`)});
      await target.locator('.footer .brand').screenshot({path:path.join(out,`brand-${name}-${width}-${which}-footer.png`)});
     }
    }
    await beforePage.close();
   }
   reports.push(report);await page.close();
  }
  console.log(`Passed ${routes.length} pages at ${width}px; page JavaScript on load: ${javaScriptEnabled}.`);
  await context.close();
 }
 check('no JavaScript errors',!problems.length);check('no HTTP errors',!httpErrors.length);
 fs.writeFileSync(path.join(out,'shared-brand-accessibility-results.json'),JSON.stringify({engine:'axe-core 4.14.0',assertions,pages:routes.length,reports,problems,httpErrors},null,2));
 console.log(JSON.stringify({assertions,pages:routes.length,browserCases:reports.length,axeAudits:reports.filter(r=>r.javaScriptEnabled).length,nativeNoJavaScriptCases:reports.filter(r=>!r.javaScriptEnabled).length,violations:reports.reduce((a,r)=>a+(r.violations?.length||0),0),geometryComparisons:reports.filter(r=>r.geometryUnchanged).length,problems,httpErrors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
