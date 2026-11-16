const fs=require('node:fs'),path=require('node:path');
module.exports=async({cdp,sessionId,qa,delay,base})=>{
 const output=[],audit=[],checks=[];
 const save=()=>fs.writeFileSync(path.join(qa,'advanced-browser.json'),JSON.stringify({screens:output,checks,accessibility:audit},null,2));
 const assert=(name,value,detail)=>{checks.push({name,pass:!!value,detail});if(!value){save();throw Error(name+': '+JSON.stringify(detail));}};
 async function navigate(width,height,screen,locale='en',theme='light'){
  await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768},sessionId);
  await cdp.send('Page.navigate',{url:base+'index.html?setup=1'},sessionId);await delay(200);
  await cdp.eval(`localStorage.setItem('realtorcrm.presentation.v1',JSON.stringify({theme:${JSON.stringify(theme)},language:${JSON.stringify(locale)},manualLanguage:true}))`);
  await cdp.send('Page.navigate',{url:base+'index.html'+(screen.startsWith('auth')?'?auth=1'+(screen==='auth-create'?'&mode=create':''):'#/'+screen)},sessionId);
  for(let i=0;i<150;i++){await delay(80);if(await cdp.eval(`!!document.querySelector('${screen.startsWith('auth')?'#cloudAuthForm':'#page .page-title'}')`))break;}
  await cdp.eval('document.fonts.ready');await delay(200);
  const error=await cdp.eval(`document.querySelector('#qaError')?.textContent`);assert('Page renders '+screen+' '+width+' '+locale,!error,error);
 }
 async function shot(name,full=false){
  const view=await cdp.eval(`({width:innerWidth,height:innerHeight,content:document.querySelector('#cloudAuth')?.scrollHeight||innerHeight})`);
  if(full&&view.content>view.height)await cdp.send('Emulation.setDeviceMetricsOverride',{width:view.width,height:view.content+16,deviceScaleFactor:1,mobile:view.width<768},sessionId);
  await cdp.eval('Promise.all(Array.from(document.images,i=>i.decode().catch(()=>{})))');
  const {data}=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:full},sessionId);fs.writeFileSync(path.join(qa,name+'.png'),Buffer.from(data,'base64'));
  if(full&&view.content>view.height)await cdp.send('Emulation.setDeviceMetricsOverride',{width:view.width,height:view.height,deviceScaleFactor:1,mobile:view.width<768},sessionId);
 }
 async function axe(name){
  await cdp.eval(fs.readFileSync(process.env.AXE_PATH || path.join(qa,'axe.min.js'),'utf8'));
  const result=await cdp.eval(`axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}).then(r=>({passes:r.passes.length,incomplete:r.incomplete.map(i=>({id:i.id,nodes:i.nodes.map(n=>n.target)})),violations:r.violations.map(i=>({id:i.id,impact:i.impact,help:i.help,nodes:i.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))}))`);
  audit.push({name,...result});
 }
 for(const locale of (process.env.QA_INTERACTIONS?[]:['en','de','ar']))for(const theme of ['light','dark'])for(const [width,height]of [[320,740],[390,844],[768,1024],[1280,720],[1440,900]])for(const screen of ['auth-create','auth-sign-in','pipeline','settings']){
  await navigate(width,height,screen,locale,theme);
  const data=await cdp.eval(`(()=>{const q=s=>document.querySelector(s),box=e=>e&&({x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height});return{scrollWidth:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme,scheme:getComputedStyle(document.documentElement).colorScheme,dir:document.documentElement.dir,header:box(q('#topbar')),tabs:[...document.querySelectorAll('.cloud-auth-tab')].map(box),panel:q('.cloud-auth-product-panel')?getComputedStyle(q('.cloud-auth-product-panel')).display:null,authHeight:q('#cloudAuth')?.scrollHeight,controls:[...document.querySelectorAll('input,select')].slice(0,8).map(e=>({background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color}))}})()`);
  assert('No overflow '+[width,locale,theme,screen].join('/'),data.scrollWidth<=width+1,data);
  assert('Theme and native scheme agree',data.theme===theme&&data.scheme===theme,data);
  assert('Direction matches language',data.dir===(locale==='ar'?'rtl':'ltr'),data.dir);
  if(width<768&&data.header)assert('Single-row header',data.header.height<=60,data.header);
  output.push({width,height,locale,theme,screen,...data});save();
  if((locale==='en'&&theme==='light'&&[390,1280].includes(width))||(locale==='ar'&&theme==='dark'&&width===390)){
   await shot('final-'+width+'-'+locale+'-'+theme+'-'+screen,screen.startsWith('auth'));await axe([width,locale,theme,screen].join('/'));
  }
 }
 for(const width of (process.env.QA_WIDTH?[Number(process.env.QA_WIDTH)]:[320,360,375,390,414,430])){
  await navigate(width,844,'pipeline','de','light');
  await cdp.eval(`document.querySelector('#profileTrigger').click()`);
  await delay(100);
  const profile=await cdp.eval(`(()=>{const menu=document.querySelector('#profileMenu'),r=menu.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight,hidden:menu.hidden,style:menu.style.cssText,scroll:scrollY,viewport:{height:visualViewport.height,width:visualViewport.width,top:visualViewport.offsetTop,scale:visualViewport.scale}}})()`);
  if(profile.bottom>844){console.log(await cdp.eval(`(()=>{const m=document.querySelector('#profileMenu');return{computed:getComputedStyle(m).top,position:getComputedStyle(m).position,parent:m.parentElement.outerHTML.slice(0,200),rect:m.getBoundingClientRect().toJSON(),ancestors:[...function*(e){while(e){yield e;e=e.parentElement}}(m)].map(e=>({tag:e.tagName,id:e.id,transform:getComputedStyle(e).transform,filter:getComputedStyle(e).filter,contain:getComputedStyle(e).contain,willChange:getComputedStyle(e).willChange}))}})()`));await shot('profile-debug');}
  assert('Profile stays in viewport '+width,!profile.hidden&&profile.x>=0&&profile.y>=0&&profile.right<=width&&profile.bottom<=844,profile);
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'},sessionId);
  assert('Escape closes profile '+width,await cdp.eval(`document.querySelector('#profileMenu').hidden&&document.activeElement.id==='profileTrigger'`));
  await cdp.eval(`document.querySelector('#profileTrigger').click();document.querySelector('#page').click()`);
  assert('Outside tap closes profile '+width,await cdp.eval(`document.querySelector('#profileMenu').hidden`));
  await cdp.eval(`App.headerActions.openSearch()`);await delay(100);
  assert('Search focus '+width,await cdp.eval(`document.activeElement.id==='globalSearchInput'`));
  await cdp.eval(`const input=document.querySelector('#globalSearchInput');input.value='Contacts';input.dispatchEvent(new Event('input',{bubbles:true}))`);await delay(600);
  assert('Search preserves customer text '+width,await cdp.eval(`document.querySelector('#globalSearchResults').textContent.includes('Contacts')`));
  await axe('search/'+width);
  if(width===390)await shot('final-390-de-search');
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'},sessionId);
  await delay(250);
  assert('Escape closes search '+width,await cdp.eval(`!document.querySelector('#globalSearchInput')`));
  await cdp.eval(`App.app.navigate('/settings/appearance')`);await delay(350);
  const settings=await cdp.eval(`({overview:!!document.querySelector('.settings-navigation')&&getComputedStyle(document.querySelector('.settings-navigation')).display,body:document.querySelector('#page').textContent})`);
  assert('Dedicated preferences section '+width,settings.body.includes('Deutsch'),settings.body.slice(0,200));
 }
 await navigate(390,844,'auth-create','en','light');
 await cdp.eval(`document.querySelector('#cloudEmail').value='user@example.test';document.querySelector('#cloudPassword').value='SecurePass123!';document.querySelector('#cloudPassword').dispatchEvent(new Event('input',{bubbles:true}));App.preferences.set({language:'ar',theme:'dark'})`);await delay(350);
 assert('Locale switch preserves unsaved auth fields',await cdp.eval(`document.querySelector('#cloudEmail').value==='user@example.test'&&document.querySelector('#cloudPassword').value==='SecurePass123!'`));
 await cdp.send('Page.reload',{},sessionId);await delay(700);
 assert('Reload persists language and appearance',await cdp.eval(`document.documentElement.lang==='ar'&&document.documentElement.dir==='rtl'&&document.documentElement.dataset.theme==='dark'`));
 await cdp.eval(`App.preferences.set({theme:'system'})`);await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]},sessionId);await delay(100);
 assert('System follows light appearance',await cdp.eval(`document.documentElement.dataset.theme==='light'`));
 await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]},sessionId);await delay(100);
 assert('System follows dark appearance',await cdp.eval(`document.documentElement.dataset.theme==='dark'`));
 fs.writeFileSync(path.join(qa,'advanced-browser.json'),JSON.stringify({screens:output,checks,accessibility:audit},null,2));
 console.log(JSON.stringify({screens:output.length,checks:checks.length,failed:checks.filter(c=>!c.pass),accessibility:audit.map(a=>({name:a.name,violations:a.violations}))},null,2));
};
