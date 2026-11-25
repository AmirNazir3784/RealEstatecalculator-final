(function () {
  'use strict';
  var form = document.getElementById('calc-form');
  if (!form) return;
  var state = { years: 27.5, kind: 'Residential rental' };
  function num(id) { var el = document.getElementById(id); var v = el ? parseFloat(el.value) : 0; return isFinite(v) ? v : 0; }
  function set(id, text) { var el = document.getElementById(id); if (el) el.textContent = text; }
  function usd(v) { return '$' + Math.round(v).toLocaleString('en-US'); }
  function usd2(v) { return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  function compute() {
    var price = Math.max(0, num('property-price'));
    var land = Math.min(Math.max(0, num('land-value')), price);
    var improvements = Math.max(0, num('improvements-cost'));
    var month = Math.min(12, Math.max(1, Math.round(num('service-month')) || 1));
    var startYear = Math.round(num('service-year')) || 2025;
    var taxRate = Math.min(60, Math.max(0, num('tax-rate')));
    var years = state.years;
    var building = price - land;
    var basis = building + improvements;
    var annual = years > 0 ? basis / years : 0;
    var f1 = (12 - month + 0.5) / 12;
    var rows = [], acc = 0, y = startYear, guard = 0;
    while (basis - acc > 0.005 && guard < 60) {
      var d = guard === 0 ? Math.min(annual * f1, basis - acc) : Math.min(annual, basis - acc);
      acc += d;
      rows.push({ year: y, dep: d, acc: acc, rem: Math.max(0, basis - acc), final: basis - acc <= 0.005 });
      y++; guard++;
    }
    return { price: price, land: land, improvements: improvements, building: building, basis: basis,
             annual: annual, rows: rows, taxRate: taxRate, years: years, startYear: startYear };
  }

  function run() {
    var r = compute();
    set('dep-value', usd(r.annual));
    set('dep-verdict', state.kind + ' · ' + r.years + '-year straight line');
    set('dep-sub', 'Land excluded · part first year under the mid-month convention');
    set('row-basis', usd(r.basis));
    set('row-land', usd(r.land));
    set('row-first-label', 'First-year deduction (' + r.startYear + ')');
    set('row-first', r.rows.length ? usd(r.rows[0].dep) : '—');
    set('row-total-label', 'Total over ' + r.years + ' years');
    set('row-total', usd(r.basis));
    set('tile-tax', usd(r.annual * r.taxRate / 100));
    set('tile-monthly', usd(r.annual / 12));
    set('sticky-value', usd(r.annual));
    var total = r.price + r.improvements;
    function w(v) { return total > 0 ? Math.max(0, v / total * 100) : 0; }
    var bEl = document.getElementById('seg-building'); if (bEl) bEl.style.width = w(r.building) + '%';
    var iEl = document.getElementById('seg-improve'); if (iEl) iEl.style.width = w(r.improvements) + '%';
    var lEl = document.getElementById('seg-land'); if (lEl) lEl.style.width = w(r.land) + '%';
    set('dep-schedule-sub', 'Straight-line over ' + r.years + ' years with the mid-month convention — the first and last years are part-years; every year between is a full year. ' + r.rows.length + ' tax years, ' + r.startYear + '–' + (r.rows.length ? r.rows[r.rows.length - 1].year : r.startYear) + '.');
    var body = document.getElementById('schedule-body');
    if (body) {
      lastCount = r.rows.length;
      body.innerHTML = r.rows.map(function (row, idx) {
        var cls = [];
        if (row.final) cls.push('final-row');
        if (idx >= 5 && idx < r.rows.length - 1) cls.push('extra');
        return '<tr' + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + '><td>' + row.year + (row.final ? '<span class="final-tag">final year</span>' : '') + '</td><td>' + usd2(row.dep) + '</td><td>' + usd2(row.acc) + '</td><td>' + usd2(row.rem) + '</td></tr>';
      }).join('');
      syncToggle();
    }
    var chart = document.getElementById('acc-chart');
    if (chart) {
      chart.innerHTML = r.rows.map(function (row, i) {
        var h = r.basis > 0 ? Math.max(4, Math.round(row.acc / r.basis * 100)) : 4;
        return '<span class="eq-bar' + (i === r.rows.length - 1 ? ' eq-final' : '') + '" style="height:' + h + '%"></span>';
      }).join('');
    }
  }

  form.addEventListener('input', run);
  var btns = form.querySelectorAll('.seg-btn');
  Array.prototype.forEach.call(btns, function (btn) {
    btn.addEventListener('click', function () {
      Array.prototype.forEach.call(btns, function (b) { b.classList.remove('is-active'); });
      btn.classList.add('is-active');
      state.years = parseFloat(btn.getAttribute('data-years')) || 27.5;
      state.kind = btn.getAttribute('data-kind') || 'Residential rental';
      run();
    });
  });
  var lastCount = 0;
  var panel = document.querySelector('.dep-years-panel');
  var toggleBtn = document.getElementById('schedule-toggle-btn');
  function syncToggle() {
    if (!toggleBtn || !panel) return;
    var collapsed = panel.classList.contains('is-collapsed');
    toggleBtn.textContent = collapsed ? 'Show full ' + lastCount + '-year schedule' : 'Show fewer years';
  }
  if (toggleBtn && panel) {
    toggleBtn.addEventListener('click', function () {
      panel.classList.toggle('is-collapsed');
      syncToggle();
    });
  }
  var copyBtn = document.getElementById('copy-results');
  if (copyBtn && typeof navigator !== 'undefined' && navigator.clipboard) {
    copyBtn.addEventListener('click', function () {
      var r = compute();
      var text = 'Depreciation: ' + usd(r.annual) + ' per full year (' + state.kind + ', ' + r.years + '-year straight line). Basis ' + usd(r.basis) + ', land excluded ' + usd(r.land) + ', first year ' + (r.rows.length ? usd2(r.rows[0].dep) : '—') + ', schedule ' + r.rows.length + ' tax years from ' + r.startYear + '.';
      navigator.clipboard.writeText(text);
      copyBtn.textContent = 'Copied';
      setTimeout(function () { copyBtn.textContent = 'Copy results'; }, 1600);
    });
  }
  run();
})();
