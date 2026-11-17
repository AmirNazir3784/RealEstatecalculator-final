import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("../../app/assets/js/core/push.js",import.meta.url),"utf8");
function world({registered=true,expired=false,unavailable=false,registration="registered"}={}) {
  const calls=[];
  let subscription;
  const make=(endpoint)=>({endpoint,expirationTime:expired?1:null,
    toJSON:()=>({endpoint,keys:{p256dh:"test-public",auth:"test-auth"}}),
    unsubscribe:async()=>{calls.push("unsubscribe");subscription=null;return true;}});
  subscription=make("https://fcm.googleapis.com/fcm/send/old");
  const w={PushManager:function(){},Notification:{permission:"granted",requestPermission:async()=>{throw Error("must not prompt");}},
    navigator:{userAgent:"Windows Chrome/120",serviceWorker:{ready:Promise.resolve({pushManager:{
      getSubscription:async()=>subscription,
      subscribe:async()=>{calls.push("subscribe");subscription=make("https://fcm.googleapis.com/fcm/send/new");return subscription;}
    }})}},App:{config:{vapidPublicKey:Buffer.from(new Uint8Array(65).fill(4)).toString("base64url")},store:{push:{
      devices:async()=>{if(unavailable)throw Error("offline");return registered&&subscription?[{endpoint:subscription.endpoint}]:[];},
      register:async()=>{calls.push("register");return {outcome:registration};},
      remove:async endpoint=>{calls.push(["remove",endpoint]);},
      test:async endpoint=>{calls.push(["test",endpoint]);return {outcome:"queued"};}
    }}}};
  w.window=w;
  vm.runInNewContext(source,{window:w,App:w.App,Uint8Array,Date,atob:s=>Buffer.from(s,"base64").toString("binary"),btoa:s=>Buffer.from(s,"binary").toString("base64")});
  return {w,push:w.App.push,calls,current:()=>subscription};
}

test("browser permission without a registered server device requires deliberate renewal",async()=>{
  const p=world({registered:false});
  assert.equal(await p.push.state(p.w),"renew");
  assert.deepEqual(p.calls,[],"checking state must not silently re-register a remotely removed device");
});
test("expired subscriptions and registration lookup failures have distinct status",async()=>{
  const expired=world({expired:true}),offline=world({unavailable:true});
  assert.equal(await expired.push.state(expired.w),"renew");
  assert.equal(await offline.push.state(offline.w),"unknown");
});
test("renewal replaces the browser subscription and removes the old server endpoint after success",async()=>{
  const p=world();
  assert.equal(await p.push.renew(p.w),"on");
  assert.equal(p.current().endpoint,"https://fcm.googleapis.com/fcm/send/new");
  assert.deepEqual(p.calls,["unsubscribe","subscribe","register",["remove","https://fcm.googleapis.com/fcm/send/old"]]);
});
test("registration refusal does not unsubscribe a pre-existing subscription",async()=>{
  const p=world({registration:"no_workspace"});
  assert.equal(await p.push.enable(p.w),"failed");
  assert.ok(p.current());
  assert.deepEqual(p.calls,["register"]);
});
test("tests are queued for the current registered device without claiming delivery",async()=>{
  const p=world();
  assert.equal((await p.push.test(p.w)).outcome,"queued");
  assert.deepEqual(p.calls,[["test","https://fcm.googleapis.com/fcm/send/old"]]);
  const removed=world({registered:false});
  assert.equal((await removed.push.test(removed.w)).outcome,"no_device");
  assert.deepEqual(removed.calls,[]);
});
