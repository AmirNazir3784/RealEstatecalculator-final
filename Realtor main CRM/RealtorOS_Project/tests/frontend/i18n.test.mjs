import {test} from "node:test";
import assert from "node:assert/strict";
import {browser,SKIP_DOM} from "../helpers/browser.mjs";
test("live translations preserve user text, input values and attached handlers",async t=>{
 const b=await browser([]);if(!b){t.skip(SKIP_DOM);return;}
 try{
  const I=b.window.App.i18n;I.register('de',{'Contacts':'Kontakte','Save':'Speichern','Welcome, {0}':'Willkommen, {0}','Language':'Sprache'});
  const host=b.document.createElement('div');b.document.body.append(host);
  const userText='Contacts';
  host.innerHTML=I.html`<h2>Contacts</h2><p>Welcome, ${I.value(()=>userText)}</p><label title="Language">Language</label><div>${I.value(()=>'<input id="untouched" value="User note"><button id="handler">User button</button>')} Save</div>`;
  const input=host.querySelector('input'),button=host.querySelector('button');let clicked=0;button.onclick=()=>clicked++;
  input.value='Edited but unsaved';await I.setLocale('de');
  assert.equal(host.querySelector('h2').textContent,'Kontakte');
  assert.equal(host.querySelector('p').textContent,'Willkommen, Contacts');
  assert.equal(host.querySelector('label').title,'Sprache');
  assert.equal(host.querySelector('input'),input);assert.equal(input.value,'Edited but unsaved');
  button.click();assert.equal(clicked,1);assert.equal(host.querySelector('button'),button);
  await I.setLocale('en');assert.equal(host.querySelector('h2').textContent,'Contacts');
 }finally{b.close();}
});
test("source message bindings update dynamic auth headings and select labels safely",async t=>{
 const b=await browser([]);if(!b){t.skip(SKIP_DOM);return;}
 try{const I=b.window.App.i18n;I.register('ar',{'Welcome back':'مرحبًا بعودتك','Dark':'داكن'});const h=b.document.createElement('h1');b.document.body.append(h);I.setText(h,I.value(()=>I.t('Welcome back')));const select=b.document.createElement('select');b.document.body.append(select);select.innerHTML=I.html`<option value="dark">Dark</option>`;await I.setLocale('ar');assert.equal(h.textContent,'مرحبًا بعودتك');assert.equal(select.options[0].textContent,'داكن');assert.equal(select.options[0].value,'dark');assert.equal(b.document.documentElement.dir,'rtl');}finally{b.close();}
});
test("unknown messages fall back to English; prototype keys are ordinary messages",async t=>{
 const b=await browser([]);if(!b){t.skip(SKIP_DOM);return;}
 try{const I=b.window.App.i18n;I.register('fr',{});await I.setLocale('fr');assert.equal(I.t('Untranslated message'),'Untranslated message');assert.equal(I.t('constructor'),'constructor');assert.equal(I.t('__proto__'),'__proto__');}finally{b.close();}
});

test("reserved interpolation-looking user text is opaque in text and attributes",async t=>{
 const b=await browser([]);if(!b){t.skip(SKIP_DOM);return;}
 try{
  const I=b.window.App.i18n,host=b.document.createElement('div');b.document.body.append(host);
  I.register('de',{'Hello {0}':'Hallo {0}','Hello {1}':'Hallo {1}','{2} Save':'{2} Speichern'});
  const name='__CRM_VALUE_2__';
  host.innerHTML=I.html`<p title="Hello ${I.value(()=>name)}">Hello ${I.value(()=>name)}</p><div>${I.value(()=>'<input id="draft"><button id="retained">User button</button>')} Save</div>`;
  const input=host.querySelector('input'),button=host.querySelector('button');let clicks=0;
  button.onclick=()=>clicks++;input.value='Unsaved user input';
  assert.equal(host.querySelector('p').title,'Hello '+name);
  assert.equal(host.querySelector('p').textContent,'Hello '+name);
  assert.equal(host.querySelectorAll('button').length,1);
  await I.setLocale('de');
  assert.equal(host.querySelector('p').title,'Hallo '+name);
  assert.equal(host.querySelector('p').textContent,'Hallo '+name);
  assert.equal(host.querySelector('input'),input);assert.equal(input.value,'Unsaved user input');
  assert.equal(host.querySelector('button'),button);button.click();assert.equal(clicks,1);
 }finally{b.close();}
});

test("translated fragments retain spacing, localized counts and live language labels",async t=>{
 const b=await browser([]);if(!b){t.skip(SKIP_DOM);return;}
 try{
  const I=b.window.App.i18n,host=b.document.createElement('div');b.document.body.append(host);
  I.register('de',{'days':'Tage','Language':'Sprache','Count: {0}':'Anzahl: {0}'});
  host.innerHTML=I.languageControl('choice')+I.html`<p>Count: ${I.value(()=>1234)}</p>`;
  const select=host.querySelector('select');await I.setLocale('de');
  assert.equal(I.t(' days'),' Tage');
  assert.equal(host.querySelector('#choiceLabel').textContent,'Sprache');
  assert.equal(host.querySelector('p').textContent,'Anzahl: 1.234');
  assert.equal(host.querySelector('select'),select);
  await I.setLocale('en');assert.equal(host.querySelector('p').textContent,'Count: 1,234');
 }finally{b.close();}
});

test("plain message bindings decode source entities without decoding user text",async t=>{
 const b=await browser([]);if(!b){t.skip(SKIP_DOM);return;}
 try{
  const I=b.window.App.i18n,node=b.document.createElement('p');b.document.body.append(node);
  const user='A &amp; B &lt;client&gt;';
  I.register('fr',{'Saved &middot; {0}':'Enregistré &middot; {0}'});
  I.setText(node,I.message('Saved &middot; {0}',[user]));
  assert.equal(node.textContent,'Saved · '+user);
  await I.setLocale('fr');assert.equal(node.textContent,'Enregistré · '+user);
 }finally{b.close();}
});

test("only known source count and grammar fragments are localized and restored",async t=>{
 const b=await browser([]);if(!b){t.skip(SKIP_DOM);return;}
 try{
  const I=b.window.App.i18n,host=b.document.createElement('div');b.document.body.append(host);
  I.register('it',{'{0} of {1} propert{2}':'Immobili: {0} di {1}{2}','{0} of {1} activit{2}':'Interazioni: {0} di {1}{2}',
   '{0} {1} required.':'{0} {1} obbligatorio.','{0} of {1} {2} record{3}':'Record di {2}: {0} di {1}{3}',Income:'Entrate',Expenses:'Spese'});
  host.innerHTML=I.html`<p>${I.value(()=>1)} of ${I.value(()=>1)} propert${I.value(()=>'y')}</p>`;
  await I.setLocale('it');assert.equal(host.textContent,'Immobili: 1 di 1');
  assert.equal(I.t('{0} of {1} activit{2}',1,2,'ies'),'Interazioni: 1 di 2');
  assert.equal(I.t('Hello {0}','s'),'Hello s');
  assert.equal(I.t('Hello {0}','ies'),'Hello ies');
  assert.equal(I.t('{0} {1} required.','Campo','is').includes('is'),false);
  assert.equal(I.t('{0} of {1} {2} record{3}',1,2,'income','s'),'Record di Entrate: 1 di 2');
  assert.equal(I.t('{0} of {1} {2} record{3}',1,2,'expense','s'),'Record di Spese: 1 di 2');
  await I.setLocale('en');assert.equal(host.textContent,'1 of 1 property');
 }finally{b.close();}
});

test("hub links, mobile options and source breadcrumbs switch without rerendering user forms",async t=>{
 const customization={teamMode:false,enabledModules:{},dashboardWidgets:{}};
 const b=await browser(['assets/js/core/utils.js','assets/js/core/customization.js','assets/js/app.js'],{
  store:{getState:()=>({settings:{customization},metadata:{}}),_defaultCustomization:()=>customization,ensureLoaded:async()=>{},settings:{}}
 });if(!b){t.skip(SKIP_DOM);return;}
 try{
  const A=b.window.App,I=A.i18n;let renders=0,clicks=0;
  A.cloud={getUser:()=>({id:'member'}),getClient:()=>({})};
  A.workspace={ready:()=>true,id:()=> 'workspace',role:()=> 'agent',teamMemberId:()=> 'member',permissions:()=>({}),
   can:()=>true,canView:()=>true,canViewSettings:()=>true,scope:()=> 'all',seesAll:()=>true};
  A.pages.contacts={renderList:async page=>{renders++;page.innerHTML='<input id="unsaved"><button id="formAction">Action</button>';
   A.app.setBreadcrumbs([{get label(){return I.t('Contacts');},route:'/contacts'},{label:'Contacts'}]);}};
  I.register('de',{All:'Alle',Buyers:'Käufer',Sellers:'Verkäufer','Past Clients':'Frühere Kunden',Contacts:'Kontakte'});
  A.app.renderShell();b.window.scrollTo=()=>{};b.window.history.replaceState(null,'','#/contacts');await A.app.route();
  const select=b.document.getElementById('hubTabSelect'),option=select.options[1],input=b.document.getElementById('unsaved'),button=b.document.getElementById('formAction');
  select.value='/buyer';input.value='User text';button.onclick=()=>clicks++;
  await I.setLocale('de');
  assert.equal(b.document.querySelector('#hubTabs .hub-tab').textContent,'Alle');
  assert.equal(select.options[1],option);assert.equal(option.textContent,'Käufer');assert.equal(select.value,'/buyer');
  assert.deepEqual(Array.from(b.document.querySelectorAll('#breadcrumbs a,#breadcrumbs .crumb-current'),n=>n.textContent),['Kontakte','Contacts']);
  assert.equal(b.document.getElementById('unsaved'),input);assert.equal(input.value,'User text');
  assert.equal(b.document.getElementById('formAction'),button);button.click();assert.equal(clicks,1);assert.equal(renders,1);
  select.dispatchEvent(new b.window.Event('change',{bubbles:true}));assert.equal(b.window.location.hash,'#/buyer');
  await I.setLocale('en');assert.equal(option.textContent,'Buyers');assert.equal(input.value,'User text');
 }finally{b.close();}
});
