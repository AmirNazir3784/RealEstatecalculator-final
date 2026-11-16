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

const STATUS = {
  workspaceId: WORKSPACE,
  role: "owner",
  canManageShared: true,
  personal: {
    provider: "gmail", email_address: "agent@gmail.com",
    status: "connected", connected_at: "2026-11-16T10:00:00.000Z",
  },
  shared: null,
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
  const bad = { ...STATUS, personal: { ...STATUS.personal, email_address: "not-an-email" } };
  const d = await dataService(t, () => ({ data: bad, error: null }));
  if (!d) return;
  await assert.rejects(() => d.data.getMailboxStatus(), /Unexpected response/);
  d.close();

  const badPolicy = { ...STATUS, policy: { mode: "everyone" } };
  const d2 = await dataService(t, () => ({ data: badPolicy, error: null }));
  if (!d2) return;
  await assert.rejects(() => d2.data.getMailboxStatus(), /Unexpected response/);
  d2.close();
});

test("mailbox start: only a Google consent URL is accepted back", async (t) => {
  const d = await dataService(t, () => ({
    data: { authUrl: "https://accounts.google.com/o/oauth2/v2/auth?client_id=x" },
    error: null,
  }));
  if (!d) return;
  const { authUrl } = await d.data.startMailboxConnect("personal");
  assert.match(authUrl, /^https:\/\/accounts\.google\.com\//);
  deq(d.calls[0].body, { action: "start", kind: "personal" });
  d.close();

  const evil = await dataService(t, () => ({
    data: { authUrl: "https://evil.example.com/phish" },
    error: null,
  }));
  if (!evil) return;
  await assert.rejects(() => evil.data.startMailboxConnect("shared"), /Unexpected response/);
  evil.close();
});

test("mailbox disconnect + policy: bodies are exact; invalid input never invokes", async (t) => {
  const d = await dataService(t, (body) => body.action === "set_policy"
    ? { data: { policy: { mode: "shared" } }, error: null }
    : { data: { disconnected: true }, error: null });
  if (!d) return;
  deq(await d.data.disconnectMailbox("shared"), { disconnected: true });
  deq(await d.data.setMailboxPolicy("shared"), { mode: "shared" });
  deq(d.calls.map((c) => c.body), [
    { action: "disconnect", kind: "shared" },
    { action: "set_policy", mode: "shared" },
  ]);
  await assert.rejects(() => d.data.setMailboxPolicy("everyone"), /valid sending policy/);
  await assert.rejects(() => d.data.disconnectMailbox("work"), /valid mailbox kind/);
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
    () => known.data.startMailboxConnect("shared"),
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
