// W8: shared All Tools disclosure, frozen calculator contracts and compact SEO intro.
// Dependency-free. Run: node website/tests/w8.cjs
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
let passed = 0;
function check(name, value) { assert(value, name); passed++; }
function equal(name, actual, expected) { assert.deepEqual(actual, expected, name); passed++; }
const frozen = {
  "pages": {
    // All baselines recaptured 2026-11-25 (Wholesale): the Wholesale Calculator became the 16th tool — every footer gained the Wholesale link, and the Wholesale page gained a frozen header entry.
    // All baselines recaptured 2026-11-25 (Depreciation): the Depreciation Calculator became the 15th tool — every footer gained the Depreciation link, and the Depreciation page gained a frozen header entry.
    // All baselines recaptured 2026-11-24 (IRR): the IRR Calculator became the 14th tool — every footer gained the IRR link (footer lists rebalanced), and the IRR page gained a frozen header entry.
    // All baselines recaptured 2026-11-24 (Commercial Real Estate): the Commercial Real Estate Calculator became the 13th tool — every footer gained the Commercial link (footer lists rebalanced), and the Commercial page gained a frozen header entry.
    // All baselines recaptured 2026-11-24 (Rental Yield): the Rental Yield Calculator became the 12th tool — every footer gained the Rental Yield link, and the Rental Yield page gained a frozen header entry.
    // All baselines recaptured 2026-11-24: the redesign stack and the Down Payment Calculator were merged onto main together — every footer gained the Down Payment link, and the Down Payment page gained a frozen header entry.
    // Homepage baseline includes the approved Google Search Console verification tag.
    "index.html": "6100848bb0da83f0df753a1eb0009d9876f1b10b5dbdf1873667218718a4c058",
    // About baseline refreshed for the editorial refinement; shared header stays frozen.
    // All page baselines refreshed 2026-11-16: footer Platform column gained the Privacy Policy link on every page.
    // All page baselines refreshed 2026-11-17: footer Platform column gained the Terms of Use link on every page.
    // All page baselines refreshed 2026-11-24: footer Tools list rebuilt (mega-menu order, Title Case, two fixed lists), footer headings h2 -> p, "Access availability" renamed "Early access".
    "about/index.html": "d8173cf429e71164f4a9264dbca4edd8af98d7bfcd2412c70022dc6a17c17f95",
    "contact/index.html": "7d316e90010887f92fc476646170e3aaaa9c93a46de277e163237f716cd1128b",
    "resources/index.html": "f1286d190a16589ba53583d9e7f33a2ebaec9ae978a82bd4f3e104c24eb8368f",
    "real-estate-crm/index.html": "50ed3e0d20ce1bc6a7014c713c956741011f109085f4ddadde72557706bfc0b7",
    "tools/index.html": "a71ed5ca019af7f25d9df95c4b7f5e0242706b4a97cb10302c4f5d5983d3a4d2",
    "tools/bridge-loan-calculator/index.html": "1469e8f4dea7d0f0412eb46e0923125242a35dc2a21f22fda1a38e914ffc036d",
    "tools/cap-rate-calculator/index.html": "c13d8b0ab54569cb3493474807157b511950fa0c4ad052a0178e601e2f473273",
    "tools/capital-gains-tax-calculator/index.html": "046a22d6a7d1972dbd1caa47f5ce4f1031f9ffb9d7b44136b1b704b629c6a677",
    "tools/commission-calculator/index.html": "26ad2292f769e6b8531d549cf911ffb025677d33938089c0f4159a7b6e864d7b",
    "tools/home-affordability-calculator/index.html": "93650459a58269abdd74da64c32727f8ba21f68cbe3c4ada20fc989671975f24",
    "tools/mortgage-calculator/index.html": "3e3a70865014d40535dbb0834e1ac74d0b2dda749076936af45355281cdaf680",
    "tools/noi-calculator/index.html": "9a50ae7b8e40d5a4972621e2b17dd6eae350445cd63b558618bbdde59c0f7dbf",
    "tools/property-investment-calculator/index.html": "8f35e0f06e1891d9886235281c456d26f7238e20975718ebefe1910091b517bb",
    "tools/rent-vs-buy-calculator/index.html": "f6a71c6684d673dec9cbd20f44a9618282517d2fe0ae2dfbb876e1af17281ed3",
    "tools/roi-calculator/index.html": "59a75aa4afb2374f7f689861d330b242b571348c4e5e2d6d6d48ecd8c930826c"
  },
  "headers": {
    "index.html": "8ff8b5602307f1645666134a5b006e4ed3850ed7c983a54259088a2e68ea77e4",
    "about/index.html": "dcf19b9faa556e2e80415ed8913016ff71dc7807434d38fd5e98036e9c89a516",
    "contact/index.html": "09b5ef330478d66108c0fddbd8472d220f1af6c9f0f1cfe1556eaff68bed30a9",
    "resources/index.html": "1e132af771c4f39d6bac996c76c4e9d25f519bed25861be2f221835b266f1a80",
    "real-estate-crm/index.html": "5b364caf2fb0dd6188b8353181ff1459dc9db46ddf41b2e53f06744e35e6d786",
    "tools/index.html": "061f31223642b159193adafd0459b8c1b84f08beba8b81cb95a5ed3f68ad9c38",
    "tools/bridge-loan-calculator/index.html": "bc3cd3f9e232ef8b213dc058eac0e159bf9faf2ac4aeb51ea5a5821b8c634181",
    "tools/cap-rate-calculator/index.html": "bc3cd3f9e232ef8b213dc058eac0e159bf9faf2ac4aeb51ea5a5821b8c634181",
    "tools/capital-gains-tax-calculator/index.html": "bc3cd3f9e232ef8b213dc058eac0e159bf9faf2ac4aeb51ea5a5821b8c634181",
    "tools/commission-calculator/index.html": "bc3cd3f9e232ef8b213dc058eac0e159bf9faf2ac4aeb51ea5a5821b8c634181",
    "tools/down-payment-calculator/index.html": "bc3cd3f9e232ef8b213dc058eac0e159bf9faf2ac4aeb51ea5a5821b8c634181",
    "tools/home-affordability-calculator/index.html": "bc3cd3f9e232ef8b213dc058eac0e159bf9faf2ac4aeb51ea5a5821b8c634181",
    "tools/mortgage-calculator/index.html": "bc3cd3f9e232ef8b213dc058eac0e159bf9faf2ac4aeb51ea5a5821b8c634181",
    "tools/noi-calculator/index.html": "5420965f4804b1eca78d76dc4b2413ccbc9d9f2c30c948e97134e436e0499120",
    "tools/property-investment-calculator/index.html": "bc3cd3f9e232ef8b213dc058eac0e159bf9faf2ac4aeb51ea5a5821b8c634181",
    "tools/rental-yield-calculator/index.html": "bc3cd3f9e232ef8b213dc058eac0e159bf9faf2ac4aeb51ea5a5821b8c634181",
    "tools/commercial-real-estate-calculator/index.html": "bc3cd3f9e232ef8b213dc058eac0e159bf9faf2ac4aeb51ea5a5821b8c634181",
    "tools/irr-calculator/index.html": "bc3cd3f9e232ef8b213dc058eac0e159bf9faf2ac4aeb51ea5a5821b8c634181",
    "tools/depreciation-calculator/index.html": "bc3cd3f9e232ef8b213dc058eac0e159bf9faf2ac4aeb51ea5a5821b8c634181",
    "tools/wholesale-calculator/index.html": "bc3cd3f9e232ef8b213dc058eac0e159bf9faf2ac4aeb51ea5a5821b8c634181",
    "tools/rent-vs-buy-calculator/index.html": "bc3cd3f9e232ef8b213dc058eac0e159bf9faf2ac4aeb51ea5a5821b8c634181",
    "tools/roi-calculator/index.html": "bc3cd3f9e232ef8b213dc058eac0e159bf9faf2ac4aeb51ea5a5821b8c634181"
  },
  "calculators": {
    "bridge-loan-calculator": "74b2f4f6d5330a2b4aec345587ec4e44faffe5228c4643b28f47a2fd4d9d124d",
    "cap-rate-calculator": "505c4381f9d4aac198cebc1b9b66deaa4814ad477dd41b5d956fb4fd3423b79b",
    "capital-gains-tax-calculator": "6ca3b2c736cc79ce6bf8dab9cdf2ffea50e5ae54bb8dfef9d2d8fc73fe1a47e9",
    "commission-calculator": "2b36dd89cd5eede3fe3c6ff2d25abec61241fe0177982a62a8e0cffe36b9a717",
    "home-affordability-calculator": "0560122f57d28acddb84d50754f327f6faa8e61e1a0b158d75269795db257cad",
    "mortgage-calculator": "8017db7163331edc279263aab50a979f5377cd2738f994fefe97b4b0392bd652",
    "noi-calculator": "d2deaf652832d3ce41d521bc707721d549fc507a124df6e899c8e83a5864d598",
    "property-investment-calculator": "8c03521413d98b9c0f2ca4cf811666cf41dedee57a7decc647269d4ef28211a7",
    "rent-vs-buy-calculator": "4e3bc4c05eb1ec0961d7e7d07641803d06c5b07251e995652e67cbf6926a36e1",
    "roi-calculator": "20d22bfc5708832155ccba50973f6eaf5f945aa7c12be827fee83627928f028b"
  }
};
const context = {window:{}};
vm.runInNewContext(read('assets/tool-registry.js'), context);
const tools = Array.from(context.window.realEstateTools).filter(t=>t.status==='published');
const pages = ['index.html','about/index.html','contact/index.html','resources/index.html','real-estate-crm/index.html','tools/index.html',...tools.map(t=>`tools/${t.slug}/index.html`)];
const escape = s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const menuPattern = /<div class="tools-menu" id="tools-menu">[\s\S]*?<\/div>\s*<\/div><\/div>/;
// The shared brand fix changes only the accessible name. Keep the original
// appearance/content fingerprints while brand-accessibility.cjs checks the new name.
// Normalize only the approved route migration; retain the frozen visual/content hashes.
const legacyBrandLabel = html=>html.replaceAll('real-estate-crm/', 'realtorcrm/').replaceAll('aria-label="Every Real Estate Calculator Tools · Software · Guides, homepage"', 'aria-label="Every Real Estate Calculator, homepage"').replaceAll('Every Real Estate Calculator</span> <em>Tools', 'Every Real Estate Calculator</span><em>Tools');
const outsideHeader = html=>legacyBrandLabel(html).replace(/<header\b[\s\S]*?<\/header>/,'').replace(/\n<div class="tools-menu-overlay"[^>]*><\/div>/,'').replace(/\s+/g,' ').trim();
let reference;
for(const file of pages) {
  const html = read(file), header = html.match(/<header\b[\s\S]*?<\/header>/)[0];
  const menu = header.match(menuPattern)?.[0];
  check(`${file} menu`, menu);
  equal(`${file} one disclosure`, (header.match(/id="tools-menu-toggle"/g)||[]).length,1);
  check(`${file} accessible toggle`, /<button[^>]*id="tools-menu-toggle"[^>]*type="button"[^>]*aria-expanded="false"[^>]*aria-controls="tools-mega-menu"/.test(menu));
  check(`${file} initially hidden`, /id="tools-mega-menu" hidden/.test(menu));
  check(`${file} overlay`, html.includes('<div class="tools-menu-overlay" id="tools-menu-overlay" hidden aria-hidden="true"></div>'));
  check(`${file} overlay outside header`, html.indexOf('id="tools-menu-overlay"')>html.indexOf('</header>'));
  equal(`${file} tool count`,(menu.match(/data-menu-tool=/g)||[]).length,16);
  const prefix='../'.repeat(file.split('/').length-1);
  const normalized=menu.replaceAll(`href="${prefix}tools/`,'href="TOOLS/').replaceAll('\r\n','\n');
  if(reference) equal(`${file} identical normalized menu`,normalized,reference);else reference=normalized;
  for(const [index,category] of ['Buying & Financing','Property Investment','Selling, Tax & Agent Tools'].entries()) {
    check(`${file} category ${index}`,menu.includes(`id="tools-group-${index}">${escape(category)}</p>`));
    const group=menu.match(new RegExp(`<div class="tools-menu-group" aria-labelledby="tools-group-${index}">[\\s\\S]*?</ul>`))[0];
    equal(`${file} approved category members ${index}`,Array.from(group.matchAll(/data-menu-tool="([^"]+)"/g),m=>m[1]),[
      ['mortgage-calculator','down-payment-calculator','home-affordability-calculator','rent-vs-buy-calculator','bridge-loan-calculator'],
      ['cap-rate-calculator','rental-yield-calculator','commercial-real-estate-calculator','irr-calculator','wholesale-calculator','noi-calculator','roi-calculator','property-investment-calculator'],
      ['commission-calculator','capital-gains-tax-calculator','depreciation-calculator']
    ][index]);
  }
  for(const tool of tools) {
    const item=menu.match(new RegExp(`<a class="tools-menu-link" data-menu-tool="${tool.slug}"[\\s\\S]*?</a>`))?.[0]||'';
    check(`${file} ${tool.slug} URL`,item.includes(`href="${prefix}tools/${tool.publicUrl}"`));
    check(`${file} ${tool.slug} name`,item.includes(`class="tools-menu-name">${escape(tool.title)}</span>`));
    // Menu items show the calculator name only — the registry description was
    // removed from the mega menu on the owner's instruction (2026-11-24) to
    // keep the menu compact. Descriptions remain in the registry for other
    // surfaces (homepage cards, /tools/).
    check(`${file} ${tool.slug} no description in menu`,!item.includes('tools-menu-description'));
    check(`${file} ${tool.slug} decorative approved icon`,item.includes(`class="tools-menu-icon" aria-hidden="true">${escape(tool.icon)}</span>`));
    equal(`${file} ${tool.slug} unique link`,(menu.match(new RegExp(`data-menu-tool="${tool.slug}"`,'g'))||[]).length,1);
    check(`${file} ${tool.slug} target exists`,fs.existsSync(path.join(root,'tools',tool.publicUrl,'index.html')));
  }
  check(`${file} no inline scripts`,!/<script(?![^>]*\bsrc=)/i.test(html));
  check(`${file} no inline handlers`,!/<[^>]*\son[a-z]+\s*=/i.test(html));
  if(file!=='tools/index.html' && !/^tools\/[^/]+\/index\.html$/.test(file)) equal(`${file} content outside header frozen`,hash(outsideHeader(html)),frozen.pages[file]);
  const normalizedHeader=legacyBrandLabel(header).replace(menuPattern,'MENU').replace(/\s+/g,' ').trim();
  equal(`${file} brand / other navbar items frozen`,hash(normalizedHeader),frozen.headers[file]);
}
// Calculator composition is intentionally changed by the centralized system.
// Keep metadata/defaults and financial engine contracts instead of old HTML hashes.
const contracts = JSON.parse(read('tests/fixtures/calculator-contracts.json'));
const normalize = s=>s.replaceAll('\r\n','\n');
for(const [slug,contract] of Object.entries(contracts.calculators)) {
  const html=read('tools/'+slug+'/index.html');
  const metadata={title:html.match(/<title>([^<]+)<\/title>/)[1]};
  for(const m of html.matchAll(/<meta\b[^>]+>/g)) {const key=m[0].match(/(?:name|property)="([^"]+)"/)?.[1],value=m[0].match(/content="([^"]*)"/)?.[1];if(key)metadata[key]=value;}
  metadata.canonical=html.match(/rel="canonical" href="([^"]+)"/)[1];
  equal(slug+' metadata and canonical preserved',metadata,contract.metadata);
  for(const [id,expected] of Object.entries(contract.inputs)) {
    const tag=[...html.matchAll(/<input\b[^>]+>/g)].find(m=>m[0].includes('id="'+id+'"'))?.[0]||'';
    equal(slug+' '+id+' financial defaults/bounds preserved',JSON.parse(JSON.stringify({value:tag.match(/value="([^"]*)"/)?.[1],min:tag.match(/\bmin="([^"]*)"/)?.[1],max:tag.match(/\bmax="([^"]*)"/)?.[1]})),expected);
  }
  let source=normalize(read('tools/'+slug+'/calculator.js'));
  if(slug==='capital-gains-tax-calculator')source=source.replace(/^.*set\('sticky-value',[^\n]+\n/gm,'');
  if(slug==='commission-calculator')source=source.match(/    var total = price \* rate \/ 100;[\s\S]+?    var sellerNet = price - total - otherCosts - payoff;/)[0];
  equal(slug+' financial engine preserved',hash(source),slug==='commission-calculator'?contract.arithmeticHash:contract.engineHash);
}
const css=read('assets/theme.css'),listing=read('assets/tool-listing.css');
for(const token of ["--font-body:'Inter'","--font-display:'Source Serif 4'",'--paper:#F6F5F0','--navy:#102131','--teal:#0F766E','--gold:#C49B52']) check('palette/font '+token,css.includes(token));
for(const rule of [
 '.header .tools-menu-toggle { display: inline-flex;', 'min-height: 44px;',
 '.header .tools-mega-menu[hidden], .tools-menu-overlay[hidden] { display: none !important; }',
 'width: min(980px, calc(100vw - 48px))', 'grid-template-columns: repeat(3, minmax(0, 1fr))',
 '.tools-menu-overlay { position: fixed; inset: 0; z-index: 19;',
 '.header .nav .tools-menu .tools-menu-link:focus-visible', '.header .tools-menu-toggle[aria-expanded="true"]',
 '@media (max-width: 760px)', '.header .tools-mega-menu { position: static; width: 100%;',
 '.header .tools-menu-columns { grid-template-columns: 1fr;', '@media (prefers-reduced-motion: reduce)',
 '@media print { .tools-menu-overlay { display: none !important; }'
]) check('shared geometry/state '+rule,css.includes(rule));
for(const tool of tools) {
  check(`${tool.slug} no per-page menu CSS`,!read(`tools/${tool.slug}/calculator.css`).includes('tools-mega-menu'));
  check(`${tool.slug} no per-page menu JS`,!read(`tools/${tool.slug}/calculator.js`).includes('tools-mega-menu'));
}
const html=read('tools/index.html');
check('requested H1',html.includes('<h1>Free Real Estate Calculators</h1>'));
check('intro copy',html.includes('Explore 16 free real estate calculators for buying, investing and selling. Compare estimates, understand the assumptions, and plan your next step.'));
check('trust right column markup',/<div class="wrap tools-intro"><div class="tools-intro-copy">[\s\S]*?<\/div><div class="trust-chips"/.test(html));
for(const chip of ['✓ No signup','✓ Free to use','✓ Calculations stay in your browser'])check('trust '+chip,html.includes(`<span>${chip}</span>`));
check('desktop right trust column',listing.includes('grid-template-columns: minmax(0, 1fr) auto'));
check('mobile trust wraps',listing.includes('.tools-intro .trust-chips { display: flex; flex-wrap: wrap;'));
check('SVG search icon',/<svg class="listing-search-icon"[\s\S]*?aria-hidden="true"[\s\S]*?<input id="tool-search"/.test(html));
check('no emoji in search placeholder',!html.includes('placeholder="🔍'));
check('search input retains label',html.includes('aria-label="Search tools"'));
check('search icon does not block input',listing.includes('pointer-events: none'));
check('SEO title',html.includes('<title>Free Real Estate Calculators | 16 Online Tools</title>'));
check('SEO description',html.includes('name="description" content="Explore 16 free real estate calculators for mortgages, affordability, rental returns, commissions and selling costs. Clear estimates, no signup required."'));
for(const attr of ['property="og:title"','name="twitter:title"'])check('social title '+attr,html.includes(`${attr} content="Free Real Estate Calculators | 16 Online Tools"`));
check('canonical unchanged',html.includes('rel="canonical" href="https://everyrealestatecalculator.com/tools/"'));
for(const tool of tools)check('static directory kept '+tool.slug,html.includes(`<li><a href="${tool.publicUrl}">`));

class Node {
 constructor(){this.attributes={};this.events={};this.hidden=true;this.members=new Set();this.classes=new Set();this.classList={toggle:n=>{if(this.classes.has(n)){this.classes.delete(n);return false;}this.classes.add(n);return true;},remove:n=>this.classes.delete(n)};}
 addEventListener(event,fn){(this.events[event] ||= []).push(fn);}
 setAttribute(name,value){this.attributes[name]=value;}
 getAttribute(name){return this.attributes[name];}
 contains(node){return node===this||this.members.has(node);}
 focus(){this.focused=true;}
 fire(event,data={}){for(const fn of this.events[event]||[])fn({target:this,detail:0,...data});}
}
const script=read('assets/site.js');
function setup({absent=false,partial=false,hover=false,media=true}={}){
 const ids=Object.fromEntries(['.menu-toggle','.nav','#tools-menu','#tools-menu-toggle','#tools-mega-menu','#tools-menu-overlay'].map(id=>[id,new Node()]));
 if(absent)for(const id of Object.keys(ids))ids[id]=null;
 if(partial)ids['#tools-mega-menu']=null;
 const document=new Node();document.querySelector=s=>ids[s];document.querySelectorAll=()=>[];
 const timers=new Map();let timerID=0;let resize;
 const window=media?{matchMedia:q=>({matches:q.includes('min-width')?hover:!hover,addEventListener(e,fn){resize=fn;}})}:{};
 if(ids['#tools-menu']){ids['#tools-menu'].members.add(ids['#tools-menu-toggle']);ids['#tools-menu'].members.add(ids['#tools-mega-menu']);}
 vm.runInNewContext(script,{window,document,setTimeout:fn=>{timers.set(++timerID,fn);return timerID;},clearTimeout:id=>timers.delete(id)});
 return{ids,document,timers,resize:()=>resize?.()};
}
setup({absent:true});passed++;setup({partial:true});passed++;setup({media:false});passed++;
let s=setup();let trigger=s.ids['#tools-menu-toggle'],panel=s.ids['#tools-mega-menu'],overlay=s.ids['#tools-menu-overlay'],container=s.ids['#tools-menu'];
trigger.fire('click');equal('click opens',panel.hidden,false);equal('overlay opens',overlay.hidden,false);equal('expanded true',trigger.getAttribute('aria-expanded'),'true');
trigger.fire('click');equal('second click closes',panel.hidden,true);
trigger.fire('click');s.document.activeElement=trigger;s.document.fire('keydown',{key:'Escape'});equal('Escape closes',panel.hidden,true);equal('Escape focuses disclosure',trigger.focused,true);
trigger.fire('click');s.document.fire('click',{target:new Node()});equal('outside click closes',panel.hidden,true);
trigger.fire('click');overlay.fire('click');equal('overlay click closes',panel.hidden,true);
trigger.fire('click');container.fire('focusout',{relatedTarget:new Node()});equal('tabbing outside closes',panel.hidden,true);
trigger.fire('click');s.resize();equal('breakpoint change closes',panel.hidden,true);
const nav=s.ids['.nav'],mobileToggle=s.ids['.menu-toggle'];mobileToggle.fire('click');trigger.fire('click');mobileToggle.fire('click');equal('closing mobile nav closes submenu',panel.hidden,true);equal('closing mobile nav hides overlay',overlay.hidden,true);
mobileToggle.fire('click');s.document.activeElement=nav;s.document.fire('keydown',{key:'Escape'});equal('legacy mobile Escape',mobileToggle.getAttribute('aria-expanded'),'false');equal('legacy focus return',mobileToggle.focused,true);
s=setup({hover:true});trigger=s.ids['#tools-menu-toggle'];panel=s.ids['#tools-mega-menu'];container=s.ids['#tools-menu'];
container.fire('pointerenter');equal('desktop hover opens',panel.hidden,false);trigger.fire('pointerdown');trigger.fire('click',{detail:1});equal('first pointer click keeps hovered menu open',panel.hidden,false);trigger.fire('pointerdown');trigger.fire('click',{detail:1});equal('second pointer click toggles closed',panel.hidden,true);
container.fire('pointerenter');container.fire('pointerleave');equal('hover close delayed',s.timers.size,1);container.fire('pointerenter');equal('hover reentry cancels close',s.timers.size,0);
container.fire('pointerleave');for(const fn of s.timers.values())fn();equal('hover leave closes',panel.hidden,true);
s=setup({hover:false});s.ids['#tools-menu'].fire('pointerenter');equal('mobile hover does not open',s.ids['#tools-mega-menu'].hidden,true);
const number={tagName:'INPUT',type:'number',value:'450000',blur(){this.blurred=true;}};s.document.activeElement=number;s.document.fire('wheel',{target:number});equal('existing number-wheel protection',number.blurred,true);equal('wheel leaves calculator value unchanged',number.value,'450000');
console.log(`W8: ${passed} passed, 0 failed (18 shared menus, 10 preserved financial engine contracts, compact intro, SEO and disclosure behavior).`);
