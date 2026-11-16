/* Central gettext-style messages + Intl formatting. Only source-authored UI
   literals are marked. Dynamic business values are opaque parameters, never
   dictionary lookup candidates. Locale changes move existing parameter nodes
   rather than replacing forms, user content or attached event handlers. */
window.App = window.App || {};
App.i18n = (function () {
  "use strict";
  const locales = { en:"English", de:"Deutsch", fr:"Français", es:"Español", it:"Italiano", pt:"Português", ar:"العربية" };
  const catalogs = new Map([["en", {}]]), requests = new Map(), bindings = new Map(), textBindings = new Map(), captures = [];
  let locale = "en", desired = "en", pending = Promise.resolve(), serial = 0, error = null;
  const esc = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const decode = value => String(value).replace(/&(amp|lt|gt|quot|apos|#39|nbsp|mdash|ndash|middot|hellip);/g, (_, code) => ({amp:"&",lt:"<",gt:">",quot:'"',apos:"'","#39":"'",nbsp:"\u00a0",mdash:"—",ndash:"–",middot:"·",hellip:"…"}[code]));
  function message(key, params) {
    return { __crmMessage:true, key:String(key), params:params || [], toString() { return format(this); } };
  }
  function template(key) {
    const dictionary = catalogs.get(locale) || {};
    return Object.hasOwn(dictionary,key.trim()) ? /^\s*/.exec(key)[0] + dictionary[key.trim()] + /\s*$/.exec(key)[0] : key;
  }
  function param(value) { return value && value.__crmValue ? value : { __crmValue:true, raw:value, message:value && value.__crmMessage ? value : null }; }
  function sourceSuffix(key, index, raw) {
    const suffix = "\\{" + index + "\\}";
    return ((raw === "s" || raw === "") && new RegExp("\\b(?:day|lead|contact|record|referral|task|deal|item|member|field|row)" + suffix).test(key)) ||
      ((raw === "y" || raw === "ies") && new RegExp("\\b(?:activit|propert)" + suffix).test(key));
  }
  function legacySuffix(key,index,raw) { return locale !== "en" && sourceSuffix(key,index,raw); }
  function sourceLiteral(key,index,raw) {
    return (key === "{0} {1} required." && index === 1 && (raw === "is" || raw === "are")) ||
      (key === "{0} of {1} {2} record{3}" && index === 2 && (raw === "income" || raw === "expense"));
  }
  // These are source-authored grammar fragments, never arbitrary CRM values.
  function sourceParam(value, key, index) {
    if (locale === "en") return value;
    if (key === "{0} {1} required." && index === 1 && (value === "is" || value === "are")) return "";
    if (key === "{0} of {1} {2} record{3}" && index === 2) {
      if (value === "income") return message("Income");
      if (value === "expense") return message("Expenses");
    }
    return value;
  }
  function paramText(value, key, index) {
    const p = param(value);
    if (legacySuffix(key,index,p.raw)) return "";
    if (p.message) return format(p.message);
    const raw = sourceParam(p.raw,key,index);
    if (raw && raw.__crmMessage) return format(raw);
    return typeof raw === "number" ? new Intl.NumberFormat(locale).format(raw) : String(raw == null ? "" : raw);
  }
  function format(msg) { return template(msg.key).replace(/\{(\d+)\}/g, (_, i) => paramText(msg.params[Number(i)], msg.key, Number(i))); }
  function plainFormat(msg) {
    const translated=template(msg.key);let at=0,out="";
    for(const match of translated.matchAll(/\{(\d+)\}/g)) {
      out+=decode(translated.slice(at,match.index));
      const index=Number(match[1]),p=param(msg.params[index]);
      out+=p.message?plainFormat(p.message):paramText(p,msg.key,index);
      at=match.index+match[0].length;
    }
    return out+decode(translated.slice(at));
  }
  function t(key, ...params) {
    const msg = message(key,params), rendered = format(msg);
    const capture = captures[captures.length - 1];
    if (capture) capture.push({ msg, rendered });
    return rendered;
  }
  function value(run) {
    const capture=[];captures.push(capture);let raw;
    try { raw=run(); } finally { captures.pop(); }
    const found=capture.length===1 && (raw===capture[0].rendered || raw===esc(capture[0].rendered)) ? capture[0].msg : null;
    return { __crmValue:true, raw, message:found || (raw && raw.__crmMessage ? raw : null) };
  }
  function text(strings,...values) { return message(strings.map((s,i)=>s+(i<values.length?"{"+i+"}":"")).join(""),values); }
  function register(localeName,dictionary) {
    if (!Object.hasOwn(locales,localeName) || !dictionary || typeof dictionary!=="object") return;
    const safe=Object.create(null);
    for(const [key,val] of Object.entries(dictionary)) if(typeof val==="string")safe[key]=val;
    catalogs.set(localeName,safe);
  }
  function bind(msg,type,attribute) { const id=String(++serial);bindings.set(id,{msg,type,attribute,created:Date.now()});return id; }
  function boundHtml(msg) {
    const id=bind(msg,"text"), translated=template(msg.key);
    let at=0,html="<!--crm-l10n:"+id+"-->";
    for(const match of translated.matchAll(/\{(\d+)\}/g)) {
      html+=esc(decode(translated.slice(at,match.index)));
      const index=Number(match[1]),p=param(msg.params[index]);
      const raw=sourceParam(p.raw,msg.key,index);
      const output=legacySuffix(msg.key,index,p.raw)?"":p.message?boundHtml(p.message):raw&&raw.__crmMessage?boundHtml(raw):typeof raw==="number"?new Intl.NumberFormat(locale).format(raw):String(raw==null?"":raw);
      html+="<!--crm-param:"+id+":"+index+"-->"+output+"<!--/crm-param:"+id+":"+index+"-->";
      at=match.index+match[0].length;
    }
    return html+esc(decode(translated.slice(at)))+"<!--/crm-l10n:"+id+"-->";
  }
  function segmentMessage(segment,values) {
    const trimmed=segment.trim(),token=/^__CRM_VALUE_(\d+)__$/.exec(trimmed);
    if(token) { const p=param(values[Number(token[1])]);return p.message; }
    const key=trimmed.replace(/__CRM_VALUE_(\d+)__/g,(_,n)=>"{"+n+"}");
    return /[A-Za-z]/.test(key)?message(key,values):null;
  }
  function html(strings,...values) {
    const raw=strings.map((s,i)=>s+(i<values.length?"__CRM_VALUE_"+i+"__":"")).join("");
    const parts=raw.split(/(<(?:"[^"]*"|'[^']*'|[^'">])*>)/g), blocked=[];
    // Substitute only tokens from source segments. Never scan substituted user
    // data or generated markup for another token (including in attributes).
    const substitute=source=>source.replace(/__CRM_VALUE_(\d+)__/g,(_,i)=>{const p=param(values[Number(i)]);return p.message?format(p.message):String(p.raw==null?"":p.raw);});
    const output=parts.map(part=>{
      if(part.startsWith("<")) {
        const closing=/^<\//.test(part),tag=/^<\/?\s*([\w-]+)/.exec(part);
        if(closing) { if(tag&&blocked[blocked.length-1]===tag[1].toLowerCase())blocked.pop();return substitute(part); }
        const name=tag?tag[1].toLowerCase():"";
        if(["script","style","textarea","code","pre","svg"].includes(name)||/\btranslate=["']no["']/.test(part))blocked.push(name);
        if(blocked.length)return substitute(part);
        const ids=[];
        let translated="",at=0;
        for(const match of part.matchAll(/\b(title|placeholder|aria-label|data-label|alt)\s*=\s*(["'])(.*?)\2/g)) {
          translated+=substitute(part.slice(at,match.index));
          const [full,attribute,,content]=match,msg=segmentMessage(content,values);
          if(msg) { const id=bind(msg,"attribute",attribute);ids.push(id);translated+=attribute+'="'+esc(decode(format(msg)))+'"'; }
          else translated+=substitute(full);
          at=match.index+full.length;
        }
        translated+=substitute(part.slice(at));
        return ids.length?translated.replace(/\s*\/?>$/,ending=>' data-crm-l10n="'+ids.join(" ")+'"'+ending):translated;
      }
      if(blocked.length)return substitute(part);
      const msg=segmentMessage(part,values);if(!msg)return substitute(part);
      const leading=/^\s*/.exec(part)[0],trailing=/\s*$/.exec(part)[0];
      return leading+boundHtml(msg)+trailing;
    }).join("");
    return output;
  }
  const markup = source => html([String(source)]);
  function setText(node,msg) {
    if (!node) return;
    if (msg && msg.__crmValue) msg=msg.message || msg.raw;
    if(msg&&msg.__crmMessage) {textBindings.set(node,msg);node.textContent=plainFormat(msg);}
    else {textBindings.delete(node);node.textContent=msg==null?"":String(msg);}
  }
  function refresh() {
    if (!document.body) return;
    const walker=document.createTreeWalker(document.body,128),starts=new Map(),ends=new Map(),comments=[];
    for(let node=walker.nextNode();node;node=walker.nextNode()){comments.push(node);const start=/^crm-l10n:(\d+)$/.exec(node.data),end=/^\/crm-l10n:(\d+)$/.exec(node.data);if(start)starts.set(start[1],node);if(end)ends.set(end[1],node);}
    for(const [id,start] of starts){
      const binding=bindings.get(id),end=ends.get(id);if(!binding||!end||!start.isConnected||start.parentNode!==end.parentNode)continue;
      const existing=new Map();
      for(const comment of comments){
        const match=new RegExp("^crm-param:"+id+":(\\d+)$").exec(comment.data);if(!match||!comment.isConnected)continue;
        let finish=comment.nextSibling;while(finish&&finish.nodeType!==8||finish&&finish.nodeType===8&&finish.data!=="/crm-param:"+id+":"+match[1])finish=finish.nextSibling;
        if(!finish)continue;
        const range=document.createRange();range.setStartAfter(comment);range.setEndBefore(finish);existing.set(Number(match[1]),range.extractContents());
      }
      const range=document.createRange();range.setStartAfter(start);range.setEndBefore(end);range.deleteContents();
      const fragment=document.createDocumentFragment(),translated=template(binding.msg.key);let at=0;
      for(const match of translated.matchAll(/\{(\d+)\}/g)){
        fragment.append(document.createTextNode(decode(translated.slice(at,match.index))));
        const index=Number(match[1]),p=param(binding.msg.params[index]);
        fragment.append(document.createComment("crm-param:"+id+":"+index));
        if(typeof p.raw === "number"||sourceSuffix(binding.msg.key,index,p.raw)||sourceLiteral(binding.msg.key,index,p.raw)) {
          fragment.append(document.createTextNode(paramText(p,binding.msg.key,index)));
        } else fragment.append(existing.get(index)||document.createTextNode(paramText(p,binding.msg.key,index)));
        fragment.append(document.createComment("/crm-param:"+id+":"+index));at=match.index+match[0].length;
      }
      fragment.append(document.createTextNode(decode(translated.slice(at))));end.before(fragment);
    }
    document.querySelectorAll("[data-crm-l10n]").forEach(node=>{
      for(const id of node.dataset.crmL10n.split(" ")){const binding=bindings.get(id);if(binding)node.setAttribute(binding.attribute,decode(format(binding.msg)));}
    });
    for(const [node,msg] of textBindings){if(!node.isConnected){textBindings.delete(node);continue;}node.textContent=plainFormat(msg);}
    const active=new Set([...starts.keys(),...Array.from(document.querySelectorAll("[data-crm-l10n]"),n=>n.dataset.crmL10n).join(" ").split(" ")]);
    for(const [id,binding] of bindings)if(!active.has(id)&&Date.now()-binding.created>60000)bindings.delete(id);
    document.querySelectorAll("[data-language-choice]").forEach(select=>{select.value=locale;});
  }
  function setLocale(next) {
    desired=Object.hasOwn(locales,next)?next:"en";
    const target=desired;error=null;
    if(!catalogs.has(target)&&!requests.has(target))requests.set(target,fetch("assets/i18n/"+target+".json").then(r=>{if(!r.ok)throw Error("Translation resources unavailable");return r.json();}).then(data=>register(target,data)).catch(err=>{error=err;register(target,{});}));
    pending=Promise.resolve(requests.get(target)).then(()=>{if(target!==desired)return;locale=target;document.documentElement.lang=target;document.documentElement.dir=target==="ar"?"rtl":"ltr";refresh();window.dispatchEvent(new CustomEvent("realtorcrm:language",{detail:{locale,error:!!error}}));});
    return pending;
  }
  function languageControl(id) {
    const options=Object.entries(locales).map(([code,name])=>'<option value="'+code+'" lang="'+code+'"'+(code===desired?' selected':'')+'>'+name+'</option>').join("");
    return html`<label class="language-control"><span class="sr-only" id="${id}Label">Language</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></svg><select id="${id}" data-language-choice aria-labelledby="${id}Label" translate="no">${options}</select></label>`;
  }
  document.addEventListener("change",event=>{if(!event.target.matches("[data-language-choice]"))return;if(App.preferences)App.preferences.set({language:event.target.value}).catch(()=>{if(App.app)App.app.toast(t("Saved on this device. Account sync failed; try again when online."),"danger");});});
  return { t,message,value,text,html,markup,setText,register,refresh,setLocale,ready:()=>pending,locale:()=>locale,locales,languageControl,status:()=>({locale,error:!!error}),number:(v,options)=>new Intl.NumberFormat(locale,options).format(v),date:(v,options)=>new Intl.DateTimeFormat(locale,options).format(v) };
})();
