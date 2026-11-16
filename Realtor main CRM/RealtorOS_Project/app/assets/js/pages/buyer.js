/* ============================================================
   buyer.js — Buyer Workspace: aggregates all buyer-side records.
   Read-only view over existing store data.
   ============================================================ */

window.App = window.App || {};
App.pages = App.pages || {};

App.pages.buyer = (function () {
  "use strict";

  const U = () => App.util;
  const S = () => App.store;
  const D = () => App.derived;

  const DEPS = ["contacts", "deals", "properties", "showings", "tasks"];

  async function render(container) {
    App.app.setBreadcrumbs([{ get label() { return App.i18n.t("Buyer Workspace"); } }]);
    App.app.setTopActions("");
    container.innerHTML = App.app.loadingHtml();
    await S().ensureLoaded(DEPS);

    const s = S().getState();
    const cur = s.settings.currency;

    // Buyer contacts (Buyer + Investor)
    const buyers = s.contacts.filter(c => c.role === "Buyer" || c.role === "Investor");
    const activeBuyers = buyers.filter(c => !["Past Client","Lost"].includes(c.stage));
    const hotBuyers = activeBuyers.filter(c => c.temperature === "Hot");

    // Buyer-side deals
    const buyerDeals = s.deals.filter(d => d.side === "Buyer");
    const activeBuyerDeals = buyerDeals.filter(d => !D().isTerminalStage(s, d.stage));

    // Buyer contact IDs, used to filter properties/showings
    const buyerContactIds = new Set(buyers.map(c => c.id));
    const buyerProperties = s.properties.filter(p =>
      buyerContactIds.has(p.contactId) && p.status !== "Sold"
    );

    // Upcoming showings (all buyers over next 14 days)
    const today = U().todayISO();
    const in14 = U().addDaysISO(today, 14);
    const upcomingShowings = s.showings.filter(sh =>
      sh.date && sh.date >= today && sh.date <= in14 &&
      sh.status === "Scheduled" &&
      buyerContactIds.has(sh.contactId)
    ).sort((a,b) => a.date.localeCompare(b.date));

    // Follow-ups for buyers
    const followUps = activeBuyers.filter(c =>
      c.nextFollowUp && c.nextFollowUp <= U().addDaysISO(today, 7)
    ).sort((a,b) => a.nextFollowUp.localeCompare(b.nextFollowUp));

    // Buyer tasks (contact-linked to a buyer or deal-linked to a buyer deal)
    const buyerDealIds = new Set(buyerDeals.map(d => d.id));
    const buyerTasks = s.tasks.filter(t =>
      (t.contactId && buyerContactIds.has(t.contactId)) ||
      (t.dealId && buyerDealIds.has(t.dealId))
    ).filter(t => t.status !== "Completed");

    // Metrics
    const totalBuyerPipeline = activeBuyerDeals.reduce((total, d) => total + U().num(d.salePrice), 0);
    const expectedNet = activeBuyerDeals.reduce((total, d) => total + App.commission.netGCI(d), 0);

    container.innerHTML = App.i18n.html`
      <div class="page-header">
        <div>
          <div class="page-title">Buyer Workspace</div>
          <div class="page-desc">Every buyer, every active buyer-side deal, and everything on your plate for buyers this week — in one view.</div>
        </div>
        <div class="page-actions">
          <button class="btn" id="bwAddContact">${App.i18n.value(() => (App.app.icon("plus")))} Add Buyer</button>
          <button class="btn" id="bwAddProperty">${App.i18n.value(() => (App.app.icon("plus")))} Add Property</button>
          <button class="btn btn-primary" id="bwAddShowing">${App.i18n.value(() => (App.app.icon("plus")))} Schedule Showing</button>
        </div>
      </div>

      <div class="stat-row">
        <div class="stat-card">
          <div class="k">Active Buyers</div>
          <div class="v">${App.i18n.value(() => (activeBuyers.length))}</div>
          <div class="sub">${App.i18n.value(() => (hotBuyers.length))} hot · ${App.i18n.value(() => (buyers.length))} total</div>
        </div>
        <div class="stat-card">
          <div class="k">Active Buyer Deals</div>
          <div class="v">${App.i18n.value(() => (activeBuyerDeals.length))}</div>
          <div class="sub">of ${App.i18n.value(() => (buyerDeals.length))} total</div>
        </div>
        <div class="stat-card">
          <div class="k">Buyer Pipeline Value</div>
          <div class="v">${App.i18n.value(() => (U().formatCompact(totalBuyerPipeline, cur)))}</div>
          <div class="sub">${App.i18n.value(() => (U().formatCurrency(totalBuyerPipeline, cur)))}</div>
        </div>
        <div class="stat-card">
          <div class="k">Expected Net (Buyers)</div>
          <div class="v">${App.i18n.value(() => (U().formatCompact(expectedNet, cur)))}</div>
          <div class="sub">across active buyer deals</div>
        </div>
      </div>

      <div class="detail-grid">
        <div class="col">
          ${App.i18n.value(() => (renderActiveBuyersCard(activeBuyers, cur)))}
          ${App.i18n.value(() => (renderBuyerDealsCard(activeBuyerDeals, cur, s)))}
          ${App.i18n.value(() => (renderBuyerPropertiesCard(buyerProperties, cur, s)))}
        </div>
        <div class="col">
          ${App.i18n.value(() => (renderUpcomingShowingsCard(upcomingShowings, s)))}
          ${App.i18n.value(() => (renderFollowUpsCard(followUps, today)))}
          ${App.i18n.value(() => (renderTasksCard(buyerTasks, today)))}
        </div>
      </div>
    `;

    document.getElementById("bwAddContact").addEventListener("click", () =>
      App.pages.contacts.openContactModal(null));
    document.getElementById("bwAddProperty").addEventListener("click", () =>
      App.pages.properties.openPropertyModal(null));
    document.getElementById("bwAddShowing").addEventListener("click", () =>
      App.pages.contacts.openShowingModal({}));
  }

  function renderActiveBuyersCard(buyers, cur) {
    return App.i18n.html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">Active Buyers</div>
          <span class="badge badge-neutral">${App.i18n.value(() => (buyers.length))}</span>
        </div>
        <div class="card-body zero">
          ${App.i18n.value(() => (buyers.length === 0 ? App.i18n.markup(`<div class="empty" style="padding:var(--empty-padding)"><p>No active buyers. Add one to get started.</p></div>`)
            : buyers.slice(0, 10).map(c => App.i18n.html`
              <div class="item-row clickable" onclick="location.hash='#/contacts/${App.i18n.value(() => (c.id))}'">
                <div class="icon-slot">${App.i18n.value(() => ((c.name||"?").split(" ").map(w => w[0]).slice(0,2).join("").toUpperCase()))}</div>
                <div class="body">
                  <div class="title">${App.i18n.value(() => (U().esc(c.name)))}</div>
                  <div class="sub">${App.i18n.value(() => (U().esc(c.stage)))} · ${App.i18n.value(() => (U().esc(c.temperature)))}${App.i18n.value(() => (c.preferredArea ? " · " + U().esc(c.preferredArea) : ""))}</div>
                </div>
                <div class="meta-right">
                  ${App.i18n.value(() => (c.budget ? App.i18n.html`<div style="font-weight:600;color:var(--text)">${App.i18n.value(() => (U().formatCompact(c.budget, cur)))}</div><div style="font-size: var(--font-size-xs)">budget</div>` : ""))}
                </div>
              </div>
            `).join("")))}
        </div>
      </div>
    `;
  }

  function renderBuyerDealsCard(deals, cur, s) {
    return App.i18n.html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">Active Buyer Deals</div>
          <span class="badge badge-neutral">${App.i18n.value(() => (deals.length))}</span>
        </div>
        <div class="card-body zero">
          ${App.i18n.value(() => (deals.length === 0 ? App.i18n.markup(`<div class="empty" style="padding:var(--empty-padding)"><p>No active buyer deals right now.</p></div>`)
            : deals.map(d => {
              const p = d.propertyId ? s.properties.find(x => x.id === d.propertyId) : null;
              const net = App.commission.netGCI(d);
              return App.i18n.html`
                <div class="item-row clickable" onclick="location.hash='#/contacts/${App.i18n.value(() => (d.contactId))}'">
                  <div class="icon-slot">${App.i18n.value(() => (App.app.icon("dollar")))}</div>
                  <div class="body">
                    <div class="title">${App.i18n.value(() => (U().esc(d.name)))}</div>
                    <div class="sub">${App.i18n.value(() => (U().esc(d.stage)))}${App.i18n.value(() => (p ? " · " + U().esc(p.address) : ""))}${App.i18n.value(() => (d.closeDate ? " · Close " + U().formatDate(d.closeDate) : ""))}</div>
                  </div>
                  <div class="meta-right">
                    <div style="font-weight:600;color:var(--text)">${App.i18n.value(() => (U().formatCurrency(d.salePrice, cur)))}</div>
                    <div style="font-size: var(--font-size-xs)">Net ${App.i18n.value(() => (U().formatCurrency(net, cur)))}</div>
                  </div>
                </div>
              `;
            }).join("")))}
        </div>
      </div>
    `;
  }

  function renderBuyerPropertiesCard(properties, cur, s) {
    return App.i18n.html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">Buyer Interest Properties</div>
          <span class="badge badge-neutral">${App.i18n.value(() => (properties.length))}</span>
        </div>
        <div class="card-body zero">
          ${App.i18n.value(() => (properties.length === 0 ? App.i18n.markup(`<div class="empty" style="padding:var(--empty-padding)"><p>No buyer-interest properties tracked.</p></div>`)
            : properties.slice(0, 10).map(p => {
              const c = p.contactId ? s.contacts.find(x => x.id === p.contactId) : null;
              return App.i18n.html`
                <div class="item-row clickable" onclick="location.hash='#/properties/${App.i18n.value(() => (p.id))}'">
                  <div class="icon-slot">${App.i18n.value(() => (App.app.icon("home")))}</div>
                  <div class="body">
                    <div class="title">${App.i18n.value(() => (U().esc(p.address)))}</div>
                    <div class="sub">${App.i18n.value(() => (U().esc(p.status)))}${App.i18n.value(() => (c ? " · for " + U().esc(c.name) : ""))}${App.i18n.value(() => (p.beds ? " · " + p.beds + "bd/" + (p.baths||0) + "ba" : ""))}</div>
                  </div>
                  <div class="meta-right">
                    <div style="font-weight:600;color:var(--text)">${App.i18n.value(() => (p.listPrice ? U().formatCurrency(p.listPrice, cur) : "—"))}</div>
                  </div>
                </div>
              `;
            }).join("")))}
        </div>
      </div>
    `;
  }

  function renderUpcomingShowingsCard(showings, s) {
    return App.i18n.html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">Upcoming Showings (14 days)</div>
          <span class="badge badge-neutral">${App.i18n.value(() => (showings.length))}</span>
        </div>
        <div class="card-body zero">
          ${App.i18n.value(() => (showings.length === 0 ? App.i18n.markup(`<div class="empty" style="padding:var(--empty-padding)"><p>No upcoming showings.</p></div>`)
            : showings.map(sh => {
              const c = sh.contactId ? s.contacts.find(x => x.id === sh.contactId) : null;
              const p = sh.propertyId ? s.properties.find(x => x.id === sh.propertyId) : null;
              return App.i18n.html`
                <div class="item-row">
                  <div class="icon-slot">${App.i18n.value(() => (App.app.icon("cal")))}</div>
                  <div class="body">
                    <div class="title">${App.i18n.value(() => (p ? U().esc(p.address) : "—"))}</div>
                    <div class="sub">${App.i18n.value(() => (c ? U().esc(c.name) : ""))} · ${App.i18n.value(() => (U().esc(sh.startTime || "")))}</div>
                  </div>
                  <div class="meta-right">${App.i18n.value(() => (U().relativeDayLabel(sh.date)))}</div>
                </div>
              `;
            }).join("")))}
        </div>
      </div>
    `;
  }

  function renderFollowUpsCard(contacts, today) {
    return App.i18n.html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">Follow-ups (next 7 days)</div>
          <span class="badge badge-neutral">${App.i18n.value(() => (contacts.length))}</span>
        </div>
        <div class="card-body zero">
          ${App.i18n.value(() => (contacts.length === 0 ? App.i18n.markup(`<div class="empty" style="padding:var(--empty-padding)"><p>Nothing due this week.</p></div>`)
            : contacts.map(c => {
              const overdue = c.nextFollowUp < today;
              return App.i18n.html`
                <div class="item-row clickable" onclick="location.hash='#/contacts/${App.i18n.value(() => (c.id))}'">
                  <div class="icon-slot" style="background:${App.i18n.value(() => (overdue?'var(--danger-soft)':'var(--warning-soft)'))};color:${App.i18n.value(() => (overdue?'var(--danger)':'var(--warning)'))}">${App.i18n.value(() => (App.app.icon("users")))}</div>
                  <div class="body">
                    <div class="title">${App.i18n.value(() => (U().esc(c.name)))}</div>
                    <div class="sub">${App.i18n.value(() => (U().esc(c.stage)))}</div>
                  </div>
                  <div class="meta-right">
                    ${App.i18n.value(() => (overdue ? App.i18n.markup('<span class="badge badge-overdue">Overdue</span>') : U().relativeDayLabel(c.nextFollowUp)))}
                  </div>
                </div>
              `;
            }).join("")))}
        </div>
      </div>
    `;
  }

  function renderTasksCard(tasks, today) {
    const sorted = tasks.slice().sort((a,b) => (a.dueDate||"9999").localeCompare(b.dueDate||"9999"));
    return App.i18n.html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">Open Buyer Tasks</div>
          <span class="badge badge-neutral">${App.i18n.value(() => (tasks.length))}</span>
        </div>
        <div class="card-body zero">
          ${App.i18n.value(() => (tasks.length === 0 ? App.i18n.markup(`<div class="empty" style="padding:var(--empty-padding)"><p>You're clear.</p></div>`)
            : sorted.slice(0, 10).map(t => {
              const overdue = t.dueDate && t.dueDate < today;
              return App.i18n.html`
                <div class="item-row">
                  <div class="icon-slot" style="background:${App.i18n.value(() => (overdue?'var(--danger-soft)':'var(--accent-soft)'))};color:${App.i18n.value(() => (overdue?'var(--danger)':'var(--accent)'))}">${App.i18n.value(() => (App.app.icon("check")))}</div>
                  <div class="body">
                    <div class="title">${App.i18n.value(() => (U().esc(t.title)))}</div>
                    <div class="sub">${App.i18n.value(() => (U().esc(t.priority)))} · ${App.i18n.value(() => (U().esc(t.status)))}</div>
                  </div>
                  <div class="meta-right">${App.i18n.value(() => (t.dueDate ? U().relativeDayLabel(t.dueDate) : "—"))}</div>
                </div>
              `;
            }).join("")))}
        </div>
      </div>
    `;
  }

  return { render };
})();

