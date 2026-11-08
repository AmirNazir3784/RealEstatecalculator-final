/* cloudStore.js — the sole Supabase boundary. Existing feature modules keep
   using App.store; the versioned workspace object is stored unchanged. */
window.App = window.App || {};
App.cloud = (function () {
  "use strict";
  let client = null, user = null, recoveryActive = false;
  // Reassigned by gate() once the card exists, so the PASSWORD_RECOVERY
  // handler below (registered as soon as the client is created, which can be
  // before gate() has ever run) can switch an already-built card straight to
  // Update Password mode.
  let showAuthMode = function () {};
  function initClient() {
    if (client) return client;
    if (!window.supabase || !window.supabase.createClient) throw new Error("Supabase client failed to load.");
    client = window.supabase.createClient(App.config.url, App.config.publishableKey, { auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true } });
    // Registered once, immediately (not only after a successful checkSession
    // call), so it also catches PASSWORD_RECOVERY — the event Supabase fires
    // when the user returns from a reset-password email — before
    // checkSession would otherwise treat that temporary recovery session as
    // a normal sign-in.
    client.auth.onAuthStateChange((event, session) => {
      user = session && session.user ? session.user : null;
      if (event === "PASSWORD_RECOVERY") {
        recoveryActive = true;
        gate();
        showAuthMode("update-password");
        return;
      }
      if (!user && !recoveryActive) gate();
    });
    return client;
  }
  function setMessage(text, kind, targetId) { const el = document.getElementById(targetId || "cloudAuthMessage"); if (el) { el.textContent = text || ""; el.className = "cloud-auth-message" + (kind ? " " + kind : ""); } }
  function gate() {
    let root = document.getElementById("cloudAuth");
    if (root) { root.hidden = false; return; }
    root = document.createElement("div"); root.id = "cloudAuth"; root.className = "cloud-auth";
    document.body.appendChild(root);
    // Small inline icons only — no icon library/CDN. currentColor follows the
    // muted text token set in CSS; the Google/Facebook marks use their
    // official colors, scoped to just these small icons.
    const ICON_USER = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.2"></circle><path d="M5 19c0-3.5 3-6 7-6s7 2.5 7 6"></path></svg>';
    const ICON_EMAIL = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M3 7l9 6 9-6"></path></svg>';
    const ICON_LOCK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>';
    const ICON_EYE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12S6 5.6 12 5.6 21.5 12 21.5 12 18 18.4 12 18.4 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';
    const ICON_EYE_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 4.5l15 15"/><path d="M9.9 6.2A9.8 9.8 0 0 1 12 5.6c6 0 9.5 6.4 9.5 6.4a17.6 17.6 0 0 1-3.2 3.5M6.1 8A16.9 16.9 0 0 0 2.5 12S6 18.4 12 18.4c1.5 0 2.9-.4 4.1-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
    const ICON_GOOGLE = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M19.6 10.23c0-.68-.06-1.36-.18-2H10v3.79h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.89-1.74 2.99-4.3 2.99-7.31z"/><path fill="#34A853" d="M10 20c2.7 0 4.96-.89 6.62-2.42l-3.23-2.5c-.9.6-2.06.95-3.39.95-2.6 0-4.8-1.76-5.59-4.12H1.06v2.59A10 10 0 0 0 10 20z"/><path fill="#FBBC05" d="M4.41 11.9a5.99 5.99 0 0 1 0-3.8V5.5H1.06a10 10 0 0 0 0 9l3.35-2.6z"/><path fill="#EA4335" d="M10 3.98c1.47 0 2.79.5 3.82 1.5l2.87-2.87C14.95.99 12.7 0 10 0 6.09 0 2.72 2.24 1.06 5.5l3.35 2.6C5.2 5.75 7.4 3.98 10 3.98z"/></svg>';
    const ICON_FACEBOOK = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path fill="#1877F2" d="M20 10a10 10 0 1 0-11.56 9.88v-6.99H5.9V10h2.54V7.8c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V10h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 20 10z"/></svg>';
    // The card is built once. Switching modes (including into/out of Reset
    // and Update Password) toggles [hidden] on these sibling forms and
    // mutates their fields instead of re-rendering, so the fade transition
    // can actually animate rather than jump.
    root.innerHTML = `<div class="cloud-auth-card" id="cloudAuthCard">
        <div class="cloud-auth-form-panel" id="cloudAuthPanel">
          <h1>RealtorCRM</h1>
          <form id="cloudAuthForm">
            <p class="cloud-auth-intro" id="cloudAuthIntro"></p>
            <div class="cloud-auth-tabs" role="tablist" aria-label="Account access">
              <button class="cloud-auth-tab" id="cloudSignInTab" type="button" role="tab" aria-selected="true" aria-controls="cloudAuthForm">Sign in</button>
              <button class="cloud-auth-tab" id="cloudCreateTab" type="button" role="tab" aria-selected="false" aria-controls="cloudAuthForm">Create account</button>
            </div>
            <div class="cloud-auth-field" id="cloudFullNameField" hidden>
              <label for="cloudFullName">Full name</label>
              <div class="cloud-auth-input-wrap"><span class="cloud-auth-input-icon">${ICON_USER}</span>
                <input id="cloudFullName" type="text" autocomplete="name" minlength="2" maxlength="80" placeholder="Jane Doe"></div>
            </div>
            <div class="cloud-auth-field">
              <label for="cloudEmail">Email</label>
              <div class="cloud-auth-input-wrap"><span class="cloud-auth-input-icon">${ICON_EMAIL}</span>
                <input id="cloudEmail" type="email" autocomplete="email" placeholder="you@example.com" required maxlength="254"></div>
            </div>
            <div class="cloud-auth-field">
              <div class="cloud-auth-label-row">
                <label for="cloudPassword">Password</label>
                <button type="button" class="cloud-auth-inline-link" id="cloudForgotLink">Forgot password?</button>
              </div>
              <div class="cloud-auth-input-wrap"><span class="cloud-auth-input-icon">${ICON_LOCK}</span>
                <input class="cloud-password-input" id="cloudPassword" type="password" autocomplete="current-password" placeholder="Enter your password" required minlength="6"><button type="button" class="cloud-password-toggle" data-password-toggle data-password-label="password" aria-label="Show password" aria-pressed="false">${ICON_EYE}</button></div>
            </div>
            <p class="cloud-auth-pw-line" id="cloudPwLine" hidden>10+ characters, including uppercase, lowercase, a number, and a symbol.</p>
            <div class="cloud-auth-field" id="cloudConfirmField" hidden>
              <label for="cloudPasswordConfirm">Confirm password</label>
              <div class="cloud-auth-input-wrap"><span class="cloud-auth-input-icon">${ICON_LOCK}</span>
                <input class="cloud-password-input" id="cloudPasswordConfirm" type="password" autocomplete="new-password" placeholder="Re-enter your password" minlength="10"><button type="button" class="cloud-password-toggle" data-password-toggle data-password-label="confirm password" aria-label="Show confirm password" aria-pressed="false">${ICON_EYE}</button></div>
              <p class="cloud-auth-confirm-line" id="cloudConfirmLine" hidden></p>
            </div>
            <button class="btn btn-primary cloud-auth-submit" id="cloudAuthSubmit" type="submit">Sign in</button>
            <p id="cloudAuthMessage" class="cloud-auth-message" aria-live="polite"></p>
            <div id="cloudOAuthBlock">
              <div class="cloud-auth-divider"><span>or continue with</span></div>
              <div class="cloud-auth-oauth-row">
                <button type="button" class="cloud-auth-oauth-btn" id="cloudOAuthGoogle">${ICON_GOOGLE}<span>Continue with Google</span></button>
                <!-- Facebook OAuth is wired below, but the provider is not enabled in Supabase yet, so this button ships disabled; remove the disabled attribute when the provider is turned on. -->
                <button type="button" class="cloud-auth-oauth-btn" id="cloudOAuthFacebook" disabled title="Facebook sign-in is not available yet">${ICON_FACEBOOK}<span>Continue with Facebook</span></button>
              </div>
            </div>
            <p class="cloud-auth-switch"><span id="cloudAuthSwitchCopy"></span> <button id="cloudAuthSwitch" type="button"></button></p>
            <p class="cloud-auth-switch"><a id="cloudBackToWebsite" href="#">Back to website</a></p>
          </form>
          <form id="cloudResetForm" hidden>
            <p class="cloud-auth-subheading">Reset your password</p>
            <p class="cloud-auth-intro">Enter your account email and we’ll send you a link to reset your password.</p>
            <div class="cloud-auth-field">
              <label for="cloudResetEmail">Email</label>
              <div class="cloud-auth-input-wrap"><span class="cloud-auth-input-icon">${ICON_EMAIL}</span>
                <input id="cloudResetEmail" type="email" autocomplete="email" placeholder="you@example.com" required maxlength="254"></div>
            </div>
            <button class="btn btn-primary cloud-auth-submit" id="cloudResetSubmit" type="submit">Send reset link</button>
            <p id="cloudResetMessage" class="cloud-auth-message" aria-live="polite"></p>
            <p class="cloud-auth-switch"><button type="button" id="cloudResetBack">Back to sign in</button></p>
          </form>
          <form id="cloudUpdateForm" hidden>
            <p class="cloud-auth-subheading">Set a new password</p>
            <p class="cloud-auth-intro">Choose a new password for your account.</p>
            <div class="cloud-auth-field">
              <label for="cloudNewPassword">New password</label>
              <div class="cloud-auth-input-wrap"><span class="cloud-auth-input-icon">${ICON_LOCK}</span>
                <input class="cloud-password-input" id="cloudNewPassword" type="password" autocomplete="new-password" placeholder="Enter your password" required minlength="10"><button type="button" class="cloud-password-toggle" data-password-toggle data-password-label="new password" aria-label="Show new password" aria-pressed="false">${ICON_EYE}</button></div>
            </div>
            <div class="cloud-auth-field">
              <label for="cloudNewPasswordConfirm">Confirm new password</label>
              <div class="cloud-auth-input-wrap"><span class="cloud-auth-input-icon">${ICON_LOCK}</span>
                <input class="cloud-password-input" id="cloudNewPasswordConfirm" type="password" autocomplete="new-password" placeholder="Re-enter your password" required minlength="10"><button type="button" class="cloud-password-toggle" data-password-toggle data-password-label="confirm new password" aria-label="Show confirm new password" aria-pressed="false">${ICON_EYE}</button></div>
              <p class="cloud-auth-confirm-line" id="cloudUpdateConfirmLine" hidden></p>
            </div>
            <p class="cloud-auth-pw-line" id="cloudUpdatePwLine" hidden>10+ characters, including uppercase, lowercase, a number, and a symbol.</p>
            <button class="btn btn-primary cloud-auth-submit" id="cloudUpdateSubmit" type="submit">Update password</button>
            <p id="cloudUpdateMessage" class="cloud-auth-message" aria-live="polite"></p>
          </form>
          <div id="cloudConfirmPanel" hidden>
            <p class="cloud-auth-subheading">Check your email</p>
            <p class="cloud-auth-intro">We’ve sent a confirmation link to your email address. Open the link to verify your account, then sign in to RealtorCRM.</p>
            <p class="cloud-auth-confirm-email" id="cloudConfirmEmail"></p>
            <button class="btn btn-primary cloud-auth-submit" id="cloudResendBtn" type="button">Resend confirmation email</button>
            <p id="cloudConfirmMessage" class="cloud-auth-message" aria-live="polite"></p>
            <p class="cloud-auth-switch"><button type="button" id="cloudChangeEmailBtn">Change email</button></p>
            <p class="cloud-auth-switch"><button type="button" id="cloudConfirmBackBtn">Back to Sign in</button></p>
          </div>
        </div>
        <div class="cloud-auth-illustration" aria-hidden="true">
          <div class="cloud-auth-illustration-art">
            <img class="cloud-auth-illustration-img" src="assets/illustrations/realtor-auth-buy-house.svg" alt="" width="248" height="239">
          </div>
          <p class="cloud-auth-illustration-label">REALTORCRM</p>
          <h2 class="cloud-auth-illustration-heading">Your real estate workspace</h2>
          <p class="cloud-auth-illustration-desc">Organize contacts, manage deals, plan follow-ups and close with confidence.</p>
          <div class="cloud-auth-illustration-features"><span class="cloud-auth-illustration-feature"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.4"/><path d="M3.5 19.5c.7-3.2 2.9-5 5.5-5s4.8 1.8 5.5 5"/></svg>Contacts</span><span class="cloud-auth-illustration-feature"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3.6 13.4L12 18l8.4-4.6"/></svg>Deals</span><span class="cloud-auth-illustration-feature"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>Follow-ups</span><span class="cloud-auth-illustration-feature"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.6"/><path d="M8.6 12.4l2.4 2.4 4.4-4.9"/></svg>Tasks</span></div>
        </div>
      </div>`;

    const card = root.querySelector("#cloudAuthCard");
    const authForm = root.querySelector("#cloudAuthForm");
    const resetForm = root.querySelector("#cloudResetForm");
    const updateForm = root.querySelector("#cloudUpdateForm");
    const intro = root.querySelector("#cloudAuthIntro");
    const signInTab = root.querySelector("#cloudSignInTab");
    const createTab = root.querySelector("#cloudCreateTab");
    const fullNameField = root.querySelector("#cloudFullNameField");
    const fullNameInput = root.querySelector("#cloudFullName");
    const emailInput = root.querySelector("#cloudEmail");
    const passwordInput = root.querySelector("#cloudPassword");
    const confirmField = root.querySelector("#cloudConfirmField");
    const confirmInput = root.querySelector("#cloudPasswordConfirm");
    const submitBtn = root.querySelector("#cloudAuthSubmit");
    const switchCopy = root.querySelector("#cloudAuthSwitchCopy");
    const switchBtn = root.querySelector("#cloudAuthSwitch");
    const forgotLink = root.querySelector("#cloudForgotLink");
    const oauthBlock = root.querySelector("#cloudOAuthBlock");
    const oauthGoogleBtn = root.querySelector("#cloudOAuthGoogle");
    const oauthFacebookBtn = root.querySelector("#cloudOAuthFacebook");
    const resetEmailInput = root.querySelector("#cloudResetEmail");
    const resetSubmitBtn = root.querySelector("#cloudResetSubmit");
    const resetBackBtn = root.querySelector("#cloudResetBack");
    const newPasswordInput = root.querySelector("#cloudNewPassword");
    const newPasswordConfirmInput = root.querySelector("#cloudNewPasswordConfirm");
    const updateSubmitBtn = root.querySelector("#cloudUpdateSubmit");
    const confirmPanel = root.querySelector("#cloudConfirmPanel");
    const confirmEmailEl = root.querySelector("#cloudConfirmEmail");
    const resendBtn = root.querySelector("#cloudResendBtn");
    const changeEmailBtn = root.querySelector("#cloudChangeEmailBtn");
    const confirmBackBtn = root.querySelector("#cloudConfirmBackBtn");
    const pwLine = root.querySelector("#cloudPwLine");
    const updatePwLine = root.querySelector("#cloudUpdatePwLine");
    const confirmLine = root.querySelector("#cloudConfirmLine");
    const updateConfirmLine = root.querySelector("#cloudUpdateConfirmLine");
    let pendingConfirmEmail = "";
    let resendCooldownUntil = 0;
    let resendTimer = null;
    let creating = false;
    let currentMode = "sign-in";
    let switching = false;

    // New-password rule for Create account and Update password (sign-in is
    // never re-judged: an existing password stays valid whatever it is).
    // Frontend-only guidance - the matching Supabase-side policy is a
    // dashboard setting, listed for the owner as an approval item.
    const PW_RULES = [
      ["length", (v) => v.length >= 10, "10+ characters"],
      ["upper", (v) => /[A-Z]/.test(v), "uppercase letter"],
      ["lower", (v) => /[a-z]/.test(v), "lowercase letter"],
      ["number", (v) => /[0-9]/.test(v), "number"],
      ["symbol", (v) => /[^A-Za-z0-9\s]/.test(v), "symbol"]
    ];
    function pwMissing(v) { return PW_RULES.filter(([, t]) => !t(v)).map(([, , label]) => label); }
    function pwError(v) { const m = pwMissing(v); return m.length ? "Your password still needs: " + m.join(", ") + "." : ""; }
    const ICON_PW_CHECK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.4 2.4 4.6-5.4"/></svg>';
    const ICON_PW_WARN = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4L2.8 20h18.4L12 4z"/><path d="M12 10v4.4"/><circle cx="12" cy="17.2" r="0.7" fill="currentColor" stroke="none"/></svg>';
    // ONE line under the password field, three states: neutral guidance
    // before typing, the missing requirements only while incomplete, and
    // a green confirmation once the rule is met. The labels interpolated
    // here are the fixed PW_RULES strings, never user input.
    function paintPwLine(lineEl, v) {
      if (!lineEl) return;
      if (!v) {
        lineEl.className = "cloud-auth-pw-line";
        lineEl.textContent = "10+ characters, including uppercase, lowercase, a number, and a symbol.";
        return;
      }
      const missing = pwMissing(v);
      if (!missing.length) {
        lineEl.className = "cloud-auth-pw-line success";
        lineEl.innerHTML = ICON_PW_CHECK + "<span>Password meets all requirements.</span>";
      } else {
        lineEl.className = "cloud-auth-pw-line error";
        lineEl.innerHTML = ICON_PW_WARN + "<span>Still needed: " + missing.join(", ") + ".</span>";
      }
    }
    // Confirm feedback appears only once something has been typed into
    // the confirmation field - never a warning before the user starts.
    function paintConfirmLine(lineEl, pw, confirm) {
      if (!lineEl) return;
      if (!confirm) { lineEl.hidden = true; lineEl.textContent = ""; return; }
      const match = pw.length > 0 && confirm === pw;
      lineEl.hidden = false;
      lineEl.className = "cloud-auth-confirm-line " + (match ? "success" : "error");
      lineEl.textContent = match ? "Passwords match." : "Passwords do not match.";
    }
    function emailError(input) {
      const v = input.value.trim();
      if (!v) return "Enter your email address.";
      if (input.validity && !input.validity.valid) return "Enter a valid email address.";
      return "";
    }

    function applySignMode(nextCreating) {
      creating = nextCreating;
      intro.textContent = creating ? "Create an account to securely start your workspace." : "Sign in to securely open your workspace.";
      signInTab.setAttribute("aria-selected", String(!creating));
      createTab.setAttribute("aria-selected", String(creating));
      fullNameField.hidden = !creating;
      fullNameInput.required = creating;
      if (!creating) fullNameInput.value = "";
      confirmField.hidden = !creating;
      confirmInput.required = creating;
      if (!creating) confirmInput.value = "";
      passwordInput.setAttribute("autocomplete", creating ? "new-password" : "current-password");
      passwordInput.minLength = creating ? 10 : 6;
      pwLine.hidden = !creating;
      if (creating) {
        paintPwLine(pwLine, passwordInput.value);
        paintConfirmLine(confirmLine, passwordInput.value, confirmInput.value);
      } else {
        confirmLine.hidden = true;
      }
      submitBtn.textContent = creating ? "Create account" : "Sign in";
      switchCopy.textContent = creating ? "Already have an account?" : "Don’t have an account?";
      switchBtn.textContent = creating ? "Sign in" : "Create one";
      forgotLink.hidden = creating;
      oauthBlock.hidden = creating; // Google/Facebook are Sign in-only, per spec
      card.classList.toggle("is-create", creating);
      setMessage("");
    }

    // Desktop/tablet gets a brief fade+translate for every mode change
    // (including the panel-order swap between Sign in and Create account
    // underneath); mobile and reduced-motion just flip instantly.
    function transitionSwap(run) {
      if (switching) { run(); return; }
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const isDesktop = window.matchMedia("(min-width: 780px)").matches;
      if (reduceMotion || !isDesktop) { run(); return; }
      switching = true;
      card.classList.add("cloud-auth-switching");
      setTimeout(() => {
        run();
        requestAnimationFrame(() => {
          card.classList.remove("cloud-auth-switching");
          switching = false;
        });
      }, 190);
    }

    // mode: "sign-in" | "create" | "reset" | "update-password" | "confirm"
    function showMode(mode, opts) {
      if (mode === currentMode && !(opts && opts.force)) return;
      transitionSwap(() => {
        currentMode = mode;
        authForm.hidden = mode !== "sign-in" && mode !== "create";
        resetForm.hidden = mode !== "reset";
        updateForm.hidden = mode !== "update-password";
        confirmPanel.hidden = mode !== "confirm";
        if (mode === "confirm") paintResendState();
        card.classList.remove("is-create");
        if (mode === "sign-in" || mode === "create") {
          applySignMode(mode === "create");
        } else if (mode === "reset") {
          if (!resetEmailInput.value) resetEmailInput.value = emailInput.value;
          setMessage("", null, "cloudResetMessage");
        } else if (mode === "update-password") {
          newPasswordInput.value = "";
          newPasswordConfirmInput.value = "";
          updatePwLine.hidden = false;
          paintPwLine(updatePwLine, "");
          updateConfirmLine.hidden = true;
          setMessage("", null, "cloudUpdateMessage");
        }
      });
    }
    showAuthMode = showMode; // let the PASSWORD_RECOVERY handler drive this card once built

    passwordInput.addEventListener("input", () => {
      if (!creating) return;
      paintPwLine(pwLine, passwordInput.value);
      paintConfirmLine(confirmLine, passwordInput.value, confirmInput.value);
    });
    confirmInput.addEventListener("input", () => {
      if (creating) paintConfirmLine(confirmLine, passwordInput.value, confirmInput.value);
    });
    newPasswordInput.addEventListener("input", () => {
      paintPwLine(updatePwLine, newPasswordInput.value);
      paintConfirmLine(updateConfirmLine, newPasswordInput.value, newPasswordConfirmInput.value);
    });
    newPasswordConfirmInput.addEventListener("input", () => {
      paintConfirmLine(updateConfirmLine, newPasswordInput.value, newPasswordConfirmInput.value);
    });

    signInTab.addEventListener("click", () => showMode("sign-in"));
    createTab.addEventListener("click", () => showMode("create"));
    switchBtn.addEventListener("click", () => showMode(creating ? "sign-in" : "create"));
    forgotLink.addEventListener("click", () => showMode("reset"));
    resetBackBtn.addEventListener("click", () => showMode("sign-in"));

    authForm.addEventListener("submit", async e => {
      e.preventDefault();
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      const emailErr = emailError(emailInput);
      if (emailErr) return setMessage(emailErr, "error");
      if (creating) {
        const fullName = fullNameInput.value.trim();
        if (fullName.length < 2) return setMessage("Please enter your full name.", "error");
        const ruleErr = pwError(password);
        if (ruleErr) return setMessage(ruleErr, "error");
        const confirmPassword = confirmInput.value;
        if (password !== confirmPassword) return setMessage("Passwords do not match.", "error");
        submitBtn.disabled = true;
        setMessage("Creating account…");
        let r;
        try {
          r = await initClient().auth.signUp({ email, password, options: { data: { full_name: fullName } } });
        } catch (err) {
          submitBtn.disabled = false;
          return setMessage("Unable to create your account right now. Check your connection and try again.", "error");
        }
        submitBtn.disabled = false;
        if (r.error) return setMessage(r.error.message, "error");
        if (!r.data.session) {
          // Email confirmation is on: no session exists yet, and nobody is
          // signed in. Show the dedicated confirmation state instead of a
          // one-line message - it carries the resend and correction paths.
          pendingConfirmEmail = email;
          confirmEmailEl.textContent = email;
          setMessage("", null, "cloudConfirmMessage");
          showMode("confirm");
          return;
        }
        window.location.reload();
        return;
      }
      setMessage("Signing in…");
      const r = await initClient().auth.signInWithPassword({ email, password });
      if (r.error) return setMessage(r.error.message, "error");
      window.location.reload();
    });

    // ---- Confirmation panel: resend (with cooldown), change email, back ----
    function paintResendState() {
      const remaining = Math.ceil((resendCooldownUntil - Date.now()) / 1000);
      if (remaining > 0) {
        resendBtn.disabled = true;
        resendBtn.textContent = "Resend confirmation email (" + remaining + "s)";
      } else {
        resendBtn.disabled = false;
        resendBtn.textContent = "Resend confirmation email";
        if (resendTimer) { clearInterval(resendTimer); resendTimer = null; }
      }
    }
    function startResendCooldown(seconds) {
      resendCooldownUntil = Date.now() + seconds * 1000;
      paintResendState();
      if (resendTimer) clearInterval(resendTimer);
      resendTimer = setInterval(paintResendState, 500);
    }
    resendBtn.addEventListener("click", async () => {
      if (!pendingConfirmEmail || Date.now() < resendCooldownUntil) return;
      resendBtn.disabled = true;
      setMessage("Sending…", null, "cloudConfirmMessage");
      let error = null;
      try {
        const r = await initClient().auth.resend({ type: "signup", email: pendingConfirmEmail });
        error = r && r.error;
      } catch (err) { error = err; }
      // The cooldown applies whether the request succeeded or not - it is
      // a UX guard; Supabase's own rate limits are the real enforcement.
      startResendCooldown(60);
      if (error) {
        const msg = String((error && error.message) || "");
        const rateLimited = (error && error.status === 429) || /rate|once every|too many/i.test(msg);
        setMessage(rateLimited
          ? "Please wait a minute before requesting another confirmation email."
          : "We couldn’t send the confirmation email just now. Please try again shortly.", "error", "cloudConfirmMessage");
      } else {
        // Supabase only confirms the request was accepted - never claim
        // delivery, and reveal nothing about the address itself.
        setMessage("Confirmation email requested. If it doesn’t arrive in a few minutes, check your spam folder.", "success", "cloudConfirmMessage");
      }
    });
    changeEmailBtn.addEventListener("click", () => {
      // Back to the form to fix the address: the name stays, the email
      // stays editable, and neither password is carried back.
      passwordInput.value = "";
      confirmInput.value = "";
      paintPwLine(pwLine, "");
      confirmLine.hidden = true;
      setMessage("");
      showMode("create");
    });
    confirmBackBtn.addEventListener("click", () => showMode("sign-in"));

    // Forgot password: never reveals whether the address is registered —
    // the same confirmation is shown whether or not the call errors.
    resetForm.addEventListener("submit", async e => {
      e.preventDefault();
      const email = resetEmailInput.value.trim();
      const emailErr = emailError(resetEmailInput);
      if (emailErr) return setMessage(emailErr, "error", "cloudResetMessage");
      resetSubmitBtn.disabled = true;
      setMessage("Sending reset link…", null, "cloudResetMessage");
      try {
        await initClient().auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + window.location.pathname
        });
      } catch (err) { /* intentionally ignored — see comment above */ }
      setMessage("If an account exists for this email, a password reset link has been sent.", "success", "cloudResetMessage");
      resetSubmitBtn.disabled = false;
    });

    // Update password, reached only via the PASSWORD_RECOVERY event above.
    updateForm.addEventListener("submit", async e => {
      e.preventDefault();
      const p1 = newPasswordInput.value, p2 = newPasswordConfirmInput.value;
      const ruleErr = pwError(p1);
      if (ruleErr) return setMessage(ruleErr, "error", "cloudUpdateMessage");
      if (p1 !== p2) return setMessage("Passwords do not match.", "error", "cloudUpdateMessage");
      updateSubmitBtn.disabled = true;
      setMessage("Updating password…", null, "cloudUpdateMessage");
      const r = await initClient().auth.updateUser({ password: p1 });
      updateSubmitBtn.disabled = false;
      if (r.error) return setMessage(r.error.message, "error", "cloudUpdateMessage");
      setMessage("Password updated. Redirecting you to sign in…", "success", "cloudUpdateMessage");
      recoveryActive = false;
      // Sign the temporary recovery session out — the user is returned to a
      // clean Sign in with their new password, never straight into the app.
      try { await initClient().auth.signOut(); } catch (err) { /* non-fatal */ }
      setTimeout(() => showMode("sign-in"), 1800);
    });

    // Password visibility: each toggle flips only the input inside its own
    // field wrap. Values, validation and submission are untouched - the
    // control changes the input type and its own pressed/label state.
    root.querySelectorAll("[data-password-toggle]").forEach(btn => {
      btn.addEventListener("click", () => {
        const input = btn.closest(".cloud-auth-input-wrap").querySelector("input");
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.setAttribute("aria-pressed", String(show));
        btn.setAttribute("aria-label", (show ? "Hide " : "Show ") + btn.dataset.passwordLabel);
        btn.innerHTML = show ? ICON_EYE_OFF : ICON_EYE;
      });
    });

    async function handleOAuth(provider, btn) {
      btn.disabled = true;
      setMessage("Redirecting to " + (provider === "google" ? "Google" : "Facebook") + "…");
      try {
        const { error } = await initClient().auth.signInWithOAuth({
          provider,
          options: { redirectTo: window.location.origin + window.location.pathname }
        });
        if (error) { setMessage(error.message, "error"); btn.disabled = false; }
        // On success the browser navigates away to the provider now, so
        // there is nothing further to do here.
      } catch (err) {
        setMessage((err && err.message) || "Unable to start sign-in.", "error");
        btn.disabled = false;
      }
    }
    oauthGoogleBtn.addEventListener("click", () => handleOAuth("google", oauthGoogleBtn));
    oauthFacebookBtn.addEventListener("click", () => handleOAuth("facebook", oauthFacebookBtn));

    // The gate's way back to the public website. The target comes from
    // App.config.websiteUrl (per-environment, not a secret); without a
    // configured URL the link hides rather than pointing nowhere.
    const backToWebsite = root.querySelector("#cloudBackToWebsite");
    if (backToWebsite) {
      if (App.config.websiteUrl) backToWebsite.href = App.config.websiteUrl;
      else backToWebsite.hidden = true;
    }

    // A `mode` query parameter from the public website can ask for the
    // Create-account form directly (?mode=create). Read once, here at
    // gate construction; any other value - including no parameter -
    // keeps the historical default, Sign in. A password-recovery return
    // outranks it: that flow must land on Update Password.
    const requestedMode = new URLSearchParams(window.location.search).get("mode");
    showMode(recoveryActive ? "update-password" : (requestedMode === "create" ? "create" : "sign-in"), { force: true });
  }
  function hideGate() { const root = document.getElementById("cloudAuth"); if (root) root.hidden = true; }

  // The only thing boot needs from this module now: is someone signed in?
  // No workspace_state read/write happens here anymore — App.data owns the
  // one-time legacy migration (its own guarded, per-user workspace_state
  // read) and every normal entity read/write after that goes straight to
  // its own relational table. This replaces the old requireSessionAndHydrate,
  // which used to also read/write the whole-workspace blob on every boot.
  async function checkSession() {
    try {
      const api = initClient();
      const { data: { user: current }, error } = await api.auth.getUser();
      if (recoveryActive) return null; // Update Password mode is already showing.
      if (error || !current) { gate(); return null; }
      user = current;
      hideGate();
      return user;
    } catch (err) {
      if (!recoveryActive) { gate(); setMessage("Unable to reach your account: " + err.message, "error"); }
      return null;
    }
  }

  // ---------- PROFILE (display name, phone, avatar) ----------
  // Editable, non-security profile fields only, stored in Supabase Auth user
  // metadata per PART 5 — never roles/permissions, never workspace_state.

  function getUser() { return user; }

  async function signOutUser() {
    try { await initClient().auth.signOut(); } catch (err) { /* ignore — reload proceeds either way */ }
    window.location.reload();
  }

  async function updateProfile(fields) {
    const api = initClient();
    const current = (user && user.user_metadata) || {};
    const data = Object.assign({}, current, fields);
    const { data: res, error } = await api.auth.updateUser({ data });
    if (!error && res && res.user) user = res.user;
    return { error, user: res ? res.user : null };
  }

  // Uploads to the private `avatars` bucket under the user's own folder
  // (${user.id}/...), matching the Storage RLS policies in the migration.
  // Best-effort deletes the previous file so a user's folder doesn't
  // accumulate old photos across edits.
  async function uploadAvatar(file) {
    if (!user) throw new Error("Not signed in.");
    const api = initClient();
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = user.id + "/avatar-" + Date.now() + "." + ext;
    const { error } = await api.storage.from("avatars").upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw error;
    const prevPath = user.user_metadata && user.user_metadata.avatar_path;
    if (prevPath && prevPath !== path) { try { await api.storage.from("avatars").remove([prevPath]); } catch (err) { /* best-effort cleanup */ } }
    return path;
  }

  async function removeAvatarFile(path) {
    if (!path) return;
    try { await initClient().storage.from("avatars").remove([path]); } catch (err) { /* best-effort */ }
  }

  // The bucket is private, so photos are only ever read back through a
  // short-lived signed URL — never a public URL, never stored as Base64.
  async function getAvatarSignedUrl(path) {
    if (!path) return null;
    try {
      const { data, error } = await initClient().storage.from("avatars").createSignedUrl(path, 3600);
      if (error || !data) return null;
      return data.signedUrl;
    } catch (err) { return null; }
  }

  return {
    checkSession,
    getUser, signOutUser, updateProfile, uploadAvatar, removeAvatarFile, getAvatarSignedUrl,
    // Exposes the already-created client so App.data (the direct per-entity
    // Supabase layer) reuses this exact client instance instead of creating
    // a second one. Auth/session/profile/avatar behavior above is unchanged.
    getClient: initClient
  };
})();
