import { test } from "node:test";
import assert from "node:assert/strict";
import { browser, settle } from "../helpers/browser.mjs";

const SCRIPTS = ["assets/js/core/utils.js", "assets/js/data/data-service.js"];
const plain = value => JSON.parse(JSON.stringify(value));

async function setup(t) {
  const b = await browser(SCRIPTS);
  assert.ok(b, "jsdom required");
  t.after(() => b.close());
  const state = { userId: "user-1", workspaceId: "workspace-1", ready: true, denied: new Set() };
  const calls = [], viewed = [];
  let respond = () => ({ data: [], error: null });
  const client = {
    from(table) {
      const call = { table, operations: [] };
      calls.push(call);
      const query = {};
      for (const method of ["select", "eq", "textSearch", "order", "limit"]) {
        query[method] = (...args) => {
          call.operations.push([method, ...args]);
          return query;
        };
      }
      query.then = (resolve, reject) => Promise.resolve().then(() => respond(call)).then(resolve, reject);
      return query;
    }
  };
  const App = b.window.App;
  App.cloud = {
    getUser: () => state.userId ? { id: state.userId } : null,
    getClient: () => client
  };
  App.workspace = {
    id: () => state.workspaceId,
    ready: () => state.ready,
    canView: area => { viewed.push(area); return !state.denied.has(area); }
  };
  return { ...b, App, state, calls, viewed, respond: fn => { respond = fn; } };
}

const entities = [
  ["contacts", "id,full_name,email,phone", { id: "c1", full_name: "François", email: "f@example.test", phone: "+92 300" }, { name: "François", email: "f@example.test", phone: "+92 300" }],
  ["deals", "id,title,stage", { id: "d1", title: "River house", stage: "Qualified" }, { name: "River house", stage: "Qualified" }],
  ["properties", "id,address,status,mls", { id: "p1", address: "12 Rue Bleue", status: "Active", mls: "AB-123" }, { address: "12 Rue Bleue", status: "Active", mls: "AB-123" }],
  ["tasks", "id,title,status,due_date", { id: "t1", title: "Call buyer", status: "To Do", due_date: "2026-11-16" }, { title: "Call buyer", status: "To Do", dueDate: "2026-11-16" }]
];

for (const [entity, projection, row, expected] of entities) {
  test(`${entity}: search is projected, workspace-scoped, indexed, deterministic, and mapped to the existing model`, async t => {
    const b = await setup(t);
    b.respond(() => ({ data: [row], error: null }));
    const result = await b.App.data.search(entity, "River house");
    assert.equal(result.hasMore, false);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].id, row.id);
    for (const [key, value] of Object.entries(expected)) assert.equal(result.rows[0][key], value);
    assert.deepEqual(b.viewed, [entity === "tasks" ? "work" : entity]);
    assert.deepEqual(plain(b.calls), [{ table: entity, operations: [
      ["select", projection], ["eq", "workspace_id", "workspace-1"],
      ["textSearch", "crm_search_document", "River:* & house:*", { config: "simple" }],
      ["order", "id"], ["limit", 21]
    ] }]);
  });
}

test("search retains Unicode letters/numbers while punctuation cannot become tsquery operators", async t => {
  const b = await setup(t);
  await b.App.data.search("contacts", " François.Santos@example.com '+92' | ! صفاء:* <-> ");
  assert.deepEqual(plain(b.calls[0].operations.find(op => op[0] === "textSearch")),
    ["textSearch", "crm_search_document", "François:* & Santos:* & example:* & com:* & 92:* & صفاء:*", { config: "simple" }]);
});

test("search bounds input length and the number of prefix terms", async t => {
  const b = await setup(t);
  await b.App.data.search("contacts", Array.from({ length: 15 }, (_, i) => `term${i}`).join(" "));
  assert.equal(b.calls[0].operations.find(op => op[0] === "textSearch")[2],
    Array.from({ length: 12 }, (_, i) => `term${i}:*`).join(" & "));
  await b.App.data.search("contacts", "x".repeat(200) + " ignored");
  assert.equal(b.calls[1].operations.find(op => op[0] === "textSearch")[2], "x".repeat(200) + ":*");
});

test("search returns at most 20 rows and uses the extra row only as a continuation signal", async t => {
  const b = await setup(t);
  let count = 21;
  b.respond(() => ({ data: Array.from({ length: count }, (_, i) => ({ id: `c${i}`, full_name: `Match ${i}` })), error: null }));
  const full = await b.App.data.search("contacts", "match");
  assert.equal(full.rows.length, 20);
  assert.equal(full.hasMore, true);
  assert.equal(full.rows.at(-1).id, "c19");
  count = 20;
  const exact = await b.App.data.search("contacts", "match");
  assert.equal(exact.rows.length, 20);
  assert.equal(exact.hasMore, false);
  b.respond(() => ({ data: null, error: null }));
  assert.deepEqual(plain(await b.App.data.search("contacts", "missing")), { rows: [], hasMore: false });
});

test("denied areas, unready workspaces, and non-word searches issue no data query", async t => {
  const b = await setup(t);
  b.state.denied.add("contacts");
  assert.deepEqual(plain(await b.App.data.search("contacts", "private")), { rows: [], hasMore: false });
  b.state.denied.add("work");
  assert.deepEqual(plain(await b.App.data.search("tasks", "private")), { rows: [], hasMore: false });
  b.state.ready = false;
  assert.deepEqual(plain(await b.App.data.search("properties", "house")), { rows: [], hasMore: false });
  b.state.ready = true;
  for (const query of ["", "   ", "! | :* & <->", null]) {
    assert.deepEqual(plain(await b.App.data.search("properties", query)), { rows: [], hasMore: false });
  }
  assert.equal(b.calls.length, 0);
});

test("only the four supported entities may reach the backend, including inherited object names", async t => {
  const b = await setup(t);
  for (const entity of ["activities", "income", "workspace_settings", "__proto__", "constructor", "toString"]) {
    await assert.rejects(b.App.data.search(entity, "private"), /Unsupported search entity/);
  }
  assert.equal(b.calls.length, 0);
});

test("search requires a signed-in user and a resolved workspace instead of falling back to an unscoped read", async t => {
  const b = await setup(t);
  b.state.userId = null;
  await assert.rejects(b.App.data.search("contacts", "person"), /Not signed in/);
  b.state.userId = "user-1";
  b.state.workspaceId = null;
  await assert.rejects(b.App.data.search("contacts", "person"), error => error.code === "workspace_not_loaded");
  assert.equal(b.calls.length, 0);
  let loads = 0;
  b.App.workspace.load = async () => { loads++; b.state.workspaceId = "resolved-workspace"; };
  await b.App.data.search("contacts", "person");
  assert.equal(loads, 1);
  assert.deepEqual(b.calls[0].operations.find(op => op[0] === "eq"), ["eq", "workspace_id", "resolved-workspace"]);
});

test("search always reads fresh results without consuming or replacing the shared entity cache", async t => {
  const b = await setup(t);
  b.respond(() => ({ data: [{ id: "cached", full_name: "Normal list" }], error: null }));
  await b.App.data.list("contacts");
  let searchId = "search-1";
  b.respond(() => ({ data: [{ id: searchId, full_name: "Search only" }], error: null }));
  assert.equal((await b.App.data.search("contacts", "person")).rows[0].id, "search-1");
  searchId = "search-2";
  assert.equal((await b.App.data.search("contacts", "person")).rows[0].id, "search-2");
  assert.equal((await b.App.data.list("contacts"))[0].id, "cached");
  assert.equal(b.App.data.getCached("contacts")[0].id, "cached");
  assert.equal(b.calls.length, 3, "one normal read and two fresh searches; cached list performs no fourth read");
  await b.App.data.search("properties", "house");
  assert.equal(b.App.data.getCached("properties").length, 0, "search does not initialize an empty shared cache");
});

test("backend errors are propagated without caching failed search results", async t => {
  const b = await setup(t);
  const failure = { message: "Search unavailable", code: "PGRST_TEST" };
  b.respond(() => ({ data: null, error: failure }));
  await assert.rejects(b.App.data.search("contacts", "person"), error => error === failure);
  assert.equal(b.App.data.getCached("contacts").length, 0);
  b.respond(() => ({ data: [{ id: "recovered", full_name: "Recovered" }], error: null }));
  assert.equal((await b.App.data.search("contacts", "person")).rows[0].id, "recovered");
  assert.equal(b.calls.length, 2);
});

for (const change of ["workspace", "user", "sign-out"]) {
  test(`late search response is rejected after ${change} changes and never enters a shared cache`, async t => {
    const b = await setup(t);
    let finish;
    b.respond(() => new Promise(resolve => { finish = resolve; }));
    const pending = b.App.data.search("contacts", "sensitive");
    await settle(b.window);
    assert.equal(typeof finish, "function", "request must be in flight before changing context");
    if (change === "workspace") b.state.workspaceId = "workspace-2";
    else b.state.userId = change === "user" ? "user-2" : null;
    const rejected = assert.rejects(pending, /Search context changed/);
    finish({ data: [{ id: "old-private", full_name: "Old context" }], error: null });
    await rejected;
    assert.equal(b.App.data.getCached("contacts").length, 0);
  });
}
