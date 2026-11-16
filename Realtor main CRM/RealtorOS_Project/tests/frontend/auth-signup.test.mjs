// Signup confirmation experience + gate validation (2026-11-08 task).
//
// The gate (assets/js/data/supabase-client.js) is driven here against a
// stubbed Supabase client in jsdom: no network, no real accounts. The
// stub records calls so the tests can prove what the UI asked the auth
// API to do - and, for the invalid cases, that it asked for nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { browser, settle, SKIP_DOM } from "../helpers/browser.mjs";

const SCRIPTS = ["assets/js/config.js", "assets/js/data/supabase-client.js"];
const STRONG = "Str0ng!Pass";

async function gate(t, { resendImpl, signInImpl, signUpImpl, oauthImpl } = {}) {
  const b = await browser(SCRIPTS);
  if (!b) { t.skip(SKIP_DOM); return null; }
  const { window } = b;
  // jsdom has no layout engine; the gate's mode transition asks
  // matchMedia about reduced motion / width. A plain "no" answer makes
  // transitions instant, which is what these tests want.
  if (!window.matchMedia) {
    window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  }
  const calls = { signUp: [], resend: [], updateUser: [], signIn: [], google: [] };
  let authCallback = null;
  const auth = {
    onAuthStateChange: (cb) => { authCallback = cb; return { data: { subscription: { unsubscribe() {} } } }; },
    getUser: async () => ({ data: { user: null }, error: null }),
    signUp: async (args) => { calls.signUp.push(args); return signUpImpl ? signUpImpl(args) : { data: { user: { id: "u1" }, session: null }, error: null }; },
    resend: async (args) => { calls.resend.push(args); return resendImpl ? resendImpl(args) : { data: {}, error: null }; },
    signInWithPassword: async (args) => { calls.signIn.push(args); return signInImpl ? signInImpl(args) : { data: {}, error: null }; },
    signInWithOAuth: async (args) => { calls.google.push(args); return oauthImpl ? oauthImpl(args) : { error: { message: "Provider unavailable." } }; },
    resetPasswordForEmail: async () => ({ data: {}, error: null }),
    updateUser: async (args) => { calls.updateUser.push(args); return { data: { user: {} }, error: null }; },
    signOut: async () => ({ error: null }),
  };
  window.supabase = { createClient: () => ({ auth }) };
  await window.App.cloud.checkSession();
  await settle(window);
  return {
    b, window, document: window.document, calls, auth,
    fireAuth: (ev, session) => { if (authCallback) authCallback(ev, session); },
  };
}

function fillCreate(g, { name = "Jane Doe", email = "jane@example.com", pw = STRONG, confirm = STRONG } = {}) {
  const d = g.document;
  d.getElementById("cloudCreateTab").click();
  d.getElementById("cloudFullName").value = name;
  d.getElementById("cloudEmail").value = email;
  d.getElementById("cloudPassword").value = pw;
  d.getElementById("cloudPasswordConfirm").value = confirm;
}

async function submit(g, formId = "cloudAuthForm") {
  g.document.getElementById(formId)
    .dispatchEvent(new g.window.Event("submit", { bubbles: true, cancelable: true }));
  await settle(g.window);
  await settle(g.window);
}

const msg = (g, id = "cloudAuthMessage") => g.document.getElementById(id).textContent;

test("signup validation is specific and blocks the request", async (t) => {
  const g = await gate(t);
  if (!g) return;
  try {
    fillCreate(g, { pw: "weak", confirm: "weak" });
    await submit(g);
    assert.match(msg(g), /still needs/i, "a weak password names what is missing");
    assert.equal(g.calls.signUp.length, 0, "and nothing was sent");

    fillCreate(g, { pw: STRONG, confirm: "Different!1A" });
    await submit(g);
    assert.match(msg(g), /do not match/i);
    assert.equal(g.calls.signUp.length, 0);

    fillCreate(g, { email: "not-an-email" });
    await submit(g);
    assert.match(msg(g), /valid email address/i, "a malformed email gets its own message");
    assert.equal(g.calls.signUp.length, 0);

    fillCreate(g, { name: "J" });
    await submit(g);
    assert.match(msg(g), /full name/i);
    assert.equal(g.calls.signUp.length, 0);
  } finally { g.b.close(); }
});

test("a successful signup shows the confirmation state, signed out", async (t) => {
  const g = await gate(t);
  if (!g) return;
  try {
    fillCreate(g, { email: "a.b+tag@example.com" });
    await submit(g);
    assert.equal(g.calls.signUp.length, 1);
    assert.equal(g.calls.signUp[0].email, "a.b+tag@example.com");
    const panel = g.document.getElementById("cloudConfirmPanel");
    assert.equal(panel.hidden, false, "the confirmation state is shown");
    assert.equal(g.document.getElementById("cloudAuthForm").hidden, true, "and the form is gone");
    assert.match(panel.textContent, /Check your email/);
    const emailEl = g.document.getElementById("cloudConfirmEmail");
    assert.equal(emailEl.textContent, "a.b+tag@example.com", "the address is shown");
    assert.equal(emailEl.childElementCount, 0, "as text, never as markup");
  } finally { g.b.close(); }
});

test("resend uses the signup resend API, then cools down", async (t) => {
  const g = await gate(t);
  if (!g) return;
  try {
    fillCreate(g);
    await submit(g);
    const btn = g.document.getElementById("cloudResendBtn");
    btn.click();
    await settle(g.window); await settle(g.window);
    assert.equal(g.calls.resend.length, 1);
    assert.equal(g.calls.resend[0].type, "signup", "the official signup resend operation");
    assert.equal(g.calls.resend[0].email, "jane@example.com");
    assert.match(msg(g, "cloudConfirmMessage"), /Confirmation email requested/);
    assert.equal(btn.disabled, true, "the button rests during the cooldown");
    assert.match(btn.textContent, /\(\d+s\)/, "and says for how long");
    btn.click();
    await settle(g.window);
    assert.equal(g.calls.resend.length, 1, "a second click during cooldown sends nothing");
  } finally { g.b.close(); }
});

test("a resend rate limit is reported plainly", async (t) => {
  const g = await gate(t, {
    resendImpl: async () => ({ data: {}, error: { status: 429, message: "For security purposes, you can only request this once every 60 seconds" } }),
  });
  if (!g) return;
  try {
    fillCreate(g);
    await submit(g);
    g.document.getElementById("cloudResendBtn").click();
    await settle(g.window); await settle(g.window);
    assert.match(msg(g, "cloudConfirmMessage"), /wait a minute/i);
  } finally { g.b.close(); }
});

test("change email keeps the name, drops the passwords; back returns to sign in", async (t) => {
  const g = await gate(t);
  if (!g) return;
  try {
    fillCreate(g, { name: "Janet Doe" });
    await submit(g);
    g.document.getElementById("cloudChangeEmailBtn").click();
    await settle(g.window);
    assert.equal(g.document.getElementById("cloudConfirmPanel").hidden, true);
    assert.equal(g.document.getElementById("cloudAuthForm").hidden, false, "the form is back");
    assert.equal(g.document.getElementById("cloudFullName").value, "Janet Doe", "the name survives");
    assert.equal(g.document.getElementById("cloudEmail").value, "jane@example.com", "the address is there to correct");
    assert.equal(g.document.getElementById("cloudPassword").value, "", "the password is not carried back");
    assert.equal(g.document.getElementById("cloudPasswordConfirm").value, "");

    // Sign up again with the same details, then leave via Back to Sign in.
    g.document.getElementById("cloudPassword").value = STRONG;
    g.document.getElementById("cloudPasswordConfirm").value = STRONG;
    await submit(g);
    assert.equal(g.document.getElementById("cloudConfirmPanel").hidden, false);
    g.document.getElementById("cloudConfirmBackBtn").click();
    await settle(g.window);
    assert.equal(g.document.getElementById("cloudConfirmPanel").hidden, true);
    assert.equal(g.document.getElementById("cloudAuthSubmit").textContent, "Sign in");
  } finally { g.b.close(); }
});

test("create account shows a live password-requirements checklist", async (t) => {
  const g = await gate(t);
  if (!g) return;
  try {
    const d = g.document;
    d.getElementById("cloudCreateTab").click();
    const rules = d.getElementById("cloudPwRules");
    assert.ok(rules, "the requirements checklist exists");
    assert.equal(rules.hidden, false, "the checklist shows in Create account mode");
    assert.equal(d.getElementById("cloudPwLine"), null,
      "the one-sentence line no longer serves the auth form (the Update Password form keeps its own)");
    const item = (k) => rules.querySelector('[data-rule="' + k + '"]');
    const met = () => ["length", "upper", "lower", "number", "symbol"].filter((k) => item(k).classList.contains("met"));
    assert.deepEqual(met(), [], "nothing is ticked before typing");
    const pw = d.getElementById("cloudPassword");
    const type = (v) => { pw.value = v; pw.dispatchEvent(new g.window.Event("input", { bubbles: true })); };
    type("abc");
    assert.deepEqual(met(), ["lower"], "typing ticks only the rules that are met");
    type(STRONG);
    assert.deepEqual(met(), ["length", "upper", "lower", "number", "symbol"], "a strong password ticks every rule");
    assert.equal(rules.classList.contains("all-met"), true, "and the list reports the all-met state");
    d.getElementById("cloudSignInTab").click();
    assert.equal(rules.hidden, true, "and the checklist hides again for Sign in");
  } finally { g.b.close(); }
});

test("confirm feedback appears only after typing, then tracks the match", async (t) => {
  const g = await gate(t);
  if (!g) return;
  try {
    const d = g.document;
    d.getElementById("cloudCreateTab").click();
    const line = d.getElementById("cloudConfirmLine");
    const pw = d.getElementById("cloudPassword");
    const cf = d.getElementById("cloudPasswordConfirm");
    const type = (el, v) => { el.value = v; el.dispatchEvent(new g.window.Event("input", { bubbles: true })); };
    assert.equal(line.hidden, true, "nothing is shown before the user types a confirmation");
    type(pw, STRONG);
    assert.equal(line.hidden, true, "still nothing while the confirmation is empty");
    type(cf, "Str0ng!Pas");
    assert.equal(line.hidden, false);
    assert.match(line.className, /error/);
    assert.equal(line.textContent, "Passwords do not match.");
    type(cf, STRONG);
    assert.match(line.className, /success/);
    assert.equal(line.textContent, "Passwords match.");
    type(pw, "Str0ng!PassX");
    assert.match(line.className, /error/, "editing the password re-evaluates the pair");
    assert.equal(line.textContent, "Passwords do not match.");
  } finally { g.b.close(); }
});

test("sign-in is never subjected to the signup password rules", async (t) => {
  const g = await gate(t);
  if (!g) return;
  try {
    const d = g.document;
    d.getElementById("cloudEmail").value = "jane@example.com";
    d.getElementById("cloudPassword").value = "weak";
    await submit(g);
    assert.equal(g.calls.signIn.length, 1, "an existing short password still signs in");
    assert.equal(g.calls.signIn[0].password, "weak");
  } finally { g.b.close(); }
});

test("gate inputs carry sensible length limits", async (t) => {
  const g = await gate(t);
  if (!g) return;
  try {
    const d = g.document;
    assert.equal(d.getElementById("cloudFullName").maxLength, 80);
    assert.equal(d.getElementById("cloudEmail").maxLength, 254);
    assert.equal(d.getElementById("cloudResetEmail").maxLength, 254);
    assert.equal(d.getElementById("cloudPasswordConfirm").minLength, 10);
    assert.equal(d.getElementById("cloudNewPassword").minLength, 10);
    assert.equal(d.getElementById("cloudNewPasswordConfirm").minLength, 10);
  } finally { g.b.close(); }
});

test("update password enforces the same rule before calling the API", async (t) => {
  const g = await gate(t);
  if (!g) return;
  try {
    g.fireAuth("PASSWORD_RECOVERY", { user: { id: "u1" } });
    await settle(g.window);
    const d = g.document;
    assert.equal(d.getElementById("cloudUpdateForm").hidden, false, "recovery lands on Update password");
    assert.equal(d.getElementById("cloudUpdatePwLine").hidden, false, "with the password line visible");
    assert.match(d.getElementById("cloudUpdatePwLine").textContent, /10\+ characters, including/, "in its neutral state");
    d.getElementById("cloudNewPassword").value = "weak";
    d.getElementById("cloudNewPasswordConfirm").value = "weak";
    await submit(g, "cloudUpdateForm");
    assert.match(msg(g, "cloudUpdateMessage"), /still needs/i);
    assert.equal(g.calls.updateUser.length, 0, "a weak new password never reaches the API");
  } finally { g.b.close(); }
});

test("auth tabs expose their panel and support arrow, Home and End keys", async t => {
  const g = await gate(t); if (!g) return;
  try {
    const d = g.document, signIn = d.getElementById("cloudSignInTab"), create = d.getElementById("cloudCreateTab");
    const panel = d.getElementById(signIn.getAttribute("aria-controls"));
    assert.equal(panel.getAttribute("role"), "tabpanel");
    assert.equal(signIn.tabIndex, 0); assert.equal(create.tabIndex, -1);
    signIn.focus();
    for (const [key, expected] of [["ArrowRight", create], ["Home", signIn], ["End", create], ["ArrowLeft", signIn]]) {
      d.activeElement.dispatchEvent(new g.window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      assert.equal(d.activeElement, expected);
      assert.equal(expected.tabIndex, 0);
      assert.equal(expected.getAttribute("aria-selected"), "true");
      assert.equal(panel.getAttribute("aria-labelledby"), expected.id);
    }
  } finally { g.b.close(); }
});

test("password guidance conveys rule status without relying on color", async t => {
  const g = await gate(t); if (!g) return;
  try {
    fillCreate(g, { pw: "", confirm: "" });
    const d = g.document, pw = d.getElementById("cloudPassword"), rules = d.getElementById("cloudPwRules");
    pw.dispatchEvent(new g.window.Event("input", { bubbles: true }));
    assert.equal(pw.getAttribute("aria-describedby"), rules.id);
    assert.match(rules.firstElementChild.getAttribute("aria-label"), /not yet met$/);
    pw.value = STRONG; pw.dispatchEvent(new g.window.Event("input", { bubbles: true }));
    for (const item of rules.children) assert.match(item.getAttribute("aria-label"), /: met$/);
    d.getElementById("cloudSignInTab").click();
    assert.equal(pw.hasAttribute("aria-describedby"), false);
  } finally { g.b.close(); }
});

test("sign-in blocks duplicate/cross-provider requests and recovers after a network failure", async t => {
  let rejectRequest;
  const g = await gate(t, { signInImpl: () => new Promise((_, reject) => { rejectRequest = reject; }) });
  if (!g) return;
  try {
    const d = g.document, form = d.getElementById("cloudAuthForm"), submitBtn = d.getElementById("cloudAuthSubmit");
    d.getElementById("cloudEmail").value = "jane@example.com";
    d.getElementById("cloudPassword").value = "existing-password";
    await submit(g); await submit(g);
    d.getElementById("cloudOAuthGoogle").dispatchEvent(new g.window.Event("click"));
    d.getElementById("cloudCreateTab").click();
    assert.equal(g.calls.signIn.length, 1); assert.equal(g.calls.google.length, 0);
    assert.equal(form.getAttribute("aria-busy"), "true");
    assert.equal(submitBtn.disabled, true);
    assert.equal(d.getElementById("cloudFullNameField").hidden, true);
    rejectRequest(new Error("Offline")); await settle(g.window);
    assert.match(msg(g), /check your connection/i);
    assert.equal(submitBtn.disabled, false);
    assert.equal(form.getAttribute("aria-busy"), "false");
    assert.equal(d.getElementById("cloudOAuthGoogle").disabled, false);
  } finally { g.b.close(); }
});

test("signup also allows only one request while pending", async t => {
  let resolveRequest;
  const g = await gate(t, { signUpImpl: () => new Promise(resolve => { resolveRequest = resolve; }) });
  if (!g) return;
  try {
    fillCreate(g); await submit(g); await submit(g);
    assert.equal(g.calls.signUp.length, 1);
    assert.equal(g.document.getElementById("cloudAuthSubmit").disabled, true);
    resolveRequest({ data: { user: { id: "u1" }, session: null }, error: null });
    await settle(g.window);
    assert.equal(g.document.getElementById("cloudConfirmPanel").hidden, false);
    assert.equal(g.document.getElementById("cloudAuthForm").getAttribute("aria-busy"), "false");
  } finally { g.b.close(); }
});

test("Google uses the app's own callback and releases controls after provider failure", async t => {
  let resolveRequest;
  const g = await gate(t, { oauthImpl: () => new Promise(resolve => { resolveRequest = resolve; }) });
  if (!g) return;
  try {
    const d = g.document, btn = d.getElementById("cloudOAuthGoogle");
    btn.click(); btn.dispatchEvent(new g.window.Event("click"));
    assert.equal(g.calls.google.length, 1);
    assert.equal(g.calls.google[0].provider, "google");
    assert.equal(g.calls.google[0].options.redirectTo, "https://app.example.test/");
    assert.equal(d.getElementById("cloudAuthSubmit").disabled, true);
    resolveRequest({ error: { message: "Google provider is not enabled." } }); await settle(g.window);
    assert.match(msg(g), /not enabled/);
    assert.equal(btn.disabled, false);
    assert.equal(d.getElementById("cloudAuthSubmit").disabled, false);
    assert.equal(d.querySelectorAll('[id*="Facebook"]').length, 0);
  } finally { g.b.close(); }
});

test("password toggles retain values and expose their state", async t => {
  const g = await gate(t); if (!g) return;
  try {
    fillCreate(g);
    const d = g.document, input = d.getElementById("cloudPassword"), toggle = input.parentElement.querySelector("button");
    toggle.click();
    assert.equal(input.type, "text"); assert.equal(input.value, STRONG);
    assert.equal(toggle.getAttribute("aria-label"), "Hide password");
    assert.equal(toggle.getAttribute("aria-pressed"), "true");
    toggle.click(); assert.equal(input.type, "password");
    assert.equal(toggle.getAttribute("aria-label"), "Show password");
  } finally { g.b.close(); }
});

test("reset navigation keeps focus in the visible form", async t => {
  const g = await gate(t); if (!g) return;
  try {
    const d = g.document, forgot = d.getElementById("cloudForgotLink"), back = d.getElementById("cloudResetBack");
    forgot.focus(); forgot.click();
    assert.equal(d.activeElement.id, "cloudResetEmail");
    back.focus(); back.click();
    assert.equal(d.activeElement.id, "cloudSignInTab");
  } finally { g.b.close(); }
});

test("the auth gate hides the inactive shell and restores it after a verified session", async t => {
  const g = await gate(t); if (!g) return;
  try {
    const root = g.document.getElementById("root");
    assert.equal(root.hasAttribute("inert"), true);
    assert.equal(root.getAttribute("aria-hidden"), "true");
    g.auth.getUser = async () => ({ data: { user: { id: "verified" } }, error: null });
    assert.equal((await g.window.App.cloud.checkSession()).id, "verified");
    assert.equal(g.document.getElementById("cloudAuth").hidden, true);
    assert.equal(root.hasAttribute("inert"), false);
    assert.equal(root.hasAttribute("aria-hidden"), false);
  } finally { g.b.close(); }
});

test("rapid desktop tab changes keep the last requested mode", async t => {
  const g = await gate(t); if (!g) return;
  try {
    g.window.matchMedia = query => ({ matches: query.includes("min-width"), addEventListener() {} });
    const d = g.document;
    d.getElementById("cloudCreateTab").click();
    d.getElementById("cloudSignInTab").click();
    await new Promise(resolve => g.window.setTimeout(resolve, 220));
    assert.equal(d.getElementById("cloudSignInTab").getAttribute("aria-selected"), "true");
    assert.equal(d.getElementById("cloudFullNameField").hidden, true);
    assert.equal(d.getElementById("cloudAuthCard").classList.contains("cloud-auth-switching"), false);
  } finally { g.b.close(); }
});
