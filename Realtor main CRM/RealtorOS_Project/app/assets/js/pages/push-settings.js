/* ============================================================
   push-settings.js — Settings → Notifications.

   Three sections, in the order somebody needs them:

     1. This device. One button, and a sentence saying what the state
        actually is. The hard part of push is not the API, it is that
        there are six states and five of them need different words.
     2. My devices. Every browser that is subscribed, with Remove. A
        device somebody has lost, or a colleague's laptop they signed in
        on once, has to be removable from the phone in their hand.
     3. What and when. Plain names for the notification types, and quiet
        hours.

   EVERY TYPE NAME IS WRITTEN OUT HERE. The database's type strings
   ('contact_untouched') are not words anybody should be shown, and the
   list comes from the server so the two cannot drift: an unknown type
   is shown under its own id rather than hidden, because a notification
   nobody can switch off is worse than an ugly label.
   ============================================================ */
window.App = window.App || {};
App.pages = App.pages || {};

App.pages.pushSettings = (function () {
  "use strict";

  const U = () => App.util;
  const S = () => App.store;

  // The plain name for each type, and one line about when it happens.
  const TYPE_WORDS = {
    lead_replied:      ["A lead replies", "Somebody answers one of your emails."],
    hot_reply:         ["A reply looks hot", "A reply that reads like real interest."],
    unsubscribed:      ["Somebody unsubscribes", "A contact opts out of your emails."],
    spam_report:       ["An email is marked as spam", "Worth knowing quickly."],
    email_bounced:     ["An email bounces", "The address did not accept it."],
    import_finished:   ["An import finishes", "A Google Sheet or file import is done."],
    followup_failed:   ["A sequence step fails", "Something in an automation could not run."],
    contact_untouched: ["A new lead goes untouched", "Nobody has replied to them yet."],
    overdue_followups: ["Follow-ups are overdue", "Your daily summary of what is late."],
    new_lead:          ["A new lead arrives", "A new lead you can access is ready to review."],
    task_reminder:     ["Tasks need attention", "A daily summary of upcoming, due and overdue tasks."],
    deal_assigned:     ["A deal is assigned to me", "A deal is assigned to your active team account."],
    push_test:         ["Test notification", "Sent only when you request a device test."],
  };

  const STATE_WORDS = {
    not_configured: {
      get line() { return App.i18n.t("Phone notifications are not configured for this app."); },
      get help() { return App.i18n.t("Ask your workspace administrator to finish notification setup."); },
    },
    ios_needs_install: {
      get line() { return App.i18n.t("On an iPhone or iPad, notifications work once RealtorCRM is on your Home Screen."); },
      get help() { return App.i18n.t("Tap Share, then Add to Home Screen, then open RealtorCRM from the new icon and come back here. Needs iOS 16.4 or later."); },
    },
    unsupported: {
      get line() { return App.i18n.t("This browser cannot show notifications."); },
      get help() { return App.i18n.t("Chrome, Edge, Firefox and Safari all can. On iPhone, add RealtorCRM to your Home Screen first."); },
    },
    blocked: {
      get line() { return App.i18n.t("Notifications are blocked for RealtorCRM in this browser."); },
      get help() { return App.i18n.t("The browser will not ask again, so this one has to be changed in its own settings: open the padlock or the site settings next to the address and allow Notifications."); },
    },
    on: {
      get line() { return App.i18n.t("Notifications are on for this device."); },
      get help() { return App.i18n.t("This browser is registered. Delivery also depends on your preferences and device settings."); },
    },
    off: {
      get line() { return App.i18n.t("Notifications are off for this device."); },
      get help() { return App.i18n.t("Turn them on and your phone tells you when a lead replies, without RealtorCRM being open."); },
    },
    renew: {
      get line() { return App.i18n.t("This device needs notification renewal."); },
      get help() { return App.i18n.t("Renew to register this browser again. This also replaces an expired subscription."); },
    },
    unknown: {
      get line() { return App.i18n.t("Device registration could not be checked."); },
      get help() { return App.i18n.t("Check your connection and refresh. Browser permission alone does not confirm delivery."); },
    },
  };

  function deviceRow(device) {
    const when = device.created_at ? U().formatDate(String(device.created_at).slice(0, 10)) : "";
    const failing = (device.failure_count || 0) >= 3;
    return App.i18n.html`<li class="push-device">
      <div class="push-device-main">
        <strong>${App.i18n.value(() => (U().esc(device.device_label || App.i18n.t("A browser"))))}</strong>
        <span class="form-help">${App.i18n.value(() => (U().esc(when ? "Added " + when : "")))}${
          App.i18n.value(() => (failing ? App.i18n.t(" · not accepting notifications lately") : ""))}</span>
      </div>
      <button type="button" class="btn btn-sm" data-remove-device="${App.i18n.value(() => (U().esc(device.id)))}">Remove</button>
    </li>`;
  }

  function typeRow(type, checked) {
    const words = TYPE_WORDS[type] || [type, ""];
    return App.i18n.html`<label class="push-type">
      <input type="checkbox" class="push-type-box" value="${App.i18n.value(() => (U().esc(type)))}" ${App.i18n.value(() => (checked ? "checked" : ""))}>
      <span><strong>${App.i18n.value(() => (U().esc(App.i18n.t(words[0]))))}</strong>
      ${App.i18n.value(() => (words[1] ? App.i18n.html`<span class="form-help">${App.i18n.value(() => (U().esc(App.i18n.t(words[1]))))}</span>` : ""))}</span>
    </label>`;
  }

  async function render(pane) {
    if (!pane) return;
    pane.innerHTML = App.i18n.html`
      <div class="settings-category-head">
        <div class="settings-category-title">Notifications</div>
        <p class="form-help">Get told when a lead replies, without having RealtorCRM open.</p>
      </div>
      <div id="pushPanel">${App.i18n.value(() => (App.app.loadingHtml ? App.app.loadingHtml(App.i18n.t("your notification settings")) : ""))}</div>`;
    await paint(pane);
  }

  async function paint(pane) {
    const panel = pane.querySelector("#pushPanel");
    if (!panel) return;

    const state = App.push ? await App.push.state(window) : "unsupported";
    const words = STATE_WORDS[state] || STATE_WORDS.unsupported;
    const live = state !== "not_configured";

    let devices = [];
    let prefs = null;
    let loadFailed = false;
    if (live) {
      try { devices = await S().push.devices(); } catch (e) { loadFailed = true; }
      try { prefs = await S().push.preferences(); } catch (e) { loadFailed = true; }
    }
    // Tests are deliberate button requests, not an automatic event to opt into.
    const allTypes = ((prefs && prefs.all_types) || Object.keys(TYPE_WORDS)).filter((type) => type !== "push_test");
    const chosen = (prefs && prefs.push_types) || allTypes;
    const pushEnabled = !prefs || prefs.push_enabled !== false;
    const quietStart = (prefs && prefs.quiet_start) ? String(prefs.quiet_start).slice(0, 5) : "";
    const quietEnd = (prefs && prefs.quiet_end) ? String(prefs.quiet_end).slice(0, 5) : "";

    panel.innerHTML = App.i18n.html`
      <section class="card" id="pushDeviceCard">
        <div class="card-header"><div class="card-title">This device</div></div>
        <div class="card-body">
          <p id="pushStateLine"><strong>${App.i18n.value(() => (U().esc(words.line)))}</strong></p>
          <p class="form-help" id="pushStateHelp">${App.i18n.value(() => (U().esc(words.help)))}</p>
          ${App.i18n.value(() => (state === "off" ? App.i18n.markup(`<button type="button" class="btn btn-primary" id="pushEnableBtn">Turn on notifications on this device</button>`) : ""))}
          ${App.i18n.value(() => (state === "on" ? App.i18n.markup(`<button type="button" class="btn" id="pushDisableBtn">Turn off on this device</button>`) : ""))}
          ${App.i18n.value(() => (state === "renew" ? App.i18n.html`<button type="button" class="btn btn-primary" id="pushRenewBtn">Renew notifications on this device</button>` : ""))}
          ${App.i18n.value(() => (state === "on" ? App.i18n.html`<button type="button" class="btn" id="pushTestBtn">Send test notification</button><p class="form-help">A test is queued for this device. Delivery depends on the worker and your quiet hours.</p>` : ""))}
          <button type="button" class="btn btn-sm" id="pushRefreshBtn">Refresh status</button>
          <p class="form-help" id="pushActionStatus" role="status" aria-live="polite"></p>
        </div>
      </section>

      ${App.i18n.value(() => (loadFailed ? App.i18n.html`<p class="form-help" role="alert">Notification settings could not be loaded. Refresh before making changes.</p>` : ""))}

      ${App.i18n.value(() => (live && !loadFailed ? App.i18n.html`
      <section class="card" id="pushDevicesCard">
        <div class="card-header"><div class="card-title">My devices</div></div>
        <div class="card-body">
          ${App.i18n.value(() => (devices.length
            ? App.i18n.html`<ul class="push-device-list" id="pushDeviceList">${App.i18n.value(() => (devices.map(deviceRow).join("")))}</ul>`
            : App.i18n.markup(`<p class="form-help" id="pushNoDevices">No devices yet. Turn notifications on above and this one appears here.</p>`)))}
        </div>
      </section>

      <section class="card" id="pushPrefsCard">
        <div class="card-header"><div class="card-title">What and when</div></div>
        <div class="card-body">
          <label class="field" style="flex-direction:row;align-items:center;gap:10px">
            <span>Send notifications to my devices</span>
            <span class="toggle-switch"><input type="checkbox" id="pushEnabledToggle" ${App.i18n.value(() => (pushEnabled ? "checked" : ""))}><span class="toggle-track"></span></span>
          </label>
          <fieldset class="field" style="border:0;padding:0;margin:12px 0 0">
            <legend style="font:inherit;padding:0">Tell me when</legend>
            <div class="push-type-list" id="pushTypeList">
              ${App.i18n.value(() => (allTypes.map((t) => typeRow(t, chosen.indexOf(t) >= 0)).join("")))}
            </div>
          </fieldset>
          <fieldset class="field" style="border:0;padding:0;margin:12px 0 0">
            <legend style="font:inherit;padding:0">Quiet hours (optional)</legend>
            <p class="form-help">Nothing buzzes between these times. Anything that happens meanwhile arrives when they end — it is held, not dropped. Uses your workspace's time zone.</p>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
              <label class="field" style="margin:0"><span>From</span>
                <input type="time" id="pushQuietStart" value="${App.i18n.value(() => (U().esc(quietStart)))}"></label>
              <label class="field" style="margin:0"><span>Until</span>
                <input type="time" id="pushQuietEnd" value="${App.i18n.value(() => (U().esc(quietEnd)))}"></label>
              <button type="button" class="btn btn-sm" id="pushQuietClear">Clear</button>
            </div>
          </fieldset>
          <div style="margin-top:14px">
            <button type="button" class="btn btn-primary" id="pushSavePrefs">Save</button>
          </div>
        </div>
      </section>` : ""))}
    `;

    wire(pane, panel);
  }

  function wire(pane, panel) {
    const refresh = panel.querySelector("#pushRefreshBtn");
    if (refresh) refresh.addEventListener("click", () => paint(pane));
    const renew = panel.querySelector("#pushRenewBtn");
    if (renew) renew.addEventListener("click", async () => {
      renew.disabled = true;
      const outcome = await App.push.renew(window);
      App.app.toast(outcome === "on" ? App.i18n.t("Notifications renewed for this device.")
        : App.i18n.t("Could not renew notifications. Check browser permission and try again."), outcome === "on" ? "success" : "danger");
      await paint(pane);
    });
    const test = panel.querySelector("#pushTestBtn");
    if (test) test.addEventListener("click", async () => {
      test.disabled = true;
      const result = await App.push.test(window);
      const messages = {
        queued: App.i18n.t("Test queued. It will arrive when the worker runs outside quiet hours."),
        rate_limited: App.i18n.t("Wait a minute before sending another test notification."),
        notifications_off: App.i18n.t("Turn on Send notifications to my devices before testing."),
        no_device: App.i18n.t("Renew this device before sending a test notification."),
      };
      App.i18n.setText(panel.querySelector("#pushActionStatus"), messages[result && result.outcome]
        || App.i18n.t("Could not queue the test notification. Try again."));
      test.disabled = false;
    });
    const enable = panel.querySelector("#pushEnableBtn");
    if (enable) {
      enable.addEventListener("click", async () => {
        enable.disabled = true;
        const outcome = await App.push.enable(window);
        // Said in the words of what happened, because "failed" covers
        // four quite different things from the agent's side.
        if (outcome === "on") App.app.toast(App.i18n.t("Notifications are on for this device."), "success");
        else if (outcome === "blocked") App.app.toast(App.i18n.t("This browser has blocked notifications for RealtorCRM. Allow them in its site settings and try again."), "danger");
        else if (outcome === "dismissed") App.app.toast(App.i18n.t("No change — the browser's permission box was closed."), "warning");
        else if (outcome === "not_configured") App.app.toast(STATE_WORDS.not_configured.line, "warning");
        else App.app.toast(App.i18n.t("Could not turn notifications on for this device."), "danger");
        await paint(pane);
      });
    }

    const disable = panel.querySelector("#pushDisableBtn");
    if (disable) {
      disable.addEventListener("click", async () => {
        disable.disabled = true;
        const outcome = await App.push.disable(window);
        App.app.toast(outcome === "off"
          ? App.i18n.t("Notifications are off for this device.")
          : App.i18n.t("Could not turn them off here — try again."), outcome === "off" ? "success" : "danger");
        await paint(pane);
      });
    }

    panel.querySelectorAll("[data-remove-device]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-remove-device");
        const devices = await S().push.devices().catch(() => []);
        const device = devices.find((d) => String(d.id) === id);
        if (!device) { await paint(pane); return; }
        btn.disabled = true;
        try {
          await S().push.remove(device.endpoint);
          // If it was this very browser, the browser's own subscription
          // has to go too, or it would re-appear on the next refresh.
          const mine = App.push ? await App.push.currentSubscription(window) : null;
          if (mine && mine.endpoint === device.endpoint) {
            try { await mine.unsubscribe(); } catch (e) { /* already gone */ }
          }
          App.app.toast(App.i18n.t("Device removed."), "success");
        } catch (e) {
          App.app.toast(App.i18n.t("Could not remove that device."), "danger");
        }
        await paint(pane);
      });
    });

    const clear = panel.querySelector("#pushQuietClear");
    if (clear) {
      clear.addEventListener("click", () => {
        panel.querySelector("#pushQuietStart").value = "";
        panel.querySelector("#pushQuietEnd").value = "";
      });
    }

    const save = panel.querySelector("#pushSavePrefs");
    if (save) {
      save.addEventListener("click", async () => {
        const start = panel.querySelector("#pushQuietStart").value;
        const end = panel.querySelector("#pushQuietEnd").value;
        if (!!start !== !!end) {
          App.app.toast(App.i18n.t("Quiet hours need both a start and an end."), "danger");
          return;
        }
        save.disabled = true;
        try {
          await S().push.savePreferences({
            pushEnabled: panel.querySelector("#pushEnabledToggle").checked,
            pushTypes: Array.from(panel.querySelectorAll(".push-type-box:checked")).map((c) => c.value),
            quietStart: start || null,
            quietEnd: end || null,
          });
          App.app.toast(App.i18n.t("Saved."), "success");
        } catch (e) {
          App.app.toast(App.i18n.t("Could not save: ") + ((e && e.message) || "Unknown error"), "danger");
        }
        save.disabled = false;
      });
    }
  }

  return { render, TYPE_WORDS, STATE_WORDS };
})();
