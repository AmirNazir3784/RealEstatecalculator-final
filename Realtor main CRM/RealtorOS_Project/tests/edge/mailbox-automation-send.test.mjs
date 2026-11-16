// process-automation + mailbox routing: an automation email job sends
// from the acting member's connected Gmail; a revoked token marks the
// connection errored and falls back to Resend inside the same attempt; a
// Gmail network failure closes the message 'unconfirmed' and never falls
// back (Gmail has no idempotency key, so a retry could duplicate).
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  automationScenario, mockFetch, workerRequest, WORKER_ENV, OWNER, WORKSPACE,
} from "../helpers/automation-fixture.mjs";

const oauth = await import(
  new URL("../../supabase/functions/_shared/mailbox-oauth.ts", import.meta.url).href
);
const ENC_KEY = Buffer.from(new Uint8Array(32).fill(11)).toString("base64");
const ENV = {
  ...WORKER_ENV,
  GOOGLE_CLIENT_ID: "test-client-id",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  MAILBOX_TOKEN_ENCRYPTION_KEY: ENC_KEY,
};

let handler;
let fetchMock;
beforeEach(async () => {
  globalThis.__edge.setEnv(ENV);
  handler = await globalThis.__edge.load("process-automation");
});
afterEach(() => fetchMock?.restore());

async function seedMailbox(db, { token = "refresh-token-1" } = {}) {
  const enc = await oauth.encryptRefreshToken(ENC_KEY, token);
  const connectionId = randomUUID();
  db.seed("workspace_members", [{
    id: randomUUID(), workspace_id: WORKSPACE, user_id: OWNER,
    role: "owner", status: "active", created_at: "2026-09-01T00:00:00Z",
  }]);
  db.seed("mailbox_connections", [{
    id: connectionId, workspace_id: WORKSPACE, user_id: OWNER,
    kind: "personal", provider: "gmail", email_address: "agent@gmail.com",
    refresh_token_ciphertext: enc.ciphertext, refresh_token_iv: enc.iv,
    status: "connected", last_error_code: null,
  }]);
  return connectionId;
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const resendCalls = () => fetchMock.calls.filter((c) => c.url.includes("api.resend.com"));
const gmailCalls = () => fetchMock.calls.filter((c) => c.url.includes("gmail.googleapis.com"));

test("connected Gmail: the job sends from the member's mailbox, Resend untouched", async () => {
  const { db, jobId } = automationScenario();
  await seedMailbox(db);
  db.install();
  fetchMock = mockFetch((url) => {
    if (url.includes("oauth2.googleapis.com/token")) return json({ access_token: "ya29.test" });
    if (url.includes("gmail.googleapis.com")) return json({ id: "gmail_msg_1" });
    return json({ id: "re_msg_123" });
  });
  const res = await handler(workerRequest());
  assert.equal(res.status, 200);
  assert.equal(gmailCalls().length, 1);
  assert.equal(resendCalls().length, 0);
  const msg = db.table("outbound_messages")[0];
  assert.equal(msg.provider, "gmail");
  assert.equal(msg.sender_address, "agent@gmail.com");
  assert.equal(msg.status, "sent");
  assert.equal(msg.provider_message_id, "gmail_msg_1");
  assert.equal(db.table("automation_jobs").find((j) => j.id === jobId).status, "completed");
});

test("revoked Gmail token: connection marked errored, same attempt falls back to Resend", async () => {
  const { db, jobId } = automationScenario();
  const connectionId = await seedMailbox(db);
  db.install();
  fetchMock = mockFetch((url) => {
    if (url.includes("oauth2.googleapis.com/token")) {
      return json({ error: "invalid_grant" }, 400);
    }
    return json({ id: "re_msg_123" });
  });
  const res = await handler(workerRequest());
  assert.equal(res.status, 200);
  assert.equal(resendCalls().length, 1);
  const connection = db.table("mailbox_connections").find((c) => c.id === connectionId);
  assert.equal(connection.status, "error");
  assert.equal(connection.last_error_code, "token_revoked");
  const msg = db.table("outbound_messages")[0];
  assert.equal(msg.provider, "resend");
  assert.equal(msg.status, "sent");
  assert.equal(db.table("automation_jobs").find((j) => j.id === jobId).status, "completed");
});

test("Gmail network failure: message unconfirmed, job terminal, Resend never tried", async () => {
  const { db, jobId } = automationScenario();
  await seedMailbox(db);
  db.install();
  fetchMock = mockFetch((url) => {
    if (url.includes("oauth2.googleapis.com/token")) return json({ access_token: "ya29.test" });
    if (url.includes("gmail.googleapis.com")) throw new Error("socket hangup");
    return json({ id: "re_msg_123" });
  });
  const res = await handler(workerRequest());
  assert.equal(res.status, 200);
  assert.equal(resendCalls().length, 0);
  const msg = db.table("outbound_messages")[0];
  assert.equal(msg.provider, "gmail");
  assert.equal(msg.status, "unconfirmed");
  const job = db.table("automation_jobs").find((j) => j.id === jobId);
  assert.equal(job.last_error_code, "gmail_outcome_unconfirmed");
});

test("no mailbox connected: behavior is the original Resend path", async () => {
  const { db, jobId } = automationScenario();
  db.seed("workspace_members", [{
    id: randomUUID(), workspace_id: WORKSPACE, user_id: OWNER,
    role: "owner", status: "active", created_at: "2026-09-01T00:00:00Z",
  }]);
  db.install();
  fetchMock = mockFetch();
  const res = await handler(workerRequest());
  assert.equal(res.status, 200);
  assert.equal(resendCalls().length, 1);
  const msg = db.table("outbound_messages")[0];
  assert.equal(msg.provider, "resend");
  assert.equal(msg.status, "sent");
  assert.equal(db.table("automation_jobs").find((j) => j.id === jobId).status, "completed");
});
