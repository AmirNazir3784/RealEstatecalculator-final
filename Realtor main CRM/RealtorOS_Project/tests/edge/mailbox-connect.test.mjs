// mailbox-connect: the signed OAuth state token, refresh-token encryption,
// the Google consent URL, and the function's self-authentication (the
// callback carries no Supabase JWT, so a bad state must go nowhere).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const oauth = await import(
  new URL("../../supabase/functions/_shared/mailbox-oauth.ts", import.meta.url)
    .href
);

const SECRET = "test-state-secret-that-is-long-enough-32+";
const ENC_KEY = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
const USER = randomUUID();
const WORKSPACE = randomUUID();
const now = () => Math.floor(Date.now() / 1000);

// ------------------------------------------------------------ state token

test("state: round trip preserves user, workspace and kind", async () => {
  const token = await oauth.createMailboxState(SECRET, {
    userId: USER, workspaceId: WORKSPACE, kind: "shared",
  });
  const v = await oauth.verifyMailboxState(SECRET, token);
  assert.equal(v.ok, true);
  assert.equal(v.state.userId, USER);
  assert.equal(v.state.workspaceId, WORKSPACE);
  assert.equal(v.state.kind, "shared");
});

test("state: tampered payload and wrong secret are rejected", async () => {
  const token = await oauth.createMailboxState(SECRET, {
    userId: USER, workspaceId: WORKSPACE, kind: "personal",
  });
  const [v, payload, sig] = token.split(".");
  const forged = `${v}.${payload.replace(/.$/, "A")}.${sig}`;
  assert.equal((await oauth.verifyMailboxState(SECRET, forged)).ok, false);
  assert.equal(
    (await oauth.verifyMailboxState("x".repeat(40), token)).ok,
    false,
  );
  assert.equal((await oauth.verifyMailboxState(SECRET, "garbage")).ok, false);
  assert.equal((await oauth.verifyMailboxState(SECRET, "")).ok, false);
});

test("state: expired tokens are rejected as expired", async () => {
  const token = await oauth.createMailboxState(SECRET, {
    userId: USER, workspaceId: WORKSPACE, kind: "personal",
    nowSeconds: now() - oauth.STATE_LIFETIME_SECONDS - 60,
  });
  const v = await oauth.verifyMailboxState(SECRET, token);
  assert.equal(v.ok, false);
  assert.equal(v.reason, "expired");
});

// ------------------------------------------------------------ token crypto

test("crypto: refresh token round trip; wrong key and tampering fail", async () => {
  const { ciphertext, iv } = await oauth.encryptRefreshToken(
    ENC_KEY, "1//refresh-token-value",
  );
  assert.notEqual(ciphertext, "1//refresh-token-value");
  assert.equal(
    await oauth.decryptRefreshToken(ENC_KEY, ciphertext, iv),
    "1//refresh-token-value",
  );
  const otherKey = Buffer.from(new Uint8Array(32).fill(9)).toString("base64");
  await assert.rejects(() =>
    oauth.decryptRefreshToken(otherKey, ciphertext, iv));
  await assert.rejects(() =>
    oauth.decryptRefreshToken(ENC_KEY, ciphertext.slice(0, -4) + "AAAA", iv));
  await assert.rejects(() => oauth.encryptRefreshToken("short", "x"));
});

// ------------------------------------------------------------ consent URL

test("consent URL: send-only scopes, offline access, forced consent", () => {
  const url = new URL(oauth.buildGoogleAuthUrl({
    clientId: "client-123",
    redirectUri: "https://example.supabase.co/functions/v1/mailbox-connect",
    state: "m1.payload.sig",
  }));
  assert.equal(url.host, "accounts.google.com");
  const scope = url.searchParams.get("scope");
  assert.match(scope, /gmail\.send/);
  assert.match(scope, /openid email/);
  assert.doesNotMatch(scope, /gmail\.readonly|gmail\.modify|mail\.google/);
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(url.searchParams.get("state"), "m1.payload.sig");
});

test("state: the provider survives the round trip; gmail is the default", async () => {
  const msToken = await oauth.createMailboxState(SECRET, {
    userId: USER, workspaceId: WORKSPACE, kind: "personal", provider: "microsoft",
  });
  const ms = await oauth.verifyMailboxState(SECRET, msToken);
  assert.equal(ms.ok, true);
  assert.equal(ms.state.provider, "microsoft");
  const gToken = await oauth.createMailboxState(SECRET, {
    userId: USER, workspaceId: WORKSPACE, kind: "personal",
  });
  const g = await oauth.verifyMailboxState(SECRET, gToken);
  assert.equal(g.ok, true);
  assert.equal(g.state.provider, "gmail");
});

test("microsoft consent URL: Graph send scope + offline access on the Microsoft host", () => {
  const url = new URL(oauth.buildMicrosoftAuthUrl({
    clientId: "client-456",
    redirectUri: "https://example.supabase.co/functions/v1/mailbox-connect",
    state: "m1.payload.sig",
  }));
  assert.equal(url.host, "login.microsoftonline.com");
  const scope = url.searchParams.get("scope");
  assert.match(scope, /graph\.microsoft\.com\/Mail\.Send/);
  assert.match(scope, /offline_access/);
  assert.doesNotMatch(scope, /Mail\.Read|Mail\.ReadWrite|Calendars/);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("state"), "m1.payload.sig");
});

// ------------------------------------------------------------ HTTP handler

let handler;
beforeEach(async () => {
  globalThis.__edge.setEnv({
    MAILBOX_APP_URL: "https://crm.example.com",
    MAILBOX_OAUTH_STATE_SECRET: SECRET,
  });
  handler = await globalThis.__edge.load("mailbox-connect");
});

const FN = "https://unit-test.supabase.co/functions/v1/mailbox-connect";

test("handler: POST without a JWT is 401", async () => {
  const res = await handler(new Request(FN, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "status" }),
  }));
  assert.equal(res.status, 401);
});

test("handler: callback with a forged state redirects to an error, never connects", async () => {
  const res = await handler(new Request(
    `${FN}?code=fake-code&state=m1.forged.state`,
    { method: "GET" },
  ));
  assert.equal(res.status, 302);
  const location = res.headers.get("location");
  assert.match(location, /mailbox=error/);
  assert.doesNotMatch(location, /connected/);
});

test("handler: callback without code/state redirects to an error", async () => {
  const res = await handler(new Request(FN, { method: "GET" }));
  assert.equal(res.status, 302);
  assert.match(res.headers.get("location"), /mailbox=error/);
});
