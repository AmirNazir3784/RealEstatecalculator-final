// Connected Mailbox (Phase 3): the real data service over a fake
// functions.invoke — status validation, consent-URL validation, policy
// and disconnect calls, and allowlisted error codes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { browser, SKIP_DOM } from "../helpers/browser.mjs";

const plain = (v) => JSON.parse(JSON.stringify(v));
const deq = (actual, expected, message) => assert.deepEqual(plain(actual), plain(expected), message);
const USER = "44444444-4444-4444-8444-444444444444";
const WORKSPACE = "22222222-2222-4222-8222-222222222222";

async function dataService(t, answer) {
  const b = await browser(["assets/js/core/utils.js", "assets/js/data/data-service.js"]);
  if (!b) { t.skip(SKIP_DOM); return null; }
  const calls = [];
  b.window.App.cloud = {
    getUser: () => ({ id: USER }),
    getClient: () => ({
      functions: {
        invoke: async (name, { body }) => {
          calls.push({ name, body: plain(body) });
          return answer(body);
        },
      },
    }),
  };
  return { ...b, calls, data: b.window.App.data };
}

const GMAIL_VIEW = {
  provider: "gmail", email_address: "agent@gmail.com",
  status: "connected", connected_at: "2026-11-16T10:00:00.000Z",
};
const STATUS = {
  workspaceId: WORKSPACE,
  role: "owner",
  canManageShared: true,
  personal: { gmail: GMAIL_VIEW, microsoft: null },
  shared: { gmail: null, microsoft: null },
  policy: { mode: "members_own" },
};

test("mailbox status: one invoke, strictly validated, normalized shape", async (t) => {
  const d = await dataService(t, () => ({ data: STATUS, error: null }));
  if (!d) return;
  const status = await d.data.getMailboxStatus();
  deq(d.calls, [{ name: "mailbox-connect", body: { action: "status" } }]);
  deq(status, STATUS);
  d.close();
});

test("mailbox status: a malformed payload is never trusted", async (t) => {
  const bad = { ...STATUS, personal: { gmail: { ...GMAIL_VIEW, email_address: "not-an-email" }, microsoft: null } };
  const d = await dataService(t, () => ({ data: bad, error: null }));
  if (!d) return;
  await assert.rejects(() => d.data.getMailboxStatus(), /Unexpected response/);
  d.close();

  // A view filed under the wrong provider key is rejected too.
  const swapped = { ...STATUS, personal: { gmail: null, microsoft: GMAIL_VIEW } };
  const d2 = await dataService(t, () => ({ data: swapped, error: null }));
  if (!d2) return;
  await assert.rejects(() => d2.data.getMailboxStatus(), /Unexpected response/);
  d2.close();

  const badPolicy = { ...STATUS, policy: { mode: "everyone" } };
  const d3 = await dataService(t, () => ({ data: badPolicy, error: null }));
  if (!d3) return;
  await assert.rejects(() => d3.data.getMailboxStatus(), /Unexpected response/);
  d3.close();
});

test("mailbox start: only the provider's own consent URL is accepted back", async (t) => {
  const d = await dataService(t, () => ({
    data: { authUrl: "https://accounts.google.com/o/oauth2/v2/auth?client_id=x" },
    error: null,
  }));
  if (!d) return;
  const { authUrl } = await d.data.startMailboxConnect("personal", "gmail");
  assert.match(authUrl, /^https:\/\/accounts\.google\.com\//);
  deq(d.calls[0].body, { action: "start", kind: "personal", provider: "gmail" });
  d.close();

  const ms = await dataService(t, () => ({
    data: { authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=x" },
    error: null,
  }));
  if (!ms) return;
  const msStart = await ms.data.startMailboxConnect("shared", "microsoft");
  assert.match(msStart.authUrl, /^https:\/\/login\.microsoftonline\.com\//);
  deq(ms.calls[0].body, { action: "start", kind: "shared", provider: "microsoft" });
  ms.close();

  // A Google URL handed back for a Microsoft start is not trusted.
  const evil = await dataService(t, () => ({
    data: { authUrl: "https://accounts.google.com/o/oauth2/v2/auth?client_id=x" },
    error: null,
  }));
  if (!evil) return;
  await assert.rejects(() => evil.data.startMailboxConnect("shared", "microsoft"), /Unexpected response/);
  evil.close();
});

test("mailbox disconnect + policy: bodies are exact; invalid input never invokes", async (t) => {
  const d = await dataService(t, (body) => body.action === "set_policy"
    ? { data: { policy: { mode: "shared" } }, error: null }
    : { data: { disconnected: true }, error: null });
  if (!d) return;
  deq(await d.data.disconnectMailbox("shared", "microsoft"), { disconnected: true });
  deq(await d.data.setMailboxPolicy("shared"), { mode: "shared" });
  deq(d.calls.map((c) => c.body), [
    { action: "disconnect", kind: "shared", provider: "microsoft" },
    { action: "set_policy", mode: "shared" },
  ]);
  await assert.rejects(() => d.data.setMailboxPolicy("everyone"), /valid sending policy/);
  await assert.rejects(() => d.data.disconnectMailbox("work", "gmail"), /valid mailbox kind/);
  await assert.rejects(() => d.data.disconnectMailbox("shared", "yahoo"), /valid mailbox provider/);
  assert.equal(d.calls.length, 2, "invalid input must not reach the function");
  d.close();
});

test("mailbox errors: allowlisted codes surface with .code; unknown codes do not", async (t) => {
  const known = await dataService(t, () => ({
    data: null,
    error: { context: { json: async () => ({ error: "admin_required" }) } },
  }));
  if (!known) return;
  await assert.rejects(
    () => known.data.startMailboxConnect("shared", "gmail"),
    (err) => err.code === "admin_required",
  );
  known.close();

  const unknown = await dataService(t, () => ({
    data: { error: "some_internal_detail_with_secrets" },
    error: null,
  }));
  if (!unknown) return;
  await assert.rejects(() => unknown.data.getMailboxStatus(), /Unexpected response/);
  unknown.close();
});
