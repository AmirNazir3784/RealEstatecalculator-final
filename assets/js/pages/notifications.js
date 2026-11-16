/* ============================================================
   notifications.js — in-app notifications (Phase 4H).

   App.notificationsUI: the bell in the app header, its unread badge and
   the dropdown panel (latest 20). App.pages.notifications: the full
   /notifications page with filters and paging.

   Data only through App.store.notifications (read + mark read) and, for
   "Mark as Hot", App.store.contacts.update — never Supabase directly.
   Every piece of notification text is escaped before it is shown, and a
   notification can only ever navigate to an allow-listed internal route
   (the same list the database enforces), never to a URL.

   Freshness: the unread count is re-read every 60 seconds while the tab
   is visible and whenever the window regains focus; polling stops while
   the tab is hidden. (Supabase Realtime was not added: polling is simple,
   cheap at this size, and has no extra moving parts. It can be layered on
   later with polling kept as the fallback.)

   Depends on: util.js (esc), app.js (navigate, toast, icon), store.js
   ============================================================ */

window.App = window.App || {};
App.pages = App.pages || {};

App.notificationsUI = (function () {
  "use strict";

  const U = () => App.util;
  const S = () => App.store;

  const POLL_MS = 60 * 1000;
  const PANEL_SIZE = 20;
  // Mirrors the database's link_route check. Anything else is ignored.
  const ALLOWED_ROUTE = /^\/(contacts(\/[A-Za-z0-9_-]{1,120})?|pipeline(\/[A-Za-z0-9_-]{1,120})?|tasks|settings\/sheet-imports|automation|notifications)$/;

  const SVG = (inner) => App.i18n.html`<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${App.i18n.value(() => (inner))}</svg>`;
  const ICONS = {
    bell: SVG(App.i18n.markup('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>')),
    reply: SVG(App.i18n.markup('<polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>')),
    hot: SVG(App.i18n.markup('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>')),
    unsubscribed: SVG(App.i18n.markup('<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/>')),
    spam: SVG(App.i18n.markup('<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>')),
    bounce: SVG(App.i18n.markup('<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><line x1="9" y1="10" x2="15" y2="16"/><line x1="15" y1="10" x2="9" y2="16"/>')),
    import: SVG(App.i18n.markup('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>')),
    failed: SVG(App.i18n.markup('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'))
  };
  // Per type: which icon, its tone (a CSS modifier) and a short word for
  // screen readers.
  const TYPES = {
    lead_replied: { icon: "reply", tone: "accent", get label() { return App.i18n.t("Reply"); } },
    hot_reply: { icon: "hot", tone: "hot", get label() { return App.i18n.t("Hot reply"); } },
    unsubscribed: { icon: "unsubscribed", tone: "warning", get label() { return App.i18n.t("Unsubscribed"); } },
    spam_report: { icon: "spam", tone: "danger", get label() { return App.i18n.t("Spam report"); } },
    email_bounced: { icon: "bounce", tone: "warning", get label() { return App.i18n.t("Bounced email"); } },
    import_finished: { icon: "import", tone: "neutral", get label() { return App.i18n.t("Import"); } },
    followup_failed: { icon: "failed", tone: "danger", get label() { return App.i18n.t("Follow-up problem"); } },
    new_lead: { icon: "bell", tone: "accent", get label() { return App.i18n.t("New lead"); } },
    task_reminder: { icon: "bell", tone: "warning", get label() { return App.i18n.t("Task reminder"); } },
    deal_assigned: { icon: "bell", tone: "accent", get label() { return App.i18n.t("Deal assigned"); } },
    push_test: { icon: "bell", tone: "neutral", get label() { return App.i18n.t("Test notification"); } }
  };
  const typeInfo = (t) => (Object.prototype.hasOwnProperty.call(TYPES, t) ? TYPES[t] : TYPES.import_finished);

  function safeRoute(route) {
    return typeof route === "string" && ALLOWED_ROUTE.test(route) ? route : null;
  }

  function badgeText(n) {
    n = Number(n) || 0;
    if (n <= 0) return "";
    return n > 9 ? "9+" : String(n);
  }

  // "just now", "5 min ago", "3 hours ago", "yesterday", "4 days ago", or a date.
  function relativeTime(iso, now) {
    const t = new Date(iso).getTime();
    if (!isFinite(t)) return "";
    const nowMs = (now ? new Date(now) : new Date()).getTime();
    const s = Math.max(0, Math.round((nowMs - t) / 1000));
    if (App.i18n && App.i18n.locale() !== "en") {
      const locale = App.i18n.locale(), relative = new Intl.RelativeTimeFormat(locale, { numeric:"auto" });
      if (s < 60) return relative.format(0,"second");
      if (s < 3600) return relative.format(-Math.floor(s/60),"minute");
      if (s < 86400) return relative.format(-Math.floor(s/3600),"hour");
      if (s < 604800) return relative.format(-Math.floor(s/86400),"day");
      return new Intl.DateTimeFormat(locale,{month:"short",day:"numeric",year:"numeric"}).format(new Date(t));
    }
    if (s < 60) return "just now";
    const m = Math.floor(s / 60);
    if (m < 60) return m + " min ago";
    const h = Math.floor(m / 60);
    if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
    const d = Math.floor(h / 24);
    if (d === 1) return "yesterday";
    if (d < 7) return d + " days ago";
    return new Date(t).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  }

  const canMarkHot = (n) => (n.type === "lead_replied" || n.type === "hot_reply") && typeof n.contact_id === "string" && n.contact_id;

  // Keep this English source map aligned with _shared/notification-copy.ts.
  // Catalogs supply the browser language; never translate arbitrary record text.
  const SYSTEM_COPY = {
  "lead_replied": [
    "A lead replied",
    "Open your inbox to review the reply."
  ],
  "hot_reply": [
    "A lead showed strong interest",
    "Open your inbox and review your next steps."
  ],
  "unsubscribed": [
    "A contact unsubscribed",
    "Email follow-ups have stopped for this contact."
  ],
  "spam_report": [
    "A contact reported spam",
    "Review the contact's email preferences before following up."
  ],
  "email_bounced": [
    "An email could not be delivered",
    "Review the contact's email address before sending again."
  ],
  "import_finished": [
    "A lead import finished",
    "Open import history to review the results."
  ],
  "followup_failed": [
    "A follow-up needs attention",
    "Open your follow-up plans to review a failed step."
  ],
  "contact_untouched": [
    "A lead is waiting for contact",
    "Open Contacts to review leads that need a response."
  ],
  "overdue_followups": [
    "Follow-ups are overdue",
    "Open Contacts to review your overdue follow-ups."
  ],
  "new_lead": [
    "A new lead is ready",
    "Open Contacts to review the new lead."
  ],
  "task_reminder": [
    "Tasks need your attention",
    "Open Tasks to review your upcoming, due and overdue work."
  ],
  "deal_assigned": [
    "A deal was assigned to you",
    "Open the deal to review your next steps."
  ],
  "push_test": [
    "Test notification",
    "You can receive RealtorCRM notifications on this device."
  ]
};
  function displayCopy(n) {
    const copy = Object.prototype.hasOwnProperty.call(SYSTEM_COPY,n.type) ? SYSTEM_COPY[n.type] : null;
    return copy ? { get title() { return App.i18n.t(copy[0]); }, get body() { return App.i18n.t(copy[1]); } } : { title:n.title, body:n.body };
  }

  // One notification as a list item. Used by the panel and the page.
  function itemHtml(n, now) {
    const info = typeInfo(n.type);
    const unread = !n.read_at;
    const copy = displayCopy(n);
    return App.i18n.html`
      <li class="notif-item${App.i18n.value(() => (unread ? " notif-unread" : ""))}" data-notif-id="${App.i18n.value(() => (U().esc(n.id)))}">
        <button type="button" class="notif-open" data-notif-open="${App.i18n.value(() => (U().esc(n.id)))}">
          <span class="notif-icon notif-tone-${App.i18n.value(() => (info.tone))}" aria-hidden="true">${App.i18n.value(() => (ICONS[info.icon]))}</span>
          <span class="notif-text">
            <span class="sr-only">${App.i18n.value(() => (U().esc(info.label)))}${App.i18n.value(() => (unread ? App.i18n.t(", unread") : ""))}: </span>
            <span class="notif-title">${App.i18n.value(() => (U().esc(copy.title)))}</span>
            ${App.i18n.value(() => (copy.body ? App.i18n.html`<span class="notif-body">${App.i18n.value(() => (U().esc(copy.body)))}</span>` : ""))}
            <span class="notif-time">${App.i18n.value(() => (U().esc(relativeTime(n.created_at, now))))}</span>
          </span>
          ${App.i18n.value(() => (unread ? App.i18n.markup('<span class="notif-dot" aria-hidden="true"></span>') : ""))}
        </button>
        ${App.i18n.value(() => (canMarkHot(n) ? App.i18n.html`<button type="button" class="btn btn-sm notif-hot-btn" data-notif-hot="${App.i18n.value(() => (U().esc(n.id)))}">Mark as Hot</button>` : ""))}
      </li>`;
  }

  // Marks one notification read (if it isn't) and follows its link.
  async function openNotification(n, after) {
    if (!n) return;
    if (!n.read_at) {
      try {
        await S().notifications.markRead(n.id);
        n.read_at = new Date().toISOString();
      } catch (e) { /* still navigate; the badge refresh will catch up */ }
    }
    if (typeof after === "function") after();
    refreshCount();
    const route = safeRoute(n.link_route);
    if (route) App.app.navigate(route);
  }

  async function markHot(n, btn) {
    if (!canMarkHot(n)) return;
    if (btn) btn.disabled = true;
    try {
      await S().contacts.update(n.contact_id, { temperature: "Hot" });
      if (btn) App.i18n.setText(btn, App.i18n.message("Marked as Hot"));
      App.app.toast(App.i18n.t("Contact marked as Hot."), "success");
    } catch (e) {
      if (btn) btn.disabled = false;
      App.app.toast(App.i18n.t("Couldn't mark this contact as Hot. Please try again."), "danger");
    }
  }

  // Wires open / Mark-as-Hot clicks inside a rendered list.
  function wireList(root, items, afterOpen) {
    const byId = {};
    items.forEach((n) => { byId[n.id] = n; });
    root.querySelectorAll("[data-notif-open]").forEach((b) => {
      b.addEventListener("click", () => openNotification(byId[b.getAttribute("data-notif-open")], afterOpen));
    });
    root.querySelectorAll("[data-notif-hot]").forEach((b) => {
      b.addEventListener("click", (e) => { e.stopPropagation(); markHot(byId[b.getAttribute("data-notif-hot")], b); });
    });
  }

  // ------------------------------------------------ the bell
  let host = null;
  let unread = 0;
  let timer = null;
  let panelOpen = false;
  let pollMs = POLL_MS;
  let listeners = [];

  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    listeners.push(() => target.removeEventListener(type, fn, opts));
  }

  function paintBadge() {
    if (!host) return;
    const btn = host.querySelector("#notifBell");
    const badge = host.querySelector("#notifBadge");
    if (!btn || !badge) return;
    const text = badgeText(unread);
    App.i18n.setText(badge, App.i18n.value(() => (text)));
    badge.hidden = !text;
    btn.setAttribute("aria-label", unread > 0 ? `Notifications, ${unread} unread` : "Notifications");
  }

  async function refreshCount() {
    if (!host || !S() || !S().notifications) return;
    try {
      unread = Number(await S().notifications.unreadCount()) || 0;
    } catch (e) {
      return; // keep the last known count; the next poll tries again
    }
    paintBadge();
  }

  function isVisible() {
    return typeof document === "undefined" || document.visibilityState !== "hidden";
  }
  function startPolling() {
    stopPolling();
    if (!isVisible()) return;
    timer = setInterval(refreshCount, pollMs);
  }
  function stopPolling() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  async function renderPanel() {
    const panel = host && host.querySelector("#notifPanel");
    if (!panel) return;
    const list = panel.querySelector('[data-role="notif-list"]');
    list.innerHTML = App.i18n.markup(`<li class="notif-empty">Loading…</li>`);
    let result;
    try {
      result = await S().notifications.list({ limit: PANEL_SIZE });
    } catch (e) {
      list.innerHTML = App.i18n.markup(`<li class="notif-empty">Notifications couldn't be loaded. Try again in a moment.</li>`);
      return;
    }
    if (!panelOpen) return;
    const rows = result.rows || [];
    const now = new Date();
    list.innerHTML = rows.length
      ? rows.map((n) => itemHtml(n, now)).join("")
      : App.i18n.markup(`<li class="notif-empty">You're all caught up. New replies, imports and problems will show up here.</li>`);
    wireList(list, rows, closePanel);
  }

  function openPanel() {
    const panel = host.querySelector("#notifPanel");
    const btn = host.querySelector("#notifBell");
    panelOpen = true;
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    document.addEventListener("click", onDocClick, true);
    document.addEventListener("keydown", onDocKey, true);
    const heading = panel.querySelector("#notifPanelTitle");
    if (heading) try { heading.focus(); } catch (e) { /* ignore */ }
    renderPanel().then(() => refreshCount());
  }

  function closePanel(returnFocus) {
    if (!host) return;
    const panel = host.querySelector("#notifPanel");
    const btn = host.querySelector("#notifBell");
    panelOpen = false;
    if (panel) panel.hidden = true;
    if (btn) btn.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", onDocClick, true);
    document.removeEventListener("keydown", onDocKey, true);
    if (returnFocus && btn) btn.focus();
  }

  function onDocClick(e) { if (host && !host.contains(e.target)) closePanel(false); }
  function onDocKey(e) { if (e.key === "Escape") { e.preventDefault(); closePanel(true); } }

  // Puts the bell and its panel into `el` (the header slot) and starts
  // keeping the count fresh. opts.pollMs is for tests.
  function mount(el, opts) {
    if (!el) return null;
    stop();
    host = el;
    pollMs = (opts && opts.pollMs) || POLL_MS;
    unread = 0;
    host.innerHTML = App.i18n.html`
      <button type="button" class="notif-bell" id="notifBell" aria-haspopup="dialog" aria-expanded="false" aria-controls="notifPanel" aria-label="Notifications" title="Notifications">
        ${App.i18n.value(() => (ICONS.bell))}
        <span class="notif-badge" id="notifBadge" aria-hidden="true" hidden></span>
      </button>
      <div class="notif-panel" id="notifPanel" role="dialog" aria-labelledby="notifPanelTitle" hidden>
        <div class="notif-panel-head">
          <h2 class="notif-panel-title" id="notifPanelTitle" tabindex="-1">Notifications</h2>
          <button type="button" class="btn btn-ghost btn-sm" data-role="notif-mark-all">Mark all as read</button>
        </div>
        <ul class="notif-list" data-role="notif-list"></ul>
        <div class="notif-panel-foot">
          <button type="button" class="btn btn-ghost btn-sm" data-role="notif-see-all">See all</button>
        </div>
      </div>`;
    const btn = host.querySelector("#notifBell");
    btn.addEventListener("click", () => { if (panelOpen) closePanel(false); else openPanel(); });
    host.querySelector('[data-role="notif-mark-all"]').addEventListener("click", async () => {
      try {
        await S().notifications.markAllRead();
      } catch (e) {
        App.app.toast(App.i18n.t("Couldn't mark notifications as read. Please try again."), "danger");
        return;
      }
      unread = 0;
      paintBadge();
      await renderPanel();
    });
    host.querySelector('[data-role="notif-see-all"]').addEventListener("click", () => {
      closePanel(false);
      App.app.navigate("/notifications");
    });

    on(document, "visibilitychange", () => {
      if (isVisible()) { refreshCount(); startPolling(); } else stopPolling();
    });
    on(window, "focus", () => refreshCount());

    paintBadge();
    refreshCount();
    startPolling();
    return { refresh: refreshCount, stop };
  }

  // Stops polling and removes every listener (sign-out, tests).
  function stop() {
    stopPolling();
    closePanel(false);
    listeners.forEach((off) => off());
    listeners = [];
  }

  return {
    mount, stop, refresh: refreshCount,
    // shared with the page
    itemHtml, wireList, safeRoute, badgeText, relativeTime,
    _isPolling: () => !!timer
  };
})();

App.pages.notifications = (function () {
  "use strict";

  const U = () => App.util;
  const S = () => App.store;
  const UI = () => App.notificationsUI;
  const PAGE_SIZE = 25;
  const FILTERS = [
    { id: "all", get label() { return App.i18n.t("All"); } },
    { id: "unread", get label() { return App.i18n.t("Unread"); } },
    { id: "replies", get label() { return App.i18n.t("Replies"); } },
    { id: "hot", get label() { return App.i18n.t("Hot"); } },
    { id: "imports", get label() { return App.i18n.t("Imports"); } },
    { id: "problems", get label() { return App.i18n.t("Problems"); } }
  ];

  async function render(page) {
    App.app.setBreadcrumbs([{ get label() { return App.i18n.t("Notifications"); } }]);
    const state = { filter: "all", offset: 0 };
    page.innerHTML = App.i18n.html`
      <div class="page-header">
        <div>
          <h1 class="page-title">Notifications</h1>
          <p class="page-subtitle">Replies, unsubscribes, imports and follow-up problems, newest first.</p>
        </div>
        <div class="page-actions">
          <button type="button" class="btn" data-role="notif-page-mark-all">Mark all as read</button>
        </div>
      </div>
      <div class="notif-filters" role="group" aria-label="Show">
        ${App.i18n.value(() => (FILTERS.map((f) => App.i18n.html`<button type="button" class="btn btn-sm notif-filter" data-filter="${App.i18n.value(() => (f.id))}" aria-pressed="${App.i18n.value(() => (f.id === "all"))}">${App.i18n.value(() => (U().esc(f.label)))}</button>`).join("")))}
      </div>
      <section class="card">
        <ul class="notif-list notif-list-page" data-role="notif-page-list" aria-live="polite"></ul>
        <div class="notif-pager" data-role="notif-pager"></div>
      </section>`;

    const list = page.querySelector('[data-role="notif-page-list"]');
    const pager = page.querySelector('[data-role="notif-pager"]');

    async function load() {
      list.innerHTML = App.i18n.markup(`<li class="notif-empty">Loading…</li>`);
      pager.innerHTML = "";
      let result;
      try {
        result = await S().notifications.list({ filter: state.filter, limit: PAGE_SIZE, offset: state.offset });
      } catch (e) {
        list.innerHTML = App.i18n.markup(`<li class="notif-empty">Notifications couldn't be loaded. <button type="button" class="btn btn-sm" data-role="notif-retry">Try again</button></li>`);
        list.querySelector('[data-role="notif-retry"]').addEventListener("click", load);
        return;
      }
      const rows = result.rows || [];
      const now = new Date();
      list.innerHTML = rows.length
        ? rows.map((n) => UI().itemHtml(n, now)).join("")
        : App.i18n.html`<li class="notif-empty">${App.i18n.value(() => (state.filter === "all" ? App.i18n.t("No notifications yet.") : App.i18n.t("Nothing here for this filter.")))}</li>`;
      UI().wireList(list, rows, null);
      const total = result.total || 0;
      const from = total ? state.offset + 1 : 0;
      const to = Math.min(state.offset + rows.length, total);
      pager.innerHTML = total > PAGE_SIZE ? App.i18n.html`
        <span class="form-help">${App.i18n.value(() => (U().esc(from)))}–${App.i18n.value(() => (U().esc(to)))} of ${App.i18n.value(() => (U().esc(total)))}</span>
        <button type="button" class="btn btn-sm" data-role="notif-prev" ${App.i18n.value(() => (state.offset > 0 ? "" : "disabled"))}>Previous</button>
        <button type="button" class="btn btn-sm" data-role="notif-next" ${App.i18n.value(() => (to < total ? "" : "disabled"))}>Next</button>` : "";
      const prev = pager.querySelector('[data-role="notif-prev"]');
      const next = pager.querySelector('[data-role="notif-next"]');
      if (prev) prev.addEventListener("click", () => { state.offset = Math.max(0, state.offset - PAGE_SIZE); load(); });
      if (next) next.addEventListener("click", () => { state.offset += PAGE_SIZE; load(); });
    }

    page.querySelectorAll("[data-filter]").forEach((b) => {
      b.addEventListener("click", () => {
        state.filter = b.getAttribute("data-filter");
        state.offset = 0;
        page.querySelectorAll("[data-filter]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        load();
      });
    });
    page.querySelector('[data-role="notif-page-mark-all"]').addEventListener("click", async () => {
      try {
        await S().notifications.markAllRead();
      } catch (e) {
        App.app.toast(App.i18n.t("Couldn't mark notifications as read. Please try again."), "danger");
        return;
      }
      UI().refresh();
      load();
    });

    await load();
  }

  return { render };
})();
