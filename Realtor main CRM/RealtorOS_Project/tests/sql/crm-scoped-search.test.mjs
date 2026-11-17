import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { migratedDb, MIGRATIONS_DIR, SKIP_MESSAGE } from "../helpers/pg.mjs";

const MIGRATION = "20261116070656_crm_scoped_search.sql";
const TABLES = ["contacts", "deals", "properties", "tasks"];
let db, world, originalRecords, originalPolicies, originalGrants, originalVisibility;

async function asService(fn) {
  await db.exec("set role service_role");
  try { return await fn(); } finally { await db.exec("reset role"); }
}

async function asUser(userId, fn) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId || ""]);
  await db.query("select set_config('request.jwt.claims', '', false)");
  await db.exec(userId ? "set role authenticated" : "set role anon");
  try { return await fn(); } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

async function newUser() {
  const userId = randomUUID();
  await db.query("insert into auth.users (id) values ($1)", [userId]);
  return userId;
}

async function personalWorkspace(userId) {
  await asService(() => db.query("select automation_internal.ensure_personal_workspace($1)", [userId]));
  return (await db.query("select workspace_id from public.workspace_members where user_id=$1 and status='active'", [userId])).rows[0].workspace_id;
}

async function seedWorld() {
  const owner = await newUser(), agent = await newUser(), stranger = await newUser();
  const ws = await personalWorkspace(owner), otherWs = await personalWorkspace(stranger);
  const agentTeamMember = `tm-search-${randomUUID()}`;
  await asService(async () => {
    await db.query("update public.workspace_members set status='removed' where user_id=$1 and status='active'", [agent]);
    const membership = (await db.query(
      "insert into public.workspace_members (workspace_id,user_id,role,status,team_member_id) values ($1,$2,'agent','active',null) returning id",
      [ws, agent])).rows[0].id;
    await db.query(
      "insert into public.team_members (id,user_id,workspace_id,auth_user_id,name,role,email,phone,active) values ($1,$2,$3,$2,'Search Agent','Agent','','',true)",
      [agentTeamMember, agent, ws]);
    await db.query("update public.workspace_members set team_member_id=$1 where id=$2", [agentTeamMember, membership]);
  });

  const ids = Object.fromEntries(TABLES.map(table => [table, []]));
  for (const [user, workspace, assignment, suffix] of [
    [owner, ws, agentTeamMember, "assigned"], [owner, ws, null, "unassigned"], [stranger, otherWs, null, "stranger"]
  ]) {
    for (const table of TABLES) {
      const id = `${table}-search-${suffix}-${randomUUID()}`;
      ids[table].push(id);
      await asService(async () => {
        if (table === "contacts") await db.query(
          "insert into public.contacts (id,user_id,workspace_id,assigned_to_id,full_name,email,phone,notes,budget,tags) values ($1,$2,$3,$4,'Searchprobe François-María','francois.santos@example.test','+92 300 1234567','privatenotetoken',350000,ARRAY['preserved'])",
          [id, user, workspace, assignment]);
        if (table === "deals") await db.query(
          "insert into public.deals (id,user_id,workspace_id,assigned_to_id,title,stage,value,commission_rate,notes) values ($1,$2,$3,$4,'Searchprobe River-Ridge','Qualified',485000,3,'privatenotetoken')",
          [id, user, workspace, assignment]);
        if (table === "properties") await db.query(
          "insert into public.properties (id,user_id,workspace_id,address,status,mls,price,bedrooms,notes) values ($1,$2,$3,'Searchprobe 12 Rue-Bleue','Active','AB-123',485000,3,'privatenotetoken')",
          [id, user, workspace]);
        if (table === "tasks") await db.query(
          "insert into public.tasks (id,user_id,workspace_id,assigned_to_id,title,status,due_date,priority,notes) values ($1,$2,$3,$4,'Searchprobe Call inspection','To Do','2026-11-16','High','privatenotetoken')",
          [id, user, workspace, assignment]);
      });
    }
  }
  return { owner, agent, stranger, ws, otherWs, agentTeamMember, ids };
}

async function records() {
  const result = {};
  for (const table of TABLES) {
    result[table] = (await db.query(
      `select to_jsonb(r) - 'crm_search_document' as record from public.${table} r where id=any($1::text[]) order by id`,
      [world.ids[table]])).rows;
  }
  return result;
}

async function policies() {
  return (await db.query(
    "select tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename=any($1::text[]) order by tablename,policyname",
    [TABLES])).rows;
}

async function grants() {
  return (await db.query(
    "select c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text as acl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1::text[]) order by c.relname",
    [TABLES])).rows;
}

async function visible(userId, table, { indexed = false, workspace = null } = {}) {
  return asUser(userId, async () => {
    try {
      const result = await db.query(
        `select id from public.${table} where id=any($1::text[])${workspace ? " and workspace_id=$2" : ""}${indexed ? " and crm_search_document @@ to_tsquery('pg_catalog.simple','searchprobe:*')" : ""} order by id`,
        workspace ? [world.ids[table], workspace] : [world.ids[table]]);
      return { ids: result.rows.map(row => row.id) };
    } catch (error) {
      // Some platform roles are denied at GRANT level rather than returning
      // zero RLS-visible rows. Preserve that distinction across the migration.
      if (error.code !== "42501") throw error;
      return { denied: error.code };
    }
  });
}

before(async () => {
  // Seed BEFORE the new migration, proving the stored documents backfill
  // existing records without rewriting their business fields or permissions.
  db = await migratedDb(name => name < MIGRATION);
  if (!db) return;
  world = await seedWorld();
  originalRecords = await records();
  originalPolicies = await policies();
  originalGrants = await grants();
  originalVisibility = {};
  for (const [role, user] of [["owner", world.owner], ["agent", world.agent], ["stranger", world.stranger], ["anon", null]]) {
    originalVisibility[role] = {};
    for (const table of TABLES) originalVisibility[role][table] = await visible(user, table);
  }
  await db.exec(readFileSync(join(MIGRATIONS_DIR, MIGRATION), "utf8"));
});

after(async () => { if (db) await db.close(); });

function sqlTest(name, fn) {
  test(name, async t => {
    if (!db) return t.skip(SKIP_MESSAGE);
    await fn();
  });
}

sqlTest("search migration preserves every existing record field, RLS policy, role grant, and RLS flag", async () => {
  assert.deepEqual(await records(), originalRecords);
  assert.deepEqual(await policies(), originalPolicies);
  assert.deepEqual(await grants(), originalGrants);
});

sqlTest("all four search documents are stored generated tsvectors with valid GIN indexes", async () => {
  const columns = (await db.query(
    "select c.relname,a.attgenerated,t.typname from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace join pg_type t on t.oid=a.atttypid where n.nspname='public' and c.relname=any($1::text[]) and a.attname='crm_search_document' order by c.relname",
    [TABLES])).rows;
  assert.deepEqual(columns, TABLES.map(table => ({ relname: table, attgenerated: "s", typname: "tsvector" })));
  const indexes = (await db.query(
    "select tab.relname,am.amname,idx.indisvalid,pg_get_indexdef(idx.indexrelid) as definition from pg_index idx join pg_class tab on tab.oid=idx.indrelid join pg_namespace n on n.oid=tab.relnamespace join pg_class ind on ind.oid=idx.indexrelid join pg_am am on am.oid=ind.relam where n.nspname='public' and tab.relname=any($1::text[]) and ind.relname=tab.relname || '_crm_search_gin' order by tab.relname",
    [TABLES])).rows;
  assert.equal(indexes.length, TABLES.length);
  for (const index of indexes) {
    assert.equal(index.amname, "gin");
    assert.equal(index.indisvalid, true);
    assert.match(index.definition, /\(crm_search_document\)/);
  }
});

async function matches(table, expression, id = world.ids[table][0]) {
  return (await asService(() => db.query(
    `select id from public.${table} where id=$1 and crm_search_document @@ to_tsquery('pg_catalog.simple',$2)`,
    [id, expression]))).rows.map(row => row.id);
}

sqlTest("existing records match Unicode/punctuation-safe prefixes across every advertised search field", async () => {
  const cases = {
    contacts: ["franç:* & marí:*", "santos:* & example:* & test:*", "92:* & 1234567:*"],
    deals: ["river:* & ridge:*", "qualif:*"],
    properties: ["rue:* & bleue:*", "activ:*", "ab:* & 123:*"],
    tasks: ["call:* & inspect:*", "to:* & do:*", "2026:* & 11:* & 16:*"]
  };
  for (const table of TABLES) {
    for (const expression of cases[table]) assert.deepEqual(await matches(table, expression), [world.ids[table][0]], `${table}: ${expression}`);
    assert.deepEqual(await matches(table, "privatenotetoken:*"), [], `${table}: private notes are outside the search projection`);
    assert.deepEqual(await matches(table, "searchprobe:* & absenttoken:*"), [], `${table}: all supplied terms must match`);
  }
});

sqlTest("generated search documents automatically follow edits, including Arabic and nullable dates", async () => {
  const contact = `search-update-${randomUUID()}`;
  await asService(() => db.query(
    "insert into public.contacts (id,user_id,workspace_id,full_name) values ($1,$2,$3,'Searchbefore')",
    [contact, world.owner, world.ws]));
  assert.deepEqual(await matches("contacts", "searchbefore:*", contact), [contact]);
  await asService(() => db.query("update public.contacts set full_name='Safa صفاء' where id=$1", [contact]));
  assert.deepEqual(await matches("contacts", "صف:*", contact), [contact]);
  assert.deepEqual(await matches("contacts", "searchbefore:*", contact), []);
  const task = `search-task-${randomUUID()}`;
  await asService(() => db.query(
    "insert into public.tasks (id,user_id,workspace_id,title,due_date) values ($1,$2,$3,'Undated inspection',null)",
    [task, world.owner, world.ws]));
  assert.deepEqual(await matches("tasks", "inspect:*", task), [task]);
  await asService(() => db.query("update public.tasks set due_date='2027-02-03' where id=$1", [task]));
  assert.deepEqual(await matches("tasks", "2027:* & 2:* & 3:*", task), [task]);
});

sqlTest("indexed search retains the exact pre-migration owner, agent, stranger, and anonymous visibility", async () => {
  for (const [role, user] of [["owner", world.owner], ["agent", world.agent], ["stranger", world.stranger], ["anon", null]]) {
    for (const table of TABLES) {
      assert.deepEqual(await visible(user, table), originalVisibility[role][table], `${role}/${table}: normal visibility changed`);
      assert.deepEqual(await visible(user, table, { indexed: true }), originalVisibility[role][table], `${role}/${table}: search widened or narrowed RLS`);
    }
  }
  assert.equal(originalVisibility.owner.contacts.ids.length, 2);
  assert.deepEqual(originalVisibility.agent.contacts.ids, [world.ids.contacts[0]], "agent sees assigned contact only");
  assert.equal(originalVisibility.agent.properties.ids.length, 2, "agent's existing all-properties scope remains intact");
});

sqlTest("an explicit workspace filter cannot expose another workspace through the generated document", async () => {
  for (const table of TABLES) {
    assert.deepEqual(await visible(world.owner, table, { indexed: true, workspace: world.otherWs }), { ids: [] });
    assert.deepEqual(await visible(world.stranger, table, { indexed: true, workspace: world.ws }), { ids: [] });
    assert.deepEqual(await visible(world.owner, table, { indexed: true, workspace: world.ws }), originalVisibility.owner[table]);
  }
});

sqlTest("search rollback removes derived documents while preserving all business records", async () => {
  const snapshot=async()=>Promise.all(TABLES.map(async table=>(await db.query("select to_jsonb(t)-'crm_search_document' as row from public."+table+" t order by id")).rows));
  const before=await snapshot();
  await db.exec(readFileSync(new URL("../../supabase/rollback/20261116070656_crm_scoped_search.sql",import.meta.url),"utf8"));
  assert.deepEqual(await snapshot(),before);
  const columns=(await db.query("select table_name from information_schema.columns where table_schema='public' and column_name='crm_search_document'")).rows;
  assert.deepEqual(columns,[]);
});
