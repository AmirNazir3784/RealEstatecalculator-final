// Follow-up completion, 2026-11-09 fix: the Quick Log's save is ONE
// atomic operation (App.store.completeFollowUp → the
// realtoros_complete_followup RPC), "None" clears the follow-up date
// through an explicit null, and an omitted value can never clear one.
//
// Two layers are pinned here:
//  - the data service: the RPC is called exactly once with the exact
//    arguments (null included), an undefined nextFollowUp or lastContact
//    is refused BEFORE any RPC happens, and a caller-supplied activity
//    id is honoured (it is what makes a retry after a lost response
//    safe — the SQL tests prove the database side of that);
//  - the quick log modal: a double click submits once, "Pick date" with
//    no date writes nothing, and a retry after a failure reuses the
//    SAME activity id.
import { test } from "node:test";
import assert from "node:assert/strict";
import { browser, settle, SKIP_DOM } from "../helpers/browser.mjs";

const open = [];
function closeAll() {
  while (open.length) {
    const b = open.pop();
    try { b.close(); } catch (e) { /* already gone */ }
  }
}
function domTest(name, fn) {
  test(name, async (t) => {
    try { await fn(t); } finally { closeAll(); }
  });
}

// ------------------------------------------------------------- data layer

const DATA_SCRIPTS = [
  "assets/js/config.js",
  "assets/js/core/utils.js",
  "assets/js/data/workspace.js",
  "assets/js/data/data-service.js",
];

const CONTACT_ROW = {
  id: "ct_1", full_name: "Pat Lee", type: "Buyer", email: "", phone: "",
  status: "New Lead", source: "Other", temperature: "Warm",
  last_contact: "2026-11-09", next_follow_up: null,
};
const ACTIVITY_ROW = {
  id: "ac_fixed", type: "Call", contact_id: "ct_1", property_id: null,
  deal_id: null, task_id: null, subject: "Reached", notes: "ok",
  outcome: "Reached", date: "2026-11-09T10:30:00.000Z",
};

async function dataCtx(t, rpcImpl) {
  const b = await browser(DATA_SCRIPTS, { store: { getState: () => ({ settings: {}, metadata: {} }) } });
  if (!b) { t.skip(SKIP_DOM); return null; }
  open.push(b);
  const calls = [];
  b.window.App.cloud = {
    getUser: () => ({ id: "u-1" }),
    getClient: () => ({
      rpc: async (name, args) => { calls.push([name, args]); return rpcImpl(name, args); },
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      removeChannel: () => {},
    }),
  };
  return { data: b.window.App.data, calls };
}

domTest("data: one RPC call carries the activity and both dates, null included", async (t) => {
  const c = await dataCtx(t, async () => ({ data: { activity: ACTIVITY_ROW, contact: CONTACT_ROW }, error: null }));
  if (!c) return;
  const out = await c.data.completeFollowUp(
    { id: "ac_fixed", type: "Call", date: "2026-11-09T10:30:00.000Z", contactId: "ct_1", subject: "Reached", outcome: "Reached", notes: "ok" },
    "ct_1", "2026-11-09", null);

  assert.equal(c.calls.length, 1, "exactly one RPC call");
  const [name, args] = c.calls[0];
  assert.equal(name, "realtoros_complete_followup");
  assert.strictEqual(args.p_next_follow_up, null, "None travels as an explicit null (clear)");
  assert.equal(args.p_last_contact, "2026-11-09");
  assert.equal(args.p_contact_id, "ct_1");
  assert.equal(args.p_activity.id, "ac_fixed", "a caller-supplied activity id is honoured");
  assert.strictEqual(out.contact.nextFollowUp, null, "the returned contact maps the cleared date");
  assert.equal(out.activity.id, "ac_fixed");
});

domTest("data: an omitted next follow-up is refused before any RPC happens", async (t) => {
  const c = await dataCtx(t, async () => ({ data: { activity: ACTIVITY_ROW, contact: CONTACT_ROW }, error: null }));
  if (!c) return;
  await assert.rejects(
    () => c.data.completeFollowUp({ type: "Call", contactId: "ct_1" }, "ct_1", "2026-11-09", undefined),
    /explicit/, "undefined must never silently become a clear");
  await assert.rejects(
    () => c.data.completeFollowUp({ type: "Call", contactId: "ct_1" }, "ct_1", undefined, null),
    /explicit/);
  assert.equal(c.calls.length, 0, "no RPC call was made for either refusal");
});

domTest("data: an RPC failure propagates and is not retried silently", async (t) => {
  const c = await dataCtx(t, async () => ({ data: null, error: { message: "Contact not found or not owned by current user" } }));
  if (!c) return;
  await assert.rejects(
    () => c.data.completeFollowUp({ type: "Call", contactId: "ct_1" }, "ct_1", "2026-11-09", "2026-11-16"),
    (err) => /not found/i.test((err && err.message) || ""),
    "the RPC's error reaches the caller (PostgREST errors are plain objects, not Errors)");
  assert.equal(c.calls.length, 1, "one attempt, surfaced to the caller");
});

// ------------------------------------------------------------- quick log UI

const UI_SCRIPTS = [
  "assets/js/core/utils.js",
  "assets/js/core/follow-up.js",
  "assets/js/app.js",
  "assets/js/pages/release.js",
  "assets/js/pages/tasks.js",
];
const TODAY = "2026-10-15";

async function uiWorld(t, completeImpl) {
  const contacts = [{
    id: "a", name: "Pat Lee", stage: "New Lead", temperature: "Warm",
    email: "", phone: "5551234567", lastContact: null, nextFollowUp: "2026-10-12",
    replyDetectedAt: null, createdAt: "2026-01-01T00:00:00Z",
  }];
  const calls = [];
  const store = {
    ensureLoaded: async () => {},
    getState: () => ({
      contacts, tasks: [], activities: [], properties: [], deals: [], showings: [],
      milestones: [], referrals: [], settings: { currency: "USD", agentName: "Dana Reed" },
    }),
    messageTemplates: { list: async () => [] },
    contacts: { get: async (id) => contacts.find((c) => c.id === id) || null },
    completeFollowUp: async (model, contactId, lastContact, nextFollowUp) => {
      calls.push([model, contactId, lastContact, nextFollowUp]);
      if (completeImpl) await completeImpl(model, contactId, lastContact, nextFollowUp);
      const c = contacts.find((x) => x.id === contactId);
      if (c) { c.lastContact = lastContact; c.nextFollowUp = nextFollowUp; }
      return { activity: model, contact: c };
    },
  };
  const b = await browser(UI_SCRIPTS, { store });
  if (!b) { t.skip(SKIP_DOM); return null; }
  open.push(b);
  b.window.App.util.todayISO = () => TODAY;
  const pane = b.document.createElement("div");
  b.document.body.appendChild(pane);
  await b.window.App.pages.release.renderDaily(pane);
  await settle(b.window);
  return { ...b, pane, calls, contacts };
}

async function openLog(p) {
  p.pane.querySelector('[data-contact-row="a"] [data-fu-action="log"]').click();
  await settle(p.window);
  return p.document.querySelector(".modal");
}

domTest("ui: a rapid double click submits exactly once", async (t) => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const p = await uiWorld(t, () => gate);
  if (!p) return;
  const m = await openLog(p);
  const save = m.querySelector('[data-role="save"]');
  save.click();
  save.click();
  await settle(p.window);
  assert.equal(p.calls.length, 1, "the second click never became a second submission");
  release();
  await settle(p.window);
  assert.equal(p.calls.length, 1);
});

domTest("ui: 'Pick date' with no date chosen writes nothing and keeps the modal open", async (t) => {
  const p = await uiWorld(t, null);
  if (!p) return;
  const m = await openLog(p);
  m.querySelector('[data-fu-next="pick"]').click();
  await settle(p.window);
  m.querySelector("#fuNextDate").value = "";
  m.querySelector('[data-role="save"]').click();
  await settle(p.window);
  assert.equal(p.calls.length, 0, "no write happened");
  assert.ok(p.document.querySelector(".modal"), "the modal is still open so the agent can fix it");
});

domTest("ui: 'Pick date' passes the chosen date through exactly", async (t) => {
  const p = await uiWorld(t, null);
  if (!p) return;
  const m = await openLog(p);
  m.querySelector('[data-fu-next="pick"]').click();
  await settle(p.window);
  m.querySelector("#fuNextDate").value = "2026-11-02";
  m.querySelector('[data-role="save"]').click();
  await settle(p.window);
  assert.equal(p.calls.length, 1);
  assert.equal(p.calls[0][3], "2026-11-02");
  assert.equal(p.calls[0][2], TODAY, "last-contact is today, date-only");
});

domTest("ui: a retry after a failure reuses the same activity id", async (t) => {
  let fail = true;
  const p = await uiWorld(t, async () => { if (fail) throw new Error("network lost"); });
  if (!p) return;
  const m = await openLog(p);
  const save = m.querySelector('[data-role="save"]');
  save.click();
  await settle(p.window);
  assert.equal(p.calls.length, 1);
  assert.equal(save.disabled, false, "the agent can retry after a failure");
  fail = false;
  save.click();
  await settle(p.window);
  assert.equal(p.calls.length, 2, "the retry went through once the failure cleared");
  assert.ok(p.calls[0][0].id, "the first attempt carried an activity id");
  assert.equal(p.calls[1][0].id, p.calls[0][0].id,
    "same id on the retry: if the first attempt had actually committed, the retry fails on the key instead of duplicating");
});
