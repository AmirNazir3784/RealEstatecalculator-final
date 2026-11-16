import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";
import { NOTIFICATION_TYPES, NOTIFICATION_LOCALES,notificationCopy,ENGLISH_NOTIFICATION_COPY } from "../../supabase/functions/_shared/notification-copy.ts";

const handler=await globalThis.__edge.load("process-automation");
const {localizedPushPayload}=handler.module;
function adminFor(id,language,{error=false,mismatch=false}={}) {
  let calls=0;
  return {auth:{admin:{getUserById:async requested=>{
    calls++;assert.equal(requested,id);
    return {data:{user:{id:mismatch?randomUUID():id,user_metadata:{crm_preferences:{language},private:"customer data"}}},error:error?{message:"private error"}:null};
  }}},calls:()=>calls};
}

test("every supported event has fixed nonempty copy in all seven locales",()=>{
  assert.equal(NOTIFICATION_TYPES.length,13);
  for(const locale of NOTIFICATION_LOCALES)for(const type of NOTIFICATION_TYPES){
    const copy=notificationCopy(type,locale);
    assert.ok(copy.title.length>0 && copy.title.length<=200);
    assert.ok(copy.body.length>0 && copy.body.length<=400);
    assert.doesNotMatch(copy.title+copy.body,/[\u200e\u200f\u202a-\u202e\u2066-\u2069]|[\r\n]|https?:\/\//);
    if(locale!=="en")assert.notDeepEqual(copy,notificationCopy(type,"en"));
  }
});

test("worker payload uses the verified recipient preference, not database English/user text",async()=>{
  const expected={
    en:["Test notification","You can receive RealtorCRM notifications on this device."],
    es:["Notificación de prueba","Puedes recibir notificaciones de RealtorCRM en este dispositivo."],
    fr:["Notification de test","Vous pouvez recevoir les notifications RealtorCRM sur cet appareil."],
    de:["Testbenachrichtigung","Sie können RealtorCRM-Benachrichtigungen auf diesem Gerät empfangen."],
    it:["Notifica di prova","Puoi ricevere notifiche di RealtorCRM su questo dispositivo."],
    pt:["Notificação de teste","Você pode receber notificações do RealtorCRM neste dispositivo."],
    ar:["إشعار تجريبي","يمكنك تلقي إشعارات RealtorCRM على هذا الجهاز."],
  };
  for(const [language,[title,body]] of Object.entries(expected)){
    const id=randomUUID(),admin=adminFor(id,language),cache=new Map();
    const item={type:"push_test",user_id:id,url:"/notifications",title:"Private name",body:"private@example.com",metadata:{language:"xx",private:"private customer"}};
    assert.deepEqual(await localizedPushPayload(item,admin,cache),{title,body,url:"/notifications"});
    await localizedPushPayload(item,admin,cache);
    assert.equal(admin.calls(),1,"cache is scoped to one batch and recipient");
  }
});

test("unsupported language, auth lookup failure and mismatched identity fall back to English",async()=>{
  for(const [language,options] of [["xx",{}],["ar",{error:true}],["pt",{mismatch:true}]]){
    const id=randomUUID(),admin=adminFor(id,language,options);
    const payload=await localizedPushPayload({type:"new_lead",user_id:id,url:"/contacts"},admin,new Map());
    assert.deepEqual(payload,{...notificationCopy("new_lead","en"),url:"/contacts"});
  }
  const admin={auth:{admin:{getUserById:async()=>{throw Error("private failure");}}}};
  assert.deepEqual(await localizedPushPayload({type:"task_reminder",user_id:randomUUID(),url:"/tasks"},admin,new Map()),{...notificationCopy("task_reminder","en"),url:"/tasks"});
  assert.equal(await localizedPushPayload({type:"unknown",user_id:randomUUID()},admin,new Map()),null);
});

test("frontend source templates match the worker and do not display arbitrary notification text",()=>{
  const source=fs.readFileSync(new URL("../../app/assets/js/pages/notifications.js",import.meta.url),"utf8");
  const app={i18n:{locale:()=>"en",t:key=>key,value:fn=>fn(),markup:s=>s,html:(strings,...values)=>strings.reduce((s,v,i)=>s+v+(values[i]??""),"")},util:{esc:s=>String(s??"")}};
  const window={App:app};
  vm.runInNewContext(source,{window,App:app,Date,Number,Object,String,isFinite,setInterval,clearInterval});
  for(const type of NOTIFICATION_TYPES){
    const html=app.notificationsUI.itemHtml({id:"n1",type,title:"Private customer",body:"private@example.com",created_at:"2026-11-16T12:00:00Z",read_at:"2026-11-16T12:00:00Z"});
    assert.ok(html.includes(ENGLISH_NOTIFICATION_COPY[type].title),type+" title");
    assert.ok(html.includes(ENGLISH_NOTIFICATION_COPY[type].body),type+" body");
    assert.doesNotMatch(html,/Private customer|private@example/);
  }
  assert.equal(app.notificationsUI.safeRoute("/pipeline/dl_1"),"/pipeline/dl_1");
  assert.equal(app.notificationsUI.safeRoute("/tasks"),"/tasks");
  assert.equal(app.notificationsUI.safeRoute("//evil.example"),null);
});
