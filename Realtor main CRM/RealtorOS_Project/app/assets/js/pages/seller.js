/* ============================================================
   seller.js — Seller Workspace: aggregates all seller-side records.
   ============================================================ */

window.App = window.App || {};
App.pages = App.pages || {};

App.pages.seller = (function () {
  "use strict";

  const U = () => App.util;
  const S = () => App.store;
  const D = () => App.derived;

  const DEPS = ["contacts", "deals", "properties", "showings", "tasks"];

  async function render(container) {
    App.app.setBreadcrumbs([{ get label() { return App.i18n.t("Seller Workspace"); } }]);
    App.app.setTopActions("");
    container.innerHTML = App.app.loadingHtml();
    await S().ensureLoaded(DEPS);

    const s = S().getState();
    const cur = s.settings.currency;

    // Sellers
    const sellers = s.contacts.filter(c => c.role === "Seller");
    const activeSellers = sellers.filter(c => !["Past Client","Lost"].includes(c.stage));
    const hotSellers = activeSellers.filter(c => c.temperature === "Hot");

    // Seller-side deals
    const sellerDeals = s.deals.filter(d => d.side === "Seller");
    const activeSellerDeals = sellerDeals.filter(d => !D().isTerminalStage(s, d.stage));

    // Active listings: properties linked to sellers, statuses Active/Under Contract/Coming Soon
    const sellerContactIds = new Set(sellers.map(c => c.id));
    const listings = s.properties.filter(p =>
      sellerContactIds.has(p.contactId) &&
      ["Active","Under Contract","Coming Soon"].includes(p.status)
    );

    // Showings on seller-linked properties
    const today = U().todayISO();
    const in14 = U().addDaysISO(today, 14);
    const listingPropertyIds = new Set(listings.map(p => p.id));
    const upcomingShowings = s.showings.filter(sh =>
      sh.date && sh.date >= today && sh.date <= in14 &&
      sh.status === "Scheduled" &&
      listingPropertyIds.has(sh.propertyId)
    ).sort((a,b) => a.date.localeCompare(b.date));

    // Seller follow-ups (next 7 days)
    const followUps = activeSellers.filter(c =>
      c.nextFollowUp && c.nextFollowUp <= U().addDaysISO(today, 7)
    ).sort((a,b) => a.nextFollowUp.localeCompare(b.nextFollowUp));

    // Seller tasks
    const sellerDealIds = new Set(sellerDeals.map(d => d.id));
    const sellerTasks = s.tasks.filter(t =>
      (t.contactId && sellerContactIds.has(t.contactId)) ||
      (t.dealId && sellerDealIds.has(t.dealId))
    ).filter(t => t.status !== "Completed");

    // Metrics
    const listingsValue = listings.reduce((total, p) => total + U().num(p.listPrice), 0);
    const expectedNet = activeSellerDeals.reduce((total, d) => total + App.commission.netGCI(d), 0);

    container.innerHTML = App.i18n.html`
      <div class="page-header">
        <div>
          <div class="page-title">Seller Workspace</div>
          <div class="page-desc">Every seller, active listing, and seller-side transaction — in one view.</div>
        </div>
        <div class="page-actions">
          <button class="btn" id="swAddContact">${App.i18n.value(() => (App.app.icon("plus")))} Add Seller</button>
          <button class="btn" id="swAddListing">${App.i18n.value(() => (App.app.icon("plus")))} Add Listing</button>
          <button class="btn btn-primary" id="swAddShowing">${App.i18n.value(() => (App.app.icon("plus")))} Schedule Showing</button>
        </div>
      </div>

      <div class="stat-row">
        <div class="stat-card">
          <div class="k">Active Sellers</div>
          <div class="v">${App.i18n.value(() => (activeSellers.length))}</div>
          <div class="sub">${App.i18n.value(() => (hotSellers.length))} hot · ${App.i18n.value(() => (sellers.length))} total</div>
        </div>
        <div class="stat-card">
          <div class="k">Active Listings</div>
          <div class="v">${App.i18n.value(() => (listings.length))}</div>
          <div class="sub">${App.i18n.value(() => (U().formatCompact(listingsValue, cur)))} total value</div>
        </div>
        <div class="stat-card">
          <div class="k">Active Seller Deals</div>
          <div class="v">${App.i18n.value(() => (activeSellerDeals.length))}</div>
          <div class="sub">of ${App.i18n.value(() => (sellerDeals.length))} total</div>
        </div>
        <div class="stat-card">
          <div class="k">Expected Net (Sellers)</div>
          <div class="v">${App.i18n.value(() => (U().formatCompact(expectedNet, cur)))}</div>
          <div class="sub">across active seller deals</div>
        </div>
      </div>

      <div class="detail-grid">
        <div class="col">
          ${App.i18n.value(() => (renderActiveSellersCard(activeSellers, cur)))}
          ${App.i18n.value(() => (renderSellerDealsCard(activeSellerDeals, cur, s)))}
          ${App.i18n.value(() => (renderListingsCard(listings, cur, s)))}
        </div>
        <div class="col">
          ${App.i18n.value(() => (renderUpcomingShowingsCard(upcomingShowings, s)))}
          ${App.i18n.value(() => (renderFollowUpsCard(followUps, today)))}
          ${App.i18n.value(() => (renderTasksCard(sellerTasks, today)))}
        </div>
      </div>
    `;

    document.getElementById("swAddContact").addEventListener("click", () =>
      App.pages.contacts.openContactModal(null));
    document.getElementById("swAddListing").addEventListener("click", () =>
      App.pages.properties.openPropertyModal(null));
    document.getElementById("swAddShowing").addEventListener("click", () =>
      App.pages.contacts.openShowingModal({}));
  }

  function renderActiveSellersCard(sellers, cur) {
    return App.i18n.html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">Active Sellers</div>
          <span class="badge badge-neutral">${App.i18n.value(() => (sellers.length))}</span>
        </div>
        <div class="card-body zero">
          ${App.i18n.value(() => (sellers.length === 0 ? App.i18n.markup(`<div class="empty" style="padding:var(--empty-padding)"><p>No active sellers. Add one to get started.</p></div>`)
            : sellers.slice(0, 10).map(c => App.i18n.html`
              <div class="item-row clickable" onclick="location.hash='#/contacts/${App.i18n.value(() => (c.id))}'">
                <div class="icon-slot">${App.i18n.value(() => ((c.name||"?").split(" ").map(w => w[0]).slice(0,2).join("").toUpperCase()))}</div>
                <div class="body">
                  <div class="title">${App.i18n.value(() => (U().esc(c.name)))}</div>
                  <div class="sub">${App.i18n.value(() => (U().esc(c.stage)))} · ${App.i18n.value(() => (U().esc(c.temperature)))}${App.i18n.value(() => (c.preferredArea ? " · " + U().esc(c.preferredArea) : ""))}</div>
                </div>
              </div>
            `).join("")))}
        </div>
      </div>
    `;
  }

  function renderSellerDealsCard(deals, cur, s) {
    return App.i18n.html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">Active Seller Deals</div>
          <span class="badge badge-neutral">${App.i18n.value(() => (deals.length))}</span>
        </div>
        <div class="card-body zero">
          ${App.i18n.value(() => (deals.length === 0 ? App.i18n.markup(`<div class="empty" style="padding:var(--empty-padding)"><p>No active seller deals right now.</p></div>`)
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

  function renderListingsCard(listings, cur, s) {
    return App.i18n.html`
      <div class="card">
        <div class="card-header">
          <div class="card-title">Active Listings</div>
          <span class="badge badge-neutral">${App.i18n.value(() => (listings.length))}</span>
        </div>
        <div class="card-body zero">
          ${App.i18n.value(() => (listings.length === 0 ? App.i18n.markup(`<div class="empty" style="padding:var(--empty-padding)"><p>No active listings.</p></div>`)
            : listings.slice(0, 10).map(p => {
              const c = p.contactId ? s.contacts.find(x => x.id === p.contactId) : null;
              const dom = D().daysOnMarket(p);
              return App.i18n.html`
                <div class="item-row clickable" onclick="location.hash='#/properties/${App.i18n.value(() => (p.id))}'">
                  <div class="icon-slot">${App.i18n.value(() => (App.app.icon("home")))}</div>
                  <div class="body">
                    <div class="title">${App.i18n.value(() => (U().esc(p.address)))}</div>
                    <div class="sub">${App.i18n.value(() => (U().esc(p.status)))}${App.i18n.value(() => (c ? " · " + U().esc(c.name) : ""))}${App.i18n.value(() => (dom != null ? " · " + dom + "d on market" : ""))}</div>
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
          <div class="card-title">Upcoming Open Houses / Showings (14 days)</div>
          <span class="badge badge-neutral">${App.i18n.value(() => (showings.length))}</span>
        </div>
        <div class="card-body zero">
          ${App.i18n.value(() => (showings.length === 0 ? App.i18n.markup(`<div class="empty" style="padding:var(--empty-padding)"><p>No upcoming showings on your listings.</p></div>`)
            : showings.map(sh => {
              const c = sh.contactId ? s.contacts.find(x => x.id === sh.contactId) : null;
              const p = sh.propertyId ? s.properties.find(x => x.id === sh.propertyId) : null;
              return App.i18n.html`
                <div class="item-row">
                  <div class="icon-slot">${App.i18n.value(() => (App.app.icon("cal")))}</div>
                  <div class="body">
                    <div class="title">${App.i18n.value(() => (p ? U().esc(p.address) : "—"))}</div>
                    <div class="sub">${App.i18n.value(() => (c ? "with " + U().esc(c.name) : ""))} · ${App.i18n.value(() => (U().esc(sh.startTime || "")))}</div>
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
          <div class="card-title">Open Seller Tasks</div>
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

