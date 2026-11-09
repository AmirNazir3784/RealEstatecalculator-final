// Follow-up completion RPC (2026-11-09 fix): realtoros_complete_followup
// is the single atomic write behind both the Quick Log and the Daily
// View follow-up modal.
//
// The things worth pinning:
//  - a date sets the next follow-up, NULL clears it, and the activity
//    and the date change land together or not at all;
//  - the activity is written into the CONTACT's workspace;
//  - authorization follows the workspace permission model, not the
//    pre-workspace "whoever created the contact" rule: an admin can
//    complete a follow-up on the owner's contact, a restricted agent
//    cannot, and another workspace's user cannot even see it;
//  - a retry that reuses the same activity id (what the client does
//    after a lost response) can never create a duplicate.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { migratedDb, one, SKIP_MESSAGE } from "../helpers/pg.mjs";

let db;
let applied = false;
before(async () => {
  db = await migratedDb();
  if (!db) return;
  const r = await db.query(
    `select pg_get_functiondef(p.oid) as def from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'realtoros_complete_followup'`);
  applied = r.rows.length === 1 && r.rows[0].def.includes("workspace_id");
});
function sqlTest(name, fn) {
  test(name, async (t) => {
    if (!db) return t.skip(SKIP_MESSAGE);
    if (!applied) return t.skip("workspace-era complete_followup not in the migration chain");
    await fn();
  });
}

const svc = async (fn) => {
  await db.exec("set role service_role");
  try { return await fn(); } finally { await db.exec("reset role"); }
};
async function as(uid, fn) {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
  await db.exec("set role authenticated");
  try { return await fn(); } finally {
    await db.exec("reset role");
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}
const rpc = (uid, fn, args = {}) => {
  const keys = Object.keys(args);
  const ph = keys.map((k, i) => `${k} => $${i + 1}`).join(", ");
  return as(uid, async () =>
    (await db.query(`select public.${fn}(${ph}) as out`, keys.map(k => args[k]))).rows[0].out);
};

async function account(email) {
  await db.exec("reset role");
  const id = randomUUID();
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, email]);
  return id;
}
async function ownerWorkspace() {
  const owner = await account(`owner.${randomUUID().slice(0, 8)}@example.com`);
  await svc(() => db.query(`select automation_internal.ensure_personal_workspace($1)`, [owner]));
  const ws = (await db.query(
    `select workspace_id from public.workspace_members where user_id=$1 and status='active'`,
    [owner])).rows[0].workspace_id;
  return { owner, ws };
}
async function joiner(w, role = "agent") {
  const email = `joiner.${randomUUID().slice(0, 8)}@example.com`;
  const inv = await rpc(w.owner, "realtoros_invite_member", { p_email: email, p_role: role });
  const uid = await account(email);
  const acc = await rpc(uid, "realtoros_accept_invitation", { p_token: inv.token });
  return { uid, email, member_id: acc.member_id, team_member_id: acc.team_member_id };
}

/** A contact owned by `userId` in workspace `ws`, with a follow-up set. */
async function contact(userId, ws, nextFollowUp = "2026-11-10") {
  const id = "ct_" + randomUUID().slice(0, 8);
  await svc(() => db.query(
    `insert into public.contacts (id, user_id, workspace_id, full_name, next_follow_up)
     values ($1, $2, $3, 'Pat Lee', $4)`, [id, userId, ws, nextFollowUp]));
  return id;
}
const activityJson = (id, contactId, extra = {}) => JSON.stringify(Object.assign({
  id, type: "Call", contact_id: contactId,
  subject: "Reached", outcome: "Reached", notes: "Spoke about the viewing",
  date: "2026-11-09T10:30:00.000Z",
}, extra));
const complete = (uid, actId, contactId, lastContact, nextFollowUp) =>
  as(uid, async () =>
    (await db.query(
      `select public.realtoros_complete_followup($1::jsonb, $2, $3::date, $4::date) as out`,
      [activityJson(actId, contactId), contactId, lastContact, nextFollowUp])).rows[0].out);
const contactRow = (id) => one(db,
  `select last_contact::text as last_contact, next_follow_up::text as next_follow_up
     from public.contacts where id=$1`, [id]);
const activityCount = async (contactId) =>
  (await one(db, `select count(*)::int as n from public.activities where contact_id=$1`, [contactId])).n;

sqlTest("a future date is set, last-contact is exact, and the activity lands in the contact's workspace", async () => {
  const w = await ownerWorkspace();
  const cid = await contact(w.owner, w.ws);
  const out = await complete(w.owner, "ac_set1", cid, "2026-11-09", "2026-11-16");

  assert.equal(out.contact.next_follow_up, "2026-11-16");
  assert.equal(out.contact.last_contact, "2026-11-09", "date-only values round-trip with no timezone shift");
  assert.equal(out.activity.contact_id, cid);
  assert.equal(out.activity.outcome, "Reached");
  assert.equal(out.activity.notes, "Spoke about the viewing");

  const row = await one(db,
    `select workspace_id from public.activities where id='ac_set1'`);
  assert.equal(row.workspace_id, w.ws, "the activity takes the contact's workspace, not a client-supplied one");
  assert.deepEqual(await contactRow(cid), { last_contact: "2026-11-09", next_follow_up: "2026-11-16" });
});

sqlTest("NULL clears the follow-up; the contact and its history survive", async () => {
  const w = await ownerWorkspace();
  const cid = await contact(w.owner, w.ws);
  await complete(w.owner, "ac_hist1", cid, "2026-11-08", "2026-11-12");
  assert.equal(await activityCount(cid), 1);

  const out = await complete(w.owner, "ac_clear1", cid, "2026-11-09", null);
  assert.equal(out.contact.next_follow_up, null, "an explicit NULL clears the stored date");
  assert.deepEqual(await contactRow(cid), { last_contact: "2026-11-09", next_follow_up: null });
  assert.equal(await activityCount(cid), 2, "both log entries remain in the timeline");
  const stillThere = await one(db, `select count(*)::int as n from public.contacts where id=$1`, [cid]);
  assert.equal(stillThere.n, 1, "clearing a follow-up never deletes the contact");
});

sqlTest("a failed completion rolls BOTH writes back", async () => {
  const w = await ownerWorkspace();
  const cid = await contact(w.owner, w.ws);
  await complete(w.owner, "ac_once", cid, "2026-11-09", "2026-11-20");

  // Same activity id again: the insert fails, so the date change that
  // travelled with it must not land either.
  await assert.rejects(() => complete(w.owner, "ac_once", cid, "2026-11-09", "2026-12-01"));
  assert.deepEqual(await contactRow(cid), { last_contact: "2026-11-09", next_follow_up: "2026-11-20" },
    "the retried call changed nothing");
  assert.equal(await activityCount(cid), 1,
    "exactly one activity exists for the id — a retry after a lost response cannot duplicate it");
});

sqlTest("an unknown contact writes nothing at all", async () => {
  const w = await ownerWorkspace();
  await assert.rejects(
    () => complete(w.owner, "ac_ghost", "ct_missing", "2026-11-09", "2026-11-16"),
    /not found/i);
  const n = (await one(db, `select count(*)::int as n from public.activities where id='ac_ghost'`)).n;
  assert.equal(n, 0, "no orphan activity remains after the refusal");
});

sqlTest("another workspace's user cannot complete or disturb the follow-up", async () => {
  const a = await ownerWorkspace();
  const b = await ownerWorkspace();
  const cid = await contact(a.owner, a.ws);

  await assert.rejects(() => complete(b.owner, "ac_xws", cid, "2026-11-09", null));
  assert.deepEqual(await contactRow(cid), { last_contact: null, next_follow_up: "2026-11-10" },
    "the other workspace's attempt changed nothing");
  assert.equal(await activityCount(cid), 0);
});

sqlTest("an admin can complete a follow-up on the owner's contact (workspace model, not creator model)", async () => {
  const w = await ownerWorkspace();
  const admin = await joiner(w, "admin");
  const cid = await contact(w.owner, w.ws);

  const out = await complete(admin.uid, "ac_admin1", cid, "2026-11-09", null);
  assert.equal(out.contact.next_follow_up, null);
  assert.equal(out.activity.user_id, admin.uid, "the activity is credited to whoever logged it");
  assert.equal(await activityCount(cid), 1);
});

sqlTest("a restricted agent cannot complete a follow-up on somebody else's contact", async () => {
  const w = await ownerWorkspace();
  const agent = await joiner(w, "agent");
  await rpc(w.owner, "realtoros_set_member_permissions",
    { p_member_id: agent.member_id, p_overrides: { contacts: { view: "own", edit: "own" } } });
  const cid = await contact(w.owner, w.ws);

  await assert.rejects(() => complete(agent.uid, "ac_agent1", cid, "2026-11-09", null));
  assert.deepEqual(await contactRow(cid), { last_contact: null, next_follow_up: "2026-11-10" });
  assert.equal(await activityCount(cid), 0, "the refusal left no partial write behind");
});

sqlTest("an activity addressed to a different contact is refused", async () => {
  const w = await ownerWorkspace();
  const cid = await contact(w.owner, w.ws);
  const other = await contact(w.owner, w.ws);
  await assert.rejects(() => as(w.owner, async () => db.query(
    `select public.realtoros_complete_followup($1::jsonb, $2, '2026-11-09'::date, null)`,
    [activityJson("ac_mismatch", other), cid])), /does not match/i);
  assert.equal(await activityCount(cid), 0);
  assert.equal(await activityCount(other), 0);
});
