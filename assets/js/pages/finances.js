/* ============================================================
   finances-page.js — Income & Expenses tracker.
   Uses store.income and store.expenses.
   ============================================================ */

window.App = window.App || {};
App.pages = App.pages || {};

App.pages.finances = (function () {
  "use strict";

  const U = () => App.util;
  const S = () => App.store;

  let tab = "income"; // "income" | "expenses"
  let filters = { search: "", category: "", sort: "date-desc" };

  const INCOME_CATS  = ["Commission", "Referral Income", "Bonus", "Other"];
  const EXPENSE_CATS = ["Marketing", "Brokerage", "Referral", "Software", "Office", "Travel", "Education", "Other"];

  // ---------- DERIVED KPIs ----------

  function calcKPIs() {
    const today = U().todayISO();
    const thisMonth = today.slice(0, 7);
    const thisYear = U().dateYear(today);
    const state = S().getState();
    const allInc = state.income;
    const allExp = state.expenses;

    const totalIncome   = allInc.reduce((t, r) => t + U().num(r.amount), 0);
    const totalExpenses = allExp.reduce((t, r) => t + U().num(r.amount), 0);
    const monthInc  = allInc.filter(r => r.date && r.date.slice(0,7) === thisMonth).reduce((t,r) => t + U().num(r.amount), 0);
    const monthExp  = allExp.filter(r => r.date && r.date.slice(0,7) === thisMonth).reduce((t,r) => t + U().num(r.amount), 0);
    const ytdInc    = allInc.filter(r => r.date && U().dateYear(r.date) === thisYear).reduce((t,r) => t + U().num(r.amount), 0);
    const ytdExp    = allExp.filter(r => r.date && U().dateYear(r.date) === thisYear).reduce((t,r) => t + U().num(r.amount), 0);

    return { totalIncome, totalExpenses, netIncome: totalIncome - totalExpenses,
             monthInc, monthExp, monthNet: monthInc - monthExp,
             ytdInc, ytdExp, ytdNet: ytdInc - ytdExp };
  }

  // ---------- RENDER ----------

  async function render(container) {
    App.app.setBreadcrumbs([{ get label() { return App.i18n.t("Income & Expenses"); } }]);
    App.app.setTopActions("");
    container.innerHTML = App.app.loadingHtml();
    await S().ensureLoaded(["income", "expenses", "contacts", "deals"]);

    const cur = S().getState().settings.currency;
    const kpi = calcKPIs();
    const fmt = (v) => U().formatCurrency(v, cur);
    const fmtS = (v) => U().formatCompact(v, cur);

    container.innerHTML = App.i18n.html`
      <div class="page-header">
        <div>
          <div class="page-title">Income & Expenses</div>
          <div class="page-desc">Track business income and expenses. All numbers calculated live from your records.</div>
        </div>
        <div class="page-actions">
          <button class="btn" id="addIncBtn">${App.i18n.value(() => (App.app.icon("plus")))} Add Income</button>
          <button class="btn btn-primary" id="addExpBtn">${App.i18n.value(() => (App.app.icon("plus")))} Add Expense</button>
        </div>
      </div>

      <div class="stat-row" style="grid-template-columns:repeat(3,1fr);">
        <div class="stat-card"><div class="k">Total Income</div><div class="v" style="color:var(--success)">${App.i18n.value(() => (fmtS(kpi.totalIncome)))}</div><div class="sub">${App.i18n.value(() => (fmt(kpi.totalIncome)))}</div></div>
        <div class="stat-card"><div class="k">Total Expenses</div><div class="v" style="color:var(--danger)">${App.i18n.value(() => (fmtS(kpi.totalExpenses)))}</div><div class="sub">${App.i18n.value(() => (fmt(kpi.totalExpenses)))}</div></div>
        <div class="stat-card"><div class="k">Net Income</div><div class="v" style="color:${App.i18n.value(() => (kpi.netIncome>=0?'var(--success)':'var(--danger)'))}">${App.i18n.value(() => (fmtS(kpi.netIncome)))}</div><div class="sub">${App.i18n.value(() => (fmt(kpi.netIncome)))}</div></div>
      </div>
      <div class="stat-row" style="grid-template-columns:repeat(3,1fr);">
        <div class="stat-card"><div class="k">This Month Income</div><div class="v">${App.i18n.value(() => (fmt(kpi.monthInc)))}</div></div>
        <div class="stat-card"><div class="k">This Month Expenses</div><div class="v">${App.i18n.value(() => (fmt(kpi.monthExp)))}</div></div>
        <div class="stat-card"><div class="k">This Month Net</div><div class="v" style="color:${App.i18n.value(() => (kpi.monthNet>=0?'var(--success)':'var(--danger)'))}">${App.i18n.value(() => (fmt(kpi.monthNet)))}</div></div>
      </div>

      <div class="filter-bar">
        <button class="btn btn-sm ${App.i18n.value(() => (tab==='income'?'btn-primary':''))}" id="tabIncome">Income</button>
        <button class="btn btn-sm ${App.i18n.value(() => (tab==='expenses'?'btn-primary':''))}" id="tabExpenses">Expenses</button>
        <div style="flex:1"></div>
        <div class="search-wrap" style="min-width:180px;">
          ${App.i18n.value(() => (App.app.icon("search")))}
          <input type="search" id="fSearch" placeholder="Search…" value="${App.i18n.value(() => (U().esc(filters.search)))}">
        </div>
        <select id="fCat" aria-label="Category">
          <option value="">All categories</option>
          ${App.i18n.value(() => ((tab === "income" ? INCOME_CATS : EXPENSE_CATS).map(c => App.i18n.html`<option value="${App.i18n.value(() => (c))}" ${App.i18n.value(() => (filters.category===c?"selected":""))}>${App.i18n.value(() => (c))}</option>`).join("")))}
        </select>
        <select id="fSort" aria-label="Sort">
          <option value="date-desc" ${App.i18n.value(() => (filters.sort==="date-desc"?"selected":""))}>Newest</option>
          <option value="date-asc" ${App.i18n.value(() => (filters.sort==="date-asc"?"selected":""))}>Oldest</option>
          <option value="amount-desc" ${App.i18n.value(() => (filters.sort==="amount-desc"?"selected":""))}>Highest amount</option>
        </select>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title" id="fCount">Loading…</div></div>
        <div class="card-body zero" id="fListWrap"></div>
      </div>
    `;

    document.getElementById("tabIncome").addEventListener("click", () => { tab = "income"; filters.category = ""; render(container); });
    document.getElementById("tabExpenses").addEventListener("click", () => { tab = "expenses"; filters.category = ""; render(container); });
    document.getElementById("fSearch").addEventListener("input", e => { filters.search = e.target.value; renderList(); });
    document.getElementById("fCat").addEventListener("change", e => { filters.category = e.target.value; renderList(); });
    document.getElementById("fSort").addEventListener("change", e => { filters.sort = e.target.value; renderList(); });
    document.getElementById("addIncBtn").addEventListener("click", () => openFinanceModal("income", null));
    document.getElementById("addExpBtn").addEventListener("click", () => openFinanceModal("expenses", null));
    renderList();
  }

  function renderList() {
    const state = S().getState();
    const cur = state.settings.currency;
    const collection = tab === "income" ? S().income : S().expenses;
    const all = tab === "income" ? state.income : state.expenses;
    let out = all.slice();
    if (filters.search) {
      const q = filters.search.toLowerCase();
      out = out.filter(r => (r.description||"").toLowerCase().includes(q) || (r.notes||"").toLowerCase().includes(q) || (r.category||"").toLowerCase().includes(q));
    }
    if (filters.category) out = out.filter(r => r.category === filters.category);
    switch (filters.sort) {
      case "date-asc":    out.sort((a,b) => (a.date||"").localeCompare(b.date||"")); break;
      case "amount-desc": out.sort((a,b) => U().num(b.amount) - U().num(a.amount)); break;
      default:            out.sort((a,b) => (b.date||"").localeCompare(a.date||""));
    }

    App.i18n.setText(document.getElementById("fCount"), App.i18n.text`${App.i18n.value(() => (out.length))} of ${App.i18n.value(() => (all.length))} ${App.i18n.value(() => (tab === "income" ? "income" : "expense"))} record${App.i18n.value(() => (all.length===1?"":"s"))}`);
    const wrap = document.getElementById("fListWrap");

    if (!out.length) {
      const label = tab === "income" ? "income" : "expense";
      wrap.innerHTML = all.length === 0
        ? App.i18n.html`<div class="empty"><div class="empty-icon">${App.i18n.value(() => (App.app.icon("wallet")))}</div><h3>No ${App.i18n.value(() => (label))} records yet</h3><p>Add your first ${App.i18n.value(() => (label))} record to start tracking your business finances.</p></div>`
        : App.i18n.markup(`<div class="empty"><h3>No matches</h3><p>Adjust your filters.</p></div>`);
      return;
    }

    wrap.innerHTML = App.i18n.html`
      <div class="table-wrap">
        <table class="tbl tbl-responsive">
          <thead><tr><th>Description</th><th>Category</th><th class="num">Amount</th><th>Date</th><th>Related</th><th class="actions">&nbsp;</th></tr></thead>
          <tbody>
            ${App.i18n.value(() => (out.map(r => {
              const c = r.contactId ? state.contacts.find(x => x.id === r.contactId) : null;
              const d = r.dealId ? state.deals.find(x => x.id === r.dealId) : null;
              return App.i18n.html`
                <tr data-fin-id="${App.i18n.value(() => (r.id))}">
                  <td data-label="Description" class="primary-cell">${App.i18n.value(() => (U().esc(r.description)))}</td>
                  <td data-label="Category"><span class="badge badge-neutral">${App.i18n.value(() => (U().esc(r.category)))}</span></td>
                  <td data-label="Amount" class="num" style="font-weight:600;color:${App.i18n.value(() => (tab==='income'?'var(--success)':'var(--danger)'))}">${App.i18n.value(() => (U().formatCurrency(r.amount, cur)))}</td>
                  <td data-label="Date">${App.i18n.value(() => (r.date ? U().formatDate(r.date) : "—"))}</td>
                  <td data-label="Related">
                    ${App.i18n.value(() => (c ? App.i18n.html`<a class="link" href="#/contacts/${App.i18n.value(() => (c.id))}">${App.i18n.value(() => (U().esc(c.name)))}</a>` : ""))}
                    ${App.i18n.value(() => (c && d ? " · " : ""))}
                    ${App.i18n.value(() => (d ? App.i18n.html`<a class="link" href="#/pipeline/${App.i18n.value(() => (d.id))}">${App.i18n.value(() => (U().esc(U().truncate(d.name, 20))))}</a>` : ""))}
                    ${App.i18n.value(() => (!c && !d ? App.i18n.markup('<span style="color:var(--text-soft)">—</span>') : ""))}
                  </td>
                  <td class="actions" data-label="">
                    <button class="btn btn-sm btn-ghost" data-edit-fin="${App.i18n.value(() => (r.id))}" aria-label="Edit">${App.i18n.value(() => (App.app.icon("edit")))}</button>
                  </td>
                </tr>
              `;
            }).join("")))}
          </tbody>
        </table>
      </div>
    `;

    wrap.querySelectorAll("[data-edit-fin]").forEach(btn => {
      btn.addEventListener("click", (e) => { e.stopPropagation(); openFinanceModal(tab, btn.getAttribute("data-edit-fin")); });
    });
  }

  // ---------- MODAL ----------

  async function openFinanceModal(type, id) {
    const isIncome = type === "income";
    const collection = isIncome ? S().income : S().expenses;
    const editing = !!id;
    await S().ensureLoaded(["income", "expenses", "contacts", "deals"]);
    const state = S().getState();
    const existing = editing ? (isIncome ? state.income : state.expenses).find(x => x.id === id) : null;
    if (editing && !existing) { App.app.toast(App.i18n.t("Record not found."), "danger"); return; }

    const cats = isIncome ? INCOME_CATS : EXPENSE_CATS;
    const r = existing || { description: "", amount: 0, date: U().todayISO(), category: cats[0], contactId: null, dealId: null, notes: "" };
    const contacts = state.contacts.slice().sort((a,b) => a.name.localeCompare(b.name));
    const deals = state.deals.slice().sort((a,b) => (a.name||"").localeCompare(b.name||""));
    const cur = state.settings.currency;

    const body = App.i18n.html`
      <form id="finForm" novalidate>
        <div class="form-grid">
          <div class="form-field full">
            <label for="ffDesc">Description <span class="req">*</span></label>
            <input type="text" id="ffDesc" value="${App.i18n.value(() => (U().esc(r.description)))}" required>
            <div class="err">Description is required.</div>
          </div>
          <div class="form-field">
            <label for="ffAmount">Amount (${App.i18n.value(() => (U().currencySymbol(cur)))}) <span class="req">*</span></label>
            <input type="number" id="ffAmount" min="0" step="0.01" value="${App.i18n.value(() => (r.amount || ""))}" required>
            <div class="err">Amount must be greater than zero.</div>
          </div>
          <div class="form-field">
            <label for="ffDate">Date</label>
            <input type="date" id="ffDate" value="${App.i18n.value(() => (r.date || U().todayISO()))}">
          </div>
          <div class="form-field">
            <label for="ffCat">Category</label>
            <select id="ffCat">${App.i18n.value(() => (cats.map(c => App.i18n.html`<option value="${App.i18n.value(() => (c))}" ${App.i18n.value(() => (r.category===c?"selected":""))}>${App.i18n.value(() => (c))}</option>`).join("")))}</select>
          </div>
          <div class="form-field">
            <label for="ffContact">Contact</label>
            <select id="ffContact"><option value="">— none —</option>${App.i18n.value(() => (contacts.map(c => App.i18n.html`<option value="${App.i18n.value(() => (c.id))}" ${App.i18n.value(() => (r.contactId===c.id?"selected":""))}>${App.i18n.value(() => (U().esc(c.name)))}</option>`).join("")))}</select>
          </div>
          <div class="form-field full">
            <label for="ffDeal">Deal</label>
            <select id="ffDeal"><option value="">— none —</option>${App.i18n.value(() => (deals.map(d => App.i18n.html`<option value="${App.i18n.value(() => (d.id))}" ${App.i18n.value(() => (r.dealId===d.id?"selected":""))}>${App.i18n.value(() => (U().esc(d.name)))}</option>`).join("")))}</select>
          </div>
          <div class="form-field full">
            <label for="ffNotes">Notes</label>
            <textarea id="ffNotes" rows="2">${App.i18n.value(() => (U().esc(r.notes)))}</textarea>
          </div>
        </div>
      </form>
    `;

    const footer = App.i18n.html`
      ${App.i18n.value(() => (editing ? App.i18n.markup('<button class="btn btn-danger" data-role="delete">Delete</button>') : ''))}
      <button class="btn" data-role="cancel">Cancel</button>
      <button class="btn btn-primary" data-role="save">${App.i18n.value(() => (editing ? App.i18n.t("Save") : "Add " + (isIncome ? App.i18n.t("Income") : App.i18n.t("Expense"))))}</button>
    `;

    const handle = App.app.openModal({
      title: editing ? "Edit " + (isIncome?"Income":"Expense") : "Add " + (isIncome?"Income":"Expense"),
      body, footer,
      onOpen: (modal) => {
        modal.querySelector('[data-role="cancel"]').addEventListener("click", () => handle.close());
        modal.querySelector('[data-role="save"]').addEventListener("click", async () => {
          const descField = document.getElementById("ffDesc").closest(".form-field");
          const amtField = document.getElementById("ffAmount").closest(".form-field");
          [descField, amtField].forEach(f => f.classList.remove("has-error"));
          const desc = document.getElementById("ffDesc").value.trim();
          const amount = U().num(document.getElementById("ffAmount").value);
          let valid = true;
          if (!desc) { descField.classList.add("has-error"); valid = false; }
          if (amount <= 0) { amtField.classList.add("has-error"); valid = false; }
          if (!valid) return;

          const patch = {
            description: desc,
            amount,
            date: document.getElementById("ffDate").value || U().todayISO(),
            category: document.getElementById("ffCat").value,
            contactId: document.getElementById("ffContact").value || null,
            dealId: document.getElementById("ffDeal").value || null,
            notes: document.getElementById("ffNotes").value
          };

          const saveBtn = modal.querySelector('[data-role="save"]');
          saveBtn.disabled = true;
          try {
            if (editing) { await collection.update(id, patch); App.app.toast(App.i18n.t("Record updated."), "success"); }
            else { await collection.create(patch); App.app.toast(App.i18n.t("Record added."), "success"); }
            handle.close();
            App.app.route();
          } catch (err) {
            App.app.toast(App.i18n.t("Could not save record: ") + err.message, "danger");
            saveBtn.disabled = false;
          }
        });
        const delBtn = modal.querySelector('[data-role="delete"]');
        if (delBtn) delBtn.addEventListener("click", () => {
          App.app.confirmDialog({ get title() { return App.i18n.t("Delete Record?"); }, get message() { return App.i18n.t("This will permanently delete this finance record."); }, okLabel: "Delete", danger: true }, async () => {
            try {
              await collection.delete(id);
              App.app.toast(App.i18n.t("Record deleted."), "success");
              handle.close();
              App.app.route();
            } catch (err) {
              App.app.toast(App.i18n.t("Could not delete record: ") + err.message, "danger");
            }
          });
        });
      }
    });
  }

  return { render, openFinanceModal, INCOME_CATS, EXPENSE_CATS };
})();

