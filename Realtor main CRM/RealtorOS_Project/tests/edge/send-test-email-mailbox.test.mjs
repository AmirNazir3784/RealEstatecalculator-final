// send-test-email + mailbox routing: a fresh claim sends the test through
// the caller's connected personal mailbox when one exists (proving the
// exact path automation mail will take); an ambiguous mailbox outcome
// leaves the row queued, and the leased retry resolves it terminally
// WITHOUT sending again (mailbox sends have no idempotency key). Without
// a mailbox, the original Resend behavior is unchanged.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { FakeDb } from "../helpers/fake-db.mjs";

const oauth = await import(
  new URL("../../supabase/functions/_shared/mailbox-oauth.ts", import.meta.url).href
);
const ENC_KEY = Buffer.from(new Uint8Array(32).fill(11)).toString("base64");
const USER = "44444444-4444-4444-8444-444444444444";
const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const TEMPLATE = "66666666-6666-4666-8666-666666666666";
const BASE_ENV = {
  SUPABASE_URL: "https://unit-test.supabase.co",
  SUPABASE_ANON_KEY: "anon-test-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
  GOOGLE_CLIENT_ID: "test-client-id",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  MAILBOX_TOKEN_ENCRYPTION_KEY: ENC_KEY,
};

let handler;
let realFetch;
beforeEach(async () => {
  realFetch = globalThis.fetch;
  globalThis.__edge.setEnv(BASE_ENV);
  handler = await globalThis.__edge.load("send-test-email");
});
afterEach(() => { globalThis.fetch = realFetch; });

function scenario({ mailbox = false } = {}) {
  const db = new FakeDb();
  db.users.set("test-token", USER);
  db.seed("email_sender_profiles", [{
    user_id: USER, display_name: "Agent Smith",
    reply_to_email: "agent@example.org", is_enabled: true, provider: "resend",
  }]);
  db.seed("message_templates", [{
    id: TEMPLATE, user_id: USER, name: "Intro", channel: "email",
    subject: "Hello there", body_text: "Test body", is_active: true,
  }]);
  if (mailbox) {
    db.seed("workspace_members", [{
      id: randomUUID(), workspace_id: WORKSPACE, user_id: USER,
      role: "owner", status: "active", created_at: "2026-09-01T00:00:00Z",
    }]);
  }
  // The claim RPC contract, faked: first sight of a key creates the row
  // (provider 'resend', the sender address it was given); a queued row
  // re-claims as retry_claimed; a terminal row returns as existing.
  db.rpc("realtoros_claim_test_send", async (args, dbRef) => {
    const existing = dbRef.table("outbound_messages")
      .find((r) => r.idempotency_key === args.p_idempotency_key);
    if (!existing) {
      const id = randomUUID();
      dbRef.seed("outbound_messages", [{
        id, user_id: args.p_user_id, template_id: args.p_template_id,
        message_kind: "test", idempotency_key: args.p_idempotency_key,
        channel: "email", provider: "resend", recipient: args.p_recipient,
        subject: args.p_subject, body_snapshot: args.p_body_snapshot,
        sender_display_name: args.p_sender_display_name,
        sender_address: args.p_sender_address, reply_to_email: args.p_reply_to_email,
        status: "queued", queued_at: new Date().toISOString(),
        provider_message_id: null, sent_at: null, delivered_at: null,
        failed_at: null, error_code: null, error_message: null,
      }]);
      return { outcome: "created", message_id: id };
    }
    if (existing.status === "queued") return { outcome: "retry_claimed", message_id: existing.id };
    return { outcome: "existing", message_id: existing.id };
  });
  db.install();
  return db;
}

async function seedGmail(db) {
  const enc = await oauth.encryptRefreshToken(ENC_KEY, "refresh-token-1");
  db.seed("mailbox_connections", [{
    id: randomUUID(), workspace_id: WORKSPACE, user_id: USER,
    kind: "personal", provider: "gmail", email_address: "agent@gmail.com",
    refresh_token_ciphertext: enc.ciphertext, refresh_token_iv: enc.iv,
    status: "connected", last_error_code: null,
  }]);
}

function request(key = randomUUID()) {
  return new Request("https://unit-test.supabase.co/functions/v1/send-test-email", {
    method: "POST",
    headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
    body: JSON.stringify({ template_id: TEMPLATE, idempotency_key: key }),
  });
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

test("mailbox test send: fresh claim sends via Gmail — Resend not configured, never called", async () => {
  const db = scenario({ mailbox: true });
  await seedGmail(db);
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes("oauth2.googleapis.com/token")) return json({ access_token: "ya29.test" });
    if (String(url).includes("gmail.googleapis.com")) return json({ id: "gmail_msg_9" });
    return json({ id: "re_msg_123" });
  };
  const res = await handler(request());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.message.status, "sent");
  assert.equal(body.message.sender_address, "agent@gmail.com");
  assert.equal(body.message.provider_message_id, "gmail_msg_9");
  assert.equal(calls.filter((u) => u.includes("api.resend.com")).length, 0);
  const row = db.table("outbound_messages")[0];
  assert.equal(row.provider, "gmail");
  assert.equal(row.status, "sent");
});

test("mailbox ambiguity: row stays queued; the same-key retry resolves it terminally without resending", async () => {
  const db = scenario({ mailbox: true });
  await seedGmail(db);
  let gmailSendCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes("oauth2.googleapis.com/token")) return json({ access_token: "ya29.test" });
    if (String(url).includes("gmail.googleapis.com")) { gmailSendCalls++; throw new Error("socket hangup"); }
    return json({ id: "re_msg_123" });
  };
  const key = randomUUID();
  const first = await handler(request(key));
  const firstBody = await first.json();
  assert.equal(firstBody.ok, false);
  assert.equal(firstBody.error, "provider_ambiguous");
  assert.equal(db.table("outbound_messages")[0].status, "queued");
  assert.equal(db.table("outbound_messages")[0].provider, "gmail");

  const second = await handler(request(key));
  const secondBody = await second.json();
  assert.equal(secondBody.ok, true);
  assert.equal(secondBody.message.status, "failed");
  assert.equal(secondBody.message.error_code, "mailbox_outcome_unconfirmed");
  assert.equal(gmailSendCalls, 1, "the retry must never send again");
});

test("no mailbox: the original Resend path is unchanged", async () => {
  globalThis.__edge.setEnv({
    ...BASE_ENV, RESEND_API_KEY: "re_test_key", RESEND_SENDING_DOMAIN: "mail.example.com",
  });
  const db = scenario();
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return json({ id: "re_msg_123" });
  };
  const res = await handler(request());
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.message.status, "sent");
  assert.equal(calls.filter((u) => u.includes("api.resend.com")).length, 1);
  assert.equal(db.table("outbound_messages")[0].provider, "resend");
});

test("mailbox connected but its secrets missing, Resend unconfigured: provider_not_configured", async () => {
  globalThis.__edge.setEnv({ SUPABASE_URL: BASE_ENV.SUPABASE_URL, SUPABASE_ANON_KEY: BASE_ENV.SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: BASE_ENV.SUPABASE_SERVICE_ROLE_KEY });
  const db = scenario({ mailbox: true });
  await seedGmail(db);
  globalThis.fetch = async () => json({ id: "re_msg_123" });
  const res = await handler(request());
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, "provider_not_configured");
  assert.equal(db.table("outbound_messages").length, 0, "no claim may happen without a transport");
});
