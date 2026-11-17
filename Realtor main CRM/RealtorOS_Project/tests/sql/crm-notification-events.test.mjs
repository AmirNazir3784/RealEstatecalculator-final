import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { migratedDb, one, SKIP_MESSAGE } from "../helpers/pg.mjs";

let db;
before(async () => { db = await migratedDb(); });
after(async () => { if (db) await db.close(); });
function sqlTest(name, fn) {
  test(name, async t => { if (!db) return t.skip(SKIP_MESSAGE); await db.exec("reset role"); await fn(); });
}
async function role(role, user, fn) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user || ""]);
  await db.exec("set role " + role);
  try { return await fn(); } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub','',false)");
  }
}
async function owner() {
  const id = randomUUID();
  await db.query("insert into auth.users(id,email) values($1,$2)", [id, id + "@example.com"]);
  const row = await one(db,"select workspace_id,team_member_id from public.workspace_members where user_id=$1 and status='active'",[id]);
  return { id, ws: row.workspace_id, tm: row.team_member_id };
}
async function agent(workspace) {
  const user=await owner(),tm="tm_"+randomUUID();
  await db.query("update public.workspace_members set status='removed' where user_id=$1 and status='active'",[user.id]);
  const membership=await one(db,"insert into public.workspace_members(workspace_id,user_id,role,status) values($1,$2,'agent','active') returning id",[workspace.ws,user.id]);
  await db.query("insert into public.team_members(id,user_id,workspace_id,auth_user_id,name,role) values($1,$2,$3,$2,'Test member','Agent')",[tm,user.id,workspace.ws]);
  await db.query("update public.workspace_members set team_member_id=$1 where id=$2",[tm,membership.id]);
  return {id:user.id,ws:workspace.ws,tm,membership:membership.id};
}
const rpc = async (name, args = []) => (await one(db,"select public." + name + "(" + args.map((_,i)=>"$"+(i+1)).join(",") + ") as result",args)).result;
const notes = async user => (await db.query("select * from public.notifications where user_id=$1 order by created_at",[user.id])).rows;
async function device(user, suffix) {
  const endpoint = "https://fcm.googleapis.com/fcm/send/test-" + suffix + randomUUID();
  await role("authenticated",user.id,()=>rpc("realtoros_register_push_subscription",[endpoint,"B".padEnd(87,"A"),"a".repeat(22),"Test browser"]));
  return endpoint;
}

sqlTest("new leads create one generic notification for accessible members only", async () => {
  const w = await owner(), outsider = await owner(), id = "ct_" + randomUUID();
  await role("authenticated",w.id,()=>db.query(
    "insert into public.contacts(id,user_id,workspace_id,full_name,email,phone) values($1,$2,$3,'Private customer','private@example.com','555-123-4567')",[id,w.id,w.ws]));
  await role("authenticated",w.id,()=>db.query("update public.contacts set full_name='Changed' where id=$1",[id]));
  const rows = (await notes(w)).filter(n=>n.type === "new_lead");
  assert.equal(rows.length,1);
  assert.equal(rows[0].link_route,"/contacts/" + id);
  assert.equal(rows[0].workspace_id,w.ws);
  assert.doesNotMatch(rows[0].title + rows[0].body,/Private|private@|555-/);
  assert.equal((await notes(outsider)).length,0);
});

sqlTest("deal assignment is emitted on assignment, not ordinary edits", async () => {
  const w=await owner(), id="dl_" + randomUUID();
  await db.query("insert into public.deals(id,user_id,workspace_id,title) values($1,$2,$3,'Private deal')",[id,w.id,w.ws]);
  await db.query("update public.deals set assigned_to_id=$1 where id=$2",[w.tm,id]);
  await db.query("update public.deals set title='Still private' where id=$1",[id]);
  const rows=(await notes(w)).filter(n=>n.type === "deal_assigned");
  assert.equal(rows.length,1);
  assert.equal(rows[0].link_route,"/pipeline/"+id);
  assert.doesNotMatch(rows[0].title + rows[0].body,/private/i);
  await role("authenticated",w.id,async()=>{
    await assert.rejects(db.query("select automation_internal.notify_crm_deal_assignment()"),/permission denied/);
    await assert.rejects(rpc("realtoros_scan_task_reminders"),/permission denied/);
  });
});

sqlTest("task reminders include tomorrow, are daily, exclude complete/later tasks and respect workspace scope", async () => {
  const w=await owner(), other=await owner();
  for(const [status,due,completed] of [["To Do","2026-11-16",false],["In Progress","2026-11-15",false],["Completed","2026-11-16",false],["To Do","2026-11-17",false],["To Do","2026-11-18",false],["To Do","2026-11-16",true]]) {
    await db.query("insert into public.tasks(id,user_id,workspace_id,title,due_date,status,completed) values($1,$2,$3,'Private task',$4,$5,$6)", ["tk_"+randomUUID(),w.id,w.ws,due,status,completed]);
  }
  await role("service_role",null,()=>rpc("realtoros_scan_task_reminders",[100,"2026-11-16T12:00:00Z"]));
  await role("service_role",null,()=>rpc("realtoros_scan_task_reminders",[100,"2026-11-16T12:00:00Z"]));
  const rows=(await notes(w)).filter(n=>n.type==="task_reminder");
  assert.equal(rows.length,1);
  assert.deepEqual(rows[0].metadata,{due_today:1,overdue:1,upcoming:1});
  assert.equal(rows[0].link_route,"/tasks");
  assert.equal((await notes(other)).length,0);
});

sqlTest("test notifications are caller-bound, throttled and claimed only for the selected device", async () => {
  const w=await owner(), other=await owner();
  const endpoint=await device(w,"one"), second=await device(w,"two"), foreign=await device(other,"foreign");
  await role("authenticated",w.id,async()=>{
    assert.equal((await rpc("realtoros_request_push_test",[foreign])).outcome,"no_device");
    assert.equal((await rpc("realtoros_request_push_test",[endpoint])).outcome,"queued");
    assert.equal((await rpc("realtoros_request_push_test",[second])).outcome,"rate_limited");
  });
  const claim=await role("service_role",null,()=>rpc("realtoros_claim_push_batch",[100,"2026-11-16T12:00:00Z"]));
  const notification=(await notes(w)).find(n=>n.type==="push_test");
  const item=claim.claimed.find(n=>n.id===notification.id);
  assert.ok(item);
  assert.deepEqual(item.subscriptions.map(s=>s.endpoint),[endpoint]);
  assert.deepEqual(Object.keys(item).sort(),["id","user_id","type","title","body","url","subscriptions"].sort());
  assert.equal(item.user_id,w.id);
  assert.ok(!JSON.stringify(notification.metadata).includes(endpoint));
});

sqlTest("master opt-out blocks testing and quiet hours defer a queued test", async () => {
  const w=await owner(), endpoint=await device(w,"quiet");
  await role("authenticated",w.id,async()=>{
    await rpc("realtoros_set_notification_preferences",[false,null,null,null]);
    assert.equal((await rpc("realtoros_request_push_test",[endpoint])).outcome,"notifications_off");
    await rpc("realtoros_set_notification_preferences",[true,[],"00:00","23:59"]);
    assert.equal((await rpc("realtoros_request_push_test",[endpoint])).outcome,"queued");
  });
  const claim=await role("service_role",null,()=>rpc("realtoros_claim_push_batch",[100,"2026-11-16T12:00:00Z"]));
  const n=(await notes(w)).find(n=>n.type==="push_test");
  assert.ok(!claim.claimed.some(item=>item.id===n.id));
  assert.equal(n.push_status,"pending");
  assert.ok(n.push_locked_until);
});

sqlTest("pending deal pushes are suppressed after reassignment", async()=>{
  const w=await owner();await device(w,"stale");
  const id="dl_"+randomUUID();
  await db.query("insert into public.deals(id,user_id,workspace_id,assigned_to_id) values($1,$2,$3,$4)",[id,w.id,w.ws,w.tm]);
  await db.query("update public.deals set assigned_to_id=null where id=$1",[id]);
  await role("service_role",null,()=>rpc("realtoros_claim_push_batch",[100,"2026-11-16T12:00:00Z"]));
  assert.equal((await notes(w)).find(n=>n.type==="deal_assigned").push_status,"skipped");
});

sqlTest("permission-denied recipients are excluded and removed members never receive queued pushes",async()=>{
  const w=await owner(),member=await agent(w);
  const denied={contacts:{view:"none",edit:"none",delete:"none"},deals:{view:"none",edit:"none",delete:"none"},work:{view:"none",edit:"none",delete:"none"}};
  await db.query("update public.workspace_members set permission_overrides=$1 where id=$2",[JSON.stringify(denied),member.membership]);
  await db.query("insert into public.contacts(id,user_id,workspace_id,assigned_to_id) values($1,$2,$3,$4)",["ct_"+randomUUID(),w.id,w.ws,member.tm]);
  await db.query("insert into public.deals(id,user_id,workspace_id,assigned_to_id) values($1,$2,$3,$4)",["dl_"+randomUUID(),w.id,w.ws,member.tm]);
  await db.query("insert into public.tasks(id,user_id,workspace_id,assigned_to_id,due_date) values($1,$2,$3,$4,'2026-11-16')",["tk_"+randomUUID(),w.id,w.ws,member.tm]);
  await role("service_role",null,()=>rpc("realtoros_scan_task_reminders",[100,"2026-11-16T12:00:00Z"]));
  assert.equal((await notes(member)).length,0);
  await db.query("update public.workspace_members set permission_overrides='{}' where id=$1",[member.membership]);
  await device(member,"removed-member");
  await db.query("insert into public.deals(id,user_id,workspace_id,assigned_to_id) values($1,$2,$3,$4)",["dl_"+randomUUID(),w.id,w.ws,member.tm]);
  const pending=(await notes(member)).find(n=>n.type==="deal_assigned");
  assert.ok(pending);
  await db.query("update public.workspace_members set status='removed' where id=$1",[member.membership]);
  const claim=await role("service_role",null,()=>rpc("realtoros_claim_push_batch",[100,"2026-11-16T12:00:00Z"]));
  assert.ok(!claim.claimed.some(n=>n.id===pending.id));
  assert.equal((await notes(member)).find(n=>n.id===pending.id).push_status,"skipped");
});

sqlTest("a subscription from a different workspace cannot satisfy a push claim",async()=>{
  const w=await owner(),foreign=await owner(),endpoint=await device(w,"wrong-workspace");
  await role("authenticated",w.id,()=>rpc("realtoros_request_push_test",[endpoint]));
  await db.query("update public.push_subscriptions set workspace_id=$1 where user_id=$2",[foreign.ws,w.id]);
  const claim=await role("service_role",null,()=>rpc("realtoros_claim_push_batch",[100,"2026-11-16T12:00:00Z"]));
  const n=(await notes(w)).find(n=>n.type==="push_test");
  assert.ok(!claim.claimed.some(item=>item.id===n.id));
  assert.equal(n.push_status,"skipped");
});

sqlTest("feature-disable rollback preserves every record, notification, preference and device",async()=>{
  const tables=["contacts","deals","tasks","notifications","push_subscriptions","notification_preferences"];
  const snapshot=async()=>Promise.all(tables.map(async table=>(await db.query("select to_jsonb(t) as row from public."+table+" t order by to_jsonb(t)::text")).rows));
  const before=await snapshot();
  await db.exec(readFileSync(new URL("../../supabase/rollback/crm_notification_events_revert.sql",import.meta.url),"utf8"));
  assert.deepEqual(await snapshot(),before);
  const w=await owner(),id="disabled_"+randomUUID();
  await db.query("insert into public.contacts(id,user_id,workspace_id,full_name) values($1,$2,$3,'After disable')",[id,w.id,w.ws]);
  assert.equal((await notes(w)).length,0,"disabled producer creates no new event");
  assert.deepEqual(await role("service_role",null,()=>rpc("realtoros_scan_task_reminders")),{summaries:0,disabled:true});
  assert.equal((await one(db,"select to_regprocedure('public.realtoros_request_push_test(text)') as fn")).fn,null);
});
