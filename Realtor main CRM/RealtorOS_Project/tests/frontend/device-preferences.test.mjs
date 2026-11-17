import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { browser, SKIP_DOM } from "../helpers/browser.mjs";
const source = readFileSync(new URL("../../app/assets/js/core/preferences.js", import.meta.url), "utf8");
async function setup(t, saved) {
  const b = await browser([]); if (!b) { t.skip(SKIP_DOM); return null; }
  for (const language of ["de", "fr", "es", "it", "pt", "ar"]) {
    b.window.App.i18n.register(language, JSON.parse(readFileSync(new URL("../../app/assets/i18n/" + language + ".json", import.meta.url), "utf8")));
  }
  let change;
  const media = { matches:true, addEventListener:(_, fn)=>{change=fn;} };
  b.window.matchMedia=()=>media;
  if (saved) b.window.localStorage.setItem("realtorcrm.presentation.v1", JSON.stringify(saved));
  b.window.eval(source);
  return {...b, media, change:()=>change(), prefs:b.window.App.preferences};
}
test("pre-paint system appearance controls native controls and follows device changes", async t => {
  const b=await setup(t);if(!b)return;
  try {
    assert.equal(b.prefs.get().theme,"system");
    assert.equal(b.document.documentElement.dataset.theme,"dark");
    assert.equal(b.document.documentElement.style.colorScheme,"dark");
    b.media.matches=false;b.change();assert.equal(b.document.documentElement.dataset.theme,"light");
    await b.prefs.set({theme:"dark"});b.change();assert.equal(b.document.documentElement.dataset.theme,"dark");
  }finally{await b.window.App.i18n.ready();b.close();}
});
test("manual language and theme persist locally without storing business or auth data",async t=>{
  const b=await setup(t);if(!b)return;
  try{
    await b.prefs.set({theme:"light",language:"ar",access_token:"never",notes:"never"});
    const stored=JSON.parse(b.window.localStorage.getItem("realtorcrm.presentation.v1"));
    assert.deepEqual(stored,{theme:"light",language:"ar",manualLanguage:true});
    assert.equal(b.document.documentElement.dir,"rtl");
    assert.equal(b.document.documentElement.lang,"ar");
    await b.prefs.set({language:"de"});assert.equal(b.document.documentElement.dir,"ltr");
  }finally{await b.window.App.i18n.ready();b.close();}
});
test("a member's personal choice uses profile metadata rather than workspace settings",async t=>{
  const b=await setup(t);if(!b)return;
  try{
    const writes=[];b.window.App.cloud={getUser:()=>({id:"member"}),updateProfile:async patch=>{writes.push(patch);return{error:null};}};
    await b.prefs.set({theme:"dark"});
    assert.equal(writes.length,1);assert.equal(writes[0].crm_preferences.theme,"dark");
    b.prefs.hydrate({user_metadata:{crm_preferences:{theme:"light",language:"fr",manualLanguage:true}}});
    assert.equal(b.prefs.get().language,"fr");assert.equal(b.document.documentElement.dataset.theme,"light");
  }finally{await b.window.App.i18n.ready();b.close();}
});
test("preference save queue cannot cross a signed-in identity change",async t=>{
  const b=await setup(t);if(!b)return;
  try{
    let id="first";const writes=[];
    b.window.App.cloud={getUser:()=>({id}),updateProfile:async patch=>{writes.push(patch);return{error:null};}};
    const pending=b.prefs.set({theme:"light"});id="second";await pending;
    assert.equal(writes.length,0);
  }finally{await b.window.App.i18n.ready();b.close();}
});
test("invalid persisted values fall back safely; offline account sync retains device choice",async t=>{
  const b=await setup(t,{theme:"invalid",language:"javascript:alert(1)"});if(!b)return;
  try{
    assert.equal(b.prefs.get().theme,"system");assert.equal(b.prefs.get().language,"en");
    b.window.App.cloud={getUser:()=>({id:"member"}),updateProfile:async()=>({error:new Error("Offline")})};
    await assert.rejects(b.prefs.set({theme:"light"}),/Offline/);
    assert.equal(b.document.documentElement.dataset.theme,"light");
    assert.equal(JSON.parse(b.window.localStorage.getItem("realtorcrm.presentation.v1")).theme,"light");
  }finally{await b.window.App.i18n.ready();b.close();}
});
test("the appearance preload precedes stylesheet paint",()=>{
  const html=readFileSync(new URL("../../app/index.html",import.meta.url),"utf8");
  assert.ok(html.indexOf('assets/js/core/preferences.js')<html.indexOf('rel="stylesheet"'));
});
