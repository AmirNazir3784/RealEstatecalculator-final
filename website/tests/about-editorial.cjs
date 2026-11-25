const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'about/index.html'),'utf8'),main=html.match(/<main\b[\s\S]*?<\/main>/)[0];
let passed=0;function check(name,value){assert(value,name);passed++;}
check('one H1',main.match(/<h1\b/g).length===1);
check('six editorial sections',main.match(/<section\b/g).length===6);
for(const text of ['Free real estate calculators, and the CRM to run your business.','Why we built this platform.','What we offer','Who our tools are for','How we approach accuracy','Find the right tool for your next decision.'])check('approved heading '+text,main.includes('>'+text+'</h'));
check('plain navy hero heading',/<h1[^>]*>[^<]+<\/h1>/.test(main));
check('no repeated template elements',!/<svg\b|class="eyebrow"|about-highlights|about-audience-card|about-principles|about-product-card/.test(main));
check('four semantic audience rows',(main.match(/<dt>/g)||[]).length===4&&(main.match(/<dd>/g)||[]).length===4);
check('three photographic visuals without screenshots', (main.match(/<img\b/g)||[]).length===3 && !/mortgage-calculator\.webp|<figcaption|<iframe/.test(main));
check('CRM description is factual text',main.includes('organize contacts, deals, appointments and follow-ups')&&main.includes('daily workflows'));
check('source and license recorded',fs.readFileSync(path.join(root,'about/IMAGE_SOURCES.md'),'utf8').includes('https://unsplash.com/license'));
check('responsive hero has dimensions',/srcset="down-payment-calculator-hero-720.webp 720w, down-payment-calculator-hero.webp 2280w"[^>]*width="2280" height="1384"/.test(main));
check('no new main scripts',!/<script\b/.test(main));
for(const name of ['architecture-home.webp','architecture-home-720.webp','property-planning.webp','property-planning-720.webp','professional-workspace.webp','professional-workspace-720.webp'])check(name+' exists',fs.existsSync(path.join(root,'about',name)));
for(const link of ['../tools/','../resources/','../real-estate-crm/'])check('existing link '+link,main.includes('href="'+link+'"'));
// The supplied copy is approximately 250 words; do not pad it with new marketing.
const words=main.replace(/<[^>]+>/g,' ').replace(/&[^;]+;/g,' ').trim().split(/\s+/).length;check('concise supplied copy',words>=225&&words<=400);
check('canonical unchanged',html.includes('rel="canonical" href="https://everyrealestatecalculator.com/about/"'));
const css=fs.readFileSync(path.join(root,'about/about.css'),'utf8');
check('no competing fonts',!/@font-face|@import/.test(css));
check('page-specific styling',css.split(/\r?\n/).filter(l=>l.includes('{')&&!l.startsWith('@')&&!l.startsWith('/*')).every(l=>l.trim().startsWith('.about-page')));
console.log(`PASS: ${passed} editorial About checks; ${words} source words, six sections, real imagery, semantic directory, supplied copy and preserved canonical.`);
