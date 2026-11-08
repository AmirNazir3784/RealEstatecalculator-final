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

async function gate(t, { resendImpl } = {}) {
  const b = await browser(SCRIPTS);
  if (!b) { t.skip(SKIP_DOM); return null; }
  const { window } = b;
  // jsdom has no layout engine; the gate's mode transition asks
  // matchMedia about reduced motion / width. A plain "no" answer makes
  // transitions instant, which is what these tests want.
  if (!window.matchMedia) {
    window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  }
  const calls = { signUp: [], resend: [], updateUser: [], signIn: [] };
  let authCallback = null;
  const auth = {
    onAuthStateChange: (cb) => { authCallback = cb; return { data: { subscription: { unsubscribe() {} } } }; },
    getUser: async () => ({ data: { user: null }, error: null }),
    signUp: async (args) => { calls.signUp.push(args); return { data: { user: { id: "u1" }, session: null }, error: null }; },
    resend: async (args) => { calls.resend.push(args); return resendImpl ? resendImpl(args) : { data: {}, error: null }; },
    signInWithPassword: async (args) => { calls.signIn.push(args); return { data: {}, error: null }; },
    resetPasswordForEmail: async () => ({ data: {}, error: null }),
    updateUser: async (args) => { calls.updateUser.push(args); return { data: { user: {} }, error: null }; },
    signOut: async () => ({ error: null }),
  };
  window.supabase = { createClient: () => ({ auth }) };
  await window.App.cloud.checkSession();
  await settle(window);
  return {
    b, window, document: window.document, calls,
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

test("one password line cycles neutral, missing and met states", async (t) => {
  const g = await gate(t);
  if (!g) return;
  try {
    const d = g.document;
    d.getElementById("cloudCreateTab").click();
    const line = d.getElementById("cloudPwLine");
    assert.equal(line.hidden, false, "the line shows in Create account mode");
    assert.equal(d.getElementById("cloudPwRules"), null, "the five-item checklist is gone");
    assert.equal(line.textContent, "10+ characters, including uppercase, lowercase, a number, and a symbol.",
      "state A: neutral guidance before typing");
    const pw = d.getElementById("cloudPassword");
    const type = (v) => { pw.value = v; pw.dispatchEvent(new g.window.Event("input", { bubbles: true })); };
    type("abc");
    assert.match(line.className, /error/, "state B is the warning state");
    assert.equal(line.textContent, "Still needed: 10+ characters, uppercase letter, number, symbol.",
      "and it names only what is missing");
    type(STRONG);
    assert.match(line.className, /success/, "state C is the success state");
    assert.equal(line.textContent, "Password meets all requirements.");
    d.getElementById("cloudSignInTab").click();
    assert.equal(line.hidden, true, "and the line hides again for Sign in");
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
