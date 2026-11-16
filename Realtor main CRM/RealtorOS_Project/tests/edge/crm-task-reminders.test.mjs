import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { automationScenario,mockFetch,workerRequest,WORKER_ENV } from "../helpers/automation-fixture.mjs";
let fetchMock;
afterEach(()=>fetchMock?.restore());
async function scenario(scan) {
  globalThis.__edge.setEnv(WORKER_ENV);
  const handler=await globalThis.__edge.load("process-automation");
  const s=automationScenario();
  s.db.rpc("realtoros_scan_time_triggers",()=>({events_created:0}));
  s.db.rpc("realtoros_scan_task_reminders",scan);
  s.db.rpc("realtoros_claim_due_jobs",()=>[]);
  s.db.install();fetchMock=mockFetch();
  const response=await handler(workerRequest());
  return {s,response,body:await response.json()};
}
test("worker runs the bounded task reminder scan and reports aggregate counts",async()=>{
  const {s,response,body}=await scenario(()=>({summaries:3}));
  assert.equal(response.status,200);
  assert.equal(body.counters.taskRemindersCreated,3);
  assert.equal(body.counters.taskReminderScanFailed,0);
  assert.equal(s.db.rpcCalls("realtoros_scan_task_reminders")[0].args.p_limit,100);
});
test("a task reminder scan failure does not interrupt existing automation work or expose error detail",async()=>{
  const {s,response,body}=await scenario(()=>{throw Error("private workspace detail");});
  assert.equal(response.status,200);
  assert.equal(body.counters.taskReminderScanFailed,1);
  assert.equal(body.counters.taskRemindersCreated,0);
  assert.ok(s.db.rpcCalls("realtoros_claim_due_jobs").length);
  assert.ok(!JSON.stringify(body).includes("private workspace"));
});
