/* ============================================================
   commission-page.js — Commission Tracker page.
   Read-only dashboard powered by derived.js + commission.js.
   No formulas duplicated. No numbers hardcoded.
   ============================================================ */

window.App = window.App || {};
App.pages = App.pages || {};

App.pages.commission = (function () {
  "use strict";

  const U = () => App.util;
  const S = () => App.store;
  const D = () => App.derived;
  const C = () => App.commission;

  async function render(container) {
    App.app.setBreadcrumbs([{ get label() { return App.i18n.t("Commission"); } }]);
    App.app.setTopActions("");
    container.innerHTML = App.app.loadingHtml();
    await S().ensureLoaded(["deals", "contacts", "properties", "teamMembers"]);

    // "Working as" is a personal view preference, not access control — the
    // data itself is untouched and still exported in full from Settings →
    // Data & Safety. See the "legacy view filter" section at the bottom of
    // data/workspace.js for the explicit limits of what this can do.
    if (App.workspace && App.workspace.commissionFiguresHidden()) {
      container.innerHTML = App.i18n.markup(`
        <div class="page-header"><div><div class="page-title">Commission</div></div></div>
        <div class="release-callout">
          <strong>Commission figures are hidden for your current view.</strong><br>
          You're viewing as Staff. Switch back to full access in Settings → Team → Working as to see commission numbers. This only changes what's shown on this screen — the underlying data is never deleted or restricted.
        </div>
        <button class="btn" data-go="/settings/team-access" id="commissionHiddenSettingsBtn" style="margin-top:12px">Open Team & Access</button>`);
      const btn = container.querySelector("#commissionHiddenSettingsBtn");
      if (btn) btn.addEventListener("click", () => App.app.navigate("/settings/team-access"));
      return;
    }

    const s = S().getState();
    const cur = s.settings.currency;

    const glance = D().businessAtAGlance(s);
    const overview = D().commissionOverview(s);
    const pipe = D().pipelineSummary(s);
    const closings = D().upcomingClosings(s, 10);

    container.innerHTML = App.i18n.html`
      <div class="page-header">
        <div>
          <div class="page-title">Commission</div>
          <div class="page-desc">Real-time commission math across every deal — expected, pending, received. Every number is calculated live from your deals.</div>
        </div>
      </div>

      <div class="stat-row">
        <div class="stat-card">
          <div class="k">Expected Net (Active)</div>
          <div class="v">${App.i18n.value(() => (U().formatCompact(overview.expectedCommission, cur)))}</div>
          <div class="sub">${App.i18n.value(() => (U().formatCurrency(overview.expectedCommission, cur)))}</div>
        </div>
        <div class="stat-card">
          <div class="k">Weighted Pipeline</div>
          <div class="v">${App.i18n.value(() => (U().formatCompact(glance.expectedWeightedCommission, cur)))}</div>
          <div class="sub">probability-adjusted</div>
        </div>
        <div class="stat-card">
          <div class="k">Pending (Under Contract)</div>
          <div class="v">${App.i18n.value(() => (U().formatCompact(overview.pendingCommission, cur)))}</div>
          <div class="sub">${App.i18n.value(() => (U().formatCurrency(overview.pendingCommission, cur)))}</div>
        </div>
        <div class="stat-card">
          <div class="k">YTD Net Commission</div>
          <div class="v">${App.i18n.value(() => (U().formatCompact(overview.ytdNetCommission, cur)))}</div>
          <div class="sub">closed this year</div>
        </div>
        <div class="stat-card">
          <div class="k">Received (Closed)</div>
          <div class="v">${App.i18n.value(() => (U().formatCompact(overview.receivedCommission, cur)))}</div>
          <div class="sub">Based on closed deals</div>
        </div>
        <div class="stat-card">
          <div class="k">Active Pipeline Value</div>
          <div class="v">${App.i18n.value(() => (U().formatCompact(glance.activePipelineValue, cur)))}</div>
          <div class="sub">${App.i18n.value(() => (U().formatCurrency(glance.activePipelineValue, cur)))}</div>
        </div>
      </div>

      <div class="detail-grid">
        <div class="col">
          <div class="card">
            <div class="card-header">
              <div class="card-title">Monthly Net Commission — Last 12 Months</div>
            </div>
            <div class="card-body">
              ${App.i18n.value(() => (renderMonthlyChart(overview.monthlyTrend, cur)))}
            </div>
          </div>

          <div class="card">
            <div class="card-header"><div class="card-title">All Deals — Commission</div></div>
            <div class="card-body zero" id="dealsCommissionTable"></div>
          </div>
        </div>

        <div class="col">
          <div class="card">
            <div class="card-header"><div class="card-title">Pipeline by Stage</div></div>
            <div class="card-body zero">
              ${App.i18n.value(() => (renderPipelineSummary(pipe, cur)))}
            </div>
          </div>

          <div class="card">
            <div class="card-header"><div class="card-title">Upcoming Closings (30 days)</div></div>
            <div class="card-body zero">
              ${App.i18n.value(() => (renderUpcomingClosings(closings, cur)))}
            </div>
          </div>

          <div class="card">
            <div class="card-body" style="font-size: var(--font-size-xs); color: var(--text-muted); line-height: 1.5;">
              These calculations are estimates based on your deal inputs. They are not tax, legal, brokerage, or financial advice.
            </div>
          </div>
        </div>
      </div>
    `;

    renderDealsCommissionTable(document.getElementById("dealsCommissionTable"), cur);
  }

  // ---------- MONTHLY SVG CHART ----------

  function renderMonthlyChart(trend, cur) {
    // trend: [{ key, label, amount, count }]
    if (!trend || trend.length === 0) {
      return App.i18n.markup(`<div class="empty" style="padding:var(--empty-padding)"><p>No closings yet.</p></div>`);
    }
    const max = Math.max(1, ...trend.map(t => t.amount));
    const W = 640;
    const H = 200;
    const padL = 46, padR = 12, padB = 30, padT = 12;
    const chartW = W - padL - padR;
    const chartH = H - padB - padT;
    const barW = chartW / trend.length * 0.6;
    const step = chartW / trend.length;

    // Y-axis ticks (0, 25%, 50%, 75%, 100% of max)
    const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => t * max);

    return App.i18n.html`
      <svg viewBox="0 0 ${App.i18n.value(() => (W))} ${App.i18n.value(() => (H))}" width="100%" height="${App.i18n.value(() => (H))}" role="img" aria-label="Monthly commission trend for last 12 months">
        ${App.i18n.value(() => (ticks.map(t => {
          const y = padT + chartH - (t / max) * chartH;
          return App.i18n.html`
            <line x1="${App.i18n.value(() => (padL))}" x2="${App.i18n.value(() => (W-padR))}" y1="${App.i18n.value(() => (y))}" y2="${App.i18n.value(() => (y))}" stroke="var(--chart-grid)" stroke-width="1"/>
            <text x="${App.i18n.value(() => (padL - 6))}" y="${App.i18n.value(() => (y + 3))}" text-anchor="end" font-size="10" fill="var(--chart-axis)">${App.i18n.value(() => (U().formatCompact(t, cur)))}</text>
          `;
        }).join("")))}
        ${App.i18n.value(() => (trend.map((t, i) => {
          const x = padL + step * i + (step - barW) / 2;
          const h = t.amount > 0 ? (t.amount / max) * chartH : 0;
          const y = padT + chartH - h;
          const isCurrentMonth = i === trend.length - 1;
          const fill = isCurrentMonth ? "var(--chart-series)" : "var(--chart-series-muted)";
          return App.i18n.html`
            <g>
              <rect x="${App.i18n.value(() => (x))}" y="${App.i18n.value(() => (y))}" width="${App.i18n.value(() => (barW))}" height="${App.i18n.value(() => (h))}" fill="${App.i18n.value(() => (fill))}" rx="3">
                <title>${App.i18n.value(() => (t.label))}: ${App.i18n.value(() => (U().formatCurrency(t.amount, cur)))} (${App.i18n.value(() => (t.count))} deal${App.i18n.value(() => (t.count===1?'':'s'))})</title>
              </rect>
              <text x="${App.i18n.value(() => (x + barW/2))}" y="${App.i18n.value(() => (H - 12))}" text-anchor="middle" font-size="10" fill="var(--chart-axis)">${App.i18n.value(() => (t.label))}</text>
            </g>
          `;
        }).join("")))}
      </svg>
    `;
  }

  // ---------- PIPELINE SUMMARY ----------

  function renderPipelineSummary(pipe, cur) {
    if (pipe.length === 0) return App.i18n.markup(`<div class="empty" style="padding:var(--empty-padding)"><p>No pipeline stages configured.</p></div>`);
    return pipe.map(stage => App.i18n.html`
      <div class="item-row">
        <div class="icon-slot" style="background:${App.i18n.value(() => (stage.color))}20;color:${App.i18n.value(() => (stage.color))}">${App.i18n.value(() => (stage.count))}</div>
        <div class="body">
          <div class="title">${App.i18n.value(() => (U().esc(stage.stageName)))}</div>
          <div class="sub">${App.i18n.value(() => (U().formatCompact(stage.totalValue, cur)))} in deals · Net ${App.i18n.value(() => (U().formatCompact(stage.expectedNetCommission, cur)))}</div>
        </div>
        <div class="meta-right">
          <div style="font-weight:600;color:var(--text)">${App.i18n.value(() => (U().formatCompact(stage.weightedCommission, cur)))}</div>
          <div style="font-size: var(--font-size-xs)">weighted</div>
        </div>
      </div>
    `).join("");
  }

  // ---------- UPCOMING CLOSINGS ----------

  function renderUpcomingClosings(closings, cur) {
    if (closings.rows.length === 0) {
      return App.i18n.markup(`<div class="empty" style="padding:var(--empty-padding)"><p>No closings scheduled in the next 30 days.</p></div>`);
    }
    return App.i18n.html`
      ${App.i18n.value(() => (closings.rows.map(r => App.i18n.html`
        <div class="item-row clickable" onclick="location.hash='#/pipeline/${App.i18n.value(() => (r.dealId))}'">
          <div class="icon-slot">${App.i18n.value(() => (App.app.icon("cal")))}</div>
          <div class="body">
            <div class="title">${App.i18n.value(() => (U().esc(r.dealName)))}</div>
            <div class="sub">${App.i18n.value(() => (U().esc(r.contactName)))}${App.i18n.value(() => (r.propertyAddress ? " · " + U().esc(r.propertyAddress) : ""))}</div>
          </div>
          <div class="meta-right">
            <div style="font-weight:600;color:var(--text)">${App.i18n.value(() => (U().formatDate(r.closeDate, "short")))}</div>
            <div style="font-size: var(--font-size-xs);">Net ${App.i18n.value(() => (U().formatCurrency(r.expectedNet, cur)))}</div>
          </div>
        </div>
      `).join("")))}
      <div style="padding: 12px 16px; border-top: 1px solid var(--border); background: var(--surface-sunk); font-size: var(--font-size-sm); font-weight: 600; color: var(--text); display: flex; justify-content: space-between;">
        <span>Total expected net:</span>
        <span>${App.i18n.value(() => (U().formatCurrency(closings.totalExpectedNet, cur)))}</span>
      </div>
    `;
  }

  // ---------- ALL DEALS TABLE ----------

  function renderDealsCommissionTable(container, cur) {
    if (!container) return;
    const s = S().getState();
    const deals = s.deals
      .slice()
      .sort((a,b) => {
        // Active first, then Closed, then Lost; within each, largest Net first
        const aTerm = D().isTerminalStage(s, a.stage);
        const bTerm = D().isTerminalStage(s, b.stage);
        if (aTerm !== bTerm) return aTerm ? 1 : -1;
        return C().netGCI(b) - C().netGCI(a);
      });

    if (deals.length === 0) {
      container.innerHTML = App.i18n.markup(`<div class="empty" style="padding:var(--empty-padding)"><p>No deals yet.</p></div>`);
      return;
    }

    container.innerHTML = App.i18n.html`
      <div class="table-wrap">
        <table class="tbl tbl-responsive tbl-compact">
          <!-- Seven columns in a half-width grid column: without fixed widths
               a long deal name wraps to three lines and squeezes every money
               column into an unreadable sliver. Widths sum to 100%. -->
          <colgroup>
            <col style="width:22%"><col style="width:16%"><col style="width:13%">
            <col style="width:8%"><col style="width:14%"><col style="width:14%">
            <col style="width:13%">
          </colgroup>
          <thead>
            <tr>
              <th>Deal</th>
              <th>Stage</th>
              <th class="num">Sale Price</th>
              <th class="num">Rate</th>
              <th class="num">Gross GCI</th>
              <th class="num">Net GCI</th>
              <th class="num">Weighted</th>
            </tr>
          </thead>
          <tbody>
            ${App.i18n.value(() => (deals.map(d => {
              const stageColor = (s.settings.pipelineStages.find(x => x.name === d.stage) || {}).color || "#94A3B8";
              return App.i18n.html`
                <tr class="clickable" data-deal-id="${App.i18n.value(() => (d.id))}">
                  <td data-label="Deal" class="primary-cell" title="${App.i18n.value(() => (U().esc(d.name)))}">${App.i18n.value(() => (U().esc(d.name)))}</td>
                  <td data-label="Stage"><span class="stage-pill"><span class="stage-dot" style="background:${App.i18n.value(() => (stageColor))}"></span>${App.i18n.value(() => (U().esc(d.stage)))}</span></td>
                  <td data-label="Sale Price" class="num">${App.i18n.value(() => (d.salePrice ? U().formatCurrency(d.salePrice, cur) : "—"))}</td>
                  <td data-label="Rate" class="num">${App.i18n.value(() => (d.commissionRate ? d.commissionRate + "%" : "—"))}</td>
                  <td data-label="Gross GCI" class="num">${App.i18n.value(() => (U().formatCurrency(C().grossGCI(d), cur)))}</td>
                  <td data-label="Net GCI" class="num" style="font-weight:600">${App.i18n.value(() => (U().formatCurrency(C().netGCI(d), cur)))}</td>
                  <td data-label="Weighted" class="num">${App.i18n.value(() => (U().formatCurrency(C().weightedGCI(d), cur)))}</td>
                </tr>
              `;
            }).join("")))}
          </tbody>
        </table>
      </div>
    `;

    container.querySelectorAll("tr[data-deal-id]").forEach(tr => {
      tr.addEventListener("click", () => App.app.navigate("/pipeline/" + tr.getAttribute("data-deal-id")));
    });
  }

  return { render };
})();

