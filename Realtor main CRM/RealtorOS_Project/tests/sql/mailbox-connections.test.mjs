// mailbox_connections + workspace_mailbox_policies (migration
// 20261116120000): schema shape, uniqueness of one personal connection per
// member/provider and one shared connection per workspace/provider, check
// constraints, and the service_role-only access pattern (clients can never
// read a stored token — grants are revoked, RLS is on).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { migratedDb, MIGRATIONS_DIR, SKIP_MESSAGE } from "../helpers/pg.mjs";

const MIGRATION = "20261116120000_mailbox_connections.sql";
let db;
let owner, agent, otherOwner, workspace, otherWorkspace;

before(async () => {
  db = await migratedDb();
  owner = randomUUID();
  agent = randomUUID();
  otherOwner = randomUUID();
  workspace = randomUUID();
  otherWorkspace = randomUUID();
  // Inserting an auth user auto-provisions their own workspace + owner
  // membership (trigger in phase_t2b2), and
  // workspace_members_one_active_per_user allows ONE active membership per
  // user — so the agent's auto-membership is removed before joining the
  // owner's workspace, exactly like the T3 accept-invitation flow.
  await db.query("insert into auth.users (id) values ($1), ($2), ($3)", [owner, agent, otherOwner]);
  const ws = await db.query(
    "select user_id, workspace_id from public.workspace_members where user_id = any($1)",
    [[owner, agent, otherOwner]],
  );
  const byUser = Object.fromEntries(ws.rows.map((r) => [r.user_id, r.workspace_id]));
  workspace = byUser[owner];
  otherWorkspace = byUser[otherOwner];
  await db.query(
    "update public.workspace_members set status = 'removed' where user_id = $1",
    [agent],
  );
  await db.query(
    "insert into public.workspace_members (workspace_id, user_id, role, status) values ($1, $2, 'agent', 'active')",
    [workspace, agent],
  );
});

async function asService(fn) {
  await db.exec("set role service_role");
  try { return await fn(); } finally { await db.exec("reset role"); }
}

async function asAuthenticated(fn) {
  await db.exec("set role authenticated");
  try { return await fn(); } finally { await db.exec("reset role"); }
}

function connectionRow(overrides = {}) {
  return {
    workspace_id: workspace,
    user_id: agent,
    kind: "personal",
    provider: "gmail",
    email_address: "agent@example.com",
    refresh_token_ciphertext: "Y2lwaGVydGV4dA==",
    refresh_token_iv: "aXY=",
    ...overrides,
  };
}

async function insertConnection(row) {
  const cols = Object.keys(row);
  const sql = `insert into public.mailbox_connections (${cols.join(", ")})
               values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`;
  const { rows } = await db.query(sql, cols.map((c) => row[c]));
  return rows[0].id;
}

test("migration file is present in the migrations directory", () => {
  const sql = readFileSync(join(MIGRATIONS_DIR, MIGRATION), "utf8");
  assert.match(sql, /create table public\.mailbox_connections/);
  assert.match(sql, /create table public\.workspace_mailbox_policies/);
});

test("service_role can store a personal connection; defaults apply", async () => {
  if (!db) return assert.skip(SKIP_MESSAGE);
  await asService(async () => {
    const id = await insertConnection(connectionRow());
    const { rows } = await db.query(
      "select status, scopes, kind from public.mailbox_connections where id = $1",
      [id],
    );
    assert.equal(rows[0].status, "connected");
    assert.equal(rows[0].kind, "personal");
    assert.match(rows[0].scopes, /gmail\.send/);
  });
});

test("one personal connection per member + provider per workspace", async () => {
  if (!db) return assert.skip(SKIP_MESSAGE);
  await asService(async () => {
    await assert.rejects(
      () => insertConnection(connectionRow()),
      /mailbox_connections_personal_uq|duplicate key/,
    );
    // A different provider for the same member is a different connection.
    await insertConnection(connectionRow({ provider: "microsoft" }));
    // The same member in another workspace is a different connection.
    await insertConnection(connectionRow({ workspace_id: otherWorkspace }));
  });
});

test("one shared connection per provider per workspace", async () => {
  if (!db) return assert.skip(SKIP_MESSAGE);
  await asService(async () => {
    await insertConnection(connectionRow({
      user_id: owner, kind: "shared", email_address: "hello@example.com",
    }));
    await assert.rejects(
      () => insertConnection(connectionRow({
        user_id: owner, kind: "shared", email_address: "team@example.com",
      })),
      /mailbox_connections_shared_uq|duplicate key/,
    );
  });
});

test("check constraints reject bad email, kind, provider and status", async () => {
  if (!db) return assert.skip(SKIP_MESSAGE);
  await asService(async () => {
    await assert.rejects(() =>
      insertConnection(connectionRow({
        user_id: owner, email_address: "not-an-email",
      })));
    await assert.rejects(() =>
      insertConnection(connectionRow({ user_id: owner, kind: "work" })));
    await assert.rejects(() =>
      insertConnection(connectionRow({ user_id: owner, provider: "yahoo" })));
    await assert.rejects(() =>
      insertConnection(connectionRow({ user_id: owner, status: "pending" })));
  });
});

test("clients can never touch the tables (grants revoked, RLS on)", async () => {
  if (!db) return assert.skip(SKIP_MESSAGE);
  await asAuthenticated(async () => {
    await assert.rejects(() =>
      db.query("select * from public.mailbox_connections"));
    await assert.rejects(() =>
      db.query("select * from public.workspace_mailbox_policies"));
  });
  const { rows } = await db.query(
    `select relname, relrowsecurity from pg_class
     where relname in ('mailbox_connections', 'workspace_mailbox_policies')`,
  );
  assert.equal(rows.length, 2);
  for (const r of rows) assert.equal(r.relrowsecurity, true);
});

test("workspace policy: insert, mode check, default is an absent row", async () => {
  if (!db) return assert.skip(SKIP_MESSAGE);
  await asService(async () => {
    await db.query(
      "insert into public.workspace_mailbox_policies (workspace_id, mode, updated_by) values ($1, 'shared', $2)",
      [workspace, owner],
    );
    const { rows } = await db.query(
      "select mode from public.workspace_mailbox_policies where workspace_id = $1",
      [workspace],
    );
    assert.equal(rows[0].mode, "shared");
    await assert.rejects(() =>
      db.query(
        "insert into public.workspace_mailbox_policies (workspace_id, mode) values ($1, 'everyone')",
        [otherWorkspace],
      ));
  });
});
