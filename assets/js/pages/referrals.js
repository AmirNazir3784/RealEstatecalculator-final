/* ============================================================
   referrals-page.js — Referrals module: list, KPIs, CRUD.
   Uses existing store.referrals. No new data structures.
   ============================================================ */

window.App = window.App || {};
App.pages = App.pages || {};

App.pages.referrals = (function () {
  "use strict";

  const U = () => App.util;
  const S = () => App.store;

  let filters = { search: "", status: "", sort: "date-desc" };

  function statusBadge(s) {
    const map = { "New": "badge-info", "Contacted": "badge-neutral", "Working": "badge-warning", "Closed Won": "badge-success", "Closed Lost": "badge-danger" };
    return App.i18n.html`<span class="badge ${App.i18n.value(() => (map[s]||"badge-neutral"))}">${App.i18n.value(() => (U().esc(s)))}</span>`;
  }
  // ---------- RENDER ----------

  async function render(container) {
    App.app.setBreadcrumbs([{ get label() { return App.i18n.t("Referrals"); } }]);
    App.app.setTopActions("");
    container.innerHTML = App.app.loadingHtml();
    await S().ensureLoaded(["referrals", "contacts", "deals"]);

    const state = S().getState();
    const all = state.referrals;
    const cur = state.settings.currency;

    // KPIs — all derived
    const converted = all.filter(r => r.status === "Closed Won");
    const active = all.filter(r => !["Closed Won","Closed Lost"].includes(r.status));
    const convRate = all.length > 0 ? Math.round((converted.length / all.length) * 100) : 0;
    // Pipeline value from referral-linked deals
    const refDealIds = new Set(all.filter(r => r.dealId).map(r => r.dealId));
    const refPipelineValue = state.deals
      .filter(d => refDealIds.has(d.id) && !App.derived.isTerminalStage(state, d.stage))
      .reduce((t,d) => t + U().num(d.salePrice), 0);

    container.innerHTML = App.i18n.html`
      <div class="page-header">
        <div>
          <div class="page-title">Referrals</div>
          <div class="page-desc">Track who referred whom, conversion status, and thank-you follow-through.</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" id="addRefBtn">${App.i18n.value(() => (App.app.icon("plus")))} Add Referral</button>
        </div>
      </div>
      <div class="stat-row">
        <div class="stat-card"><div class="k">Total Referrals</div><div class="v">${App.i18n.value(() => (all.length))}</div></div>
        <div class="stat-card"><div class="k">Active</div><div class="v">${App.i18n.value(() => (active.length))}</div></div>
        <div class="stat-card"><div class="k">Converted</div><div class="v">${App.i18n.value(() => (converted.length))}</div><div class="sub">${App.i18n.value(() => (convRate))}% conversion</div></div>
        <div class="stat-card"><div class="k">Referral Pipeline</div><div class="v">${App.i18n.value(() => (U().formatCompact(refPipelineValue, cur)))}</div><div class="sub">active deal value</div></div>
      </div>
      <div class="filter-bar">
        <div class="search-wrap">
          ${App.i18n.value(() => (App.app.icon("search")))}
          <input type="search" id="rSearch" placeholder="Search referrer or referred…" value="${App.i18n.value(() => (U().esc(filters.search)))}">
        </div>
        <select id="rStatus" aria-label="Status">
          <option value="">All statuses</option>
          ${App.i18n.value(() => (["New","Contacted","Working","Closed Won","Closed Lost"].map(s => App.i18n.html`<option value="${App.i18n.value(() => (s))}" ${App.i18n.value(() => (filters.status===s?"selected":""))}>${App.i18n.value(() => (App.i18n.t(s)))}</option>`).join("")))}
        </select>
        <select id="rSort" aria-label="Sort">
          <option value="date-desc" ${App.i18n.value(() => (filters.sort==="date-desc"?"selected":""))}>Newest first</option>
          <option value="date-asc" ${App.i18n.value(() => (filters.sort==="date-asc"?"selected":""))}>Oldest first</option>
        </select>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title" id="rCount">Loading…</div></div>
        <div class="card-body zero" id="rListWrap"></div>
      </div>
    `;

    const rr = () => renderList();
    document.getElementById("rSearch").addEventListener("input", e => { filters.search = e.target.value; rr(); });
    document.getElementById("rStatus").addEventListener("change", e => { filters.status = e.target.value; rr(); });
    document.getElementById("rSort").addEventListener("change", e => { filters.sort = e.target.value; rr(); });
    document.getElementById("addRefBtn").addEventListener("click", () => openRefModal(null));
    renderList();
  }

  function renderList() {
    const state = S().getState();
    const all = state.referrals;
    let out = all.slice();
    const f = filters;
    if (f.search) {
      const q = f.search.toLowerCase();
      out = out.filter(r => {
        const from = r.referrerId ? state.contacts.find(x => x.id === r.referrerId) : null;
        const to = r.referredContactId ? state.contacts.find(x => x.id === r.referredContactId) : null;
        return (from && from.name.toLowerCase().includes(q)) || (to && to.name.toLowerCase().includes(q)) || (r.notes||"").toLowerCase().includes(q);
      });
    }
    if (f.status) out = out.filter(r => r.status === f.status);
    out.sort((a,b) => f.sort === "date-asc" ? (a.date||"").localeCompare(b.date||"") : (b.date||"").localeCompare(a.date||""));

    App.i18n.setText(document.getElementById("rCount"), App.i18n.text`${App.i18n.value(() => (out.length))} of ${App.i18n.value(() => (all.length))} referral${App.i18n.value(() => (all.length===1?"":"s"))}`);
    const wrap = document.getElementById("rListWrap");

    if (!out.length) {
      wrap.innerHTML = all.length === 0
        ? App.i18n.html`<div class="empty"><div class="empty-icon">${App.i18n.value(() => (App.app.icon("share")))}</div><h3>No referrals yet</h3><p>Track who referred whom to stay on top of thank-yous and conversion.</p><button class="btn btn-primary" onclick="App.pages.referrals.openRefModal(null)">Add Referral</button></div>`
        : App.i18n.markup(`<div class="empty"><h3>No matches</h3><p>Adjust your filters.</p></div>`);
      return;
    }

    const cur = state.settings.currency;
    wrap.innerHTML = out.map(r => {
      const from = r.referrerId ? state.contacts.find(x => x.id === r.referrerId) : null;
      const to = r.referredContactId ? state.contacts.find(x => x.id === r.referredContactId) : null;
      const deal = r.dealId ? state.deals.find(x => x.id === r.dealId) : null;
      return App.i18n.html`
        <div class="item-row clickable" data-ref-id="${App.i18n.value(() => (r.id))}">
          <div class="icon-slot">${App.i18n.value(() => (App.app.icon("share")))}</div>
          <div class="body">
            <div class="title">
              ${App.i18n.value(() => (from ? App.i18n.html`<a class="link" href="#/contacts/${App.i18n.value(() => (from.id))}" onclick="event.stopPropagation()">${App.i18n.value(() => (U().esc(from.name)))}</a>` : App.i18n.t("Someone")))}
              → ${App.i18n.value(() => (to ? App.i18n.html`<a class="link" href="#/contacts/${App.i18n.value(() => (to.id))}" onclick="event.stopPropagation()">${App.i18n.value(() => (U().esc(to.name)))}</a>` : App.i18n.t("Someone")))}
            </div>
            <div class="sub">
              ${App.i18n.value(() => (statusBadge(r.status)))}
              ${App.i18n.value(() => (r.date ? " · " + U().formatDate(r.date) : ""))}
              ${App.i18n.value(() => (deal ? ' · <a class="link" href="#/pipeline/'+deal.id+'" onclick="event.stopPropagation()">'+U().esc(deal.name)+'</a>' : ""))}
              ${App.i18n.value(() => (r.thankYouSent ? App.i18n.markup(' · <span class="badge badge-success">Thank-you sent</span>') : ""))}
              ${App.i18n.value(() => (r.thankYouExpense ? " · Gift " + U().formatCurrency(r.thankYouExpense, cur) : ""))}
            </div>
          </div>
          <div class="meta-right">${App.i18n.value(() => (r.date ? U().relativeDayLabel(r.date) : "—"))}</div>
        </div>
      `;
    }).join("");

    wrap.querySelectorAll("[data-ref-id]").forEach(el => {
      el.addEventListener("click", () => openRefModal(el.getAttribute("data-ref-id")));
    });
  }

  // ---------- ADD / EDIT MODAL ----------

  async function openRefModal(id) {
    const editing = !!id;
    await S().ensureLoaded(["referrals", "contacts", "deals"]);
    const state = S().getState();
    const existing = editing ? state.referrals.find(x => x.id === id) : null;
    if (editing && !existing) { App.app.toast(App.i18n.t("Referral not found."), "danger"); return; }

    const r = existing || { referrerId: null, referredContactId: null, date: U().todayISO(), status: "New", dealId: null, notes: "", thankYouSent: false, thankYouExpense: 0 };
    const contacts = state.contacts.slice().sort((a,b) => a.name.localeCompare(b.name));
    const deals = state.deals.slice().sort((a,b) => (a.name||"").localeCompare(b.name||""));

    const body = App.i18n.html`
      <form id="refForm" novalidate>
        <div class="form-grid">
          <div class="form-field">
            <label for="rfFrom">Referrer <span class="req">*</span></label>
            <select id="rfFrom" required>
              <option value="">— select —</option>
              ${App.i18n.value(() => (contacts.map(c => App.i18n.html`<option value="${App.i18n.value(() => (c.id))}" ${App.i18n.value(() => (r.referrerId===c.id?"selected":""))}>${App.i18n.value(() => (U().esc(c.name)))} (${App.i18n.value(() => (U().esc(c.role)))})</option>`).join("")))}
            </select>
            <div class="err">Referrer is required.</div>
          </div>
          <div class="form-field">
            <label for="rfTo">Referred Contact <span class="req">*</span></label>
            <select id="rfTo" required>
              <option value="">— select —</option>
              ${App.i18n.value(() => (contacts.map(c => App.i18n.html`<option value="${App.i18n.value(() => (c.id))}" ${App.i18n.value(() => (r.referredContactId===c.id?"selected":""))}>${App.i18n.value(() => (U().esc(c.name)))} (${App.i18n.value(() => (U().esc(c.role)))})</option>`).join("")))}
            </select>
            <div class="err">Referred contact is required.</div>
          </div>
          <div class="form-field">
            <label for="rfDate">Date</label>
            <input type="date" id="rfDate" value="${App.i18n.value(() => (r.date||U().todayISO()))}">
          </div>
          <div class="form-field">
            <label for="rfStatus">Status</label>
            <select id="rfStatus">${App.i18n.value(() => (["New","Contacted","Working","Closed Won","Closed Lost"].map(s => App.i18n.html`<option value="${App.i18n.value(() => (s))}" ${App.i18n.value(() => (r.status===s?"selected":""))}>${App.i18n.value(() => (App.i18n.t(s)))}</option>`).join("")))}</select>
          </div>
          <div class="form-field">
            <label for="rfDeal">Related Deal</label>
            <select id="rfDeal"><option value="">— none —</option>${App.i18n.value(() => (deals.map(d => App.i18n.html`<option value="${App.i18n.value(() => (d.id))}" ${App.i18n.value(() => (r.dealId===d.id?"selected":""))}>${App.i18n.value(() => (U().esc(d.name)))}</option>`).join("")))}</select>
          </div>
          <div class="form-field">
            <label for="rfThankYou">Thank-you sent?</label>
            <select id="rfThankYou"><option value="false" ${App.i18n.value(() => (!r.thankYouSent?"selected":""))}>No</option><option value="true" ${App.i18n.value(() => (r.thankYouSent?"selected":""))}>Yes</option></select>
          </div>
          <div class="form-field">
            <label for="rfExpense">Thank-you Expense ($)</label>
            <input type="number" id="rfExpense" min="0" step="1" value="${App.i18n.value(() => (r.thankYouExpense||0))}">
          </div>
          <div class="form-field full">
            <label for="rfNotes">Notes</label>
            <textarea id="rfNotes" rows="3">${App.i18n.value(() => (U().esc(r.notes)))}</textarea>
          </div>
        </div>
      </form>
    `;

    const footer = App.i18n.html`
      ${App.i18n.value(() => (editing ? App.i18n.markup('<button class="btn btn-danger" data-role="delete">Delete</button>') : ''))}
      <button class="btn" data-role="cancel">Cancel</button>
      <button class="btn btn-primary" data-role="save">${App.i18n.value(() => (editing ? App.i18n.t("Save") : App.i18n.t("Add Referral")))}</button>
    `;

    const handle = App.app.openModal({
      title: editing ? "Edit Referral" : "Add Referral", body, footer,
      onOpen: (modal) => {
        modal.querySelector('[data-role="cancel"]').addEventListener("click", () => handle.close());
        modal.querySelector('[data-role="save"]').addEventListener("click", async () => {
          const fromField = document.getElementById("rfFrom").closest(".form-field");
          const toField = document.getElementById("rfTo").closest(".form-field");
          [fromField, toField].forEach(f => f.classList.remove("has-error"));
          let valid = true;
          if (!document.getElementById("rfFrom").value) { fromField.classList.add("has-error"); valid = false; }
          if (!document.getElementById("rfTo").value) { toField.classList.add("has-error"); valid = false; }
          if (!valid) return;

          const patch = {
            referrerId: document.getElementById("rfFrom").value,
            referredContactId: document.getElementById("rfTo").value,
            date: document.getElementById("rfDate").value || U().todayISO(),
            status: document.getElementById("rfStatus").value,
            dealId: document.getElementById("rfDeal").value || null,
            thankYouSent: document.getElementById("rfThankYou").value === "true",
            thankYouExpense: U().num(document.getElementById("rfExpense").value),
            notes: document.getElementById("rfNotes").value
          };
          const saveBtn = modal.querySelector('[data-role="save"]');
          saveBtn.disabled = true;
          try {
            if (editing) { await S().referrals.update(id, patch); App.app.toast(App.i18n.t("Referral updated."), "success"); }
            else { await S().referrals.create(patch); App.app.toast(App.i18n.t("Referral added."), "success"); }
            handle.close();
            App.app.route();
          } catch (err) {
            App.app.toast(App.i18n.t("Could not save referral: ") + err.message, "danger");
            saveBtn.disabled = false;
          }
        });
        const delBtn = modal.querySelector('[data-role="delete"]');
        if (delBtn) delBtn.addEventListener("click", () => {
          App.app.confirmDialog({ get title() { return App.i18n.t("Delete Referral?"); }, get message() { return App.i18n.t("This will permanently delete this referral."); }, okLabel: "Delete", danger: true }, async () => {
            try {
              await S().referrals.delete(id);
              App.app.toast(App.i18n.t("Referral deleted."), "success");
              handle.close();
              App.app.route();
            } catch (err) {
              App.app.toast(App.i18n.t("Could not delete referral: ") + err.message, "danger");
            }
          });
        });
      }
    });
  }

  return { render, openRefModal };
})();

