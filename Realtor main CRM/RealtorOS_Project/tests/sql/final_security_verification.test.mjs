// Final security verification (2026-11-09): the focused follow-up to the
// owner's manual RLS audit. Two synthetic users in two workspaces,
// PGlite against the real migration chain - production is never touched.
//
// Scope is deliberately narrow (the T2b-2 matrix already covers the
// general role x operation grid). These tests aim at the paths the
// audit named explicitly:
//   1. team_members role / auth_user_id as an escalation surface.
//   2. Whether the directory table (team_members) can move the
//      authorization identity, which actually lives in
//      workspace_members (authz.my_role / my_team_member_id).
//   3. Moving records across workspaces by UPDATEing workspace_id.
//   4. Privileged SECURITY DEFINER RPCs called by an outsider and by
//      a low-role insider.
//   5. Cross-workspace assignment (assigned_to_id pointing abroad).
//   6. Workspace settings written by a user who is privileged - in
//      somebody else's workspace.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { migratedDb, SKIP_MESSAGE } from "../helpers/pg.mjs";

let db;
before(async () => { db = await migratedDb(); });

function sqlTest(name, fn) {
  test(name, async (t) => {
    if (!db) return t.skip(SKIP_MESSAGE);
    await fn();
  });
}

async function asService(fn) {
  await db.exec("set role service_role");
  try { return await fn(); } finally { await db.exec("reset role"); }
}
async function asUser(uid, fn) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
  await db.exec("set role authenticated");
  try { return await fn(); } finally {
    await db.exec("reset role");
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}
async function mkUser() {
  await db.exec("reset role");
  const id = randomUUID();
  await db.query(`insert into auth.users (id) values ($1)`, [id]);
  return id;
}
const n = (r) => Number(r.rows[0].n);
const count = async (sql, p = []) => n(await db.query(sql, p));
async function refused(fn) {
  try { const r = await fn(); return (r?.rowCount ?? 0) === 0; }
  catch { return true; }
}
// The privileged RPCs report refusal two ways: raising (42501) or
// returning an outcome jsonb that is not a success outcome. A bare
// rowCount check cannot tell those apart for a SELECT call, so RPC
// abuse is judged on the outcome - with state-unchanged assertions
// as the backstop in every test that uses this.
async function rpcBlocked(uid, sql, p, successOutcomes) {
  try {
    const r = await asUser(uid, () => db.query(sql, p));
    const v = r.rows[0] && Object.values(r.rows[0])[0];
    const outcome = v && typeof v === "object" ? v.outcome : String(v);
    return !successOutcomes.includes(outcome);
  } catch { return true; }
}

// Same world as the T2b-2 matrix: W1 with owner/admin/agent, W2 owned
// by the stranger.
async function world() {
  const owner = await mkUser();
  const admin = await mkUser();
  const agent = await mkUser();
  const stranger = await mkUser();
  await asService(async () => {
    await db.query(`select automation_internal.ensure_personal_workspace($1)`, [owner]);
    await db.query(`select automation_internal.ensure_personal_workspace($1)`, [stranger]);
  });
  const ws = (await db.query(
    `select workspace_id from public.workspace_members where user_id=$1 and status='active'`, [owner])).rows[0].workspace_id;
  const strangerWs = (await db.query(
    `select workspace_id from public.workspace_members where user_id=$1 and status='active'`, [stranger])).rows[0].workspace_id;
  const ids = { owner, admin, agent, stranger, ws, strangerWs, tm: {} };
  for (const [uid, role, label] of [[admin, "admin", "Admin"], [agent, "agent", "Agent"]]) {
    await asService(async () => {
      await db.query(`update public.workspace_members set status='removed' where user_id=$1 and status='active'`, [uid]);
      const mid = (await db.query(
        `insert into public.workspace_members (workspace_id,user_id,role,status,team_member_id)
         values ($1,$2,$3,'active',null) returning id`, [ws, uid, role])).rows[0].id;
      const tmid = `tm-${role}-${uid.slice(0, 6)}`;
      await db.query(
        `insert into public.team_members (id,user_id,workspace_id,auth_user_id,name,role,email,phone,active)
         values ($1,$2,$3,$4,$5,$6,'','',true)`, [tmid, uid, ws, uid, label, role]);
      await db.query(`update public.workspace_members set team_member_id=$1 where id=$2`, [tmid, mid]);
      ids.tm[role] = tmid;
      ids[`${role}Member`] = mid;
    });
  }
  ids.tm.owner = (await db.query(
    `select team_member_id from public.workspace_members where user_id=$1 and status='active'`, [owner])).rows[0].team_member_id;
  ids.tm.stranger = (await db.query(
    `select team_member_id from public.workspace_members where user_id=$1 and status='active'`, [stranger])).rows[0].team_member_id;
  ids.wsName = (await db.query(`select name from public.workspaces where id=$1`, [ws])).rows[0].name;
  return ids;
}

async function seed(w) {
  const cid = `c-fin-${randomUUID().slice(0, 8)}`;
  const did = `d-fin-${randomUUID().slice(0, 8)}`;
  const tid = `t-fin-${randomUUID().slice(0, 8)}`;
  await asService(async () => {
    await db.query(`insert into public.contacts (id,user_id,workspace_id,assigned_to_id,full_name)
                    values ($1,$2,$3,$4,'Final Check Lead')`, [cid, w.owner, w.ws, w.tm.agent]);
    await db.query(`insert into public.deals (id,user_id,workspace_id,title,contact_id,stage,status)
                    values ($1,$2,$3,'Final Check Deal',$4,'Lead','open')`, [did, w.owner, w.ws, cid]);
    await db.query(`insert into public.tasks (id,user_id,workspace_id,contact_id,title,assigned_to_id)
                    values ($1,$2,$3,$4,'Final Check Task',$5)`, [tid, w.owner, w.ws, cid, w.tm.agent]);
  });
  return { cid, did, tid };
}

// ------------------------------------------------------------------ 1
sqlTest("team_members: an agent cannot rewrite role or auth_user_id (or anything)", async () => {
  const w = await world();
  const beforeRow = (await db.query(
    `select role, auth_user_id from public.team_members where id=$1`, [w.tm.agent])).rows[0];
  assert.equal(beforeRow.role, "agent");

  assert.ok(await refused(() => asUser(w.agent, () => db.query(
    `update public.team_members set role='owner' where id=$1`, [w.tm.agent]))),
    "role self-escalation is refused");
  assert.ok(await refused(() => asUser(w.agent, () => db.query(
    `update public.team_members set auth_user_id=$1 where id=$2`, [w.stranger, w.tm.agent]))),
    "auth_user_id rewrite is refused");
  assert.ok(await refused(() => asUser(w.agent, () => db.query(
    `update public.team_members set name='Renamed' where id=$1`, [w.tm.agent]))),
    "even a benign field is refused without team_manage");

  const afterRow = (await db.query(
    `select role, auth_user_id from public.team_members where id=$1`, [w.tm.agent])).rows[0];
  assert.deepEqual(afterRow, beforeRow, "the row is unchanged");
});

// ------------------------------------------------------------------ 2
sqlTest("team_members.auth_user_id does not carry authorization identity", async () => {
  const w = await world();
  const { cid } = await seed(w);
  // Baseline: the agent sees exactly the one contact assigned to them.
  assert.equal(await asUser(w.agent, () => count(
    `select count(*) n from public.contacts where id=$1`, [cid])), 1);

  // A team_manage holder re-points the agent's directory row at the
  // admin's login. The write itself is policy-allowed (directory
  // administration) - the security question is whether anything in
  // the authorization layer moves with it. First prove the directory
  // write really landed, so the assertions below are meaningful.
  const write = await asUser(w.admin, () => db.query(
    `update public.team_members set auth_user_id=$1 where id=$2`, [w.admin, w.tm.agent]));
  assert.equal(write.rowCount, 1, "the directory edit itself is allowed for team_manage");
  const pointed = (await db.query(
    `select auth_user_id from public.team_members where id=$1`, [w.tm.agent])).rows[0].auth_user_id;
  assert.equal(pointed, w.admin, "the directory row now names the admin's login");

  const agentRole = await asUser(w.agent, async () =>
    (await db.query(`select authz.my_role() as r`)).rows[0].r);
  assert.equal(agentRole, "agent", "the agent's role still resolves from workspace_members");
  const agentTm = await asUser(w.agent, async () =>
    (await db.query(`select authz.my_team_member_id() as t`)).rows[0].t);
  assert.equal(agentTm, w.tm.agent, "the agent's member identity is unchanged");
  const adminTm = await asUser(w.admin, async () =>
    (await db.query(`select authz.my_team_member_id() as t`)).rows[0].t);
  assert.equal(adminTm, w.tm.admin, "and the admin has not absorbed the agent's identity");
  assert.equal(await asUser(w.agent, () => count(
    `select count(*) n from public.contacts where id=$1`, [cid])), 1,
    "visibility is exactly as before the directory edit");
});

// ------------------------------------------------------------------ 3
sqlTest("records cannot be moved across workspaces by updating workspace_id", async () => {
  const w = await world();
  const { cid, did, tid } = await seed(w);
  for (const [tbl, id] of [["contacts", cid], ["deals", did], ["tasks", tid]]) {
    assert.ok(await refused(() => asUser(w.owner, () => db.query(
      `update public.${tbl} set workspace_id=$1 where id=$2`, [w.strangerWs, id]))),
      `${tbl}: the move into a foreign workspace is refused`);
    const row = (await db.query(`select workspace_id from public.${tbl} where id=$1`, [id])).rows[0];
    assert.equal(row.workspace_id, w.ws, `${tbl}: still in its own workspace`);
  }
});

// ------------------------------------------------------------------ 4
sqlTest("privileged RPCs refuse an outsider from another workspace", async () => {
  const w = await world();
  assert.ok(await rpcBlocked(w.stranger,
    `select public.realtoros_change_member_role($1, 'admin')`, [w.agentMember], ["changed"]),
    "change_member_role refuses the outsider");
  assert.ok(await rpcBlocked(w.stranger,
    `select public.realtoros_remove_member($1)`, [w.agentMember], ["removed"]),
    "remove_member refuses the outsider");
  assert.ok(await rpcBlocked(w.stranger,
    `select public.realtoros_transfer_ownership($1)`, [w.agentMember], ["transferred"]),
    "transfer_ownership refuses the outsider");
  assert.ok(await rpcBlocked(w.stranger,
    `select public.realtoros_set_member_permissions($1, $2::jsonb)`,
    [w.agentMember, JSON.stringify({ contacts: { view: "all" } })], ["saved", "ok", "changed", "updated"]),
    "set_member_permissions refuses the outsider");

  const member = (await db.query(
    `select role, status, permission_overrides from public.workspace_members where id=$1`, [w.agentMember])).rows[0];
  assert.equal(member.role, "agent", "the targeted membership keeps its role");
  assert.equal(member.status, "active", "and its status");
  assert.deepEqual(member.permission_overrides, {}, "and gains no overrides");
});

// ------------------------------------------------------------------ 5
sqlTest("privileged RPCs refuse a low-role insider (self-promotion attempts)", async () => {
  const w = await world();
  assert.ok(await rpcBlocked(w.agent,
    `select public.realtoros_change_member_role($1, 'owner')`, [w.agentMember], ["changed"]),
    "an agent cannot promote themselves via the role RPC ('owner' is not a grantable role)");
  assert.ok(await rpcBlocked(w.agent,
    `select public.realtoros_change_member_role($1, 'agent')`, [w.adminMember], ["changed"]),
    "an agent cannot demote the admin either (team_manage is enforced)");
  assert.ok(await rpcBlocked(w.agent,
    `select public.realtoros_set_member_permissions($1, $2::jsonb)`,
    [w.agentMember, JSON.stringify({ contacts: { view: "all", delete: "all" } })], ["saved", "ok", "changed", "updated"]),
    "an agent cannot grant themselves overrides");
  assert.ok(await rpcBlocked(w.agent,
    `select public.realtoros_set_role_permissions('agent', $1::jsonb)`,
    [JSON.stringify({ contacts: { view: "all" } })], ["saved", "ok", "changed", "updated"]),
    "an agent cannot rewrite their role's permission set");
  assert.ok(await rpcBlocked(w.agent,
    `select public.realtoros_delete_workspace($1)`, [w.wsName], ["deleted"]),
    "a non-owner cannot delete the workspace, even with its exact name");

  const role = (await db.query(
    `select role from public.workspace_members where id=$1`, [w.agentMember])).rows[0].role;
  assert.equal(role, "agent", "the agent is still an agent");
  const adminRole = (await db.query(
    `select role from public.workspace_members where id=$1`, [w.adminMember])).rows[0].role;
  assert.equal(adminRole, "admin", "and the admin is still an admin");
  const perms = await asUser(w.agent, async () =>
    (await db.query(`select public.realtoros_my_permissions() as p`)).rows[0].p);
  assert.equal(perms.permissions.contacts.view, "own", "the agent's effective permissions are unexpanded");
  assert.equal(await count(`select count(*) n from public.workspaces where id=$1`, [w.ws]), 1,
    "and the workspace still exists");
});

// ------------------------------------------------------------------ 6
sqlTest("cross-workspace assignment grants the foreign assignee nothing", async () => {
  const w = await world();
  const { cid } = await seed(w);
  // The owner points the contact at the stranger's member row (W2).
  // Two mechanisms could hold: the assignment trigger refuses the
  // write, or the write lands but RLS still shows the stranger
  // nothing. The invariant asserted here is the second one, and the
  // first is reported by which branch ran.
  let writeRefused = false;
  try {
    await asUser(w.owner, () => db.query(
      `update public.contacts set assigned_to_id=$1 where id=$2`, [w.tm.stranger, cid]));
  } catch { writeRefused = true; }
  const seenByStranger = await asUser(w.stranger, () => count(
    `select count(*) n from public.contacts where id=$1`, [cid]));
  assert.equal(seenByStranger, 0,
    `the foreign assignee sees nothing (write ${writeRefused ? "was refused by the assignment guard" : "landed but is inert under RLS"})`);
  const row = (await db.query(
    `select workspace_id from public.contacts where id=$1`, [cid])).rows[0];
  assert.equal(row.workspace_id, w.ws, "the record never left its workspace");
});

// ------------------------------------------------------------------ 7
sqlTest("workspace_settings: a privileged outsider cannot write another workspace's settings", async () => {
  const w = await world();
  await asService(async () => {
    const existing = await count(
      `select count(*) n from public.workspace_settings where workspace_id=$1`, [w.ws]);
    if (!existing) {
      await db.query(
        `insert into public.workspace_settings (id,user_id,workspace_id,ui_preferences)
         values ($1,$2,$3,'{}'::jsonb)`, [`wset-${w.ws.slice(0, 8)}`, w.owner, w.ws]);
    }
  });
  const beforeRow = (await db.query(
    `select ui_preferences from public.workspace_settings where workspace_id=$1`, [w.ws])).rows[0];
  assert.ok(await refused(() => asUser(w.stranger, () => db.query(
    `update public.workspace_settings set ui_preferences='{"breach":true}'::jsonb where workspace_id=$1`, [w.ws]))),
    "the cross-workspace settings write is refused");
  const afterRow = (await db.query(
    `select ui_preferences from public.workspace_settings where workspace_id=$1`, [w.ws])).rows[0];
  assert.deepEqual(afterRow, beforeRow, "the settings row is unchanged");
  assert.equal(await asUser(w.stranger, () => count(
    `select count(*) n from public.workspace_settings where workspace_id=$1`, [w.ws])), 0,
    "and the outsider cannot even read it");
});

// ------------------------------------------------------------------ 8
sqlTest("unauthorized CRUD sweep: the stranger gets nothing from W1's tables", async () => {
  const w = await world();
  const { cid, did, tid } = await seed(w);
  for (const [tbl, id] of [["contacts", cid], ["deals", did], ["tasks", tid]]) {
    assert.equal(await asUser(w.stranger, () => count(
      `select count(*) n from public.${tbl} where id=$1`, [id])), 0, `${tbl}: SELECT is empty`);
    assert.ok(await refused(() => asUser(w.stranger, () => db.query(
      `update public.${tbl} set ${tbl === "contacts" ? "notes" : "title"}='breach' where id=$1`, [id]))),
      `${tbl}: UPDATE is refused`);
    assert.ok(await refused(() => asUser(w.stranger, () => db.query(
      `delete from public.${tbl} where id=$1`, [id]))), `${tbl}: DELETE is refused`);
  }
  assert.ok(await refused(() => asUser(w.stranger, () => db.query(
    `insert into public.contacts (id,user_id,workspace_id,full_name) values ($1,$2,$3,'Breach')`,
    [`c-breach-${randomUUID().slice(0, 6)}`, w.stranger, w.ws]))),
    "INSERT stamped with the victim workspace is refused");
  assert.equal(await count(`select count(*) n from public.contacts where id=$1`, [cid]), 1,
    "the seeded rows all survive");
});
