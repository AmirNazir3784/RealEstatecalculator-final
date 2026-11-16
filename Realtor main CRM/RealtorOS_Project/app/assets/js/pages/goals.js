/* ============================================================
   goals-page.js — Goals dashboard with progress tracking.
   All progress derived from existing records via App.derived.
   ============================================================ */

window.App = window.App || {};
App.pages = App.pages || {};

App.pages.goals = (function () {
  "use strict";

  const U = () => App.util;
  const S = () => App.store;
  const D = () => App.derived;

  async function render(container) {
    App.app.setBreadcrumbs([{ get label() { return App.i18n.t("Goals"); } }]);
    App.app.setTopActions("");
    container.innerHTML = App.app.loadingHtml();
    await S().ensureLoaded(["goals", "deals", "contacts", "referrals", "activities", "showings"]);

    const s = S().getState();
    const cur = s.settings.currency;
    const progress = D().allGoalsProgress(s);
    const year = new Date().getFullYear();

    container.innerHTML = App.i18n.html`
      <div class="page-header">
        <div>
          <div class="page-title">Goals</div>
          <div class="page-desc">Annual targets and real-time progress — every number is calculated live from your deals, contacts, referrals, and activities.</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" id="addGoalBtn">${App.i18n.value(() => (App.app.icon("plus")))} Add Goal</button>
        </div>
      </div>
      <div id="goalsGrid" class="goals-grid">
        ${App.i18n.value(() => (progress.length === 0
          ? App.i18n.html`<div class="empty" style="grid-column:1/-1;">
              <div class="empty-icon">${App.i18n.value(() => (App.app.icon("target")))}</div>
              <h3>No goals set</h3>
              <p>Set annual targets for GCI, closed deals, new clients, referrals, or appointments.</p>
              <button class="btn btn-primary" onclick="App.pages.goals.openGoalModal(null)">Add Your First Goal</button>
            </div>`
          : progress.map(g => renderGoalCard(g, cur)).join("")))}
      </div>
    `;

    document.getElementById("addGoalBtn").addEventListener("click", () => openGoalModal(null));
    container.querySelectorAll("[data-edit-goal]").forEach(btn => {
      btn.addEventListener("click", (e) => { e.stopPropagation(); openGoalModal(btn.getAttribute("data-edit-goal")); });
    });
    container.querySelectorAll("[data-del-goal]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const gid = btn.getAttribute("data-del-goal");
        App.app.confirmDialog({ get title() { return App.i18n.t("Delete Goal?"); }, get message() { return App.i18n.t("This goal and its target will be removed."); }, okLabel: "Delete", danger: true }, async () => {
          try {
            await S().goals.delete(gid);
            App.app.toast(App.i18n.t("Goal deleted."), "success");
            App.app.route();
          } catch (err) {
            App.app.toast(App.i18n.t("Could not delete goal: ") + err.message, "danger");
          }
        });
      });
    });
  }

  function renderGoalCard(g, cur) {
    const pct = Math.min(100, g.pct);
    const isCurrency = g.type === "GCI";
    const fmt = (v) => isCurrency ? U().formatCurrency(v, cur) : v.toLocaleString();
    const fmtCompact = (v) => isCurrency ? U().formatCompact(v, cur) : v.toLocaleString();
    const remaining = Math.max(0, g.target - g.current);
    const statusLabel = g.overachieved ? "Exceeded" : pct >= 75 ? "On Track" : pct >= 40 ? "In Progress" : pct > 0 ? "Behind" : "Not Started";
    const statusCls = g.overachieved ? "badge-success" : pct >= 75 ? "badge-success" : pct >= 40 ? "badge-warning" : "badge-danger";
    const typeLabels = { GCI: "Net GCI", ClosedDeals: "Closed Deals", NewClients: "New Clients", Referrals: "Referrals", Appointments: "Appointments" };

    return App.i18n.html`
      <div class="goal-card card">
        <div class="card-body">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;">
            <div>
              <div style="font-size: var(--font-size-xs);color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;font-weight:600;margin-bottom:4px;">${App.i18n.value(() => (U().esc(typeLabels[g.type] || g.type)))}</div>
              <div style="font-size: var(--font-size-xs);color:var(--text-soft);">${App.i18n.value(() => (g.year))} Annual Goal</div>
            </div>
            <div style="display:flex;gap:4px;">
              <button class="btn btn-sm btn-ghost" data-edit-goal="${App.i18n.value(() => (g.goalId))}" aria-label="Edit goal">${App.i18n.value(() => (App.app.icon("edit")))}</button>
              <button class="btn btn-sm btn-ghost" data-del-goal="${App.i18n.value(() => (g.goalId))}" aria-label="Delete goal">${App.i18n.value(() => (App.app.icon("trash")))}</button>
            </div>
          </div>
          <div style="font-size: var(--font-size-3xl);font-weight:800;color:var(--text);margin-bottom:2px;">${App.i18n.value(() => (fmtCompact(g.current)))}</div>
          <div style="font-size: var(--font-size-sm);color:var(--text-muted);margin-bottom:14px;">of ${App.i18n.value(() => (fmt(g.target)))} target</div>
          <div class="progress-bar-wrap">
            <div class="progress-bar" style="width:${App.i18n.value(() => (pct))}%;background:${App.i18n.value(() => (pct >= 75 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)'))}"></div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
            <span class="badge ${App.i18n.value(() => (statusCls))}">${App.i18n.value(() => (statusLabel))}</span>
            <span style="font-size: var(--font-size-xs);color:var(--text-muted);">${App.i18n.value(() => (Math.round(g.rawPct)))}% · ${App.i18n.value(() => (fmt(remaining)))} to go</span>
          </div>
        </div>
      </div>
    `;
  }

  // ---------- MODAL ----------

  async function openGoalModal(id) {
    const editing = !!id;
    await S().ensureLoaded(["goals"]);
    const existing = editing ? S().getState().goals.find(x => x.id === id) : null;
    if (editing && !existing) { App.app.toast(App.i18n.t("Goal not found."), "danger"); return; }

    const g = existing || { type: "GCI", year: new Date().getFullYear(), target: 0, notes: "" };
    const typeOptions = [
      { value: "GCI", get label() { return App.i18n.t("Net GCI ($)"); } },
      { value: "ClosedDeals", get label() { return App.i18n.t("Closed Deals (#)"); } },
      { value: "NewClients", get label() { return App.i18n.t("New Clients (#)"); } },
      { value: "Referrals", get label() { return App.i18n.t("Referrals (#)"); } },
      { value: "Appointments", get label() { return App.i18n.t("Appointments (#)"); } }
    ];

    const body = App.i18n.html`
      <form id="goalForm" novalidate>
        <div class="form-grid">
          <div class="form-field">
            <label for="gType">Goal Type <span class="req">*</span></label>
            <select id="gType">${App.i18n.value(() => (typeOptions.map(t => App.i18n.html`<option value="${App.i18n.value(() => (t.value))}" ${App.i18n.value(() => (g.type===t.value?"selected":""))}>${App.i18n.value(() => (t.label))}</option>`).join("")))}</select>
          </div>
          <div class="form-field">
            <label for="gYear">Year</label>
            <input type="number" id="gYear" min="2020" max="2050" value="${App.i18n.value(() => (g.year))}">
          </div>
          <div class="form-field full">
            <label for="gTarget">Target <span class="req">*</span></label>
            <input type="number" id="gTarget" min="1" value="${App.i18n.value(() => (g.target || ""))}" required>
            <div class="err">Target must be greater than zero.</div>
          </div>
          <div class="form-field full">
            <label for="gNotes">Notes</label>
            <textarea id="gNotes" rows="2">${App.i18n.value(() => (U().esc(g.notes)))}</textarea>
          </div>
        </div>
      </form>
    `;

    const handle = App.app.openModal({
      title: editing ? "Edit Goal" : "Add Goal", body,
      footer: App.i18n.html`
        <button class="btn" data-role="cancel">Cancel</button>
        <button class="btn btn-primary" data-role="save">${App.i18n.value(() => (editing ? App.i18n.t("Save") : App.i18n.t("Add Goal")))}</button>
      `,
      onOpen: (modal) => {
        modal.querySelector('[data-role="cancel"]').addEventListener("click", () => handle.close());
        modal.querySelector('[data-role="save"]').addEventListener("click", async () => {
          const targetField = document.getElementById("gTarget").closest(".form-field");
          targetField.classList.remove("has-error");
          const target = U().num(document.getElementById("gTarget").value);
          if (target <= 0) { targetField.classList.add("has-error"); return; }

          const patch = {
            type: document.getElementById("gType").value,
            year: parseInt(document.getElementById("gYear").value) || new Date().getFullYear(),
            target,
            notes: document.getElementById("gNotes").value
          };
          const saveBtn = modal.querySelector('[data-role="save"]');
          saveBtn.disabled = true;
          try {
            if (editing) { await S().goals.update(id, patch); App.app.toast(App.i18n.t("Goal updated."), "success"); }
            else { await S().goals.create(patch); App.app.toast(App.i18n.t("Goal added."), "success"); }
            handle.close();
            App.app.route();
          } catch (err) {
            App.app.toast(App.i18n.t("Could not save goal: ") + err.message, "danger");
            saveBtn.disabled = false;
          }
        });
      }
    });
  }

  return { render, openGoalModal };
})();

