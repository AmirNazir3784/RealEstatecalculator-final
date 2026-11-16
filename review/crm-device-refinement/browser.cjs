const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process'),os=require('node:os');
const qa=__dirname,app='Realtor main CRM/RealtorOS_Project/app',roots={before:path.join(qa,'baseline',app),after:path.resolve(qa,'../..',app)};
const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.avif':'image/avif','.webp':'image/webp','.woff2':'font/woff2','.png':'image/png'};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/fixture.js'||u.pathname==='/supabase.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(qa,u.pathname.slice(1))));return;}
 const [,version,...parts]=decodeURIComponent(u.pathname).split('/');const root=roots[version];if(!root){res.writeHead(404).end();return;}
 const file=path.resolve(root,parts.join('/')||'index.html');if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');if(file.endsWith('index.html'))data=String(data).replace('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2','/supabase.js').replace('assets/js/boot.js','/fixture.js');res.end(data);});
});
class CDP{
 constructor(url){this.socket=new WebSocket(url);this.counter=0;this.pending=new Map();this.events=[];this.ready=new Promise((r,j)=>{this.socket.onopen=r;this.socket.onerror=j;});this.socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else this.events.push(m);};}
 async send(method,params={},sessionId){await this.ready;const id=++this.counter;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
 async eval(expression){const r=await this.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},this.session);if(r.exceptionDetails)throw Error(r.exceptionDetails.text+' '+JSON.stringify(r.exceptionDetails.exception));return r.result.value;}
}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'erc-crm-qa-'));
 const chrome=cp.spawn(process.env.CHROME_BIN || ['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>fs.existsSync(p)) || 'chrome',['--headless=new','--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--disable-gpu','about:blank'],{windowsHide:true,stdio:'ignore'});
 let cdp;
 try{
  const active=path.join(profile,'DevToolsActivePort');for(let i=0;i<300&&!fs.existsSync(active);i++)await delay(100);
  if(!fs.existsSync(active))throw Error('Chrome debugging endpoint unavailable');
  let address;for(let i=0;i<100;i++){try{address=fs.readFileSync(active,'utf8').split('\n');if(address[1])break;}catch(_){}await delay(100);}
  const [port,endpoint]=address||[];if(!endpoint)throw Error('Chrome debugging address unavailable');cdp=new CDP('ws://127.0.0.1:'+port+endpoint);await cdp.ready;
  const {targetId}=await cdp.send('Target.createTarget',{url:'about:blank'});const {sessionId}=await cdp.send('Target.attachToTarget',{targetId,flatten:true});cdp.session=sessionId;
  await cdp.send('Page.enable',{},sessionId);await cdp.send('Runtime.enable',{},sessionId);
  await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`navigator.serviceWorker.register=async()=>({waiting:null,installing:null,addEventListener(){}});if(!localStorage.getItem('realtorcrm.presentation.v1'))localStorage.setItem('realtorcrm.presentation.v1',JSON.stringify({theme:'light',language:'en',manualLanguage:true}));`},sessionId);
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'},{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
  const results=[];
  if(process.env.QA_ADVANCED){await require('./advanced.cjs')({cdp,sessionId,qa,delay,base:'http://127.0.0.1:'+server.address().port+'/after/'});return;}
  const modes=process.env.QA_MODE==='before'?['before']:['after'];
  for(const mode of modes){for(const [width,height]of [[1280,720],[390,844],...(process.env.QA_FULL?[[320,700],[360,800],[375,812],[414,896],[430,932],[1024,768],[1366,768],[1440,900],[1920,1080],[768,1024],[844,390]]:[])]){
   for(const screen of ['pipeline','settings','auth-create','auth-sign-in']){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768},sessionId);
    const url='http://127.0.0.1:'+server.address().port+'/'+mode+'/index.html'+(screen.startsWith('auth')?'?auth=1'+(screen==='auth-create'?'&mode=create':''):'#/'+(screen==='pipeline'?'pipeline':'settings'));
    await cdp.send('Page.navigate',{url},sessionId);
    for(let i=0;i<150;i++){await delay(100);if(await cdp.eval(`!!document.querySelector('${screen.startsWith('auth')?'#cloudAuthForm':'#page .page-title'}')`))break;}
    await cdp.eval('document.fonts.ready');await delay(250);
    const data=await cdp.eval(`(()=>{const q=s=>document.querySelector(s),r=s=>{const e=q(s);if(!e)return null;const x=e.getBoundingClientRect();return{x:x.x,y:x.y,width:x.width,height:x.height,bottom:x.bottom}};return{width:innerWidth,scrollWidth:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme,colorScheme:getComputedStyle(document.documentElement).colorScheme,header:r('#topbar'),brand:r('.topbar-brand'),avatar:r('#profileTrigger'),newVisible:!!q('#globalNewBtn')&&getComputedStyle(q('#globalNewBtn')).display!=='none',stats:q('.pipeline-stats')?getComputedStyle(q('.pipeline-stats')).gridTemplateColumns:null,authHeight:q('#cloudAuth')?q('#cloudAuth').scrollHeight:null,form:r('#cloudAuthForm'),bodyText:document.body.innerText.slice(0,200)}})()`);
    if(mode==='after'&&!screen.startsWith('auth')){
     if(data.scrollWidth>width+1)throw Error('Overflow '+screen+' '+width);
     if(width<768&&data.header&&data.header.height>60)throw Error('Header height '+width);
     if(width<768&&data.newVisible)throw Error('Duplicate mobile New button');
    }
    const captureHeight=screen.startsWith('auth')?Math.max(height,data.authHeight||height):height;
    if(captureHeight>height)await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:captureHeight,deviceScaleFactor:1,mobile:width<768},sessionId);
    await cdp.eval('Promise.all(Array.from(document.images,i=>i.decode().catch(()=>{})))');
    const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true},sessionId);fs.writeFileSync(path.join(qa,mode+'-'+width+'-'+screen+'.png'),Buffer.from(shot.data,'base64'));
    results.push({mode,width,height,screen,...data});
   }
  }}
  fs.writeFileSync(path.join(qa,(process.env.QA_MODE==='before'?'before':'after')+'-browser.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results.map(r=>({mode:r.mode,width:r.width,screen:r.screen,scrollWidth:r.scrollWidth,header:r.header,authHeight:r.authHeight})),null,2));
 }finally{if(cdp){try{await Promise.race([cdp.send('Browser.close'),delay(1500)]);}catch(_){}cdp.socket.close();}chrome.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{server.closeAllConnections();server.close();});
