// mailbox-send: route planning (the workspace policy), MIME building with
// header-injection guards, Gmail token exchange + send outcome mapping,
// and route resolution against a stubbed database.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

const send = await import(
  new URL("../../supabase/functions/_shared/mailbox-send.ts", import.meta.url).href
);
const oauth = await import(
  new URL("../../supabase/functions/_shared/mailbox-oauth.ts", import.meta.url).href
);

const ENC_KEY = Buffer.from(new Uint8Array(32).fill(11)).toString("base64");
const conn = (overrides = {}) => ({
  id: "c-1", kind: "personal", provider: "gmail",
  email_address: "agent@gmail.com",
  refresh_token_ciphertext: "x", refresh_token_iv: "y",
  status: "connected", ...overrides,
});

// ------------------------------------------------------------ planRoute

test("route: members_own = personal, shared, resend", () => {
  const steps = send.planRoute("members_own", [conn()], [conn({ id: "c-2", kind: "shared" })]);
  assert.deepEqual(steps.map((s) => s.via), ["gmail", "gmail", "resend"]);
  assert.equal(steps[0].connection.kind, "personal");
  assert.equal(steps[1].connection.kind, "shared");
});

test("route: shared policy = shared, resend (personal never used)", () => {
  const steps = send.planRoute("shared", [conn()], [conn({ id: "c-2", kind: "shared" })]);
  assert.deepEqual(steps.map((s) => s.via), ["gmail", "resend"]);
  assert.equal(steps[0].connection.kind, "shared");
});

test("route: no usable connection = resend only; error/revoked/unknown-provider excluded", () => {
  assert.deepEqual(send.planRoute("members_own", [], []).map((s) => s.via), ["resend"]);
  assert.deepEqual(
    send.planRoute("members_own", [conn({ status: "error" })], [conn({ provider: "yahoo", kind: "shared" })]).map((s) => s.via),
    ["resend"],
  );
  // Shared policy with no shared mailbox falls straight to Resend.
  assert.deepEqual(send.planRoute("shared", [conn()], []).map((s) => s.via), ["resend"]);
});

test("route: both providers connected — Gmail before Microsoft within a kind", () => {
  const steps = send.planRoute("members_own", [
    conn({ id: "ms", provider: "microsoft", email_address: "agent@outlook.com" }),
    conn({ id: "g", provider: "gmail" }),
  ], []);
  assert.deepEqual(steps.map((s) => s.via), ["gmail", "microsoft", "resend"]);
  // A Microsoft-only member routes through Microsoft.
  const msOnly = send.planRoute("members_own", [
    conn({ id: "ms", provider: "microsoft", email_address: "agent@outlook.com" }),
  ], []);
  assert.deepEqual(msOnly.map((s) => s.via), ["microsoft", "resend"]);
});

// ------------------------------------------------------------ MIME

test("mime: structure, reply-to list, unsubscribe headers, CRLF", () => {
  const raw = send.buildMimeMessage({
    fromName: "Agent Smith", fromEmail: "agent@gmail.com",
    to: "lead@example.com", replyTo: ["agent@example.org", "reply@in.example"],
    subject: "Following up", text: "Hello Lead,",
    headers: { "List-Unsubscribe": "<https://example.com/u>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  });
  assert.match(raw, /^From: "Agent Smith" <agent@gmail\.com>\r\n/);
  assert.match(raw, /To: lead@example\.com\r\n/);
  assert.match(raw, /Reply-To: agent@example\.org, reply@in\.example\r\n/);
  assert.match(raw, /Subject: Following up\r\n/);
  assert.match(raw, /List-Unsubscribe: <https:\/\/example\.com\/u>\r\n/);
  assert.ok(raw.endsWith("\r\n\r\nHello Lead,"));
});

test("mime: header injection is rejected outright", () => {
  const base = {
    fromName: "Agent", fromEmail: "a@gmail.com", to: "l@example.com",
    replyTo: [], subject: "Hi", text: "x",
  };
  assert.throws(() => send.buildMimeMessage({ ...base, subject: "Hi\r\nBcc: evil@example.com" }));
  assert.throws(() => send.buildMimeMessage({ ...base, to: "l@example.com\nBcc: e@x.io" }));
  assert.throws(() => send.buildMimeMessage({ ...base, headers: { "X-Test": "a\r\nInjected: 1" } }));
});

// ------------------------------------------------------------ Gmail send

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

async function gmailConnection() {
  const enc = await oauth.encryptRefreshToken(ENC_KEY, "refresh-token-1");
  return conn({ refresh_token_ciphertext: enc.ciphertext, refresh_token_iv: enc.iv });
}
const MESSAGE = {
  fromName: "Agent Smith", fromEmail: "agent@gmail.com",
  to: "lead@example.com", replyTo: [], subject: "Hi", text: "Hello",
};
const CREDS = { encryptionKey: ENC_KEY, clientId: "cid", clientSecret: "csecret" };

test("gmail: token exchange + send success returns the Gmail message id", async () => {
  const seen = [];
  globalThis.fetch = async (url, init = {}) => {
    seen.push(String(url));
    if (String(url).includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "ya29.x" }), { status: 200 });
    }
    // The raw MIME is base64url in the JSON body.
    const parsed = JSON.parse(init.body);
    const mime = Buffer.from(parsed.raw.replaceAll("-", "+").replaceAll("_", "/"), "base64").toString("utf8");
    assert.match(mime, /To: lead@example\.com/);
    return new Response(JSON.stringify({ id: "gmail-123" }), { status: 200 });
  };
  const result = await send.sendViaGmail({ connection: await gmailConnection(), ...CREDS, message: MESSAGE });
  assert.deepEqual(result, { outcome: "sent", providerMessageId: "gmail-123" });
  assert.equal(seen.length, 2);
});

test("gmail: invalid_grant is a definitive rejection flagged tokenInvalid", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
  const result = await send.sendViaGmail({ connection: await gmailConnection(), ...CREDS, message: MESSAGE });
  assert.equal(result.outcome, "rejected");
  assert.equal(result.tokenInvalid, true);
  assert.equal(result.code, "token_revoked");
});

test("gmail: a 400 send rejection is definitive (safe to fall back)", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes("oauth2.googleapis.com")) {
      return new Response(JSON.stringify({ access_token: "ya29.x" }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { status: "INVALID_ARGUMENT" } }), { status: 400 });
  };
  const result = await send.sendViaGmail({ connection: await gmailConnection(), ...CREDS, message: MESSAGE });
  assert.equal(result.outcome, "rejected");
  assert.equal(result.tokenInvalid, false);
  assert.equal(result.code, "gmail_invalid_argument");
});

test("gmail: network failure and unreadable success are ambiguous, never rejected", async () => {
  globalThis.fetch = async () => { throw new Error("socket hangup"); };
  const netResult = await send.sendViaGmail({ connection: await gmailConnection(), ...CREDS, message: MESSAGE });
  assert.equal(netResult.outcome, "ambiguous");

  globalThis.fetch = async (url) => {
    if (String(url).includes("oauth2.googleapis.com")) {
      return new Response(JSON.stringify({ access_token: "ya29.x" }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };
  const malformed = await send.sendViaGmail({ connection: await gmailConnection(), ...CREDS, message: MESSAGE });
  assert.equal(malformed.outcome, "ambiguous");
  assert.equal(malformed.code, "send_response_malformed");
});

// ------------------------------------------------------------ Microsoft send

async function microsoftConnection() {
  const enc = await oauth.encryptRefreshToken(ENC_KEY, "ms-refresh-1");
  return conn({
    provider: "microsoft", email_address: "agent@outlook.com",
    refresh_token_ciphertext: enc.ciphertext, refresh_token_iv: enc.iv,
  });
}

test("microsoft: token exchange + 202 returns sent with the rotated refresh token", async () => {
  const seen = [];
  globalThis.fetch = async (url, init = {}) => {
    seen.push(String(url));
    if (String(url).includes("login.microsoftonline.com")) {
      return new Response(JSON.stringify({ access_token: "ms-at", refresh_token: "ms-refresh-2" }), { status: 200 });
    }
    const parsed = JSON.parse(init.body);
    assert.equal(parsed.message.toRecipients[0].emailAddress.address, "lead@example.com");
    assert.equal(parsed.message.subject, "Hi");
    assert.equal(parsed.saveToSentItems, true);
    return new Response(null, { status: 202 });
  };
  const result = await send.sendViaMicrosoft({ connection: await microsoftConnection(), ...CREDS, message: MESSAGE });
  assert.deepEqual(result, { outcome: "sent", providerMessageId: null, rotatedRefreshToken: "ms-refresh-2" });
  assert.equal(seen.length, 2);
});

test("microsoft: invalid_grant is token_revoked; a Graph 403 is a definitive rejection", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
  const revoked = await send.sendViaMicrosoft({ connection: await microsoftConnection(), ...CREDS, message: MESSAGE });
  assert.equal(revoked.outcome, "rejected");
  assert.equal(revoked.code, "token_revoked");
  assert.equal(revoked.tokenInvalid, true);

  globalThis.fetch = async (url) => {
    if (String(url).includes("login.microsoftonline.com")) {
      return new Response(JSON.stringify({ access_token: "ms-at" }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { code: "ErrorAccessDenied" } }), { status: 403 });
  };
  const denied = await send.sendViaMicrosoft({ connection: await microsoftConnection(), ...CREDS, message: MESSAGE });
  assert.equal(denied.outcome, "rejected");
  assert.equal(denied.code, "microsoft_erroraccessdenied");
  assert.equal(denied.tokenInvalid, false);
});

test("microsoft: network failure is ambiguous, never rejected", async () => {
  globalThis.fetch = async () => { throw new Error("socket hangup"); };
  const result = await send.sendViaMicrosoft({ connection: await microsoftConnection(), ...CREDS, message: MESSAGE });
  assert.equal(result.outcome, "ambiguous");
});

// ------------------------------------------------------------ resolveRoute

function stubAdmin(tables) {
  const makeChain = (rows) => {
    const filters = [];
    const chain = {
      select: () => chain,
      eq: (col, val) => { filters.push([col, val]); return chain; },
      limit: () => chain,
      then: (resolve) => resolve({
        data: rows.filter((r) => filters.every(([c, v]) => r[c] === v)),
        error: null,
      }),
    };
    return chain;
  };
  return { from: (table) => makeChain(tables[table] ?? []) };
}

test("resolveRoute: acting member's personal connection wins under members_own", async () => {
  const admin = stubAdmin({
    workspace_members: [
      { workspace_id: "w1", user_id: "u1", role: "owner", status: "active", created_at: "2026-01-01" },
    ],
    workspace_mailbox_policies: [],
    mailbox_connections: [
      { id: "mine", user_id: "u1", workspace_id: "w1", kind: "personal", provider: "gmail", status: "connected", email_address: "me@gmail.com", refresh_token_ciphertext: "x", refresh_token_iv: "y" },
      { id: "theirs", user_id: "u2", workspace_id: "w1", kind: "personal", provider: "gmail", status: "connected", email_address: "them@gmail.com", refresh_token_ciphertext: "x", refresh_token_iv: "y" },
      { id: "shared", user_id: "u1", workspace_id: "w1", kind: "shared", provider: "gmail", status: "connected", email_address: "team@gmail.com", refresh_token_ciphertext: "x", refresh_token_iv: "y" },
    ],
  });
  const route = await send.resolveRoute(admin, "u1");
  assert.equal(route.workspaceId, "w1");
  assert.deepEqual(
    route.steps.map((s) => (s.via !== "resend" ? s.connection.id : "resend")),
    ["mine", "shared", "resend"],
  );
});

test("resolveRoute: a Microsoft personal connection routes as a microsoft step", async () => {
  const admin = stubAdmin({
    workspace_members: [
      { workspace_id: "w1", user_id: "u1", role: "agent", status: "active", created_at: "2026-01-01" },
    ],
    workspace_mailbox_policies: [],
    mailbox_connections: [
      { id: "msmine", user_id: "u1", workspace_id: "w1", kind: "personal", provider: "microsoft", status: "connected", email_address: "me@outlook.com", refresh_token_ciphertext: "x", refresh_token_iv: "y" },
    ],
  });
  const route = await send.resolveRoute(admin, "u1");
  assert.deepEqual(route.steps.map((s) => s.via), ["microsoft", "resend"]);
});

test("resolveRoute: no membership or empty tables degrade to plain Resend", async () => {
  const route = await send.resolveRoute(stubAdmin({}), "nobody");
  assert.deepEqual(route.steps.map((s) => s.via), ["resend"]);
});
